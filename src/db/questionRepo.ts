/** 题库（question）与作答记录（attempt）的仓储：这两张表的 SQL 都在这里。 */
import type { ExamId } from '../lib/exams';
import type { OpenMistakeRow } from '../lib/exam/mistakes';
import type { AttemptRow, PracticeSectionId, QuestionRow, QuestionType } from '../lib/exam/types';
import type { SqlDb, SqlValue } from './types';

export const QUESTION_COLS = [
  'id',
  'exam',
  'section',
  'type',
  'schema_version',
  'payload',
  'source',
  'model',
  'prompt_version',
  'created_at',
  'deleted',
] as const;

export const ATTEMPT_COLS = [
  'id',
  'question_id',
  'exam',
  'section',
  'type',
  'answer',
  'score',
  'max_score',
  'feedback',
  'wrong_count',
  'needs_redo',
  'duration_ms',
  'started_at',
  'submitted_at',
] as const;

export const insertQuestionSql = `INSERT INTO question(${QUESTION_COLS.join(',')}) VALUES (${QUESTION_COLS.map(() => '?').join(',')})`;
export const insertAttemptSql = `INSERT INTO attempt(${ATTEMPT_COLS.join(',')}) VALUES (${ATTEMPT_COLS.map(() => '?').join(',')})`;

export function questionValues(r: QuestionRow): SqlValue[] {
  return QUESTION_COLS.map((c) => (r[c] ?? null) as SqlValue);
}
export function attemptValues(r: AttemptRow): SqlValue[] {
  return ATTEMPT_COLS.map((c) => (r[c] ?? null) as SqlValue);
}

// ---------- question ----------
export async function insertQuestion(db: SqlDb, q: QuestionRow): Promise<void> {
  await db.runAsync(insertQuestionSql, questionValues(q));
}

/** 某门考试某种题型下未删除的题，最新的在前 */
export async function listQuestions(
  db: SqlDb,
  exam: ExamId,
  type: QuestionType,
  limit = 100,
): Promise<QuestionRow[]> {
  return db.getAllAsync<QuestionRow>(
    'SELECT * FROM question WHERE exam = ? AND type = ? AND deleted = 0 ORDER BY created_at DESC, id LIMIT ?',
    [exam, type, limit],
  );
}

/**
 * 取单题。软删除的题也能取到（deleted = 1）：错题本和练习记录里的旧作答还要能打开原题。
 */
export async function getQuestion(db: SqlDb, id: string): Promise<QuestionRow | null> {
  return db.getFirstAsync<QuestionRow>('SELECT * FROM question WHERE id = ?', [id]);
}

/** 软删除：不再出现在题目列表里，作答记录保留 */
export async function softDeleteQuestion(db: SqlDb, id: string): Promise<void> {
  await db.runAsync('UPDATE question SET deleted = 1 WHERE id = ?', [id]);
}

// ---------- attempt ----------
export async function insertAttempt(db: SqlDb, a: AttemptRow): Promise<void> {
  await db.runAsync(insertAttemptSql, attemptValues(a));
}

/**
 * 某道题的全部作答，最新的在前；同一时间戳按 id 降序定一个确定的次序
 * （和 listOpenMistakes 取「最近一次」的次序一致，第一条就是错题本看的那条）。
 */
export async function listAttemptsForQuestion(
  db: SqlDb,
  questionId: string,
): Promise<AttemptRow[]> {
  return db.getAllAsync<AttemptRow>(
    'SELECT * FROM attempt WHERE question_id = ? ORDER BY submitted_at DESC, id DESC',
    [questionId],
  );
}

/**
 * 客观题里有答错的作答（wrong_count > 0），逐条返回、不按题去重，最新的在前。
 * 主观题 wrong_count 固定 0，不会出现在这里；错题本页面用的是 listOpenMistakes。
 */
export async function listWrongAttempts(
  db: SqlDb,
  exam: ExamId,
  limit = 100,
): Promise<AttemptRow[]> {
  return db.getAllAsync<AttemptRow>(
    'SELECT * FROM attempt WHERE exam = ? AND wrong_count > 0 ORDER BY submitted_at DESC, id LIMIT ?',
    [exam, limit],
  );
}

/**
 * 待重练：主观题得分低于 9 的作答（needs_redo = 1），逐条返回、不按题去重，最新的在前。
 * 错题本页面用的是 listOpenMistakes（每道题只看最近一次作答）。
 */
