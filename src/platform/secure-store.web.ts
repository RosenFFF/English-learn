/**
 * Web build only (debugging in a desktop browser). expo-secure-store has no web
 * implementation, and browsers have no equivalent encrypted store, so the key
 * lives in memory for the current page and is gone after a reload. It is never
 * written to localStorage, IndexedDB, SQLite, or logs.
 */
import type { LlmApiKeyRead } from './secure-store';

export type { LlmApiKeyRead } from './secure-store';

export const LLM_API_KEY_STORAGE_KEY = 'llm.apiKey';

let memory: string | null = null;

export async function readLlmApiKey(): Promise<LlmApiKeyRead> {
  return memory === null ? { status: 'missing' } : { status: 'ok', apiKey: memory };
}

export async function getLlmApiKey(): Promise<string | null> {
  return memory;
}

export async function setLlmApiKey(apiKey: string): Promise<void> {
  if (apiKey.trim().length === 0) {
    throw new Error('API key must not be empty');
  }
  memory = apiKey;
}

export async function clearLlmApiKey(): Promise<void> {
  memory = null;
}
