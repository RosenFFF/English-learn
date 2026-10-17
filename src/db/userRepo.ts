/** user.db 仓储：所有读写学习进度的 SQL 都在这里。 */
import type { BackupPayload, DailyStatRow, KvRow, StudyPlanRow } from '../lib/backup';
import { EXPORTABLE_KV_KEYS } from '../lib/backup';
import type { CardRow, ReviewLogRow } from '../lib/fsrs';
import type { SqlDb, SqlValue } from './types';

const CARD_COLS = [
  'word_id',
  'due',
  'stability',
  'difficulty',
  'elapsed_days',
  'scheduled_days',
  'learning_steps',
  'reps',
  'lapses',
  'state',
  'last_review',
  'updated_at',
  'deleted',
] as const;
const LOG_COLS = [
  'id',
  'word_id',
  'rating',
  'state',
  'due',
  'reviewed_at',
  'elapsed_days',
  'scheduled_days',
] as const;
const PLAN_COLS = ['book_id', 'daily_new', 'daily_review_cap', 'started_at', 'active'] as const;
const STAT_COLS = [
  'date',
  'new_count',
  'review_count',
  'minutes',
  'sessions',
  'streak_freeze_used',
] as const;

function insertSql(table: string, cols: readonly string[], verb = 'INSERT OR REPLACE'): string {
  return `${verb} INTO ${table}(${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`;
}
function values<T extends object>(row: T, cols: readonly (keyof T & string)[]): SqlValue[] {
  return cols.map((c) => (row[c] ?? null) as SqlValue);
}

// ---------- card ----------
export async function getCard(db: SqlDb, wordId: number): Promise<CardRow | null> {
  return db.getFirstAsync<CardRow>('SELECT * FROM card WHERE word_id = ? AND deleted = 0', [
    wordId,
  ]);
}

export async function getCards(db: SqlDb, wordIds: readonly number[]): Promise<CardRow[]> {
  if (wordIds.length === 0) return [];
  return db.getAllAsync<CardRow>(
    `SELECT * FROM card WHERE deleted = 0 AND word_id IN (${wordIds.map(() => '?').join(',')})`,
    [...wordIds],
  );
}

export async function getLearnedWordIds(db: SqlDb): Promise<Set<number>> {
  const rows = await db.getAllAsync<{ word_id: number }>(
    'SELECT word_id FROM card WHERE deleted = 0',
    [],
  );
  return new Set(rows.map((r) => r.word_id));
}

/** 学习中/重学中且在 until 之前到期的卡 */
export async function getDueLearning(db: SqlDb, until: number): Promise<CardRow[]> {
  return db.getAllAsync<CardRow>(
    'SELECT * FROM card WHERE deleted = 0 AND state IN (1, 3) AND due <= ? ORDER BY due',
    [until],
  );
}

/** 复习状态且在 until 之前到期的卡 */
export async function getDueReviews(db: SqlDb, until: number): Promise<CardRow[]> {
  return db.getAllAsync<CardRow>(
    'SELECT * FROM card WHERE deleted = 0 AND state = 2 AND due <= ? ORDER BY due',
    [until],
  );
}

export async function countDueReviews(db: SqlDb, until: number): Promise<number> {
  const r = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM card WHERE deleted = 0 AND state = 2 AND due <= ?',
    [until],
  );
  return r?.n ?? 0;
}

export async function countDueLearning(db: SqlDb, until: number): Promise<number> {
  const r = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM card WHERE deleted = 0 AND state IN (1, 3) AND due <= ?',
    [until],
  );
  return r?.n ?? 0;
}

/** 弱点词：since 之后选过「忘了」，或累计遗忘（复习时忘记）2 次以上。again_count 为累计选「忘了」的次数 */
export async function getWeakCards(
  db: SqlDb,
  since: number,
  limit: number,
): Promise<(CardRow & { again_count: number })[]> {
  return db.getAllAsync(
    `SELECT c.*, COALESCE(a.n, 0) AS again_count FROM card c
     LEFT JOIN (SELECT word_id, COUNT(*) AS n, MAX(reviewed_at) AS last_again FROM review_log WHERE rating = 1 GROUP BY word_id) a ON a.word_id = c.word_id
     WHERE c.deleted = 0 AND (c.lapses >= 2 OR a.last_again >= ?)
     ORDER BY again_count DESC, c.stability ASC LIMIT ?`,
    [since, limit],
  );
}

