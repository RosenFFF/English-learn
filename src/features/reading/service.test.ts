/**
 * @jest-environment node
 *
 * 阅读出题与交卷：生成的题存进 question 表、没做过的旧题优先复用、交卷按 PR-B 规则写 attempt、
 * 没配大模型 / 模型输出不合格时给中文说明。大模型用假的 chat（不联网）。
 */
import { openMemoryDb } from '../../db/__testutils__/nodeDb';
import { runMigrations } from '../../db/migrate';
import { MIGRATIONS } from '../../db/migrations';
import { insertQuestion, listAttemptsForQuestion, listQuestions } from '../../db/questionRepo';
import type { SqlDb } from '../../db/types';
import { kvSet } from '../../db/userRepo';
import type { ChatFn } from '../../lib/exam/generate';
import { SCHEMA_VERSION } from '../../lib/exam/schemas';
import { createSheet, sheetReducer, type ReadingSet } from '../../lib/exam/reading';
import {
  DEMO_BANKED_CLOZE,
  DEMO_CAREFUL,
  DEMO_MATCHING,
} from '../../lib/exam/__testutils__/reading-fixtures';
import type { LlmConfig } from '../../lib/llm';
import * as secureStore from '../../platform/secure-store';
import {
  ReadingNotConfiguredError,
  describeReadingError,
  getReadingLlmStatus,
  prepareReadingSet,
  saveReadingAttempts,
  startReadingSet,
} from './service';

const mockDb: { user: SqlDb | null } = { user: null };
jest.mock('../../db/open', () => ({
  getDatabases: jest.fn(async () => ({ user: mockDb.user, words: mockDb.user, schemaVersion: 1 })),
}));
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));
jest.mock('../../platform/secure-store', () => ({
  readLlmApiKey: jest.fn(async () => ({ status: 'missing' })),
  setLlmApiKey: jest.fn(),
  clearLlmApiKey: jest.fn(),
}));
const store = secureStore as unknown as { readLlmApiKey: jest.Mock };

const T0 = new Date(2026, 9, 23, 9).getTime();
const CFG: LlmConfig = { baseUrl: 'https://llm.example/v1', apiKey: 'k', model: 'm-1' };
let user: SqlDb;

beforeEach(async () => {
  user = openMemoryDb();
  await runMigrations(user, MIGRATIONS, T0);
  mockDb.user = user;
  store.readLlmApiKey.mockResolvedValue({ status: 'missing' });
});

/** 按顺序吐出这些 payload 的假大模型 */
function fakeChat(...outputs: unknown[]): jest.Mock & ChatFn {
  const queue = [...outputs];
  return jest.fn(async () => {
    const next = queue.shift();
    if (next === undefined) throw new Error('fake chat 没有更多输出了');
    return typeof next === 'string' ? next : JSON.stringify(next);
  }) as unknown as jest.Mock & ChatFn;
}

const answerAll = (set: ReadingSet, values: (number | string)[]) =>
  values.reduce(
    (s, value, index) => sheetReducer(s, { type: 'answer', index, value }),
    createSheet(set),
  );

