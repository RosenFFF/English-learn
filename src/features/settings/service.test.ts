/**
 * @jest-environment node
 *
 * 密钥解不开时：当作「未配置大模型」（AI 隐藏），设置页拿到 keyUnreadable 提示，接口地址和模型名保留。
 * 解密失败的判断与清理属于 src/lib/secure-store（骨架，测试见 secure-store.test.ts）；这里把它 mock 掉，只测界面需要的状态。
 */
import { openMemoryDb } from '../../db/__testutils__/nodeDb';
import { runMigrations } from '../../db/migrate';
import { MIGRATIONS } from '../../db/migrations';
import type { SqlDb } from '../../db/types';
import { kvGet, kvSet } from '../../db/userRepo';
import { isAiConfigured, explainWord } from '../ai/explain';
import * as secureStore from '../../lib/secure-store';
import { clearLlmSettings, getLlmConfig, loadLlmSettings, saveLlmSettings } from './service';

const mockDb: { user: SqlDb | null } = { user: null };

jest.mock('../../db/open', () => ({
  getDatabases: jest.fn(async () => ({ user: mockDb.user, words: mockDb.user, schemaVersion: 1 })),
}));
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));
jest.mock('../../lib/secure-store', () => ({
  readLlmApiKey: jest.fn(),
  setLlmApiKey: jest.fn(),
  clearLlmApiKey: jest.fn(),
}));

const store = secureStore as unknown as {
  readLlmApiKey: jest.Mock;
  setLlmApiKey: jest.Mock;
  clearLlmApiKey: jest.Mock;
};
const SECRET_IN_ERROR = 'sk-should-never-be-logged';
const ok = (apiKey: string) => ({ status: 'ok', apiKey });
let user: SqlDb;
let logSpies: jest.SpyInstance[];
let fetchSpy: jest.SpyInstance;

/** 模拟一台「从系统备份恢复」的新手机：第一次读到 unreadable（底层已清掉坏记录），之后就是 missing */
function simulateRestoredPhone(): void {
  store.readLlmApiKey
    .mockResolvedValueOnce({ status: 'unreadable' })
    .mockResolvedValue({ status: 'missing' });
}

beforeEach(async () => {
  jest.clearAllMocks();
  user = openMemoryDb();
  await runMigrations(user, MIGRATIONS, Date.now());
  mockDb.user = user;
  await kvSet(user, 'llm_base_url', 'https://api.deepseek.com/v1');
  await kvSet(user, 'llm_model', 'deepseek-chat');
  logSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
    jest.spyOn(console, m).mockImplementation(() => {}),
  );
  fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('不应该发请求'));
});
afterEach(() => {
  for (const s of [...logSpies, fetchSpy]) s.mockRestore();
});

it('密钥正常时：AI 已配置', async () => {
  store.readLlmApiKey.mockResolvedValue(ok('sk-ok'));
  expect(await getLlmConfig()).toEqual({
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    apiKey: 'sk-ok',
  });
  expect(await loadLlmSettings()).toEqual({
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    hasKey: true,
    keyUnreadable: false,
  });
});

it('换手机后密钥解不开：AI 当作未配置，不抛错不发请求，坏记录被删除', async () => {
  simulateRestoredPhone();
  await expect(getLlmConfig()).resolves.toBeNull();
  await expect(isAiConfigured()).resolves.toBe(false);
  const word = {
    id: 1,
    headword: 'abandon',
    meanings: [],
    examples: [],
    phrases: [],
  } as unknown as Parameters<typeof explainWord>[0];
  await expect(explainWord(word, 'cet4')).resolves.toMatchObject({ ok: false });
  expect(fetchSpy).not.toHaveBeenCalled();
});

it('设置页拿到提示标记，接口地址和模型名保留；坏记录删掉后再次进入仍然提示', async () => {
  simulateRestoredPhone();
  const first = await loadLlmSettings();
  expect(first).toEqual({
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    hasKey: false,
    keyUnreadable: true,
  });
  // 第二次读取时记录已被删掉（missing），提示要一直留到用户重新填写
  const again = await loadLlmSettings();
  expect(again).toEqual(first);
  expect(await kvGet(user, 'llm_base_url')).toBe('https://api.deepseek.com/v1');
  expect(await kvGet(user, 'llm_model')).toBe('deepseek-chat');
});

it('重新填写密钥后提示消失，AI 恢复可用', async () => {
  simulateRestoredPhone();
  await loadLlmSettings();
  store.setLlmApiKey.mockResolvedValue(undefined);
  await saveLlmSettings({
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    apiKey: 'sk-new',
  });
  store.readLlmApiKey.mockResolvedValue(ok('sk-new'));
  expect(await loadLlmSettings()).toMatchObject({ hasKey: true, keyUnreadable: false });
  expect(store.setLlmApiKey).toHaveBeenCalledWith('sk-new');
  expect((await getLlmConfig())?.apiKey).toBe('sk-new');
});

it('只保存地址/模型（密钥留空）不会清掉提示；清除配置会清掉提示', async () => {
  simulateRestoredPhone();
  await loadLlmSettings();
  await saveLlmSettings({
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    apiKey: '',
  });
  expect(await loadLlmSettings()).toMatchObject({ keyUnreadable: true });
  store.clearLlmApiKey.mockResolvedValue(undefined);
  await clearLlmSettings();
  expect(store.clearLlmApiKey).toHaveBeenCalled();
  expect(await loadLlmSettings()).toMatchObject({ hasKey: false, keyUnreadable: false });
});

it('底层抛出其它系统错误时也不崩：当作没有密钥、不提示重填、不打日志', async () => {
  store.readLlmApiKey.mockRejectedValue(new Error(`keystore busy ${SECRET_IN_ERROR}`));
  await expect(getLlmConfig()).resolves.toBeNull();
  await expect(loadLlmSettings()).resolves.toMatchObject({ hasKey: false, keyUnreadable: false });
  for (const s of logSpies) expect(s).not.toHaveBeenCalled();
});

it('整个过程不打日志，密钥/异常信息不会进 user.db', async () => {
  simulateRestoredPhone();
  await loadLlmSettings();
  await getLlmConfig();
  for (const s of logSpies) expect(s).not.toHaveBeenCalled();
  const kv = await user.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM kv',
    [],
  );
  expect(JSON.stringify(kv)).not.toContain(SECRET_IN_ERROR);
  expect(JSON.stringify(kv)).not.toMatch(/decrypt/i);
});