/** 生词：最近 since 之后第一次学的词，按学习时间倒序 */
export async function getRecentNewCards(
  db: SqlDb,
  since: number,
  limit: number,
): Promise<(CardRow & { first_seen: number })[]> {
  return db.getAllAsync(
    `SELECT c.*, f.first_seen FROM card c
     JOIN (SELECT word_id, MIN(reviewed_at) AS first_seen FROM review_log GROUP BY word_id) f ON f.word_id = c.word_id
     WHERE c.deleted = 0 AND f.first_seen >= ? ORDER BY f.first_seen DESC LIMIT ?`,
    [since, limit],
  );
}

export interface CardStateCounts {
  total: number;
  learning: number;
  review: number;
  /** 稳定度 ≥ 21 天，视为「已掌握」 */
  mastered: number;
}

export async function countCardStates(db: SqlDb): Promise<CardStateCounts> {
  const r = await db.getFirstAsync<CardStateCounts>(
    `SELECT COUNT(*) AS total,
       COALESCE(SUM(CASE WHEN state IN (1,3) THEN 1 ELSE 0 END),0) AS learning,
       COALESCE(SUM(CASE WHEN state = 2 THEN 1 ELSE 0 END),0) AS review,
       COALESCE(SUM(CASE WHEN state = 2 AND stability >= 21 THEN 1 ELSE 0 END),0) AS mastered
     FROM card WHERE deleted = 0`,
    [],
  );
  return r ?? { total: 0, learning: 0, review: 0, mastered: 0 };
}

/**
 * 一次评分的全部写入放在一个事务里：卡片、日志、当日统计。
 * kind：new=新词首次学习（计 new_count）；review=复习卡（计 review_count，受每日上限约束）；
 * learning=学习中/重学中卡片的短期重复（只记日志，不占新词和复习额度）。
 */
export async function recordReview(
  db: SqlDb,
  card: CardRow,
  log: ReviewLogRow,
  dateKey: string,
  kind: 'new' | 'review' | 'learning',
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync(insertSql('card', CARD_COLS), values(card, [...CARD_COLS]));
    await db.runAsync(insertSql('review_log', LOG_COLS), values(log, [...LOG_COLS]));
    await db.runAsync('INSERT OR IGNORE INTO daily_stat(date) VALUES (?)', [dateKey]);
    if (kind !== 'learning') {
      await db.runAsync(
        `UPDATE daily_stat SET ${kind === 'new' ? 'new_count = new_count + 1' : 'review_count = review_count + 1'} WHERE date = ?`,
        [dateKey],
      );
    }
  });
}

// ---------- review_log ----------
/** 最近窗口内复习（非新词首学）的记住率 */
export async function reviewRetention(
  db: SqlDb,
  since: number,
): Promise<{ total: number; remembered: number }> {
  const r = await db.getFirstAsync<{ total: number; remembered: number | null }>(
    'SELECT COUNT(*) AS total, SUM(CASE WHEN rating > 1 THEN 1 ELSE 0 END) AS remembered FROM review_log WHERE reviewed_at >= ? AND state = 2',
    [since],
  );
  return { total: r?.total ?? 0, remembered: r?.remembered ?? 0 };
}

export async function countReviews(db: SqlDb): Promise<number> {
  const r = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM review_log', []);
  return r?.n ?? 0;
}

// ---------- study_plan ----------
export async function getPlans(db: SqlDb): Promise<StudyPlanRow[]> {
  return db.getAllAsync<StudyPlanRow>('SELECT * FROM study_plan', []);
}

export async function getActivePlan(db: SqlDb): Promise<StudyPlanRow | null> {
  return db.getFirstAsync<StudyPlanRow>('SELECT * FROM study_plan WHERE active = 1 LIMIT 1', []);
}

/** 设为当前词书；其它词书保留计划但不再激活 */
export async function activatePlan(
  db: SqlDb,
  bookId: string,
  defaults: { dailyNew: number; dailyReviewCap: number },
  now: number,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE study_plan SET active = 0', []);
    await db.runAsync(
      'INSERT INTO study_plan(book_id, daily_new, daily_review_cap, started_at, active) VALUES (?, ?, ?, ?, 1) ON CONFLICT(book_id) DO UPDATE SET active = 1',
      [bookId, defaults.dailyNew, defaults.dailyReviewCap, now],
    );
  });
}

export async function updatePlanAmounts(
  db: SqlDb,
  bookId: string,
  dailyNew: number,
  dailyReviewCap: number,
): Promise<void> {
  await db.runAsync('UPDATE study_plan SET daily_new = ?, daily_review_cap = ? WHERE book_id = ?', [
    dailyNew,
    dailyReviewCap,
    bookId,
  ]);
}

// ---------- daily_stat ----------
export async function getDayStat(db: SqlDb, dateKey: string): Promise<DailyStatRow | null> {
  return db.getFirstAsync<DailyStatRow>('SELECT * FROM daily_stat WHERE date = ?', [dateKey]);
}