describe('出题', () => {
  it('选词填空：调一次大模型，题目存进 question 表（来源 llm、记下模型和提示词版本）', async () => {
    const chat = fakeChat(DEMO_BANKED_CLOZE);
    const { set } = await prepareReadingSet(user, 'banked_cloze', {
      deps: { cfg: CFG, chat },
      now: () => T0,
    });
    expect(chat).toHaveBeenCalledTimes(1);
    expect(set.type).toBe('banked_cloze');
    expect(set.parts).toHaveLength(1);
    expect(set.parts[0]!.payload).toEqual(DEMO_BANKED_CLOZE);

    const rows = await listQuestions(user, 'cet6', 'banked_cloze');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: set.parts[0]!.id,
      exam: 'cet6',
      section: 'reading',
      type: 'banked_cloze',
      source: 'llm',
      model: 'm-1',
      created_at: T0,
      deleted: 0,
    });
    expect(JSON.parse(rows[0]!.payload)).toEqual(DEMO_BANKED_CLOZE);
  });

  it('仔细阅读一次两篇：生成两道题，进度从 0/2 走到 2/2', async () => {
    const chat = fakeChat(DEMO_CAREFUL[0], DEMO_CAREFUL[1]);
    const progress: string[] = [];
    const { set } = await prepareReadingSet(user, 'careful_reading', {
      deps: { cfg: CFG, chat },
      onProgress: (d, t) => progress.push(`${d}/${t}`),
    });
    expect(chat).toHaveBeenCalledTimes(2);
    expect(set.parts).toHaveLength(2);
    expect(progress).toEqual(['0/2', '1/2', '2/2']);
    expect(await listQuestions(user, 'cet6', 'careful_reading')).toHaveLength(2);
  });

  it('出完题没做就退出：下次先用这道旧题，不再调大模型；做过以后再出新题', async () => {
    const { set: first } = await prepareReadingSet(user, 'matching', {
      deps: { cfg: CFG, chat: fakeChat(DEMO_MATCHING) },
      now: () => T0,
    });
    const idle = fakeChat();
    const { set: again } = await prepareReadingSet(user, 'matching', {
      deps: { cfg: CFG, chat: idle },
    });
    expect(idle).not.toHaveBeenCalled();
    expect(again.parts[0]!.id).toBe(first.parts[0]!.id);

    await saveReadingAttempts(user, again, createSheet(again), {
      startedAt: T0,
      submittedAt: T0 + 1000,
    });
    const chat = fakeChat(DEMO_MATCHING);
    const { set: third } = await prepareReadingSet(user, 'matching', {
      deps: { cfg: CFG, chat },
      now: () => T0 + 2000,
    });
    expect(chat).toHaveBeenCalledTimes(1);
    expect(third.parts[0]!.id).not.toBe(first.parts[0]!.id);
  });

  it('考试跟着所选考试走；存的值不认识或还没上线时按六级存', async () => {
    await kvSet(user, 'exam', 'cet4'); // 四级还没上线
    await prepareReadingSet(user, 'banked_cloze', {
      deps: { cfg: CFG, chat: fakeChat(DEMO_BANKED_CLOZE) },
    });
    expect(await listQuestions(user, 'cet6', 'banked_cloze')).toHaveLength(1);
  });

  it('模型三次都输出不合格：抛中文错误，不往题库里存半成品', async () => {
    const chat = fakeChat('not json', 'still not json', '{"passage": 1}');
    const err = await prepareReadingSet(user, 'banked_cloze', {
      deps: { cfg: CFG, chat },
    }).catch((e: unknown) => e);
    expect(describeReadingError(err)).toMatch(/[\u4e00-\u9fff]/);
    expect(await listQuestions(user, 'cet6', 'banked_cloze')).toHaveLength(0);
  });

  it('生成时把同题型最近的话题传给大模型（avoidTopics），存库写生成返回的 schema 版本', async () => {
    await prepareReadingSet(user, 'careful_reading', {
      deps: { cfg: CFG, chat: fakeChat(DEMO_CAREFUL[0], DEMO_CAREFUL[1]) },
      now: () => T0,
    });
    // 两篇都没做过会被复用；先交卷，下次才会真的生成
    const { set: old } = await prepareReadingSet(user, 'careful_reading', {
      deps: { cfg: CFG, chat: fakeChat() },
    });
    await saveReadingAttempts(user, old, createSheet(old), { startedAt: T0, submittedAt: T0 });
    await prepareReadingSet(user, 'matching', {
      deps: { cfg: CFG, chat: fakeChat(DEMO_MATCHING) },
      now: () => T0 + 500,
    });

    const chat = fakeChat(DEMO_CAREFUL[1], DEMO_CAREFUL[0]);
    await prepareReadingSet(user, 'careful_reading', {
      deps: { cfg: CFG, chat },
      now: () => T0 + 1000,
    });
    expect(chat).toHaveBeenCalledTimes(2);
    for (const [, messages] of chat.mock.calls as [unknown, { content: string }[]][]) {
      const prompt = messages.map((m) => m.content).join('\n');
      expect(prompt).toContain(JSON.stringify(DEMO_CAREFUL[0].topic));
      expect(prompt).toContain(JSON.stringify(DEMO_CAREFUL[1].topic));
      // 只避开同题型的话题
      expect(prompt).not.toContain(DEMO_MATCHING.topic);
    }
    const rows = await listQuestions(user, 'cet6', 'careful_reading');
    expect(rows.map((r) => r.schema_version)).toEqual(Array(4).fill(SCHEMA_VERSION));
  });

  it('题库里第一次出题：不带「避开话题」段落', async () => {
    const chat = fakeChat(DEMO_BANKED_CLOZE);
    await prepareReadingSet(user, 'banked_cloze', { deps: { cfg: CFG, chat } });
    const [, messages] = chat.mock.calls[0] as [unknown, { content: string }[]];
    expect(messages.map((m) => m.content).join('\n')).not.toMatch(/避开以下话题/);
  });

  it('没做过的旧题读不出来：跳过、给中文原因，再生成一道新的', async () => {
    await insertQuestion(user, {
      id: 'broken',
      exam: 'cet6',
      section: 'reading',
      type: 'banked_cloze',
      schema_version: SCHEMA_VERSION + 1,
      payload: JSON.stringify(DEMO_BANKED_CLOZE),
      source: 'llm',
      model: 'm-1',
      prompt_version: 1,
      created_at: T0,
      deleted: 0,
    });
    const chat = fakeChat(DEMO_BANKED_CLOZE);
    const { set, skipped } = await prepareReadingSet(user, 'banked_cloze', {
      deps: { cfg: CFG, chat },
      now: () => T0 + 1,
    });
    expect(skipped).toEqual([{ id: 'broken', error: expect.stringMatching(/升级/) }]);
    expect(chat).toHaveBeenCalledTimes(1);
    expect(set.parts[0]!.id).not.toBe('broken');
  });

  it('v1 的老题没有 topic 也能复用', async () => {
    const { topic: _t, ...v1 } = DEMO_BANKED_CLOZE;
    await insertQuestion(user, {
      id: 'old-v1',
      exam: 'cet6',
      section: 'reading',
      type: 'banked_cloze',
      schema_version: 1,
      payload: JSON.stringify(v1),
      source: 'llm',
      model: null,
      prompt_version: 1,
      created_at: T0,
      deleted: 0,
    });
    const { set, skipped } = await prepareReadingSet(user, 'banked_cloze', {
      deps: { cfg: CFG, chat: fakeChat() },
    });
    expect(skipped).toEqual([]);
    expect(set.parts[0]).toMatchObject({ id: 'old-v1', payload: v1 });
  });
});

