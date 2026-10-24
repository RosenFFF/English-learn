# English-learn v1 架构与规范（架构师·一号）

## 范围
安卓单机、无账号、离线优先。功能：三套词书背单词（FSRS）+ AI 讲解（用户自填 OpenAI 兼容接口）。

## 目录约定
```
src/app/             expo-router 页面（路由表见下）
src/features/<域>/   按业务域组织：exam, study, books, practice, ai, settings, backup, stats
src/db/              SQLite 打开、迁移、仓储（repository）函数
src/platform/        原生能力的薄封装（安全存储、朗读、文件读写/分享）；只有这里能 import 原生模块
src/lib/             纯函数工具（fsrs 封装、日期、llm 客户端）
assets/db/words.db   只读词库（构建时生成，脚本在 scripts/build-words-db）
```
考试与板块的元数据（考试 id `cet6` / `kaoyan` / `ielts`，板块 id `vocab` / `reading` / `translation` / `writing` / `listening` / `mistakes`）在 `src/lib/exams.ts`，路由白名单和题库表的考试/题型字段都以它为准。

路由表（`/home`、`/me` 在 `src/app/(tabs)/` 下）：
```
/                    入口：kv `exam` 没有（或不合法）→ /choose-exam，有 → /home
/choose-exam         选考试；?from=home|me 时选完返回来源页，首次启动选完进 /home
/home                当前考试首页（底部 Tab「首页」），按板块列卡片
/me                  我的（底部 Tab「我的」），顶部「当前考试 · 切换」
/vocab               词汇板块：今日背词（原「今天」）
/vocab/books         词书
/vocab/practice      弱点词 / 生词
/section/[id]        未上线板块的占位页；id 不在 src/lib/exams.ts 白名单里显示找不到
/study               背词（全屏）
/settings            大模型设置
```
首页右上角和「我的」里的「切换」走同一个入口（`src/features/exam/navigation.ts`）。

规则：页面只调用 features 暴露的 hook/函数；只有 src/db 能写 SQL；只有 src/platform 能引入除 expo-sqlite 外的原生模块；src/lib 不依赖 React，也不依赖 Expo。

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
- card(word_id PK, due INTEGER, stability REAL, difficulty REAL, elapsed_days, scheduled_days, reps, lapses, state INTEGER, learning_steps INTEGER NOT NULL DEFAULT 0, last_review INTEGER, updated_at INTEGER, deleted INTEGER DEFAULT 0)
- review_log(id TEXT PK /*uuid*/, word_id, rating INTEGER, state, due, reviewed_at INTEGER, elapsed_days, scheduled_days)
- study_plan(book_id PK, daily_new INTEGER, daily_review_cap INTEGER, started_at, active INTEGER)
- daily_stat(date TEXT PK /*YYYY-MM-DD 本地*/, new_count, review_count, minutes REAL, sessions INTEGER NOT NULL DEFAULT 0, streak_freeze_used INTEGER)
- kv(key TEXT PRIMARY KEY, value TEXT NOT NULL)  -- 仅非敏感设置
- 索引：card(deleted, state, due)、review_log(reviewed_at)、review_log(word_id)
- ai_cache(word_id, kind, model, content, created_at, PRIMARY KEY(word_id, kind, model))
- 时间一律存 Unix 毫秒 UTC；updated_at/deleted/uuid 预留给未来同步。
- 设置（接口地址、模型名）存 kv 表；API 密钥只存 expo-secure-store，禁止写入 SQLite、日志、崩溃报告。

## 代码规范
TypeScript strict，禁止 any；ESLint + Prettier；Conventional Commits；
每个 PR 一件事，需通过 CI（类型、lint、单测、网页 E2E）并经一号评审；
FSRS 调度与数据仓储必须有单元测试；LLM 调用需超时（30s）、重试最多 2 次带退避、可取消。
