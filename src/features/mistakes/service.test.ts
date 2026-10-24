/**
 * @jest-environment node
 *
 * 错题本整条链路：做错 → 进错题本（按板块分组）→ 用原题重做（不出新题）→ 全对 / ≥ 9 分后移出；
 * 读不出来的题显示中文原因；重做翻译写作的草稿不碰正常练习的草稿。
 */
import { openMemoryDb } from '../../db/__testutils__/nodeDb';
import { runMigrations } from '../../db/migrate';
import { MIGRATIONS } from '../../db/migrations';
import { insertQuestion, listQuestions } from '../../db/questionRepo';
import type { SqlDb } from '../../db/types';
import { DEMO_CAREFUL, DEMO_MATCHING } from '../../lib/exam/__testutils__/reading-fixtures';
import {
  asModelOutput,
  DEMO_ESSAY,
  DEMO_ESSAY_FEEDBACK,
  DEMO_TRANSLATION,
} from '../../lib/exam/__testutils__/subjective-fixtures';
import type { ChatFn } from '../../lib/exam/generate';
import { createSheet, sheetReducer, type ReadingSet } from '../../lib/exam/reading';
import type { LlmConfig } from '../../lib/llm';
import { StoredQuestionError } from '../generation/llm';
import { prepareReadingRedo, prepareReadingSet, saveReadingAttempts } from '../reading/service';
import {
  gradeAndSave,
  prepareSubjective,
  prepareSubjectiveRedo,
  readDraft,
  writeDraft,
} from '../subjective/service';
import { loadMistakeBook, redoHref } from './service';

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

const answerAll = (set: ReadingSet, values: (number | string)[]) =>
  values.reduce(
    (s, value, index) => sheetReducer(s, { type: 'answer', index, value }),
    createSheet(set),
  );

const lowEssay = { ...DEMO_ESSAY_FEEDBACK, score: 6 };
const goodEssay = { ...DEMO_ESSAY_FEEDBACK, score: 11 };

it('空的错题本', async () => {
  expect(await loadMistakeBook(user, 'cet6')).toEqual({ exam: 'cet6', groups: [], total: 0 });
});

it('仔细阅读做错一篇 → 进错题本 → 用原题重做（只这一篇，不出新题）→ 全对后移出', async () => {
  const { set } = await prepareReadingSet(user, 'careful_reading', {
    deps: { cfg: CFG, chat: fakeChat(DEMO_CAREFUL[0], DEMO_CAREFUL[1]) },
    now: () => T0,
  });
  // 第一篇全对，第二篇最后一题错
  const keys = set.parts.map((p) =>
    (p.payload as (typeof DEMO_CAREFUL)[number]).questions.map((q) => q.answer as string),
  );
  const second = [...keys[1]!];
  second[4] = second[4] === 'A' ? 'B' : 'A';
  await saveReadingAttempts(user, set, answerAll(set, [...keys[0]!, ...second]), {
    startedAt: T0,
    submittedAt: T0 + 1000,
  });

  let book = await loadMistakeBook(user, 'cet6');
  expect(book.total).toBe(1);
  const item = book.groups[0]!.items[0]!;
  expect(book.groups[0]!.section).toBe('reading');
  expect(item).toMatchObject({
    questionId: set.parts[1]!.id,
    badge: '错 1 题',
    detail: '上次错 1 题 · 共 5 题',
    redo: { screen: 'reading', type: 'careful_reading' },
  });
  expect(redoHref(item)).toEqual({
    pathname: '/reading/[type]',
    params: { type: 'careful_reading', redo: set.parts[1]!.id },
  });

  // 重做：只取这一道原题
  const { set: redo } = await prepareReadingRedo(user, 'careful_reading', item.questionId);
  expect(redo.parts.map((p) => p.id)).toEqual([item.questionId]);
  expect(await listQuestions(user, 'cet6', 'careful_reading')).toHaveLength(2);

  // 重做还错 2 题：留着，次数累加
  const wrong2 = [...keys[1]!];
  wrong2[0] = wrong2[0] === 'A' ? 'B' : 'A';
  wrong2[1] = wrong2[1] === 'A' ? 'B' : 'A';
  await saveReadingAttempts(user, redo, answerAll(redo, wrong2), {
    startedAt: T0 + 2000,
    submittedAt: T0 + 3000,
  });
  book = await loadMistakeBook(user, 'cet6');
  expect(book.groups[0]!.items[0]).toMatchObject({ badge: '错 2 题', missTimes: 2 });

  // 全对：移出
  await saveReadingAttempts(user, redo, answerAll(redo, keys[1]!), {
    startedAt: T0 + 4000,
    submittedAt: T0 + 5000,
  });
  expect((await loadMistakeBook(user, 'cet6')).total).toBe(0);
});

