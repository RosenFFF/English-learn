import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

import * as SecureStore from 'expo-secure-store';

import {
  clearLlmApiKey,
  getLlmApiKey,
  LLM_API_KEY_STORAGE_KEY,
  readLlmApiKey,
  setLlmApiKey,
} from './secure-store';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const getItemAsync = jest.mocked(SecureStore.getItemAsync);
const setItemAsync = jest.mocked(SecureStore.setItemAsync);
const deleteItemAsync = jest.mocked(SecureStore.deleteItemAsync);

const SECRET = 'sk-test-secret';

function listSourceFiles(directory: string): string[] {
  const entries = readdirSync(directory);
  const files: string[] = [];
  for (const entry of entries) {
    if (
      entry === 'node_modules' ||
      entry === 'dist' ||
      entry === 'coverage' ||
      entry === 'android' ||
      entry === 'ios' ||
      entry === '.git' ||
      entry === '.expo'
    ) {
      continue;
    }
    const fullPath = path.join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listSourceFiles(fullPath));
    } else if (
      /\.(ts|tsx)$/.test(entry) &&
      !entry.endsWith('.test.ts') &&
      !entry.endsWith('.test.tsx')
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('llm api key secure store', () => {
  beforeEach(() => {
    getItemAsync.mockReset();
    setItemAsync.mockReset();
    deleteItemAsync.mockReset();
  });

  it('uses a secure-store key and does not log or persist the secret elsewhere', async () => {
    expect(LLM_API_KEY_STORAGE_KEY).toMatch(/^[A-Za-z0-9._-]+$/);

    const source = readFileSync(path.join(process.cwd(), 'src/lib/secure-store.ts'), 'utf8');
    expect(source).not.toMatch(/console\./);
    expect(source).not.toMatch(/\b(expo-sqlite|sqlite3|user\.db|words\.db|INSERT |CREATE TABLE)\b/);

    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    setItemAsync.mockResolvedValue(undefined);
    await setLlmApiKey(SECRET);

    expect(setItemAsync).toHaveBeenCalledWith(LLM_API_KEY_STORAGE_KEY, SECRET);
    expect(log).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();

    log.mockRestore();
    info.mockRestore();
    warn.mockRestore();
    error.mockRestore();
  });

  it('reads and clears the same key', async () => {
    getItemAsync.mockResolvedValue(SECRET);
    await expect(getLlmApiKey()).resolves.toBe(SECRET);
    expect(getItemAsync).toHaveBeenCalledWith(LLM_API_KEY_STORAGE_KEY);

    getItemAsync.mockResolvedValue(null);
    await expect(getLlmApiKey()).resolves.toBeNull();

    deleteItemAsync.mockResolvedValue(undefined);
    await clearLlmApiKey();
    expect(deleteItemAsync).toHaveBeenCalledWith(LLM_API_KEY_STORAGE_KEY);
  });

  it('treats a decrypt failure as no key and clears the stored value', async () => {
    getItemAsync.mockRejectedValue(
      Object.assign(new Error("Could not decrypt the value for key 'llm.apiKey'"), {
        code: 'ERR_DECRYPT',
      }),
    );
    deleteItemAsync.mockResolvedValue(undefined);

    await expect(getLlmApiKey()).resolves.toBeNull();
    expect(deleteItemAsync).toHaveBeenCalledWith(LLM_API_KEY_STORAGE_KEY);
  });

  it('reports whether the key is present, missing, or was unreadable and cleared', async () => {
    getItemAsync.mockResolvedValue(SECRET);
    await expect(readLlmApiKey()).resolves.toEqual({ status: 'ok', apiKey: SECRET });

    getItemAsync.mockResolvedValue(null);
    await expect(readLlmApiKey()).resolves.toEqual({ status: 'missing' });
    expect(deleteItemAsync).not.toHaveBeenCalled();

    getItemAsync.mockRejectedValue(
      Object.assign(new Error("Could not decrypt the value for key 'llm.apiKey'"), {
        code: 'ERR_DECRYPT',
      }),
    );
    deleteItemAsync.mockRejectedValue(new Error('keystore unavailable'));
    const result = await readLlmApiKey();
    expect(result).toEqual({ status: 'unreadable' });
    expect(JSON.stringify(result)).not.toMatch(/decrypt/i);
    expect(deleteItemAsync).toHaveBeenCalledWith(LLM_API_KEY_STORAGE_KEY);
  });

  it('still throws when a read fails for a reason other than decrypt', async () => {
    getItemAsync.mockRejectedValue(new Error('User canceled the authentication'));

    await expect(getLlmApiKey()).rejects.toThrow('User canceled the authentication');
    expect(deleteItemAsync).not.toHaveBeenCalled();
  });

  it('rejects an empty key before touching secure store', async () => {
    await expect(setLlmApiKey('   ')).rejects.toThrow('API key must not be empty');
    expect(setItemAsync).not.toHaveBeenCalled();
  });

  it('is the only module that imports expo-secure-store', () => {
    const allowed = path.normalize(path.join(process.cwd(), 'src/lib/secure-store.ts'));
    const offenders = listSourceFiles(process.cwd()).filter((file) => {
      if (path.normalize(file) === allowed) {
        return false;
      }
      return /from ['"]expo-secure-store['"]|require\(['"]expo-secure-store['"]\)/.test(
        readFileSync(file, 'utf8'),
      );
    });
    expect(offenders).toEqual([]);
  });
});