export async function listDayStats(db: SqlDb, sinceKey?: string): Promise<DailyStatRow[]> {
  return sinceKey
    ? db.getAllAsync<DailyStatRow>('SELECT * FROM daily_stat WHERE date >= ? ORDER BY date', [
        sinceKey,
      ])
    : db.getAllAsync<DailyStatRow>('SELECT * FROM daily_stat ORDER BY date', []);
}

export async function recordSessionDone(
  db: SqlDb,
  dateKey: string,
  minutes: number,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('INSERT OR IGNORE INTO daily_stat(date) VALUES (?)', [dateKey]);
    await db.runAsync(
      'UPDATE daily_stat SET sessions = sessions + 1, minutes = minutes + ? WHERE date = ?',
      [minutes, dateKey],
    );
  });
}

// ---------- kv（非敏感设置） ----------
const FORBIDDEN_KV = /key|secret|token|password/i;

export async function kvGet(db: SqlDb, key: string): Promise<string | null> {
  const r = await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', [key]);
  return r?.value ?? null;
}

export async function kvSet(db: SqlDb, key: string, value: string): Promise<void> {
  // 防御：密钥只能进 expo-secure-store
  if (FORBIDDEN_KV.test(key) && key !== 'words_db_version')
    throw new Error(`kv 不允许保存敏感项：${key}`);
  await db.runAsync('INSERT OR REPLACE INTO kv(key, value) VALUES (?, ?)', [key, value]);
}

// ---------- ai_cache ----------
export async function getAiCache(
  db: SqlDb,
  wordId: number,
  kind: string,
  model: string,
): Promise<string | null> {
  const r = await db.getFirstAsync<{ content: string }>(
    'SELECT content FROM ai_cache WHERE word_id = ? AND kind = ? AND model = ?',
    [wordId, kind, model],
  );
  return r?.content ?? null;
}

export async function putAiCache(
  db: SqlDb,
  wordId: number,
  kind: string,
  model: string,
  content: string,
  now: number,
): Promise<void> {
  await db.runAsync(
    'INSERT OR REPLACE INTO ai_cache(word_id, kind, model, content, created_at) VALUES (?, ?, ?, ?, ?)',
    [wordId, kind, model, content, now],
  );
}

// ---------- 备份 ----------
export async function dumpForBackup(
  db: SqlDb,
  schemaVersion: number,
  now: number,
): Promise<BackupPayload> {
  const kv = await db.getAllAsync<KvRow>('SELECT key, value FROM kv', []);
  return {
    format: 'english-learn-backup',
    version: 1,
    exported_at: now,
    schema_version: schemaVersion,
    card: await db.getAllAsync<CardRow>('SELECT * FROM card', []),
    review_log: await db.getAllAsync<ReviewLogRow>(
      'SELECT * FROM review_log ORDER BY reviewed_at',
      [],
    ),
    study_plan: await getPlans(db),
    daily_stat: await listDayStats(db),
    kv: kv.filter((r) => EXPORTABLE_KV_KEYS.has(r.key)),
  };
}

/** 用备份整体替换学习数据（AI 缓存保留）。在一个事务里完成，失败不改动现有数据。 */
export async function restoreFromBackup(db: SqlDb, p: BackupPayload): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const t of ['card', 'review_log', 'study_plan', 'daily_stat'])
      await db.runAsync(`DELETE FROM ${t}`, []);
    for (const c of p.card)
      await db.runAsync(insertSql('card', CARD_COLS), values(c, [...CARD_COLS]));
    for (const l of p.review_log)
      await db.runAsync(insertSql('review_log', LOG_COLS), values(l, [...LOG_COLS]));
    for (const s of p.study_plan)
      await db.runAsync(
        insertSql('study_plan', PLAN_COLS),
        values({ ...s, started_at: s.started_at ?? p.exported_at, active: s.active ? 1 : 0 }, [
          ...PLAN_COLS,
        ]),
      );
    for (const d of p.daily_stat)
      await db.runAsync(
        insertSql('daily_stat', STAT_COLS),
        values(
          {
            ...d,
            new_count: d.new_count ?? 0,
            review_count: d.review_count ?? 0,
            minutes: d.minutes ?? 0,
            sessions: d.sessions ?? 0,
            streak_freeze_used: d.streak_freeze_used ?? 0,
          },
          [...STAT_COLS],
        ),
      );
    for (const kv of p.kv)
      if (EXPORTABLE_KV_KEYS.has(kv.key))
        await db.runAsync('INSERT OR REPLACE INTO kv(key, value) VALUES (?, ?)', [
          kv.key,
          kv.value,
        ]);
  });
}