describe('交卷写记录', () => {
  it('客观题：score = 答对题数，wrong_count 把没答的也算上，needs_redo = 0，feedback 为空', async () => {
    const { set } = await prepareReadingSet(user, 'banked_cloze', {
      deps: { cfg: CFG, chat: fakeChat(DEMO_BANKED_CLOZE) },
    });
    // 前 3 空答对，第 4 空答错，其余没答
    const right = DEMO_BANKED_CLOZE.blanks.map((b) => b.answer);
    const sheet = answerAll(set, [right[0]!, right[1]!, right[2]!, right[0] === 0 ? 1 : 0]);
    const { rows } = await saveReadingAttempts(user, set, sheet, {
      startedAt: T0,
      submittedAt: T0 + 90_000,
    });
    expect(rows).toHaveLength(1);
    const saved = await listAttemptsForQuestion(user, set.parts[0]!.id);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      exam: 'cet6',
      section: 'reading',
      type: 'banked_cloze',
      score: 3,
      max_score: 10,
      wrong_count: 7,
      needs_redo: 0,
      feedback: null,
      duration_ms: 90_000,
      started_at: T0,
      submitted_at: T0 + 90_000,
    });
    const answer = JSON.parse(saved[0]!.answer) as (number | null)[];
    expect(answer).toHaveLength(10);
    expect(answer.slice(4)).toEqual(Array(6).fill(null));
  });

  it('仔细阅读两篇各写一条记录，答案按篇拆开', async () => {
    const { set } = await prepareReadingSet(user, 'careful_reading', {
      deps: { cfg: CFG, chat: fakeChat(DEMO_CAREFUL[0], DEMO_CAREFUL[1]) },
    });
    const key = DEMO_CAREFUL.flatMap((p) => p.questions.map((q) => q.answer));
    const sheet = answerAll(set, key);
    const { rows } = await saveReadingAttempts(user, set, sheet, {
      startedAt: T0,
      submittedAt: T0 + 1,
    });
    expect(rows.map((r) => [r.question_id, r.score, r.max_score, r.wrong_count])).toEqual([
      [set.parts[0]!.id, 5, 5, 0],
      [set.parts[1]!.id, 5, 5, 0],
    ]);
    expect(JSON.parse(rows[1]!.answer)).toEqual(DEMO_CAREFUL[1].questions.map((q) => q.answer));
  });
});

describe('大模型配置', () => {
  it('什么都没填：列出缺的三项，出题直接报「还没有配置大模型」', async () => {
    await expect(getReadingLlmStatus()).resolves.toEqual({
      ready: false,
      missing: ['接口地址', '密钥', '模型名'],
      keyUnreadable: false,
    });
    const err = await startReadingSet('banked_cloze').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ReadingNotConfiguredError);
    expect(describeReadingError(err)).toMatch(/还没有配置大模型/);
  });

  it('只缺模型名：只列模型名', async () => {
    await kvSet(user, 'llm_base_url', 'https://llm.example/v1');
    store.readLlmApiKey.mockResolvedValue({ status: 'ok', apiKey: 'k' });
    await expect(getReadingLlmStatus()).resolves.toMatchObject({ missing: ['模型名'] });
  });

  it('三项都齐：可以出题', async () => {
    await kvSet(user, 'llm_base_url', 'https://llm.example/v1');
    await kvSet(user, 'llm_model', 'm-1');
    store.readLlmApiKey.mockResolvedValue({ status: 'ok', apiKey: 'k' });
    await expect(getReadingLlmStatus()).resolves.toEqual({ ready: true });
  });
});
