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
src/lib/exam/        题库的题型定义、zod schema、prompt、题目生成与评分（纯 TS，见下文「题库与评分层」）
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
- book(id TEXT PK, name, exam TEXT CHECK(exam IN ('cet4','cet6','kaoyan','ielts')), word_count)  -- exam 在代码里是 `BookExam`（src/db/wordsRepo.ts），表示词书属于哪门考试，和 src/lib/exams.ts 的 `ExamId`（用户在准备的考试）不是一回事
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
- question(id TEXT PK /*uuid*/, exam, section, type, schema_version INTEGER, payload TEXT /*题目 JSON*/, source TEXT /*'llm'*/, model, prompt_version INTEGER, created_at, deleted INTEGER DEFAULT 0)  -- 迁移 v2
- attempt(id TEXT PK /*uuid*/, question_id → question(id), exam, section, type, answer TEXT /*作答 JSON*/, score REAL /*评分失败为 NULL*/, max_score REAL, feedback TEXT /*主观题点评 JSON*/, wrong_count INTEGER DEFAULT 0, needs_redo INTEGER DEFAULT 0, duration_ms, started_at, submitted_at)  -- 迁移 v2
- 题库索引：question(exam, type, deleted, created_at)、attempt(question_id, submitted_at)、attempt(exam, section, submitted_at)、attempt(exam, wrong_count, submitted_at)
- 题库取值：exam 为 `cet6` / `kaoyan` / `ielts`；section 为 `reading` / `translation` / `writing` / `listening`；type 为细分题型 `banked_cloze`、`matching`、`careful_reading`（阅读），`translation`，`essay`（写作），`long_conversation`、`passage`、`lecture`（听力）。exam、section 以 src/lib/exams.ts 为准，type 与板块的对应见 src/lib/exam/types.ts。
- wrong_count 只算客观题答错（含未答）的题数，错题本查 wrong_count > 0。翻译、写作是主观题，wrong_count 固定 0、不进错题本；得分低于 9（满分 15）时 needs_redo = 1，表示「待重练」。
- 题目软删除（deleted = 1）后不再出现在题目列表里，但作答记录保留，按 id 仍能取到原题。
- 题库 SQL 在 src/db/questionRepo.ts。`listRecentTopics(exam, type, limit)` 取最近几道未删除题目的 payload.topic（去重，跳过没有 topic 的老题），给生成时的 avoidTopics 用。
- 时间一律存 Unix 毫秒 UTC；updated_at/deleted/uuid 预留给未来同步。
- 设置（接口地址、模型名）存 kv 表；API 密钥只存 expo-secure-store，禁止写入 SQLite、日志、崩溃报告。

## 备份格式
- 导出文件 `format: 'english-learn-backup'`，当前 `version: 2`（`BACKUP_VERSION`，src/lib/backup.ts）。
- v1：card、review_log、study_plan、daily_stat、kv（白名单）。v2 增加 question、attempt。
- 导入 v1 时题库视为空：导入后题库被清空（与「整体替换」一致）。版本号大于当前版本时拒绝导入，提示先升级 App。
- 导入在一个事务里完成：先删 attempt 再删 question，再插入；任何一行出错整体回滚。

