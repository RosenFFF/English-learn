/**
 * @jest-environment node
 *
 * 词库按 BUNDLED_WORDS_DB_VERSION 整体覆盖 words.db：绝不能碰 user.db。
 * 用磁盘上的真实 SQLite 文件模拟设备上的 SQLite 目录：importer 把“随包词库”复制到 <目录>/<name>。
 */
import { newCardRow, rateCard } from '../lib/fsrs';
import { openFileDb } from './__testutils__/nodeDb';
import {
  copyFileSync,
  join,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  tmpdir,
} from './__testutils__/nodeFs';
import { runMigrations } from './migrate';
import { MIGRATIONS } from './migrations';
import type { SqlDb } from './types';
import * as repo from './userRepo';
import {
  BUNDLED_WORDS_DB_VERSION,
  USER_DB_NAME,
  WORDS_DB_NAME,
  WORDS_DB_VERSION_KEY,
  assertWordsDbTarget,
  guardWordsDbImporter,
  syncBundledWordsDb,
  type WordsDbImporter,
} from './wordsDbSync';

const now = new Date(2026, 9, 17, 9).getTime();

let dir: string; // 模拟设备上的 SQLite 数据库目录
let bundledAsset: string; // 模拟 APK 里的 assets/db/words.db
let user: SqlDb & { close(): void };

async function makeWordsDb(path: string, version: string, headword: string): Promise<void> {
  const db = openFileDb(path);
  await db.execAsync(
    `CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT); CREATE TABLE word(id INTEGER PRIMARY KEY, headword TEXT);`,
  );
  await db.runAsync('INSERT INTO meta(key, value) VALUES (?, ?)', ['db_version', version]);
  await db.runAsync('INSERT INTO word(id, headword) VALUES (?, ?)', [1, headword]);
  db.close();
}

async function readWordsDb(
  path: string,
): Promise<{ version: string | undefined; headword: string | undefined }> {
  const db = openFileDb(path);
  const v = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', [
    'db_version',
  ]);
  const w = await db.getFirstAsync<{ headword: string }>(
    'SELECT headword FROM word WHERE id = ?',
    [1],
  );
  db.close();
  return { version: v?.value, headword: w?.headword };
}

/** 模拟 expo-sqlite 的 importDatabaseFromAssetAsync：把随包词库复制到 <目录>/<name> */
function fsImporter(calls: { name: string; forceOverwrite: boolean }[]): WordsDbImporter {
  return async (name, forceOverwrite) => {
    calls.push({ name, forceOverwrite });
    const target = join(dir, name);
    let exists = true;
    try {
      statSync(target);
    } catch {
      exists = false;
    }
    if (!exists || forceOverwrite) copyFileSync(bundledAsset, target);
  };
}

/** user.db 里所有学习数据的快照（卡片、日志、计划、每日统计、kv、迁移记录） */
async function snapshotUser(db: SqlDb) {
  return {
    card: await db.getAllAsync('SELECT * FROM card ORDER BY word_id', []),
    review_log: await db.getAllAsync('SELECT * FROM review_log ORDER BY id', []),
    study_plan: await db.getAllAsync('SELECT * FROM study_plan ORDER BY book_id', []),
    daily_stat: await db.getAllAsync('SELECT * FROM daily_stat ORDER BY date', []),
    kv: await db.getAllAsync<{ key: string; value: string }>(
      'SELECT key, value FROM kv ORDER BY key',
      [],
    ),
    schema_migrations: await db.getAllAsync('SELECT * FROM schema_migrations ORDER BY version', []),
  };
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'words-sync-'));
  bundledAsset = join(mkdtempSync(join(tmpdir(), 'asset-')), 'words.db');
  await makeWordsDb(bundledAsset, '2', 'abandon-v2');
  await makeWordsDb(join(dir, WORDS_DB_NAME), '1', 'abandon-v1'); // 设备上已有旧版词库

  user = openFileDb(join(dir, USER_DB_NAME));
  await runMigrations(user, MIGRATIONS, now);
  const r1 = rateCard(newCardRow(1, now), 'good', now, 'log-1');
  await repo.recordReview(user, r1.card, r1.log, '2026-10-17', 'new');
  const r2 = rateCard(newCardRow(2, now), 'again', now, 'log-2');
  await repo.recordReview(user, r2.card, r2.log, '2026-10-17', 'new');
  await repo.recordSessionDone(user, '2026-10-17', 3.5);
  await repo.activatePlan(user, 'cet4', { dailyNew: 20, dailyReviewCap: 200 }, now);
  await repo.kvSet(user, 'llm_model', 'deepseek-chat');
  await repo.kvSet(user, 'llm_base_url', 'https://api.example.com/v1');
  await repo.kvSet(user, WORDS_DB_VERSION_KEY, '1');
});

