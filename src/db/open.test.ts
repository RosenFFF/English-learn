/**
 * @jest-environment node
 *
 * getDatabases()：expo-sqlite 层面的检查——导入/覆盖只会作用于 words.db，user.db 只被打开、从不被导入或删除。
 */
import { openMemoryDb } from './__testutils__/nodeDb';
import type { SqlDb } from './types';

const mockUserDb: SqlDb = openMemoryDb();
const mockWordsDb: SqlDb = openMemoryDb();

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async (name: string) =>
    name === 'user.db' ? mockUserDb : mockWordsDb,
  ),
  importDatabaseFromAssetAsync: jest.fn(async () => {}),
  deleteDatabaseAsync: jest.fn(async () => {}),
}));
jest.mock('../../assets/db/words.db', () => 42);

// eslint-disable-next-line import/first
import * as SQLite from 'expo-sqlite';
// eslint-disable-next-line import/first
import { BUNDLED_WORDS_DB_VERSION, __resetDatabasesForTest, getDatabases } from './open';
// eslint-disable-next-line import/first
import { kvGet, kvSet } from './userRepo';

const sqlite = SQLite as unknown as {
  openDatabaseAsync: jest.Mock;
  importDatabaseFromAssetAsync: jest.Mock;
  deleteDatabaseAsync: jest.Mock;
};

beforeEach(() => {
  __resetDatabasesForTest();
  jest.clearAllMocks();
});

it('getDatabases 在词库版本变化时只覆盖 words.db，user.db 从不被导入或删除', async () => {
  // 第一次启动：迁移 user.db，导入词库
  await getDatabases();
  await kvSet(mockUserDb, 'llm_model', 'm');
  // 模拟旧版本词库
  await kvSet(mockUserDb, 'words_db_version', 'old');
  __resetDatabasesForTest();
  jest.clearAllMocks();

  const dbs = await getDatabases();

  expect(dbs.user).toBe(mockUserDb);
  expect(dbs.words).toBe(mockWordsDb);
  expect(sqlite.importDatabaseFromAssetAsync).toHaveBeenCalledTimes(1);
  expect(sqlite.importDatabaseFromAssetAsync).toHaveBeenCalledWith('words.db', {
    assetId: 42,
    forceOverwrite: true,
  });
  for (const [name] of sqlite.importDatabaseFromAssetAsync.mock.calls)
    expect(name).toBe('words.db');
  expect(sqlite.deleteDatabaseAsync).not.toHaveBeenCalled();
  expect(sqlite.openDatabaseAsync.mock.calls.map((c: unknown[]) => c[0])).toEqual([
    'user.db',
    'words.db',
  ]);
  expect(await kvGet(mockUserDb, 'words_db_version')).toBe(BUNDLED_WORDS_DB_VERSION);
  expect(await kvGet(mockUserDb, 'llm_model')).toBe('m');
});

it('版本一致时不强制覆盖', async () => {
  await kvSet(mockUserDb, 'words_db_version', BUNDLED_WORDS_DB_VERSION);
  await getDatabases();
  expect(sqlite.importDatabaseFromAssetAsync).toHaveBeenCalledWith('words.db', {
    assetId: 42,
    forceOverwrite: false,
  });
});
