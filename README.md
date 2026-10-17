# 英语词汇

给自己用的英语词汇学习应用，覆盖四级、六级、考研和 IELTS。第一版是一台安卓手机上的离线应用：没有账号，词书和进度都在本机，讲解走你自己填写的 OpenAI 兼容接口。

当前仓库是骨架。四个标签页（今天 / 词书 / 练习 / 我的）可以打开，API 密钥的安全存储已经接好。SQLite、FSRS、LLM 客户端和真正的学习界面会在后面的 PR 里接上。分层约定见 [docs/architecture.md](docs/architecture.md)。

## 环境

- Node.js 22.13 或更高的 22.x（见 `.nvmrc`）
- npm（使用仓库里的 `package-lock.json`）

```bash
nvm use
npm ci
```

## 本地开发

```bash
npm start          # Metro
npm run android    # 在已连接的设备或模拟器上打开
npm run web        # 浏览器里看同一套页面
```

安卓包名是 `com.rosenfff.englishlearn`。页面在 `src/app/`，业务代码在 `src/features/`。`android/` 和 `ios/` 由 `npx expo prebuild` 生成，不提交。

## 测试

```bash
npm run lint       # ESLint + Prettier
npm run typecheck  # tsc --noEmit
npm test           # Jest + React Native Testing Library
npm run e2e        # expo export --platform web，再用 Playwright 打开静态产物
```

第一次跑网页端到端测试前，安装 Playwright 自带的 Chromium：

```bash
npx playwright install --with-deps chromium
```

`npm run e2e` 会先执行 `npx expo export --platform web`，再用 `scripts/serve-web.mjs` 把 `dist/` 提供给 Playwright。CI 里同样是这条路径。静态站点没有单独的首页文件，第一个标签是 `/today`；本地静态服务器会把 `/` 指到这一页。

## CI

`.github/workflows/ci.yml` 在指向 `main` 的 pull request 以及推送到 `main` 时运行：`npm ci`、lint、类型检查、单元测试、网页导出和 Playwright。Actions 按完整 commit SHA 固定，npm 依赖走缓存，同一分支上新的运行会取消还在排队或进行中的运行。权限只有 `contents: read`。

Dependabot 每周检查 npm 和 GitHub Actions。

## 发布安卓 APK

发布不使用 EAS。给一个 `v*` 标签会触发 `.github/workflows/release.yml`：检查四个签名密钥是否存在，生成 `android/`，用 JDK 17 执行 `./gradlew assembleRelease`，把 APK（不是 AAB）挂到 GitHub Release 上。

第一次打标签之前，在仓库 Settings → Secrets and variables → Actions 里添加：

| Secret                      | 内容                |
| --------------------------- | ------------------- |
| `ANDROID_KEYSTORE_BASE64`   | 发布密钥库的 base64 |
| `ANDROID_KEY_ALIAS`         | keytool 的 `-alias` |
| `ANDROID_KEYSTORE_PASSWORD` | 密钥库口令          |
| `ANDROID_KEY_PASSWORD`      | 密钥口令            |

生成密钥库并写入这四个 secret（口令自己保管，不要提交密钥库）：

```bash
keytool -genkeypair -v \
  -keystore english-learn-release.keystore \
  -alias english-learn \
  -keyalg RSA -keysize 2048 -validity 10000

# Linux / macOS 都适用。把输出整段粘贴到 ANDROID_KEYSTORE_BASE64。
base64 < english-learn-release.keystore | tr -d '\n'
```

`keytool` 会询问密钥库口令和密钥口令。别名填 `ANDROID_KEY_ALIAS`（上面的例子是 `english-learn`）。缺任何一个 secret 时，工作流会在 prebuild 之前失败，并写明缺的是哪一个。

密钥库文件已被 `.gitignore` 忽略。API 密钥不是这个密钥库，它由用户在「我的」里填写，只进 `expo-secure-store`。

`android:allowBackup` 保持开启（系统默认），换手机时系统备份可以带走学习进度。API 密钥存在 Android Keystore 里，换设备后不会恢复，需要重新填写。`expo-secure-store` 会把这份密钥排除在自动备份之外，避免新设备读到无法解密的数据。

标签 `vMAJOR.MINOR.PATCH` 同时作为 APK 的 versionName。versionCode 按 `MAJOR * 10000 + MINOR * 100 + PATCH` 计算，例如 `v0.2.3` 是 203，`v0.1.0` 是 100。MINOR 和 PATCH 必须各自在 0 到 99 之间；超出时发布工作流会在 prebuild 之前失败，并写明是哪一段超了。本地不打标签时，版本取 `package.json` 里的 `version`（当前 `0.1.0`，versionCode 100）。也可以在本地设置 `ANDROID_RELEASE_TAG=v0.2.3` 再 prebuild。

准备好 secret 之后：

```bash
git tag v0.1.0
git push origin v0.1.0
```

到 Actions 里看 Release 工作流。成功后，仓库的 Releases 页面会有带 `app-release.apk` 的 `v0.1.0`。把 APK 拷到手机上安装即可。

## 还没做

- `words.db` / `user.db`、迁移和仓储
- FSRS 调度
- LLM 客户端（超时、重试、取消）
- 今天、词书、练习、设置的真实界面
