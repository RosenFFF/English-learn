/**
 * 打开两个数据库。只有这里接触 expo-sqlite。
 * - words.db：随包发布的只读词库。BUNDLED_WORDS_DB_VERSION 与已导入版本不同时整体覆盖（升级词库），逻辑见 wordsDbSync.ts。
 * - user.db：学习进度，只走迁移，永不覆盖。
 */
import * as SQLite from 'expo-sqlite';

import { runMigrations } from './migrate';
import { MIGRATIONS } from './migrations';
import type { SqlDb } from './types';
import {
  USER_DB_NAME,
  WORDS_DB_NAME,
  assertWordsDbTarget,
  syncBundledWordsDb,
} from './wordsDbSync';

export { BUNDLED_WORDS_DB_VERSION } from './wordsDbSync';

export interface Databases {
  words: SqlDb;
  user: SqlDb;
  schemaVersion: number;
}

let opening: Promise<Databases> | null = null;

async function open(): Promise<Databases> {
  const user = await SQLite.openDatabaseAsync(USER_DB_NAME);
  await user.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const schemaVersion = await runMigrations(user, MIGRATIONS);

  await syncBundledWordsDb(user, async (name, forceOverwrite) => {
    assertWordsDbTarget(name); // 双保险：传给 expo-sqlite 的名字只可能是 words.db
    await SQLite.importDatabaseFromAssetAsync(name, {
      assetId: require('../../assets/db/words.db') as number,
      forceOverwrite,
    });
  });
  const words = await SQLite.openDatabaseAsync(WORDS_DB_NAME);
  return { words, user, schemaVersion };
}

export function getDatabases(): Promise<Databases> {
  if (!opening) {
    opening = open().catch((e: unknown) => {
      opening = null;
      throw e;
    });
  }
  return opening;
}

/** 仅供单测：清掉缓存的打开结果 */
export function __resetDatabasesForTest(): void {
  opening = null;
}
