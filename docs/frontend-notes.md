# 前端实现说明（二号）

## 对 architecture.md 的补充（user.db）

- `card.learning_steps INTEGER NOT NULL DEFAULT 0`：ts-fsrs v5 的短期学习步骤序号，缺了它学习中卡片无法正确续算。
- `daily_stat.sessions INTEGER NOT NULL DEFAULT 0`：当天完成的组数，「完成 1 组即打卡」靠它判断。
- `kv(key TEXT PRIMARY KEY, value TEXT NOT NULL)`：文档提到但没写结构。只放非敏感设置（llm_base_url、llm_model、auto_speak、group_size、words_db_version）；`kvSet` 拒绝 key/secret/token/password 类键名。
- 索引：`card(deleted, state, due)`、`review_log(reviewed_at)`、`review_log(word_id)`。
- `daily_stat.minutes` 用 REAL（存一位小数）。

## 约定

- 词库升级：`src/db/wordsDbSync.ts` 的 `BUNDLED_WORDS_DB_VERSION`（`src/db/open.ts` 转出）与 user.db kv 里记录的版本不同就整体覆盖 words.db；重建词库并提升 `meta.db_version` 时同步改这个常量。覆盖目标经 `assertWordsDbTarget` 断言必须恰好是 `words.db`（不带路径、不带通配），user.db 只更新 `kv.words_db_version` 一项；单测见 `src/db/wordsDbSync.test.ts`、`src/db/open.test.ts`。
- 计数口径：新词首次评分计 `new_count`；复习状态卡评分计 `review_count`（受每日上限约束）；学习中/重学中卡的短期重复只写日志，不占额度。
- 每日上限与欠账：见 `src/lib/queue.ts` 顶部注释。
- FSRS 参数：retention 0.9，learning_steps ['1m']（认识/简单直接毕业），relearning_steps ['10m']，开启 fuzz。
- 密钥解不开（换手机/系统备份恢复后 Keystore 密钥不在了）：解密失败的判断和清理在 `src/platform/secure-store.ts`；`readLlmApiKey()` 返回 `ok / missing / unreadable`（`getLlmApiKey()` 行为不变）。`src/features/settings/service.ts` 只消费结果：`unreadable` 时当作未配置大模型（AI 隐藏），kv 里记 `llm_auth_lost=1`，设置页提示「密钥无法读取（可能是换了手机），请重新填写」，接口地址和模型名保留；重新填写密钥或清除配置后清掉标记。底层抛出的其它错误在 features 层吞掉、当作本次没有密钥，不记录异常内容。
- 网页版（仅调试用）：expo-secure-store 没有网页实现，`src/platform/secure-store.web.ts` 把密钥只放内存，刷新即清空；网页版 SQLite 需要跨源隔离，`metro.config.js`（开发服务器）和 `scripts/serve-web.mjs`（导出产物）都加了 COOP/COEP 头；`web.output` 用 `single`。

## 目录

- 所有代码都在 `src/` 下：页面 `src/app/`（expo-router 在 `src/app` 存在时自动用它作为路由根，无需配置）、`src/features/`、`src/db/`、`src/platform/`、`src/lib/`、`src/ui/`。别名 `@/*` → `src/*`。

## 分层（ESLint 强制）

- `src/app/**` 不能 import `src/db`、`src/lib`、`src/platform` 和任何原生模块。
- 只有 `src/db` 能 import `expo-sqlite`。
- 只有 `src/platform` 能 import 其它原生模块（安全存储、朗读、文件、分享等），业务代码通过它的薄封装调用。
- `src/lib` 不能依赖 react / react-native / expo，也不能 import `src/platform`。

## 已定事项

- ~~8. 目录冲突：页面目录用根目录 `app/` 还是 `src/app/`~~ **已定（一号，2026-10-17）：用 `src/app/`**，与四号骨架一致，所有代码放在 `src/` 下；ESLint 分层规则已改为 `src/app/**`。
