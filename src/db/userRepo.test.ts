/**
 * @jest-environment node
 */
import { parseBackup } from '../lib/backup';
import { CardState, newCardRow, rateCard } from '../lib/fsrs';
import { openMemoryDb } from './__testutils__/nodeDb';
import { runMigrations } from './migrate';
import { MIGRATIONS, type Migration } from './migrations';
import type { SqlDb } from './types';
import * as repo from './userRepo';

const now = new Date(2026, 9, 17, 9).getTime();
let db: SqlDb;

beforeEach(async () => {
  db = openMemoryDb();
  await runMigrations(db, MIGRATIONS, now);
});

describe('迁移', () => {
  it('重复执行是幂等的，版本号记在 schema_migrations', async () => {
    expect(await runMigrations(db, MIGRATIONS, now)).toBe(2);
    const rows = await db.getAllAsync<{ version: number }>(
      'SELECT version FROM schema_migrations ORDER BY version',
      [],
    );
    expect(rows).toEqual([{ version: 1 }, { version: 2 }]);
  });

  it('失败的迁移整体回滚，不留半张表', async () => {
    const bad: Migration[] = [
      ...MIGRATIONS,
      { version: 3, name: 'bad', sql: 'CREATE TABLE t2(x INTEGER); SELECT * FROM no_such_table;' },
    ];
    await expect(runMigrations(db, bad, now)).rejects.toThrow();
    expect(
      await db.getFirstAsync('SELECT name FROM sqlite_master WHERE name = ?', ['t2']),
    ).toBeNull();
    expect(await runMigrations(db, MIGRATIONS, now)).toBe(2);
  });
});

describe('评分写入', () => {
  it('一个事务里写卡片、日志和当日统计；新词、复习分开计数，学习中的短期重复不占额度', async () => {
    const r1 = rateCard(newCardRow(1, now), 'again', now, 'log-1');
    await repo.recordReview(db, r1.card, r1.log, '2026-10-17', 'new');
    const r2 = rateCard(r1.card, 'good', now + 60_000, 'log-2');
    await repo.recordReview(db, r2.card, r2.log, '2026-10-17', 'learning');
    const r3 = rateCard(r2.card, 'good', r2.card.due, 'log-3');
    await repo.recordReview(db, r3.card, r3.log, '2026-10-19', 'review');

    expect((await repo.getCard(db, 1))?.reps).toBe(3);
    expect(await repo.countReviews(db)).toBe(3);
    expect(await repo.getDayStat(db, '2026-10-17')).toMatchObject({
      new_count: 1,
      review_count: 0,
      sessions: 0,
    });
    expect(await repo.getDayStat(db, '2026-10-19')).toMatchObject({
      new_count: 0,
      review_count: 1,
    });
    expect([...(await repo.getLearnedWordIds(db))]).toEqual([1]);
  });

  it('到期查询区分学习中和复习状态', async () => {
    const learning = rateCard(newCardRow(1, now), 'again', now, 'a').card;
    const review = rateCard(newCardRow(2, now), 'easy', now, 'b').card;
    await repo.recordReview(
      db,
      learning,
      rateCard(newCardRow(1, now), 'again', now, 'a').log,
      '2026-10-17',
      'new',
    );
    await repo.recordReview(
      db,
      review,
      rateCard(newCardRow(2, now), 'easy', now, 'b').log,
      '2026-10-17',
      'new',
    );

    expect((await repo.getDueLearning(db, now + 3_600_000)).map((c) => c.word_id)).toEqual([1]);
    expect(await repo.countDueReviews(db, now)).toBe(0);
    expect(await repo.countDueReviews(db, review.due)).toBe(1);
    expect((await repo.countCardStates(db)).learning).toBe(1);
  });

  it('弱点词：最近选过「忘了」的词，之后答对也保留；时间窗外的不算', async () => {
    const c = rateCard(newCardRow(5, now), 'again', now, 'w1');
    await repo.recordReview(db, c.card, c.log, '2026-10-17', 'new');
    const ok = rateCard(c.card, 'good', now + 60_000, 'w2');
    await repo.recordReview(db, ok.card, ok.log, '2026-10-17', 'learning');
    const good = rateCard(newCardRow(6, now), 'good', now, 'w3');
    await repo.recordReview(db, good.card, good.log, '2026-10-17', 'new');

    const weak = await repo.getWeakCards(db, now - 1, 10);
    expect(weak.map((x) => [x.word_id, x.again_count])).toEqual([[5, 1]]);
    expect(await repo.getWeakCards(db, now + 1, 10)).toEqual([]);
    expect(c.card.state).toBe(CardState.Learning);
  });
});

