# English-learn v1 架构与规范（架构师·一号）

## 范围
安卓单机、无账号、离线优先。功能：三套词书背单词（FSRS）+ AI 讲解（用户自填 OpenAI 兼容接口）。

## 目录约定
```
app/                 expo-router 页面：(tabs)/today, books, practice, me
src/features/<域>/   按业务域组织：study, books, ai, settings
src/db/              SQLite 打开、迁移、仓储（repository）函数
src/lib/             纯函数工具（fsrs 封装、日期、llm 客户端）
assets/db/words.db   只读词库（构建时生成，脚本在 scripts/build-words-db）
```
规则：页面只调用 features 暴露的 hook/函数；只有 src/db 能写 SQL；src/lib 不依赖 React。

## 两个数据库
- words.db（只读，随包发布，可整体替换升级）
- user.db（可写，用户进度，必须走迁移，绝不随升级覆盖）

## words.db
- word(id INTEGER PK, headword TEXT UNIQUE, phonetic_uk, phonetic_us, meanings_json, examples_json, phrases_json)
- book(id TEXT PK, name, exam TEXT CHECK(exam IN ('cet4','cet6','kaoyan','ielts')), word_count)
- book_word(book_id, word_id, seq, PRIMARY KEY(book_id, word_id))
- meta(key PK, value)  -- 含 db_version、来源与许可证

## user.db
- schema_migrations(version INTEGER PK, applied_at)
- card(word_id PK, due INTEGER, stability REAL, difficulty REAL, elapsed_days, scheduled_days, reps, lapses, state INTEGER, last_review INTEGER, updated_at INTEGER, deleted INTEGER DEFAULT 0)
- review_log(id TEXT PK /*uuid*/, word_id, rating INTEGER, state, due, reviewed_at INTEGER, elapsed_days, scheduled_days)
- study_plan(book_id PK, daily_new INTEGER, daily_review_cap INTEGER, started_at, active INTEGER)
- daily_stat(date TEXT PK /*YYYY-MM-DD 本地*/, new_count, review_count, minutes, streak_freeze_used INTEGER)
- ai_cache(word_id, kind, model, content, created_at, PRIMARY KEY(word_id, kind, model))
- 时间一律存 Unix 毫秒 UTC；updated_at/deleted/uuid 预留给未来同步。
- 设置（接口地址、模型名）存 kv 表；API 密钥只存 expo-secure-store，禁止写入 SQLite、日志、崩溃报告。

## 代码规范
TypeScript strict，禁止 any；ESLint + Prettier；Conventional Commits；
每个 PR 一件事，需通过 CI（类型、lint、单测、网页 E2E）并经一号评审；
FSRS 调度与数据仓储必须有单元测试；LLM 调用需超时（30s）、重试最多 2 次带退避、可取消。
