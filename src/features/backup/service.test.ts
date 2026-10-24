/**
 * @jest-environment node
 *
 * 导入前自动备份：先备份再导入、只保留 5 份、备份失败不导入、从自动备份恢复后数据一致、备份不含密钥。
 */
import { openMemoryDb } from '../../db/__testutils__/nodeDb';
import { runMigrations } from '../../db/migrate';
import { MIGRATIONS } from '../../db/migrations';
import type { SqlDb } from '../../db/types';
import * as qrepo from '../../db/questionRepo';
import * as repo from '../../db/userRepo';
import { AUTO_BACKUP_KEEP, autoBackupTime } from '../../lib/backup';
import { newCardRow, rateCard } from '../../lib/fsrs';
import {
  AutoBackupError,
  createAutoBackup,
  listAutoBackups,
  prepareImport,
  prepareRestoreLatest,
  type BackupDeps,
} from './service';
import type { AutoBackupStore } from './types';

const mockDb: { user: SqlDb | null } = { user: null };
jest.mock('../../db/open', () => ({
  getDatabases: jest.fn(async () => ({ user: mockDb.user, words: mockDb.user, schemaVersion: 1 })),
}));
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));
// 真正的文件实现不参与单测（用下面的内存存储注入）
jest.mock('../../platform/files', () => ({ pickTextFile: jest.fn(), saveTextFile: jest.fn() }));
jest.mock('../../platform/auto-backup-store', () => ({ autoBackupStore: {} }));

const T0 = new Date(2026, 9, 17, 9).getTime();
let user: SqlDb;
let files: Map<string, string>;
let clock: number;

function memoryStore(overrides: Partial<AutoBackupStore> = {}): AutoBackupStore {
  return {
    list: async () => [...files.keys()],
    write: async (name, text) => {
      files.set(name, text);
    },
    read: async (name) => {
      const t = files.get(name);
      if (t === undefined) throw new Error('not found');
      return t;
    },
    remove: async (name) => {
      files.delete(name);
    },
    ...overrides,
  };
}

function deps(over: Partial<BackupDeps> = {}): BackupDeps {
  return {
    store: memoryStore(),
    pickFile: async () => null,
    now: () => (clock += 60_000),
    ...over,
  };
}

/** user.db 里的全部学习数据（与备份内容对应） */
async function snapshot(db: SqlDb) {
  return {
    card: await db.getAllAsync('SELECT * FROM card ORDER BY word_id', []),
    review_log: await db.getAllAsync('SELECT * FROM review_log ORDER BY id', []),
    study_plan: await db.getAllAsync('SELECT * FROM study_plan ORDER BY book_id', []),
    daily_stat: await db.getAllAsync('SELECT * FROM daily_stat ORDER BY date', []),
    kv: await db.getAllAsync('SELECT key, value FROM kv WHERE key IN (?, ?) ORDER BY key', [
      'llm_model',
      'auto_speak',
    ]),
    question: await db.getAllAsync('SELECT * FROM question ORDER BY id', []),
    attempt: await db.getAllAsync('SELECT * FROM attempt ORDER BY id', []),
  };
}

async function freshDb(): Promise<SqlDb> {
  const db = openMemoryDb();
  await runMigrations(db, MIGRATIONS, T0);
  return db;
}

async function study(db: SqlDb, wordIds: number[], day: string): Promise<void> {
  for (const id of wordIds) {
    const r = rateCard(newCardRow(id, T0), 'good', T0, `log-${day}-${id}`);
    await repo.recordReview(db, r.card, r.log, day, 'new');
  }
  await repo.recordSessionDone(db, day, 2);
}

/** 另一台设备导出的备份文件：只有 3 个词 */
async function otherDeviceBackupText(): Promise<string> {
  const other = await freshDb();
  await study(other, [101, 102, 103], '2026-10-10');
  await repo.activatePlan(other, 'ielts', { dailyNew: 10, dailyReviewCap: 100 }, T0);
  return JSON.stringify(await repo.dumpForBackup(other, 1, T0));
}

