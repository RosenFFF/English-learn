/**
 * @jest-environment node
 *
 * 翻译、写作：出题入库（避开最近话题）、草稿恢复、评分写 attempt（needs_redo 规则）、评分失败保留草稿。
 */
import { openMemoryDb } from '../../db/__testutils__/nodeDb';
import { runMigrations } from '../../db/migrate';
import { MIGRATIONS } from '../../db/migrations';
import { listAttemptsForQuestion, listOpenMistakes, listQuestions } from '../../db/questionRepo';
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
import { LlmError, type LlmConfig } from '../../lib/llm';
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
  const open = await listOpenMistakes(user, 'cet6');
  expect(open.map((r) => [r.question_id, r.wrong_count, r.needs_redo])).toEqual([
    [question.id, 0, 1],
  ]);
});

it('同一份答案再交一次不重复打分、不重复入库；并行的两次也只留一条', async () => {
  const { question } = await prepareSubjective(user, 'essay', {
    deps: { cfg: CFG, chat: fakeChat(DEMO_ESSAY) },
  });
  const chat = fakeChat(asModelOutput(DEMO_ESSAY_FEEDBACK));
  const opts = {
    deps: { cfg: CFG, chat },
    startedAt: T0,
    now: () => T0 + 1000,
  };
  const [a, b] = await Promise.all([
    gradeAndSave(user, question, SAMPLE_ESSAY_ANSWER, opts),
    gradeAndSave(user, question, SAMPLE_ESSAY_ANSWER, opts),
  ]);
  const again = await gradeAndSave(user, question, SAMPLE_ESSAY_ANSWER, opts);
  expect(chat).toHaveBeenCalledTimes(1);
  expect(b.row.id).toBe(a.row.id);
  expect(again.row.id).toBe(a.row.id);
  expect(await listAttemptsForQuestion(user, question.id)).toHaveLength(1);
  expect((await listOpenMistakes(user, 'cet6'))[0]).toMatchObject({
    wrong_count: 0,
    needs_redo: 1,
    miss_times: 1,
  });
});

it('清草稿失败则作答一并回滚，草稿还在，不会留下半条记录', async () => {
  const { question } = await prepareSubjective(user, 'essay', {
    deps: { cfg: CFG, chat: fakeChat(DEMO_ESSAY) },
  });
  const draft = { questionId: question.id, text: SAMPLE_ESSAY_ANSWER, startedAt: T0, savedAt: T0 };
  await writeDraft(user, 'essay', draft);
  const flaky: SqlDb = {
    execAsync: (sql) => user.execAsync(sql),
    getAllAsync: (sql, params) => user.getAllAsync(sql, params),
    getFirstAsync: (sql, params) => user.getFirstAsync(sql, params),
    withTransactionAsync: (task) => user.withTransactionAsync(task),
    async runAsync(sql, params) {
      if (sql.includes('INTO kv') && params[1] === '') throw new Error('草稿清不掉');
      return user.runAsync(sql, params);
    },
  };
  await expect(
    gradeAndSave(flaky, question, SAMPLE_ESSAY_ANSWER, {
      deps: { cfg: CFG, chat: fakeChat(asModelOutput(DEMO_ESSAY_FEEDBACK)) },
      startedAt: T0,
    }),
  ).rejects.toThrow(/草稿清不掉/);
  expect(await listAttemptsForQuestion(user, question.id)).toHaveLength(0);
  expect(await listOpenMistakes(user, 'cet6')).toEqual([]);
  expect(await readDraft(user, 'essay')).toEqual(draft);
});

it('评分请求已取消：不调用模型或不落库，草稿保留', async () => {
  const { question } = await prepareSubjective(user, 'essay', {
    deps: { cfg: CFG, chat: fakeChat(DEMO_ESSAY) },
  });
  const draft = { questionId: question.id, text: SAMPLE_ESSAY_ANSWER, startedAt: T0, savedAt: T0 };
  await writeDraft(user, 'essay', draft);
  const aborted = new AbortController();
  aborted.abort();
  const idle = jest.fn();
  await expect(
    gradeAndSave(user, question, SAMPLE_ESSAY_ANSWER, {
      deps: { cfg: CFG, chat: idle as unknown as ChatFn, signal: aborted.signal },
      startedAt: T0,
    }),
  ).rejects.toBeInstanceOf(LlmError);
  expect(idle).not.toHaveBeenCalled();

  const late = new AbortController();
  const chat = jest.fn(async () => {
    late.abort();
    return JSON.stringify(asModelOutput(DEMO_ESSAY_FEEDBACK));
  });
  await expect(
    gradeAndSave(user, question, SAMPLE_ESSAY_ANSWER, {
      deps: { cfg: CFG, chat: chat as unknown as ChatFn, signal: late.signal },
      startedAt: T0,
    }),
  ).rejects.toMatchObject({ kind: 'aborted' });
  expect(chat).toHaveBeenCalledTimes(1);
  expect(await listAttemptsForQuestion(user, question.id)).toHaveLength(0);
  expect(await readDraft(user, 'essay')).toEqual(draft);
});

