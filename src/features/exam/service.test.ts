/**
 * @jest-environment node
 *
 * 选考试：写入 kv `exam`；没有在学词书时自动激活六级词书（每天 20 个新词），已有在学词书时不动。
 */
import { openMemoryDb } from '../../db/__testutils__/nodeDb';
import { runMigrations } from '../../db/migrate';
import { MIGRATIONS } from '../../db/migrations';
import type { SqlDb } from '../../db/types';
import * as repo from '../../db/userRepo';
import { DEFAULT_DAILY_REVIEW_CAP } from '../books/constants';
import { chooseExam, EXAM_KV_KEY, getSelectedExam } from './service';

const mockDb: { user: SqlDb | null } = { user: null };
jest.mock('../../db/open', () => ({
  getDatabases: jest.fn(async () => ({ user: mockDb.user, words: mockDb.user, schemaVersion: 1 })),
}));
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));

const T0 = new Date(2026, 9, 23, 9).getTime();
let user: SqlDb;

async function freshDb(): Promise<SqlDb> {
  const db = openMemoryDb();
  await runMigrations(db, MIGRATIONS, T0);
  return db;
}

beforeEach(async () => {
  user = await freshDb();
  mockDb.user = user;
});

it('没选过考试时读到 null（v0.1.1 升级上来的用户会先看到选考试页）', async () => {
  await expect(getSelectedExam()).resolves.toBeNull();
});

it('没有在学词书时选六级：自动选上六级词书，每天 20 个新词，复习上限用默认值', async () => {
  await chooseExam('cet6', T0);
  expect(await repo.kvGet(user, EXAM_KV_KEY)).toBe('cet6');
  await expect(getSelectedExam()).resolves.toBe('cet6');
  expect(await repo.getActivePlan(user)).toEqual({
    book_id: 'cet6',
    daily_new: 20,
    daily_review_cap: DEFAULT_DAILY_REVIEW_CAP,
    started_at: T0,
    active: 1,
  });
  expect(await repo.getPlans(user)).toHaveLength(1);
});

it('已有在学词书时选六级：在学词书和每日量都不变', async () => {
  await repo.activatePlan(user, 'cet4', { dailyNew: 30, dailyReviewCap: 300 }, T0 - 1000);
  const before = await repo.getPlans(user);
  await chooseExam('cet6', T0);
  expect(await repo.kvGet(user, EXAM_KV_KEY)).toBe('cet6');
  expect(await repo.getPlans(user)).toEqual(before);
  expect(await repo.getActivePlan(user)).toMatchObject({ book_id: 'cet4', daily_new: 30 });
});

it('重复选六级是幂等的，不会重置已调过的每日量', async () => {
  await chooseExam('cet6', T0);
  await repo.updatePlanAmounts(user, 'cet6', 50, 500);
  await chooseExam('cet6', T0 + 1000);
  expect(await repo.getActivePlan(user)).toMatchObject({
    book_id: 'cet6',
    daily_new: 50,
    daily_review_cap: 500,
  });
});

it('即将推出的考试不能选：报错，kv 和词书都不动', async () => {
  await expect(chooseExam('ielts', T0)).rejects.toThrow(/即将推出/);
  expect(await repo.kvGet(user, EXAM_KV_KEY)).toBeNull();
  expect(await repo.getPlans(user)).toEqual([]);
});

it('kv 里存了不认识或还没上线的值，都当作没选过', async () => {
  for (const v of ['ielts', 'cet4', '', 'garbage']) {
    await repo.kvSet(user, EXAM_KV_KEY, v);
    await expect(getSelectedExam()).resolves.toBeNull();
  }
});