## 题库与评分层（src/lib/exam）
纯 TS，不能 import Expo / React Native（ESLint 对 src/lib 有限制）。zod（v4，版本写死）只在这个目录里用，其它层只拿推导出的普通类型。
- `types.ts`：题型、板块对应、行类型（QuestionRow / AttemptRow）、主观题满分 15 和「待重练」阈值 9。
- `schemas.ts`：每种题型的 payload schema，结构之外还在 superRefine 里查业务规则（选词填空 15 词 10 空、答案不重复、短文按顺序各有一次 `{{1}}`…`{{10}}`；段落匹配段落字母从 A 连续、10 道陈述答案必须是存在的段落；仔细阅读 5 题；听力长对话 4 题至少两位说话人，短文、讲座 3 到 4 题；选择题都是 4 个不重复选项、答案 A 到 D；每题带中文解析）。`SCHEMA_VERSION` 存进 question.schema_version：v1 没有 topic；v2 起顶层有必填的 `topic`（简短英文话题，单行，≤ 60 字符）。生成新题用 `GENERATION_SCHEMAS`（topic 必填）；读题用 `PAYLOAD_SCHEMAS`（topic 可选，兼容 v1 老题），存库的题用 `parseStoredPayload(type, schema_version, payload)` 按版本解析（v1 topic 可选、v2 必填、更新的版本报错）。
- `prompts.ts`：每种题型的生成 prompt 和主观题评分 prompt。要求只输出 JSON、原创、不得复述或改写真题，难度对齐六级。评分 prompt 里题目材料和学生作答分别放进 `<source>`/`<reference>`/`<title>`/`<directions>`/`<answer>` 标签，其中的指令一律忽略；拼进 prompt 前统一用 `sanitize.ts` 的 `promptText` 清洗、限长（作答上限 `ANSWER_MAX_CHARS`：翻译 2000、写作 4000 字符），并把文字里的这些标签中和成 `‹answer›` 形式，防止提前闭合标签。改生成 prompt 把 `PROMPT_VERSION` 加 1；改评分 prompt 把 `GRADE_PROMPT_VERSION` 加 1。
- `generate.ts`：`generateQuestion(type, { cfg, chat?, signal?, avoidTopics? })`。avoidTopics 先清洗（去控制字符和换行、去首尾空格、去空、去重，最多 10 个，每个 ≤ 60 字符），作为「请避开以下话题」一段加进生成 prompt，每个话题写成一行 JSON 字符串；清洗后为空时 prompt 与不传完全一样，chat 依赖注入，默认用 src/lib/llm.ts。流程：解析 JSON（容忍代码块包裹和首尾杂字）→ zod 校验 → 不合格就把上次输出和精简后的错误回给模型重试，最多 2 次 → 仍失败抛 `ExamGenError`（kind 为 `invalid_json` / `schema_mismatch`，message 是中文）。`LlmError` 原样抛出、不额外重试（网络类错误 llm.ts 已经退避重试过）。
- `grade.ts`：客观题本地判分（每题 1 分，返回 score、maxScore、wrongCount、逐题对错）；翻译、写作调用 LLM 按六级 15 分制评分，结果同样走 zod 校验和重试（分数 0 到 15，翻译分数要落在所给档次内）。主观题返回 wrongCount = 0、needsRedo = score < 9；空白作答直接 0 分，不调用 LLM。
- 主观题点评（`FEEDBACK_VERSION` = 2）：总评 summary、档次 band、分项点评 criteria（翻译：accuracy / vocabulary / grammar / fluency；写作：content / organization / vocabulary / grammar；每项 level 为 good / fair / weak 加中文 comment，每个维度恰好一条，输出按固定顺序）、逐句点评 sentences（翻译）或问题清单 issues（写作）、英文改写示例 rewrite。zod 校验分数与档次一致、维度齐全不重复、改写不含中文；点评文字在 schema 里清洗（去控制字符、规整空白）并按 `FEEDBACK_LIMITS` 截断，条目最多 30 条。
- `feedback.ts`：`subjectiveAttemptFields(grade)` 把评分结果转成 attempt 行的 score / max_score / feedback / wrong_count / needs_redo；feedback 列存 JSON，顶层带 `version` 和 `promptVersion`。`parseStoredFeedback(type, text)` 读回：没有 version 的老记录按 v1 宽松读（criteria、翻译 rewrite、写作 band 可缺），version 2 严格读，更新的版本提示升级。不做数据迁移。
- 题目和作答怎么写进数据库由 features 层负责：拿 generate / grade 的结果拼成 QuestionRow / AttemptRow，再调 src/db/questionRepo.ts。

## 代码规范
TypeScript strict，禁止 any；ESLint + Prettier；Conventional Commits；
每个 PR 一件事，需通过 CI（类型、lint、单测、网页 E2E）并经一号评审；
FSRS 调度与数据仓储必须有单元测试；LLM 调用需超时（30s）、重试最多 2 次带退避、可取消。