it('旧请求未结束时取消并立刻用新信号重交：第二次会打分，不会跟着旧请求一起取消', async () => {
  const { question } = await prepareSubjective(user, 'essay', {
    deps: { cfg: CFG, chat: fakeChat(DEMO_ESSAY) },
  });
  const draft = { questionId: question.id, text: SAMPLE_ESSAY_ANSWER, startedAt: T0, savedAt: T0 };
  await writeDraft(user, 'essay', draft);
  let releaseHung!: (value: string) => void;
  const hung = new Promise<string>((resolve) => {
    releaseHung = resolve;
  });
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const firstCtrl = new AbortController();
  const chat1 = jest.fn(() => {
    markStarted();
    return hung;
  });
  const first = gradeAndSave(user, question, SAMPLE_ESSAY_ANSWER, {
    deps: { cfg: CFG, chat: chat1 as unknown as ChatFn, signal: firstCtrl.signal },
    startedAt: T0,
    now: () => T0 + 1000,
  });
  await started;
  firstCtrl.abort();
  const secondCtrl = new AbortController();
  const chat2 = jest.fn(async () => JSON.stringify(asModelOutput(DEMO_ESSAY_FEEDBACK)));
  const second = gradeAndSave(user, question, SAMPLE_ESSAY_ANSWER, {
    deps: { cfg: CFG, chat: chat2 as unknown as ChatFn, signal: secondCtrl.signal },
    startedAt: T0,
    now: () => T0 + 2000,
  });
  releaseHung(JSON.stringify(asModelOutput(DEMO_ESSAY_FEEDBACK)));
  await expect(first).rejects.toMatchObject({ kind: 'aborted' });
  const saved = await second;
  expect(chat2).toHaveBeenCalledTimes(1);
  expect(saved.row.answer).toBe(JSON.stringify(SAMPLE_ESSAY_ANSWER));
  expect(await listAttemptsForQuestion(user, question.id)).toHaveLength(1);
  expect(await readDraft(user, 'essay')).toBeNull();
});

it('事务刚开始或写入过程中取消：整笔回滚，草稿还在', async () => {
  const { question } = await prepareSubjective(user, 'essay', {
    deps: { cfg: CFG, chat: fakeChat(DEMO_ESSAY) },
  });
  const draft = { questionId: question.id, text: SAMPLE_ESSAY_ANSWER, startedAt: T0, savedAt: T0 };
  await writeDraft(user, 'essay', draft);
  const ctrl = new AbortController();
  const db: SqlDb = {
    execAsync: (sql) => user.execAsync(sql),
    getAllAsync: (sql, params) => user.getAllAsync(sql, params),
    getFirstAsync: (sql, params) => user.getFirstAsync(sql, params),
    async withTransactionAsync(task) {
      ctrl.abort();
      return user.withTransactionAsync(task);
    },
    runAsync: (sql, params) => user.runAsync(sql, params),
  };
  await expect(
    gradeAndSave(db, question, SAMPLE_ESSAY_ANSWER, {
      deps: {
        cfg: CFG,
        chat: fakeChat(asModelOutput(DEMO_ESSAY_FEEDBACK)) as unknown as ChatFn,
        signal: ctrl.signal,
      },
      startedAt: T0,
    }),
  ).rejects.toMatchObject({ kind: 'aborted' });
  expect(await listAttemptsForQuestion(user, question.id)).toHaveLength(0);
  expect(await readDraft(user, 'essay')).toEqual(draft);
});