describe('打卡与计划', () => {
  it('完成一组记 sessions 和分钟数', async () => {
    await repo.recordSessionDone(db, '2026-10-17', 3.5);
    await repo.recordSessionDone(db, '2026-10-17', 1);
    expect(await repo.getDayStat(db, '2026-10-17')).toMatchObject({ sessions: 2, minutes: 4.5 });
  });

  it('同一时间只有一本当前词书，切换时保留各自的每日量', async () => {
    await repo.activatePlan(db, 'cet4', { dailyNew: 20, dailyReviewCap: 200 }, now);
    await repo.updatePlanAmounts(db, 'cet4', 30, 300);
    await repo.activatePlan(db, 'ielts', { dailyNew: 20, dailyReviewCap: 200 }, now);
    await repo.activatePlan(db, 'cet4', { dailyNew: 20, dailyReviewCap: 200 }, now);
    expect(await repo.getActivePlan(db)).toMatchObject({
      book_id: 'cet4',
      daily_new: 30,
      daily_review_cap: 300,
    });
    expect((await repo.getPlans(db)).filter((p) => p.active === 1)).toHaveLength(1);
  });
});

describe('设置与安全', () => {
  it('kv 拒绝保存密钥类字段', async () => {
    await expect(repo.kvSet(db, 'llm_api_key', 'sk-x')).rejects.toThrow();
    await repo.kvSet(db, 'llm_model', 'deepseek-chat');
    expect(await repo.kvGet(db, 'llm_model')).toBe('deepseek-chat');
  });
});

describe('导出/导入', () => {
  it('导出再导入得到同样的数据，且备份里没有非白名单设置', async () => {
    const r = rateCard(newCardRow(1, now), 'good', now, 'log-1');
    await repo.recordReview(db, r.card, r.log, '2026-10-17', 'new');
    await repo.recordSessionDone(db, '2026-10-17', 2);
    await repo.activatePlan(db, 'cet6', { dailyNew: 10, dailyReviewCap: 100 }, now);
    await repo.kvSet(db, 'llm_model', 'm');
    await repo.kvSet(db, 'words_db_version', '1');

    const dump = await repo.dumpForBackup(db, 1, now);
    expect(dump.kv.map((k) => k.key)).toEqual(['llm_model']);

    const other = openMemoryDb();
    await runMigrations(other, MIGRATIONS, now);
    await repo.restoreFromBackup(other, parseBackup(JSON.stringify(dump)));
    expect(await repo.getCard(other, 1)).toEqual(r.card);
    expect(await repo.getActivePlan(other)).toMatchObject({ book_id: 'cet6' });
    expect(await repo.getDayStat(other, '2026-10-17')).toMatchObject({ new_count: 1, sessions: 1 });
  });

  it('当前考试 exam 随备份导出、导入；导入时值不合法就忽略，保留设备上原来的选择', async () => {
    await repo.kvSet(db, 'exam', 'cet6');
    const dump = await repo.dumpForBackup(db, 1, now);
    expect(dump.kv).toContainEqual({ key: 'exam', value: 'cet6' });

    // 新设备：还没选过考试，导入后直接是六级
    const fresh = openMemoryDb();
    await runMigrations(fresh, MIGRATIONS, now);
    await repo.restoreFromBackup(fresh, parseBackup(JSON.stringify(dump)));
    expect(await repo.kvGet(fresh, 'exam')).toBe('cet6');

    // 手改过的备份：exam 值不合法。即使绕过 parseBackup 直接恢复，也不会写进 kv
    const tampered = { ...dump, kv: [{ key: 'exam', value: 'ielts' }] };
    expect(parseBackup(JSON.stringify(tampered)).kv).toEqual([]);
    await repo.restoreFromBackup(fresh, tampered);
    expect(await repo.kvGet(fresh, 'exam')).toBe('cet6');
  });
});