export async function listRedoAttempts(
  db: SqlDb,
  exam: ExamId,
  limit = 100,
): Promise<AttemptRow[]> {
  return db.getAllAsync<AttemptRow>(
    'SELECT * FROM attempt WHERE exam = ? AND needs_redo = 1 ORDER BY submitted_at DESC, id LIMIT ?',
    [exam, limit],
  );
}

export interface SectionStat {
  section: PracticeSectionId;
  /** 作答次数 */
  attempts: number;
  /** 已评分作答的得分合计（评分失败的不计） */
  score_sum: number;
  /** 已评分作答的满分合计，和 score_sum 一起算得分率 */
  max_score_sum: number;
  /** 客观题答错的题数合计 */
  wrong_sum: number;
  /** 待重练的作答数 */
  redo_count: number;
  /** 最近一次提交时间 */
  last_submitted_at: number;
}

/** 练习记录：按板块统计某门考试 since 之后的作答（默认全部） */
export async function statsBySection(db: SqlDb, exam: ExamId, since = 0): Promise<SectionStat[]> {
  return db.getAllAsync<SectionStat>(
    `SELECT section, COUNT(*) AS attempts,
       COALESCE(SUM(score), 0) AS score_sum,
       COALESCE(SUM(CASE WHEN score IS NULL THEN 0 ELSE max_score END), 0) AS max_score_sum,
       COALESCE(SUM(wrong_count), 0) AS wrong_sum,
       COALESCE(SUM(needs_redo), 0) AS redo_count,
       MAX(submitted_at) AS last_submitted_at
     FROM attempt WHERE exam = ? AND submitted_at >= ?
     GROUP BY section ORDER BY section`,
    [exam, since],
  );
}

/**
 * 某门考试某种题型最近 limit 道未删除题目的话题（payload.topic），最新的在前，去重（不区分大小写）。
 * v1 的老题没有 topic，跳过；payload 不是合法 JSON 的也跳过，不会让整个查询失败。
 * 结果可以直接传给 generateQuestion 的 avoidTopics。
 */
export async function listRecentTopics(
  db: SqlDb,
  exam: ExamId,
  type: QuestionType,
  limit = 10,
): Promise<string[]> {
  const rows = await db.getAllAsync<{ topic: unknown }>(
    `SELECT CASE WHEN json_valid(payload) THEN json_extract(payload, '$.topic') END AS topic
     FROM question WHERE exam = ? AND type = ? AND deleted = 0
     ORDER BY created_at DESC, id LIMIT ?`,
    [exam, type, limit],
  );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const { topic } of rows) {
    if (typeof topic !== 'string') continue;
    const t = topic.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out;
}

/**
 * 错题本：每道题只看最近一次作答——客观题 wrong_count > 0、主观题（翻译、写作）needs_redo = 1
 * 的列出来（主观题在页面上带「待重练」标签，wrong_count 保持 0），
 * 最近做的在前。作答记录只追加不修改：重做全对（或主观题 ≥ 9 分）会写一条新作答，
 * 这道题的最近一次作答就「过了」，自然从列表里消失，练习记录和统计不受影响。
 * 同一时间戳按 id 定一个确定的次序（submitted_at DESC, id DESC），不会列两遍。id 是随机 uuid，
 * 这个次序不代表写入先后；不用 rowid，因为备份恢复后 rowid 会重排，id 不变。
 * 软删除的题也列（错题还在，原题能打开）。行的含义见 src/lib/exam/mistakes.ts。
 */
export async function listOpenMistakes(
  db: SqlDb,
  exam: ExamId,
  limit = 200,
): Promise<OpenMistakeRow[]> {
  return db.getAllAsync<OpenMistakeRow>(
    `SELECT a.question_id, a.exam, a.section, a.type, a.score, a.max_score,
       a.wrong_count, a.needs_redo, a.submitted_at,
       (SELECT COUNT(*) FROM attempt m
          WHERE m.question_id = a.question_id AND (m.wrong_count > 0 OR m.needs_redo = 1)) AS miss_times,
       q.schema_version, q.payload
     FROM attempt a JOIN question q ON q.id = a.question_id
     WHERE a.exam = ?
       AND a.id = (SELECT l.id FROM attempt l WHERE l.question_id = a.question_id
                   ORDER BY l.submitted_at DESC, l.id DESC LIMIT 1)
       AND (a.wrong_count > 0 OR a.needs_redo = 1)
     ORDER BY a.submitted_at DESC, a.question_id
     LIMIT ?`,
    [exam, limit],
  );
}
