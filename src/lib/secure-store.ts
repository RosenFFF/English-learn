import * as SecureStore from 'expo-secure-store';

/**
 * SecureStore key for the user's OpenAI-compatible API key.
 * Keys may contain only alphanumeric characters, ".", "-", and "_".
 * Never write this value to SQLite, logs, crash reports, or source.
 */
export const LLM_API_KEY_STORAGE_KEY = 'llm.apiKey';

export async function getLlmApiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(LLM_API_KEY_STORAGE_KEY);
}

export async function setLlmApiKey(apiKey: string): Promise<void> {
  if (apiKey.trim().length === 0) {
    throw new Error('API key must not be empty');
  }
  await SecureStore.setItemAsync(LLM_API_KEY_STORAGE_KEY, apiKey);
}

export async function clearLlmApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(LLM_API_KEY_STORAGE_KEY);
}
