/**
 * @jest-environment node
 *
 * 翻译、写作：出题入库（避开最近话题）、草稿恢复、评分写 attempt（needs_redo 规则）、评分失败保留草稿。
 */
import { openMemoryDb } from '../../db/__testutils__/nodeDb';
import { runMigrations } from '../../db/migrate';
import { MIGRATIONS } from '../../db/migrations';
import { listAttemptsForQuestion, listQuestions } from '../../db/questionRepo';
import type { SqlDb } from '../../db/types';
import {
  asModelOutput,
  DEMO_ESSAY,
  DEMO_ESSAY_FEEDBACK,
  DEMO_TRANSLATION,
  DEMO_TRANSLATION_FEEDBACK,
  SAMPLE_ESSAY_ANSWER,
} from '../../lib/exam/__testutils__/subjective-fixtures';
import type { ChatFn } from '../../lib/exam/generate';
import { SCHEMA_VERSION } from '../../lib/exam/schemas';
import type { LlmConfig } from '../../lib/llm';
import { gradeAndSave, prepareSubjective, readDraft, writeDraft } from './service';

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

const T0 = new Date(2026, 9, 23, 20).getTime();
const CFG: LlmConfig = { baseUrl: 'https://llm.example/v1', apiKey: 'k', model: 'm-1' };
let user: SqlDb;

beforeEach(async () => {
  user = openMemoryDb();
  await runMigrations(user, MIGRATIONS, T0);
  mockDb.user = user;
});

function fakeChat(...outputs: unknown[]): jest.Mock & ChatFn {
  const queue = [...outputs];
  return jest.fn(async () => {
    const next = queue.shift();
    if (next === undefined) throw new Error('fake chat 没有更多输出了');
    return typeof next === 'string' ? next : JSON.stringify(next);
  }) as unknown as jest.Mock & ChatFn;
}
const promptOf = (chat: jest.Mock, i: number) =>
  (chat.mock.calls[i] as [unknown, { content: string }[]])[1].map((m) => m.content).join('\n');

it('写作：生成一道题存库（section writing、schema_version 用生成返回的值）', async () => {
  const chat = fakeChat(DEMO_ESSAY);
  const p = await prepareSubjective(user, 'essay', { deps: { cfg: CFG, chat }, now: () => T0 });
  expect(p.question).toMatchObject({ type: 'essay', payload: DEMO_ESSAY });
  expect(p.draft).toBeNull();
  const rows = await listQuestions(user, 'cet6', 'essay');
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    section: 'writing',
    schema_version: SCHEMA_VERSION,
    source: 'llm',
  });
});

it('草稿：中途退出再进来，接着写草稿那道题、恢复内容，不再出新题', async () => {
  const { question } = await prepareSubjective(user, 'translation', {
    deps: { cfg: CFG, chat: fakeChat(DEMO_TRANSLATION) },
  });
  const draft = { questionId: question.id, text: 'Over the past', startedAt: T0, savedAt: T0 + 5 };
  await writeDraft(user, 'translation', draft);
  const idle = fakeChat();
  const again = await prepareSubjective(user, 'translation', { deps: { cfg: CFG, chat: idle } });
  expect(idle).not.toHaveBeenCalled();
  expect(again.question.id).toBe(question.id);
  expect(again.draft).toEqual(draft);
});

it('翻译 10 分：写 attempt（wrong_count 0、needs_redo 0、feedback 存评分 JSON），清掉草稿', async () => {
  const { question } = await prepareSubjective(user, 'translation', {
    deps: { cfg: CFG, chat: fakeChat(DEMO_TRANSLATION) },
  });
  await writeDraft(user, 'translation', {
    questionId: question.id,
    text: 'x',
    startedAt: T0,
    savedAt: T0,
  });
  const { view } = await gradeAndSave(user, question, 'My translation.', {
    deps: { cfg: CFG, chat: fakeChat(asModelOutput(DEMO_TRANSLATION_FEEDBACK)) },
    startedAt: T0,
    now: () => T0 + 60_000,
  });
  expect(view).toMatchObject({ score: 10, band: 11, needsRedo: false });
  const [a] = await listAttemptsForQuestion(user, question.id);
  expect(a).toMatchObject({
    section: 'translation',
    type: 'translation',
    score: 10,
    max_score: 15,
    wrong_count: 0,
    needs_redo: 0,
    duration_ms: 60_000,
  });
  expect(JSON.parse(a!.answer)).toBe('My translation.');
  expect(JSON.parse(a!.feedback!)).toMatchObject({ version: 2, ...DEMO_TRANSLATION_FEEDBACK });
  expect(view.dimensions).toHaveLength(4);
  expect(view.rewrite).toBe(DEMO_TRANSLATION_FEEDBACK.rewrite);
  expect(await readDraft(user, 'translation')).toBeNull();
});

it('写作 8 分：低于 9 分 needs_redo = 1', async () => {
  const { question } = await prepareSubjective(user, 'essay', {
    deps: { cfg: CFG, chat: fakeChat(DEMO_ESSAY) },
  });
  const { view, row } = await gradeAndSave(user, question, SAMPLE_ESSAY_ANSWER, {
    deps: { cfg: CFG, chat: fakeChat(asModelOutput(DEMO_ESSAY_FEEDBACK)) },
    startedAt: T0,
  });
  expect(view.needsRedo).toBe(true);
  expect(row).toMatchObject({ section: 'writing', score: 8, needs_redo: 1, wrong_count: 0 });
});

it('评分失败：不写 attempt、草稿还在，可以重试', async () => {
  const { question } = await prepareSubjective(user, 'essay', {
    deps: { cfg: CFG, chat: fakeChat(DEMO_ESSAY) },
  });
  const draft = { questionId: question.id, text: SAMPLE_ESSAY_ANSWER, startedAt: T0, savedAt: T0 };
  await writeDraft(user, 'essay', draft);
  await expect(
    gradeAndSave(user, question, SAMPLE_ESSAY_ANSWER, {
      deps: { cfg: CFG, chat: fakeChat('no', 'still no', 'nope') },
      startedAt: T0,
    }),
  ).rejects.toThrow(/[\u4e00-\u9fff]/);
  expect(await listAttemptsForQuestion(user, question.id)).toHaveLength(0);
  expect(await readDraft(user, 'essay')).toEqual(draft);
});

it('做过一道之后再出题：把这道题的话题作为 avoidTopics 传给大模型', async () => {
  const first = fakeChat(DEMO_ESSAY);
  const { question } = await prepareSubjective(user, 'essay', {
    deps: { cfg: CFG, chat: first },
    now: () => T0,
  });
  expect(promptOf(first, 0)).not.toContain('避开以下话题');
  await gradeAndSave(user, question, 'x', {
    deps: { cfg: CFG, chat: fakeChat(asModelOutput(DEMO_ESSAY_FEEDBACK)) },
    startedAt: T0,
  });
  const chat = fakeChat(DEMO_ESSAY);
  const next = await prepareSubjective(user, 'essay', {
    deps: { cfg: CFG, chat },
    now: () => T0 + 1,
  });
  expect(next.question.id).not.toBe(question.id);
  expect(promptOf(chat, 0)).toContain(JSON.stringify(DEMO_ESSAY.topic));
});
