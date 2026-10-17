/**
 * 词库升级：BUNDLED_WORDS_DB_VERSION 与 user.db 里记录的版本不同时，整体覆盖 words.db。
 * 这里不依赖 expo-sqlite，便于单测；真正的复制由 open.ts 注入的 importer 完成。
 *
 * 安全约束：覆盖目标只能是 words.db 这个文件名（不带目录、不带通配），绝不能是 user.db。
 * user.db 只走迁移，这里只读写它的 kv.words_db_version 一项。
 */
import type { SqlDb } from './types';
import { kvGet, kvSet } from './userRepo';

/** 与 words.db 的 meta.db_version 保持一致；词库重建并提升版本时改这里 */
export const BUNDLED_WORDS_DB_VERSION = '1';
export const WORDS_DB_NAME = 'words.db';
export const USER_DB_NAME = 'user.db';
export const WORDS_DB_VERSION_KEY = 'words_db_version';

/** 把随包词库复制到名为 name 的数据库文件；forceOverwrite 为 true 时整体替换 */
export type WordsDbImporter = (name: string, forceOverwrite: boolean) => Promise<void>;

/** 覆盖前的防护：目标必须恰好是 words.db，任何路径、通配或其他文件名都直接拒绝 */
export function assertWordsDbTarget(name: string): void {
  // 严格相等：路径（a/words.db）、通配（*.db）、大小写变体、user.db 都会被拒绝
  if (name !== WORDS_DB_NAME) {
    throw new Error(`拒绝覆盖数据库：目标必须是 ${WORDS_DB_NAME}，实际是 ${JSON.stringify(name)}`);
  }
}

/** 包一层防护：无论调用方传什么名字，先断言再交给真正的 importer */
export function guardWordsDbImporter(importer: WordsDbImporter): WordsDbImporter {
  return async (name, forceOverwrite) => {
    assertWordsDbTarget(name);
    await importer(name, forceOverwrite);
  };
}

/**
 * 确保 words.db 是当前随包版本。返回是否做了整体覆盖。
 * 先覆盖、后记版本：覆盖失败时版本号不变，下次启动会重试。
 */
export async function syncBundledWordsDb(
  user: SqlDb,
  importer: WordsDbImporter,
  bundledVersion: string = BUNDLED_WORDS_DB_VERSION,
): Promise<boolean> {
  const imported = await kvGet(user, WORDS_DB_VERSION_KEY);
  const forceOverwrite = imported !== bundledVersion;
  await guardWordsDbImporter(importer)(WORDS_DB_NAME, forceOverwrite);
  if (forceOverwrite) await kvSet(user, WORDS_DB_VERSION_KEY, bundledVersion);
  return forceOverwrite;
}
