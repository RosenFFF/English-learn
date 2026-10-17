import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { getDatabases } from '../../db/open';
import { kvGet, kvSet } from '../../db/userRepo';
import { chat, chatCompletionsUrl, LlmError, validateConfig, type LlmConfig } from '../../lib/llm';
import { notifyDataChanged } from '../shared';
import type { SqlDb } from '../../db/types';
import { clearLlmApiKey, readLlmApiKey, setLlmApiKey } from '../../lib/secure-store';

/** 网页调试版没有安全存储（src/lib/secure-store.web.ts 只放内存），界面据此提示刷新后要重填 */
export const SECRET_PERSISTED = Platform.OS !== 'web';

export interface LlmSettings {
  baseUrl: string;
  model: string;
  /** 只告诉界面「有没有填」，不把密钥本身交给界面 */
  hasKey: boolean;
  /** 之前保存过密钥，但现在解不开（多半是换了手机/从系统备份恢复），需要重新填写 */
  keyUnreadable: boolean;
}

/** 设置页提示文案 */
export const KEY_UNREADABLE_TEXT =
  '密钥无法读取（可能是换了手机），请重新填写。接口地址和模型名已保留。';

/**
 * kv 里的非敏感标记：密钥解不开时置 1，坏记录删掉后提示仍能留到用户重新填写或清除配置。
 * （名字里不能带 key/secret/token，否则 kvSet 会拒绝）
 */
const KEY_LOST_FLAG = 'llm_auth_lost';

/** 读密钥，绝不抛错；解不开时记下标记。返回密钥（读不出为 null）和是否需要提示重新填写 */
async function readKey(user: SqlDb): Promise<{ key: string | null; lost: boolean }> {
  let r: Awaited<ReturnType<typeof readLlmApiKey>>;
  try {
    // 解密失败的判断和清理在 src/lib/secure-store（骨架），这里只消费结果
    r = await readLlmApiKey();
  } catch {
    // 其它系统错误：本次当作没有密钥（AI 隐藏），不删除、不记录异常内容，界面不崩
    return { key: null, lost: false };
  }
  if (r.status === 'ok') return { key: r.apiKey, lost: false };
  if (r.status === 'unreadable') {
    await kvSet(user, KEY_LOST_FLAG, '1');
    return { key: null, lost: true };
  }
  return { key: null, lost: (await kvGet(user, KEY_LOST_FLAG)) === '1' };
}

export async function loadLlmSettings(): Promise<LlmSettings> {
  const { user } = await getDatabases();
  const baseUrl = await kvGet(user, 'llm_base_url');
  const model = await kvGet(user, 'llm_model');
  const { key, lost } = await readKey(user);
  return { baseUrl: baseUrl ?? '', model: model ?? '', hasKey: Boolean(key), keyUnreadable: lost };
}

/** 读取完整配置给 AI 功能使用；没配全或密钥解不开都返回 null（AI 入口隐藏） */
export async function getLlmConfig(): Promise<LlmConfig | null> {
  const { user } = await getDatabases();
  const baseUrl = (await kvGet(user, 'llm_base_url')) ?? '';
  const model = (await kvGet(user, 'llm_model')) ?? '';
  const { key } = await readKey(user);
  const cfg = { baseUrl, model, apiKey: key ?? '' };
  return validateConfig(cfg) ? cfg : null;
}

export interface SaveInput {
  baseUrl: string;
  model: string;
  /** 为空表示保留原来的密钥 */
  apiKey: string;
}

export function validateBaseUrl(url: string): string | null {
  if (!url.trim()) return '请填写接口地址';
  try {
    chatCompletionsUrl(url);
    return null;
  } catch (e) {
    return e instanceof LlmError ? e.message : '接口地址格式不对';
  }
}

export async function saveLlmSettings(input: SaveInput): Promise<void> {
  const err = validateBaseUrl(input.baseUrl);
  if (err) throw new Error(err);
  const { user } = await getDatabases();
  await kvSet(user, 'llm_base_url', input.baseUrl.trim());
  await kvSet(user, 'llm_model', input.model.trim());
  if (input.apiKey.trim()) {
    await setLlmApiKey(input.apiKey.trim());
    await kvSet(user, KEY_LOST_FLAG, '');
  }
  notifyDataChanged();
}

export async function clearLlmSettings(): Promise<void> {
  const { user } = await getDatabases();
  await kvSet(user, 'llm_base_url', '');
  await kvSet(user, 'llm_model', '');
  await clearLlmApiKey().catch(() => undefined);
  await kvSet(user, KEY_LOST_FLAG, '');
  notifyDataChanged();
}

const ERROR_TEXT: Record<string, string> = {
  auth: '密钥无效或没有权限（HTTP 401/403）',
  rate_limit: '请求太频繁或额度不足（HTTP 429）',
  server: '服务端出错，请稍后再试',
  network: '连不上接口地址，请检查网络和地址',
  timeout: '连接超时',
  bad_response: '接口有响应，但返回格式不是 OpenAI 兼容格式',
  config: '配置不完整',
  aborted: '已取消',
};

export function describeLlmError(e: unknown): string {
  if (e instanceof LlmError)
    return e.kind === 'config' ? e.message : (ERROR_TEXT[e.kind] ?? e.message);
  return '未知错误';
}

/** 用表单里的值测试连接（密钥留空时用已保存的） */
export async function testLlmConnection(
  input: SaveInput,
  signal?: AbortSignal,
): Promise<{ ok: true; ms: number } | { ok: false; message: string }> {
  const urlErr = validateBaseUrl(input.baseUrl);
  if (urlErr) return { ok: false, message: urlErr };
  const apiKey = input.apiKey.trim() || ((await readKey((await getDatabases()).user)).key ?? '');
  const cfg: LlmConfig = { baseUrl: input.baseUrl, model: input.model, apiKey };
  if (!validateConfig(cfg)) return { ok: false, message: '请把接口地址、密钥和模型名都填上' };
  const t0 = Date.now();
  try {
    await chat(cfg, [{ role: 'user', content: '只回复 OK' }], {
      signal,
      timeoutMs: 15_000,
      maxRetries: 0,
      temperature: 0,
    });
    return { ok: true, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, message: describeLlmError(e) };
  }
}

export function useLlmSettings() {
  const [settings, setSettings] = useState<LlmSettings | null>(null);
  const reload = useCallback(() => {
    loadLlmSettings().then(setSettings, () =>
      setSettings({ baseUrl: '', model: '', hasKey: false, keyUnreadable: false }),
    );
  }, []);
  useEffect(reload, [reload]);
  return { settings, reload };
}

// ---------- 其它偏好 ----------
export async function getAutoSpeak(): Promise<boolean> {
  const { user } = await getDatabases();
  return (await kvGet(user, 'auto_speak')) !== '0';
}
export async function setAutoSpeak(on: boolean): Promise<void> {
  const { user } = await getDatabases();
  await kvSet(user, 'auto_speak', on ? '1' : '0');
}
