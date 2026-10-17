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

export function openMemoryDb(): SqlDb {
  return openFileDb(':memory:');
}

/** 打开磁盘上的数据库文件（单测里模拟真实的 user.db / words.db 文件）；用完调用 close() */
export function openFileDb(path: string): SqlDb & { close(): void } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync: Ctor } = require('node:sqlite') as {
    DatabaseSync: new (path: string) => DatabaseSync;
  };
  const db = new Ctor(path);
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
