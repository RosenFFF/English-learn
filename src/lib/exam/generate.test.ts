import { LlmError, type ChatMessage, type LlmConfig } from '../llm';
import { VALID_PAYLOADS } from './__testutils__/fixtures';
import {
  ExamGenError,
  extractJson,
  generateQuestion,
  MAX_JSON_RETRIES,
  type ChatFn,
} from './generate';
import { PROMPT_VERSION } from './prompts';
import { SCHEMA_VERSION } from './schemas';
import { QUESTION_TYPES } from './types';

const cfg: LlmConfig = {
  baseUrl: 'https://example.com/v1',
  apiKey: 'sk-test',
  model: ' deepseek-chat ',
};

/** 假的 chat：按顺序返回预设的回复，并记下每次收到的消息 */
function fakeChat(...replies: (string | Error)[]) {
  const calls: ChatMessage[][] = [];
  const fn = jest.fn(async (_cfg: LlmConfig, messages: ChatMessage[]) => {
    calls.push(messages.map((m) => ({ ...m })));
    const r = replies[Math.min(calls.length - 1, replies.length - 1)];
    if (r instanceof Error) throw r;
    return r;
  });
  return { chat: fn as unknown as ChatFn, calls, fn };
}

const json = (type: keyof typeof VALID_PAYLOADS) => JSON.stringify(VALID_PAYLOADS[type]);

describe('extractJson', () => {
  it.each([
    ['纯 JSON', '{"a":1}'],
    ['```json 包裹', '```json\n{"a":1}\n```'],
    ['``` 包裹', '```\n{"a":1}\n```'],
    ['首尾杂字', '好的，题目如下：\n{"a":1}\n希望有帮助！'],
    ['代码块外还有杂字', '说明\n```json\n{"a":1}\n```\n以上'],
  ])('%s', (_name, raw) => {
    expect(extractJson(raw)).toEqual({ a: 1 });
  });
  it.each([
    ['不是 JSON', 'oops'],
    ['数组', '[1,2]'],
    ['截断', '{"a":'],
    ['空', ''],
  ])('%s 返回 undefined', (_name, raw) => {
    expect(extractJson(raw)).toBeUndefined();
  });
});

describe('generateQuestion', () => {
  it.each(QUESTION_TYPES)('正常生成 %s：返回题型、payload、版本和模型名', async (type) => {
    const { chat, calls } = fakeChat(json(type));
    const q = await generateQuestion(type, { cfg, chat });
    expect(q).toEqual({
      type,
      payload: VALID_PAYLOADS[type],
      schemaVersion: SCHEMA_VERSION,
      promptVersion: PROMPT_VERSION,
      model: 'deepseek-chat',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0][0].role).toBe('system');
    expect(calls[0][0].content).toMatch(/只输出一个 JSON 对象/);
    expect(calls[0][0].content).toMatch(/不得复述、改写/);
  });

  it('被 ```json 代码块包裹也能解析', async () => {
    const { chat } = fakeChat('```json\n' + json('translation') + '\n```');
    await expect(generateQuestion('translation', { cfg, chat })).resolves.toMatchObject({
      payload: VALID_PAYLOADS.translation,
    });
  });

  it('去掉 payload 里多余的字段', async () => {
    const { chat } = fakeChat(JSON.stringify({ ...VALID_PAYLOADS.essay, extra: 'x' }));
    const q = await generateQuestion('essay', { cfg, chat });
    expect(q.payload).toEqual(VALID_PAYLOADS.essay);
  });

  it('坏 JSON 后重试成功：把上次输出和问题回给模型', async () => {
    const { chat, calls } = fakeChat('{"passage": "截断了', json('careful_reading'));
    const q = await generateQuestion('careful_reading', { cfg, chat });
    expect(q.payload).toEqual(VALID_PAYLOADS.careful_reading);
    expect(calls).toHaveLength(2);
    const retry = calls[1];
    expect(retry).toHaveLength(4);
    expect(retry[2]).toEqual({ role: 'assistant', content: '{"passage": "截断了' });
    expect(retry[3].role).toBe('user');
    expect(retry[3].content).toMatch(/不是一个有效的 JSON 对象/);
  });

  it('schema 不过后重试成功：回给模型的是精简后的校验错误', async () => {
    const bad = { ...VALID_PAYLOADS.banked_cloze, options: ['only', 'two'] };
    const { chat, calls } = fakeChat(JSON.stringify(bad), json('banked_cloze'));
    await generateQuestion('banked_cloze', { cfg, chat });
    expect(calls[1][3].content).toMatch(/options: 必须 15 个候选词/);
  });

  it('schema 一直不过：共请求 1 + 2 次后抛 ExamGenError(schema_mismatch)，带中文说明', async () => {
    const bad = { ...VALID_PAYLOADS.matching, statements: [] };
    const { chat, fn } = fakeChat(JSON.stringify(bad));
    const p = generateQuestion('matching', { cfg, chat });
    await expect(p).rejects.toBeInstanceOf(ExamGenError);
    await expect(p).rejects.toMatchObject({
      kind: 'schema_mismatch',
      message: expect.stringMatching(/长篇阅读（段落匹配）题目格式不符合要求（共尝试 3 次）/),
      detail: expect.stringMatching(/statements/),
    });
    expect(fn).toHaveBeenCalledTimes(MAX_JSON_RETRIES + 1);
  });

  it('一直不是 JSON：抛 ExamGenError(invalid_json)', async () => {
    const { chat, fn } = fakeChat('抱歉，我无法完成。');
    await expect(generateQuestion('lecture', { cfg, chat })).rejects.toMatchObject({
      name: 'ExamGenError',
      kind: 'invalid_json',
      message: expect.stringMatching(/不是有效的 JSON/),
    });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('LlmError 原样抛出，不重试', async () => {
    const err = new LlmError('auth', '接口返回 HTTP 401', 401);
    const { chat, fn } = fakeChat(err);
    await expect(generateQuestion('essay', { cfg, chat })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('重试过程中的 LlmError 也原样抛出', async () => {
    const err = new LlmError('timeout', '请求超时');
    const { chat } = fakeChat('oops', err);
    await expect(generateQuestion('essay', { cfg, chat })).rejects.toBe(err);
  });

  it('signal 传给 chat；已取消时不再重试，抛 LlmError(aborted)', async () => {
    const ctrl = new AbortController();
    const fn = jest.fn(
      async (_c: LlmConfig, _m: ChatMessage[], opts?: { signal?: AbortSignal }) => {
        expect(opts?.signal).toBe(ctrl.signal);
        ctrl.abort();
        return 'not json';
      },
    );
    const p = generateQuestion('essay', {
      cfg,
      chat: fn as unknown as ChatFn,
      signal: ctrl.signal,
    });
    await expect(p).rejects.toMatchObject({ name: 'LlmError', kind: 'aborted' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('不传 chat 时用 llm.ts 的 chat（配置不全直接报 LlmError）', async () => {
    await expect(
      generateQuestion('essay', { cfg: { baseUrl: '', apiKey: '', model: '' } }),
    ).rejects.toMatchObject({ name: 'LlmError', kind: 'config' });
  });
});
