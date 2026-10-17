import type { Migration } from './migrations';
import type { SqlDb } from './types';

/** 依次执行未应用的迁移，每个迁移一个事务；失败整体回滚，不留半张表。返回当前版本。 */
export async function runMigrations(
  db: SqlDb,
  migrations: readonly Migration[],
  now: number = Date.now(),
): Promise<number> {
  await db.execAsync(
    'CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)',
  );
  const row = await db.getFirstAsync<{ v: number | null }>(
    'SELECT MAX(version) AS v FROM schema_migrations',
    [],
  );
  let current = row?.v ?? 0;
  const pending = [...migrations]
    .sort((a, b) => a.version - b.version)
    .filter((m) => m.version > current);
  for (const m of pending) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(m.sql);
      await db.runAsync('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)', [
        m.version,
        now,
      ]);
    });
    current = m.version;
  }
  return current;
}
