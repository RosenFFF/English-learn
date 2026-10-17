/**
 * OpenAI 兼容的 Chat Completions 客户端（纯逻辑，不依赖 React）。
 * 规范：超时 30s、最多重试 2 次（指数退避）、可通过 AbortSignal 取消。
 * 注意：apiKey 由调用方从 expo-secure-store 读出后传入，本模块绝不记录或持久化它。
 */

export interface LlmConfig {
  /** 例如 https://api.deepseek.com/v1 ，末尾斜杠可有可无 */
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRetries?: number;
  temperature?: number;
  /** 测试时注入 */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export type LlmErrorKind =
  'config' | 'auth' | 'rate_limit' | 'server' | 'network' | 'timeout' | 'aborted' | 'bad_response';

export class LlmError extends Error {
  constructor(
    public readonly kind: LlmErrorKind,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

const RETRYABLE: ReadonlySet<LlmErrorKind> = new Set([
  'rate_limit',
  'server',
  'network',
  'timeout',
]);

export function chatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!/^https:\/\//i.test(trimmed)) {
    throw new LlmError('config', '接口地址必须以 https:// 开头');
  }
  return trimmed.endsWith('/chat/completions') ? trimmed : `${trimmed}/chat/completions`;
}

export function validateConfig(cfg: Partial<LlmConfig>): cfg is LlmConfig {
  return Boolean(cfg.baseUrl?.trim() && cfg.apiKey?.trim() && cfg.model?.trim());
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function classifyStatus(status: number): LlmErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'server';
  return 'bad_response';
}

async function attempt(
  url: string,
  cfg: LlmConfig,
  messages: ChatMessage[],
  opts: ChatOptions,
): Promise<string> {
  const ctrl = new AbortController();
  const onAbort = (): void => ctrl.abort();
  opts.signal?.addEventListener('abort', onAbort);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, opts.timeoutMs ?? 30_000);
  try {
    const res = await (opts.fetchImpl ?? fetch)(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey.trim()}` },
      body: JSON.stringify({
        model: cfg.model.trim(),
        messages,
        temperature: opts.temperature ?? 0.3,
        stream: false,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      // 不把响应体原样抛出，避免把可能回显的密钥片段带进日志
      throw new LlmError(classifyStatus(res.status), `接口返回 HTTP ${res.status}`, res.status);
    }
    const data: unknown = await res.json().catch(() => null);
    const content = (data as { choices?: { message?: { content?: unknown } }[] } | null)
      ?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim() === '') {
      throw new LlmError('bad_response', '接口返回内容为空或格式不对');
    }
    return content.trim();
  } catch (e) {
    if (e instanceof LlmError) throw e;
    if (opts.signal?.aborted) throw new LlmError('aborted', '已取消');
    if (timedOut) throw new LlmError('timeout', '请求超时');
    throw new LlmError('network', '网络错误');
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

export async function chat(
  cfg: LlmConfig,
  messages: ChatMessage[],
  opts: ChatOptions = {},
): Promise<string> {
  if (!validateConfig(cfg)) throw new LlmError('config', '请先在设置里填写接口地址、密钥和模型名');
  const url = chatCompletionsUrl(cfg.baseUrl);
  const maxRetries = opts.maxRetries ?? 2;
  const sleep = opts.sleep ?? defaultSleep;
  for (let i = 0; ; i++) {
    try {
      return await attempt(url, cfg, messages, opts);
    } catch (e) {
      const err = e as LlmError;
      if (i >= maxRetries || !RETRYABLE.has(err.kind) || opts.signal?.aborted) throw err;
      await sleep(500 * 2 ** i + Math.floor(Math.random() * 250));
    }
  }
}
