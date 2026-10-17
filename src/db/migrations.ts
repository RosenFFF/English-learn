/**
 * user.db 迁移。只能追加新版本，已发布的版本永远不改。
 * 表结构以 docs/architecture.md 为准；本文件补充的字段见各处注释。
 */
export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'init',
    sql: `
CREATE TABLE IF NOT EXISTS card(
  word_id INTEGER PRIMARY KEY,
  due INTEGER NOT NULL,
  stability REAL NOT NULL,
  difficulty REAL NOT NULL,
  elapsed_days INTEGER NOT NULL,
  scheduled_days INTEGER NOT NULL,
  learning_steps INTEGER NOT NULL DEFAULT 0, -- 补充：ts-fsrs v5 的短期学习步骤序号，缺了它学习中卡片无法正确调度
  reps INTEGER NOT NULL,
  lapses INTEGER NOT NULL,
  state INTEGER NOT NULL,
  last_review INTEGER,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_card_due ON card(deleted, state, due);

CREATE TABLE IF NOT EXISTS review_log(
  id TEXT PRIMARY KEY,
  word_id INTEGER NOT NULL,
  rating INTEGER NOT NULL,
  state INTEGER NOT NULL,
  due INTEGER NOT NULL,
  reviewed_at INTEGER NOT NULL,
  elapsed_days INTEGER NOT NULL,
  scheduled_days INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_review_log_time ON review_log(reviewed_at);
CREATE INDEX IF NOT EXISTS idx_review_log_word ON review_log(word_id);

CREATE TABLE IF NOT EXISTS study_plan(
  book_id TEXT PRIMARY KEY,
  daily_new INTEGER NOT NULL,
  daily_review_cap INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS daily_stat(
  date TEXT PRIMARY KEY,
  new_count INTEGER NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  minutes REAL NOT NULL DEFAULT 0,
  sessions INTEGER NOT NULL DEFAULT 0, -- 补充：当天完成的组数，「完成 1 组即打卡」靠它判断
  streak_freeze_used INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ai_cache(
  word_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  model TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(word_id, kind, model)
);

-- 补充：架构文档提到设置存 kv 表但没写表结构。只放非敏感设置，API 密钥禁止写入。
CREATE TABLE IF NOT EXISTS kv(
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`,
  },
];