it('写作 6 分 → 待重练 → 重做 11 分后移出；重做的草稿单独存，不动正常练习的草稿', async () => {
  const { question } = await prepareSubjective(user, 'essay', {
    deps: { cfg: CFG, chat: fakeChat(DEMO_ESSAY) },
  });
  await gradeAndSave(user, question, 'Short essay.', {
    deps: { cfg: CFG, chat: fakeChat(asModelOutput(lowEssay)) },
    startedAt: T0,
    now: () => T0 + 1000,
  });
  let book = await loadMistakeBook(user, 'cet6');
  expect(book.groups.map((g) => g.section)).toEqual(['writing']);
  const item = book.groups[0]!.items[0]!;
  expect(item).toMatchObject({ badge: '待重练', detail: '上次 6 / 15 分', kind: 'subjective' });
  expect(redoHref(item)).toEqual({ pathname: '/writing', params: { redo: question.id } });

  // 正常练习里另有一篇写了一半的草稿
  const practiceDraft = { questionId: 'other', text: 'half', startedAt: T0, savedAt: T0 };
  await writeDraft(user, 'essay', practiceDraft);

  // 重做：原题、没有草稿；写了一半退出再进来，恢复重做草稿
  let redo = await prepareSubjectiveRedo(user, 'essay', question.id);
  expect(redo.question.id).toBe(question.id);
  expect(redo.draft).toBeNull();
  const redoDraft = { questionId: question.id, text: 'Better', startedAt: T0, savedAt: T0 + 1 };
  await writeDraft(user, 'essay', redoDraft, 'redo');
  redo = await prepareSubjectiveRedo(user, 'essay', question.id);
  expect(redo.draft).toEqual(redoDraft);

  await gradeAndSave(user, redo.question, 'A much better essay.', {
    deps: { cfg: CFG, chat: fakeChat(asModelOutput(goodEssay)) },
    startedAt: T0,
    now: () => T0 + 2000,
    slot: 'redo',
  });
  expect((await loadMistakeBook(user, 'cet6')).total).toBe(0);
  expect(await readDraft(user, 'essay', 'redo')).toBeNull();
  expect(await readDraft(user, 'essay')).toEqual(practiceDraft);
});

it('翻译的重做草稿只恢复同一道题', async () => {
  const { question } = await prepareSubjective(user, 'translation', {
    deps: { cfg: CFG, chat: fakeChat(DEMO_TRANSLATION) },
  });
  await writeDraft(
    user,
    'translation',
    { questionId: 'someone-else', text: 'x', startedAt: T0, savedAt: T0 },
    'redo',
  );
  expect((await prepareSubjectiveRedo(user, 'translation', question.id)).draft).toBeNull();
});

it('题目读不出来：错题本照样列出并给中文原因；硬点进去重做也是中文报错', async () => {
  await insertQuestion(user, {
    id: 'future',
    exam: 'cet6',
    section: 'reading',
    type: 'matching',
    schema_version: 99,
    payload: JSON.stringify(DEMO_MATCHING),
    source: 'llm',
    model: null,
    prompt_version: 9,
    created_at: T0,
    deleted: 0,
  });
  await user.runAsync(
    `INSERT INTO attempt(id, question_id, exam, section, type, answer, score, max_score, wrong_count, started_at, submitted_at)
     VALUES ('a', 'future', 'cet6', 'reading', 'matching', '[]', 0, 10, 10, ?, ?)`,
    [T0, T0],
  );
  const book = await loadMistakeBook(user, 'cet6');
  const item = book.groups[0]!.items[0]!;
  expect(item.blocked).toBe('这道题读不出来，没法重做：这道题来自更新版本的 App，请先升级');
  expect(redoHref(item)).toBeNull();

  await expect(prepareReadingRedo(user, 'matching', 'future')).rejects.toThrow(StoredQuestionError);
  await expect(prepareReadingRedo(user, 'matching', 'future')).rejects.toThrow(
    '这道题读不出来，没法重做：这道题来自更新版本的 App，请先升级',
  );
  await expect(prepareReadingRedo(user, 'matching', 'nope')).rejects.toThrow(
    '找不到这道题，可能已经被清除了',
  );
  // 题型对不上（改过的链接）也当作找不到
  await expect(prepareReadingRedo(user, 'banked_cloze', 'future')).rejects.toThrow('找不到这道题');
  await expect(prepareSubjectiveRedo(user, 'essay', 'nope')).rejects.toThrow(StoredQuestionError);
});
