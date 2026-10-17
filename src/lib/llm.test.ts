import { chat, chatCompletionsUrl, LlmError, type LlmConfig } from './llm';

const cfg: LlmConfig = { baseUrl: 'https://api.example.com/v1/', apiKey: 'sk-test', model: 'm' };
const ok = (content: string): Response =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const noSleep = async (): Promise<void> => {};

describe('chatCompletionsUrl', () => {
  it('补全路径并去掉末尾斜杠', () => {
    expect(chatCompletionsUrl('https://a.com/v1/')).toBe('https://a.com/v1/chat/completions');
    expect(chatCompletionsUrl('https://a.com/v1/chat/completions')).toBe(
      'https://a.com/v1/chat/completions',
    );
  });
  it('拒绝非 https', () => {
    expect(() => chatCompletionsUrl('http://a.com')).toThrow(LlmError);
  });
});

describe('chat', () => {
  it('成功返回内容并带上鉴权头', async () => {
    const fetchImpl = jest.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
      return ok(' hi ');
    });
    await expect(
      chat(cfg, [{ role: 'user', content: 'x' }], {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toBe('hi');
  });
  it('5xx 重试后成功', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(ok('ok'));
    await expect(chat(cfg, [], { fetchImpl, sleep: noSleep })).resolves.toBe('ok');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it('401 不重试', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(new Response('', { status: 401 }));
    await expect(chat(cfg, [], { fetchImpl, sleep: noSleep })).rejects.toMatchObject({
      kind: 'auth',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('最多重试 2 次', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(new Response('', { status: 500 }));
    await expect(chat(cfg, [], { fetchImpl, sleep: noSleep })).rejects.toMatchObject({
      kind: 'server',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
  it('缺配置直接报错', async () => {
    await expect(chat({ ...cfg, apiKey: '' }, [])).rejects.toMatchObject({ kind: 'config' });
  });
  it('超时', async () => {
    const fetchImpl = jest.fn(
      (_u: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_r, rej) => {
          init?.signal?.addEventListener('abort', () => rej(new Error('abort')));
        }),
    );
    await expect(
      chat(cfg, [], {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        timeoutMs: 10,
        maxRetries: 0,
      }),
    ).rejects.toMatchObject({ kind: 'timeout' });
  });
  it('取消', async () => {
    const ac = new AbortController();
    const fetchImpl = jest.fn(
      (_u: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_r, rej) => {
          init?.signal?.addEventListener('abort', () => rej(new Error('abort')));
        }),
    );
    const p = chat(cfg, [], { fetchImpl: fetchImpl as unknown as typeof fetch, signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toMatchObject({ kind: 'aborted' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
