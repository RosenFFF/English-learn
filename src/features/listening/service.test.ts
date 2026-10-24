/**
 * @jest-environment node
 *
 * 听力出题与交卷：生成的题按生成版本存库、没做过的旧题优先、listRecentTopics 避让话题、
 * 交卷写 attempt（wrong_count）、错题本重做用原题；朗读走 mock 的 src/platform/speech。
 */
import { openMemoryDb } from '../../db/__testutils__/nodeDb';
import { runMigrations } from '../../db/migrate';
import { MIGRATIONS } from '../../db/migrations';
import { listAttemptsForQuestion, listOpenMistakes, listQuestions } from '../../db/questionRepo';
import type { SqlDb } from '../../db/types';
import type { ChatFn } from '../../lib/exam/generate';
import { createListeningSheet } from '../../lib/exam/listening-sheet';
import { sheetReducer } from '../../lib/exam/reading';
import { SCHEMA_VERSION } from '../../lib/exam/schemas';
import {
  DEMO_LECTURE,
  DEMO_LONG_CONVERSATION,
} from '../../lib/exam/__testutils__/listening-fixtures';
import type { LlmConfig } from '../../lib/llm';
import * as speech from '../../platform/speech';
import { StoredQuestionError } from '../generation/llm';
import {
  loadVoicePlan,
  narratedQuestion,
  plainStem,
  prepareListeningRedo,
  prepareListeningSet,
  saveListeningAttempt,
  scriptLineCount,
  systemSpeechDriver,
  toSpeechQueue,
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
jest.mock('../../platform/speech', () => ({
  listVoices: jest.fn(async () => []),
  speakUtterance: jest.fn(),
  stopSpeech: jest.fn(),
  speak: jest.fn(),
}));
const sp = speech as unknown as {
  listVoices: jest.Mock;
  speakUtterance: jest.Mock;
  stopSpeech: jest.Mock;
};

const T0 = new Date(2026, 9, 23, 21).getTime();
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
    return JSON.stringify(next);
  }) as unknown as jest.Mock & ChatFn;
}

describe('听力出题', () => {
  it('生成的题存进 question 表：section listening、schema_version 用生成时的版本', async () => {
    const chat = fakeChat(DEMO_LONG_CONVERSATION);
    const { set } = await prepareListeningSet(user, 'long_conversation', {
      deps: { cfg: CFG, chat },
      now: () => T0,
    });
    expect(chat).toHaveBeenCalledTimes(1);
    expect(set.payload.roles.map((r) => r.gender)).toEqual(['female', 'male']);
    const rows = await listQuestions(user, 'cet6', 'long_conversation', 10);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: set.questionId,
      section: 'listening',
      schema_version: SCHEMA_VERSION,
      source: 'llm',
    });
  });

  it('没做过的旧题优先复用；做过之后再出新题，并把旧话题告诉模型', async () => {
    const first = await prepareListeningSet(user, 'lecture', {
      deps: { cfg: CFG, chat: fakeChat(DEMO_LECTURE) },
    });
    const chat = fakeChat({ ...DEMO_LECTURE, topic: 'how bees find food' });
    const again = await prepareListeningSet(user, 'lecture', { deps: { cfg: CFG, chat } });
    expect(chat).not.toHaveBeenCalled();
    expect(again.set.questionId).toBe(first.set.questionId);

    await saveListeningAttempt(user, first.set, createListeningSheet(first.set.payload), {
      startedAt: T0,
      submittedAt: T0 + 1000,
    });
    const fresh = await prepareListeningSet(user, 'lecture', { deps: { cfg: CFG, chat } });
    expect(chat).toHaveBeenCalledTimes(1);
    expect(fresh.set.questionId).not.toBe(first.set.questionId);
    const prompt = JSON.stringify(chat.mock.calls[0]);
    expect(prompt).toContain(DEMO_LECTURE.topic);
  });
});

describe('交卷与错题本重做', () => {
  it('写一行 attempt：score / max / wrong_count，没答算错；做错进错题本，重做全对后移出', async () => {
    const { set } = await prepareListeningSet(user, 'lecture', {
      deps: { cfg: CFG, chat: fakeChat(DEMO_LECTURE) },
    });
    let sheet = createListeningSheet(set.payload);
    sheet = sheetReducer(sheet, { type: 'answer', index: 0, value: 'D' });
    sheet = sheetReducer(sheet, { type: 'answer', index: 1, value: 'A' });
    const row = await saveListeningAttempt(user, set, sheet, {
      startedAt: T0,
      submittedAt: T0 + 90_000,
    });
    expect(row).toMatchObject({
      section: 'listening',
      type: 'lecture',
      score: 1,
      max_score: 4,
      wrong_count: 3,
      needs_redo: 0,
      feedback: null,
      duration_ms: 90_000,
    });
    expect(JSON.parse(row.answer)).toEqual(['D', 'A', null, null]);
    expect(await listAttemptsForQuestion(user, set.questionId)).toHaveLength(1);
    let open = await listOpenMistakes(user, 'cet6');
    expect(open.map((r) => [r.question_id, r.wrong_count])).toEqual([[set.questionId, 3]]);

    // 重做：取原题，不调大模型
    const redo = await prepareListeningRedo(user, 'lecture', set.questionId);
    expect(redo.set.questionId).toBe(set.questionId);
    expect(redo.set.payload.questions).toEqual(DEMO_LECTURE.questions);
    let all = createListeningSheet(redo.set.payload);
    DEMO_LECTURE.questions.forEach((q, index) => {
      all = sheetReducer(all, { type: 'answer', index, value: q.answer });
    });
    await saveListeningAttempt(user, redo.set, all, {
      startedAt: T0 + 95_000,
      submittedAt: T0 + 100_000,
    });
    open = await listOpenMistakes(user, 'cet6');
    expect(open).toEqual([]);
  });

  it('重做链接打不开：题型不对 / 找不到都给中文原因', async () => {
    const { set } = await prepareListeningSet(user, 'lecture', {
      deps: { cfg: CFG, chat: fakeChat(DEMO_LECTURE) },
    });
    await expect(prepareListeningRedo(user, 'passage', set.questionId)).rejects.toThrow(
      StoredQuestionError,
    );
    await expect(prepareListeningRedo(user, 'lecture', 'missing')).rejects.toThrow(
      '找不到这道题，可能已经被清除了',
    );
  });
});