it('写入过程中取消：已经插入的作答回滚，草稿保持原样', async () => {
  const { question } = await prepareSubjective(user, 'essay', {
    deps: { cfg: CFG, chat: fakeChat(DEMO_ESSAY) },
  });
  const draft = { questionId: question.id, text: SAMPLE_ESSAY_ANSWER, startedAt: T0, savedAt: T0 };
  await writeDraft(user, 'essay', draft);
  const ctrl = new AbortController();
  const db: SqlDb = {
    execAsync: (sql) => user.execAsync(sql),
    getAllAsync: (sql, params) => user.getAllAsync(sql, params),
    getFirstAsync: (sql, params) => user.getFirstAsync(sql, params),
    withTransactionAsync: (task) => user.withTransactionAsync(task),
    async runAsync(sql, params) {
      const result = await user.runAsync(sql, params);
      if (sql.startsWith('INSERT INTO attempt')) ctrl.abort();
      return result;
    },
  };
  await expect(
    gradeAndSave(db, question, SAMPLE_ESSAY_ANSWER, {
      deps: {
        cfg: CFG,
        chat: fakeChat(asModelOutput(DEMO_ESSAY_FEEDBACK)) as unknown as ChatFn,
        signal: ctrl.signal,
      },
      startedAt: T0,
    }),
  ).rejects.toMatchObject({ kind: 'aborted' });
  expect(await listAttemptsForQuestion(user, question.id)).toHaveLength(0);
  expect(await readDraft(user, 'essay')).toEqual(draft);
});

it('事务提交成功之后才取消：当作已保存，同一份答案再交不插第二行', async () => {
  const { question } = await prepareSubjective(user, 'essay', {
    deps: { cfg: CFG, chat: fakeChat(DEMO_ESSAY) },
  });
  await writeDraft(user, 'essay', {
    questionId: question.id,
    text: SAMPLE_ESSAY_ANSWER,
    startedAt: T0,
    savedAt: T0,
  });
  const ctrl = new AbortController();
  const db: SqlDb = {
    execAsync: (sql) => user.execAsync(sql),
    getAllAsync: (sql, params) => user.getAllAsync(sql, params),
    getFirstAsync: (sql, params) => user.getFirstAsync(sql, params),
    async withTransactionAsync(task) {
      await user.withTransactionAsync(task);
      ctrl.abort();
    },
    runAsync: (sql, params) => user.runAsync(sql, params),
  };
  const saved = await gradeAndSave(db, question, SAMPLE_ESSAY_ANSWER, {
    deps: {
      cfg: CFG,
      chat: fakeChat(asModelOutput(DEMO_ESSAY_FEEDBACK)) as unknown as ChatFn,
      signal: ctrl.signal,
    },
    startedAt: T0,
    now: () => T0 + 1000,
  });
  expect(saved.view.score).toBe(8);
  expect(ctrl.signal.aborted).toBe(true);
  expect(await listAttemptsForQuestion(user, question.id)).toHaveLength(1);
  expect(await readDraft(user, 'essay')).toBeNull();
  const chat = jest.fn();
  const again = await gradeAndSave(user, question, SAMPLE_ESSAY_ANSWER, {
    deps: { cfg: CFG, chat: chat as unknown as ChatFn },
    startedAt: T0,
    now: () => T0 + 2000,
  });
  expect(chat).not.toHaveBeenCalled();
  expect(again.row.id).toBe(saved.row.id);
  expect(await listAttemptsForQuestion(user, question.id)).toHaveLength(1);
});

it('已取消的旧评分晚返回时，不清掉后来的草稿，也不插入作答', async () => {
  const { question } = await prepareSubjective(user, 'essay', {
    deps: { cfg: CFG, chat: fakeChat(DEMO_ESSAY) },
  });
  const draft = { questionId: question.id, text: SAMPLE_ESSAY_ANSWER, startedAt: T0, savedAt: T0 };
  await writeDraft(user, 'essay', draft);
  let releaseHung!: (value: string) => void;
  const hung = new Promise<string>((resolve) => {
    releaseHung = resolve;
  });
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const firstCtrl = new AbortController();
  const chat1 = jest.fn(() => {
    markStarted();
    return hung;
  });
  const first = gradeAndSave(user, question, SAMPLE_ESSAY_ANSWER, {
    deps: { cfg: CFG, chat: chat1 as unknown as ChatFn, signal: firstCtrl.signal },
    startedAt: T0,
  });
  await started;
  firstCtrl.abort();
  const newer = { ...draft, text: `${SAMPLE_ESSAY_ANSWER} more.`, savedAt: T0 + 5 };
  await writeDraft(user, 'essay', newer);
  releaseHung(JSON.stringify(asModelOutput(DEMO_ESSAY_FEEDBACK)));
  await expect(first).rejects.toMatchObject({ kind: 'aborted' });
  expect(await listAttemptsForQuestion(user, question.id)).toHaveLength(0);
  expect(await readDraft(user, 'essay')).toEqual(newer);
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