afterEach(() => {
  user.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('words.db 覆盖目标防护', () => {
  it('assertWordsDbTarget 只接受 words.db，拒绝 user.db、带路径、通配和空名', () => {
    expect(() => assertWordsDbTarget('words.db')).not.toThrow();
    for (const bad of [
      'user.db',
      '',
      '*.db',
      '*',
      './words.db',
      'sub/words.db',
      '../user.db',
      '/data/words.db',
      'WORDS.DB',
      'words.db ',
      'words.db-wal',
    ]) {
      expect(() => assertWordsDbTarget(bad)).toThrow(/拒绝覆盖数据库/);
    }
  });

  it('guardWordsDbImporter 收到非 words.db 的名字时不会调用底层 importer', async () => {
    const inner = jest.fn<Promise<void>, [string, boolean]>(async () => {});
    const guarded = guardWordsDbImporter(inner);
    await expect(guarded(USER_DB_NAME, true)).rejects.toThrow(/拒绝覆盖数据库/);
    await expect(guarded('*.db', true)).rejects.toThrow(/拒绝覆盖数据库/);
    expect(inner).not.toHaveBeenCalled();
    await guarded(WORDS_DB_NAME, true);
    expect(inner).toHaveBeenCalledWith(WORDS_DB_NAME, true);
  });
});

describe('词库按版本整体覆盖 words.db', () => {
  it('版本变化时覆盖 words.db，user.db 文件和卡片/日志/计划/统计/kv 原样保留（只更新 words_db_version）', async () => {
    const before = await snapshotUser(user);
    const userInode = statSync(join(dir, USER_DB_NAME)).ino;
    const calls: { name: string; forceOverwrite: boolean }[] = [];

    const overwritten = await syncBundledWordsDb(user, fsImporter(calls), '2');

    expect(overwritten).toBe(true);
    // 覆盖目标只可能是 words.db
    expect(calls).toEqual([{ name: WORDS_DB_NAME, forceOverwrite: true }]);
    expect(await readWordsDb(join(dir, WORDS_DB_NAME))).toEqual({
      version: '2',
      headword: 'abandon-v2',
    });

    // user.db 还是同一个文件，没有被替换或删除
    expect(statSync(join(dir, USER_DB_NAME)).ino).toBe(userInode);
    expect(readdirSync(dir).filter((f) => f.startsWith('user.db'))).toContain(USER_DB_NAME);

    const after = await snapshotUser(user);
    expect(after.card).toEqual(before.card);
    expect(after.card).toHaveLength(2);
    expect(after.review_log).toEqual(before.review_log);
    expect(after.review_log).toHaveLength(2);
    expect(after.study_plan).toEqual(before.study_plan);
    expect(after.daily_stat).toEqual(before.daily_stat);
    expect(after.schema_migrations).toEqual(before.schema_migrations);
    const withoutVersion = (rows: { key: string; value: string }[]) =>
      rows.filter((r) => r.key !== WORDS_DB_VERSION_KEY);
    expect(withoutVersion(after.kv)).toEqual(withoutVersion(before.kv));
    expect(await repo.kvGet(user, WORDS_DB_VERSION_KEY)).toBe('2');

    // 重新打开 user.db 文件，数据确实落盘且未丢失
    user.close();
    user = openFileDb(join(dir, USER_DB_NAME));
    expect((await snapshotUser(user)).card).toEqual(before.card);
  });

  it('版本相同时不覆盖 words.db，user.db 完全不变', async () => {
    const before = await snapshotUser(user);
    const calls: { name: string; forceOverwrite: boolean }[] = [];
    const overwritten = await syncBundledWordsDb(user, fsImporter(calls), '1');
    expect(overwritten).toBe(false);
    expect(calls).toEqual([{ name: WORDS_DB_NAME, forceOverwrite: false }]);
    expect(await readWordsDb(join(dir, WORDS_DB_NAME))).toEqual({
      version: '1',
      headword: 'abandon-v1',
    });
    expect(await snapshotUser(user)).toEqual(before);
  });

  it('首次安装（没有版本记录）时导入 words.db 并记下当前随包版本', async () => {
    await user.runAsync('DELETE FROM kv WHERE key = ?', [WORDS_DB_VERSION_KEY]);
    rmSync(join(dir, WORDS_DB_NAME));
    const calls: { name: string; forceOverwrite: boolean }[] = [];
    expect(await syncBundledWordsDb(user, fsImporter(calls))).toBe(true);
    expect(calls).toEqual([{ name: WORDS_DB_NAME, forceOverwrite: true }]);
    expect(await repo.kvGet(user, WORDS_DB_VERSION_KEY)).toBe(BUNDLED_WORDS_DB_VERSION);
    expect((await snapshotUser(user)).card).toHaveLength(2);
  });

  it('覆盖失败时不更新版本号、不动 user.db，下次启动会重试', async () => {
    const before = await snapshotUser(user);
    const failing: WordsDbImporter = async () => {
      throw new Error('磁盘已满');
    };
    await expect(syncBundledWordsDb(user, failing, '2')).rejects.toThrow('磁盘已满');
    expect(await snapshotUser(user)).toEqual(before);
    expect(await repo.kvGet(user, WORDS_DB_VERSION_KEY)).toBe('1');
  });
});