beforeEach(async () => {
  files = new Map();
  clock = T0;
  user = await freshDb();
  mockDb.user = user;
  // 当前设备上的进度：5 个词、四级计划、设置
  await study(user, [1, 2, 3, 4, 5], '2026-10-17');
  await repo.activatePlan(user, 'cet4', { dailyNew: 20, dailyReviewCap: 200 }, T0);
  await repo.kvSet(user, 'llm_model', 'deepseek-chat');
  await repo.kvSet(user, 'auto_speak', '0');
  await repo.kvSet(user, 'words_db_version', '1');
  // 题库：一道题和一次作答，导入 / 恢复时要跟着学习进度一起备份和还原
  await qrepo.insertQuestion(user, {
    id: 'q-local',
    exam: 'cet6',
    section: 'writing',
    type: 'essay',
    schema_version: 1,
    payload: '{"title":"t"}',
    source: 'llm',
    model: 'm',
    prompt_version: 1,
    created_at: T0,
    deleted: 0,
  });
  await qrepo.insertAttempt(user, {
    id: 'a-local',
    question_id: 'q-local',
    exam: 'cet6',
    section: 'writing',
    type: 'essay',
    answer: '"essay"',
    score: 7,
    max_score: 15,
    feedback: '{"score":7}',
    wrong_count: 0,
    needs_redo: 1,
    duration_ms: 1000,
    started_at: T0,
    submitted_at: T0,
  });
});

it('确认导入时先生成自动备份，备份内容就是导入前的进度，然后才覆盖', async () => {
  const before = await snapshot(user);
  const text = await otherDeviceBackupText();
  const prepared = await prepareImport(deps({ pickFile: async () => text }));

  expect(prepared).not.toBeNull();
  expect(prepared!.cards).toBe(3);
  // 确认前：没导入，也没写备份
  expect(await snapshot(user)).toEqual(before);
  expect(files.size).toBe(0);

  await expect(prepared!.apply()).resolves.toMatch(/已导入 3 个单词/);
  // 确认后：有一份自动备份，内容等于导入前的进度
  const [backup] = await listAutoBackups(deps());
  expect([...files.keys()]).toEqual([backup.name]);
  const saved = JSON.parse(files.get(backup.name)!) as { card: unknown[] };
  expect(saved.card).toEqual(before.card);
  expect(await repo.getCard(user, 101)).not.toBeNull();
  expect(await repo.getCard(user, 1)).toBeNull();
  // 题库也被替换成备份里的（另一台设备没有题），自动备份里留着原来的题库
  expect(await qrepo.getQuestion(user, 'q-local')).toBeNull();
  const savedBank = JSON.parse(files.get(backup.name)!) as {
    question: unknown[];
    attempt: unknown[];
  };
  expect(savedBank.question).toEqual(before.question);
  expect(savedBank.attempt).toEqual(before.attempt);
});

it('在确认框里取消导入或恢复，不写备份，备份列表不变', async () => {
  const first = await prepareImport(deps({ pickFile: async () => otherDeviceBackupText() }));
  await first!.apply();
  const listed = (await listAutoBackups(deps())).map((b) => b.name);
  const before = await snapshot(user);

  // 打开再取消（不调 apply），来回多次
  for (let i = 0; i < AUTO_BACKUP_KEEP + 2; i++) {
    clock += 60_000;
    await prepareImport(deps({ pickFile: async () => otherDeviceBackupText() }));
    await prepareRestoreLatest(deps());
  }

  expect((await listAutoBackups(deps())).map((b) => b.name)).toEqual(listed);
  expect(await snapshot(user)).toEqual(before);
});

it('用户取消选择文件时不备份也不导入', async () => {
  await expect(prepareImport(deps({ pickFile: async () => null }))).resolves.toBeNull();
  expect(files.size).toBe(0);
});

it('备份文件无效时直接报错，不生成自动备份', async () => {
  await expect(
    prepareImport(deps({ pickFile: async () => '{"not":"a backup"}' })),
  ).rejects.toThrow();
  expect(files.size).toBe(0);
});