describe('朗读驱动', () => {
  it('systemSpeechDriver 把音色、音调、语速交给平台层', () => {
    const cb = { onDone: jest.fn(), onError: jest.fn() };
    systemSpeechDriver.speak(
      'Hello.',
      { voice: 'v1', language: 'en-GB', pitch: 0.85, rate: 0.8 },
      cb,
    );
    expect(sp.speakUtterance).toHaveBeenCalledWith(
      'Hello.',
      { voice: 'v1', language: 'en-GB', pitch: 0.85, rate: 0.8 },
      cb,
    );
    systemSpeechDriver.stop();
    expect(sp.stopSpeech).toHaveBeenCalled();
  });

  it('loadVoicePlan：取不到音色时降级且不缓存，下次重新查', async () => {
    sp.listVoices.mockResolvedValueOnce([]);
    expect((await loadVoicePlan()).distinct).toBe(false);
    sp.listVoices.mockResolvedValueOnce([
      { identifier: 'f', name: 'Samantha', language: 'en-US', quality: 'Default' },
      { identifier: 'm', name: 'Daniel', language: 'en-GB', quality: 'Default' },
    ]);
    const plan = await loadVoicePlan();
    expect(plan.distinct).toBe(true);
    expect(plan.female.voice).toBe('f');
    expect(plan.male.voice).toBe('m');
    // 查到了就缓存
    await loadVoicePlan();
    expect(sp.listVoices).toHaveBeenCalledTimes(2);
  });
});

describe('旁白判断与题干显示（isNarrator / displayText）', () => {
  it('narratedQuestion：念题条返回这一条（带 questionIndex、displayText），原文条和空值返回 null', () => {
    const items = toSpeechQueue(DEMO_LONG_CONVERSATION);
    const n = DEMO_LONG_CONVERSATION.script.length;
    expect(narratedQuestion(items[0])).toBeNull();
    expect(narratedQuestion(null)).toBeNull();
    expect(narratedQuestion(undefined)).toBeNull();
    const q = narratedQuestion(items[n + 1]);
    expect(q).toMatchObject({ questionIndex: 1, role: 'narrator' });
    expect(q!.displayText).toBe(DEMO_LONG_CONVERSATION.questions[1]!.stem);
    expect(q!.displayText).not.toMatch(/^Question/);
  });

  it('稿子角色的 id 碰巧叫 "narrator" 也算原文，不当成念题', () => {
    const payload = {
      ...DEMO_LONG_CONVERSATION,
      roles: [
        { id: 'narrator', name: 'Narrator', gender: 'female' as const },
        { id: 'M', name: 'Man', gender: 'male' as const },
      ],
      script: DEMO_LONG_CONVERSATION.script.map((l) => ({
        ...l,
        speaker: l.speaker === 'W' ? 'narrator' : l.speaker,
      })),
    };
    const items = toSpeechQueue(payload);
    expect(items[0]!.speaker).toBe('narrator');
    expect(narratedQuestion(items[0])).toBeNull();
    expect(scriptLineCount(items)).toBe(DEMO_LONG_CONVERSATION.script.length);
  });

  it('scriptLineCount 不算念题条；关掉念题时等于队列长度', () => {
    const n = DEMO_LONG_CONVERSATION.script.length;
    expect(scriptLineCount(toSpeechQueue(DEMO_LONG_CONVERSATION))).toBe(n);
    const off = toSpeechQueue(DEMO_LONG_CONVERSATION, { readQuestions: false });
    expect(off).toHaveLength(n);
    expect(scriptLineCount(off)).toBe(n);
    expect(scriptLineCount([])).toBe(0);
  });

  it('displayText 去掉 Markdown，和题目卡片用的 plainStem(q.stem) 一致', () => {
    const md = '**Why** does the man look _tired_?';
    const payload = {
      ...DEMO_LONG_CONVERSATION,
      questions: DEMO_LONG_CONVERSATION.questions.map((q, i) => (i === 0 ? { ...q, stem: md } : q)),
    };
    const q = narratedQuestion(toSpeechQueue(payload)[DEMO_LONG_CONVERSATION.script.length]);
    expect(q!.displayText).toBe('Why does the man look tired?');
    expect(q!.displayText).toBe(plainStem(md));
    expect(q!.text).toBe('Question 1. Why does the man look tired?');
  });
});
