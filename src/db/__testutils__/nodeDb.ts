/** 单测用：把 Node 22 自带的 node:sqlite 包装成 SqlDb 接口 */
import type { SqlDb, SqlValue } from '../types';

interface StatementSync {
  run(...p: SqlValue[]): unknown;
  all(...p: SqlValue[]): unknown[];
  get(...p: SqlValue[]): unknown;
}
interface DatabaseSync {
  exec(sql: string): void;
  prepare(sql: string): StatementSync;
  close(): void;
}

export function openMemoryDb(opts?: { foreignKeys?: boolean }): SqlDb {
  return openFileDb(':memory:', opts);
}

/**
 * 打开磁盘上的数据库文件（单测里模拟真实的 user.db / words.db 文件）；用完调用 close()。
 * Node 22 的 node:sqlite 默认 foreign_keys 已是 ON（和生产 open() 里的 PRAGMA 一致）。
 * 需要显式关掉做对照时不要靠默认值，直接 `PRAGMA foreign_keys = OFF`。
 * `{ foreignKeys: true }` 仍会再执行一次 PRAGMA，避免换运行时后默认值变了。
 * withTransactionAsync 和 expo-sqlite 一样不是独占事务：回调里的 await 会让同一条连接上的
 * 其它语句插进来，失败才 ROLLBACK。
 */
export function openFileDb(
  path: string,
  opts?: { foreignKeys?: boolean },
): SqlDb & { close(): void } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync: Ctor } = require('node:sqlite') as {
    DatabaseSync: new (path: string) => DatabaseSync;
  };
  const db = new Ctor(path);
  if (opts?.foreignKeys) db.exec('PRAGMA foreign_keys = ON');
  return {
    close() {
      db.close();
    },
    async execAsync(sql) {
      db.exec(sql);
    },
    async runAsync(sql, params) {
      return db.prepare(sql).run(...params);
    },
    async getAllAsync<T>(sql: string, params: SqlValue[]) {
      return db.prepare(sql).all(...params) as T[];
    },
    async getFirstAsync<T>(sql: string, params: SqlValue[]) {
      return (db.prepare(sql).get(...params) as T | undefined) ?? null;
    },
    async withTransactionAsync(task) {
      db.exec('BEGIN');
      try {
        await task();
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
