/**
 * The settings screen will collect an OpenAI-compatible base URL, model name,
 * and API key. Persist the URL and model in user.db later. The API key must
 * go through src/lib/secure-store and must never be written to SQLite, logs,
 * or the app bundle.
 */
export const settingsPlaceholder = {
  title: '我的',
  body: '在这里填写 OpenAI 兼容接口的地址、模型和 API 密钥。密钥只保存在本机安全存储里。',
} as const;