it('自动备份失败时中止导入，当前进度没有任何改动', async () => {
  const before = await snapshot(user);
  const text = await otherDeviceBackupText();
  const failing = memoryStore({
    write: async () => {
      throw new Error('ENOSPC: no space left on device');
    },
  });
  const prepared = await prepareImport(deps({ pickFile: async () => text, store: failing }));
  const p = prepared!.apply();
  await expect(p).rejects.toBeInstanceOf(AutoBackupError);
  await expect(p).rejects.toThrow(/自动备份当前进度失败，已取消/);
  await expect(p).rejects.not.toThrow(/ENOSPC/);
  expect(await snapshot(user)).toEqual(before);
  expect(files.size).toBe(0);
});

it(`轮转：连续备份后只保留最近 ${AUTO_BACKUP_KEEP} 份，其它文件不受影响`, async () => {
  files.set('notes.txt', 'keep me');
  const made: string[] = [];
  for (let i = 0; i < 8; i++) made.push((await createAutoBackup(deps())).name);

  const autos = [...files.keys()].filter((n) => autoBackupTime(n) !== null);
  expect(autos).toHaveLength(AUTO_BACKUP_KEEP);
  expect(new Set(autos)).toEqual(new Set(made.slice(-AUTO_BACKUP_KEEP)));
  expect(files.get('notes.txt')).toBe('keep me');

  const listed = await listAutoBackups(deps());
  expect(listed.map((b) => b.name)).toEqual(made.slice(-AUTO_BACKUP_KEEP).reverse());
});

it('轮转删除旧文件失败不影响本次备份', async () => {
  const d = deps({ store: memoryStore({ remove: async () => Promise.reject(new Error('busy')) }) });
  for (let i = 0; i < AUTO_BACKUP_KEEP + 1; i++) await createAutoBackup(d);
  expect(files.size).toBe(AUTO_BACKUP_KEEP + 1);
});

it('从最近的自动备份恢复后，数据与导入前完全一致；恢复前也会再备份一份', async () => {
  const before = await snapshot(user);
  const prepared = await prepareImport(deps({ pickFile: async () => otherDeviceBackupText() }));
  await prepared!.apply();
  const afterImport = await snapshot(user);
  expect(afterImport).not.toEqual(before);

  const [importBackup] = await listAutoBackups(deps());
  const restore = await prepareRestoreLatest(deps());
  expect(restore).not.toBeNull();
  expect(restore!.target.name).toBe(importBackup.name);
  expect(restore!.cards).toBe(5);
  expect(await snapshot(user)).toEqual(afterImport);

  clock += 60_000;
  await expect(restore!.apply()).resolves.toMatch(/已从自动备份恢复 5 个单词/);
  expect(await snapshot(user)).toEqual(before);
  // 恢复前把「导入后」的进度也备份了一份，而且它现在是最新的
  const [latest] = await listAutoBackups(deps());
  expect(latest.name).not.toBe(importBackup.name);
  const saved = JSON.parse(files.get(latest.name)!) as { card: unknown[] };
  expect(saved.card).toEqual(afterImport.card);
});

it('还没有自动备份时恢复返回 null，不改动进度', async () => {
  const before = await snapshot(user);
  await expect(prepareRestoreLatest(deps())).resolves.toBeNull();
  expect(await snapshot(user)).toEqual(before);
});

it('自动备份里不含 API 密钥，也不含白名单以外的设置', async () => {
  // 模拟有人误把敏感项直接写进了 kv（kvSet 会拒绝，这里绕过它）
  await user.runAsync('INSERT INTO kv(key, value) VALUES (?, ?)', ['llm_api_key', 'sk-secret']);
  const info = await createAutoBackup(deps());
  const text = files.get(info.name)!;
  expect(text).not.toContain('sk-secret');
  expect(text).not.toContain('llm_api_key');
  expect(text).not.toContain('words_db_version');
  const kvKeys = (JSON.parse(text) as { kv: { key: string }[] }).kv.map((k) => k.key).sort();
  expect(kvKeys).toEqual(['auto_speak', 'llm_model']);
});
