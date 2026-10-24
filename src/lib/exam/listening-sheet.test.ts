import { cet6PaperScore, CET6_LISTENING_WEIGHTS } from './cet6-score';
import { gradeObjective } from './grade';
import {
  isListeningQuestionType,
  LISTENING_QUESTION_TYPES,
  LISTENING_SPEC,
  scriptWordCount,
} from './listening';
import {
  createListeningSheet,
  gradeListening,
  listeningAnswers,
  stemVisible,
  type ListeningSet,
} from './listening-sheet';
import { sheetReducer } from './reading';
import { GENERATION_SCHEMAS, parseStoredPayload } from './schemas';
import { DEMO_LISTENING, STRESS_LECTURE } from './__testutils__/listening-fixtures';

const set = (type: 'long_conversation' | 'passage' | 'lecture'): ListeningSet => ({
  id: 's',
  type,
  questionId: 'q',
  payload: DEMO_LISTENING[type],
});

describe('听力测试题', () => {
  it.each(LISTENING_QUESTION_TYPES)('%s 的示例题和压测题都符合生成 schema', (t) => {
    const r = GENERATION_SCHEMAS[t].safeParse(DEMO_LISTENING[t]);
    expect(r.error?.issues ?? []).toEqual([]);
    const words = scriptWordCount(DEMO_LISTENING[t].script);
    expect(words).toBeGreaterThanOrEqual(LISTENING_SPEC[t].words[0]);
    expect(words).toBeLessThanOrEqual(LISTENING_SPEC[t].words[1]);
    // 存库再读（v3）
    const stored = parseStoredPayload(t, 3, JSON.stringify(DEMO_LISTENING[t]));
    expect(stored.ok).toBe(true);
  });

  it('压测题也合格', () => {
    const r = GENERATION_SCHEMAS.lecture.safeParse(STRESS_LECTURE);
    expect(r.error?.issues ?? []).toEqual([]);
  });

  it('isListeningQuestionType', () => {
    expect(isListeningQuestionType('lecture')).toBe(true);
    expect(isListeningQuestionType('careful_reading')).toBe(false);
  });
});

describe('听力答题卡与判分', () => {
  it('每题 A–D 四选一，答案之外的值忽略；交卷后锁定', () => {
    let s = createListeningSheet(DEMO_LISTENING.long_conversation);
    expect(s.answers).toEqual([null, null, null, null]);
    s = sheetReducer(s, { type: 'answer', index: 0, value: 'B' });
    s = sheetReducer(s, { type: 'answer', index: 1, value: 'E' });
    s = sheetReducer(s, { type: 'answer', index: 9, value: 'A' });
    expect(s.answers).toEqual(['B', null, null, null]);
    s = sheetReducer(s, { type: 'submit' });
    expect(sheetReducer(s, { type: 'answer', index: 1, value: 'C' })).toBe(s);
    expect(sheetReducer(s, { type: 'reset' }).answers).toEqual([null, null, null, null]);
  });

  it('判分与 gradeObjective 一致，没答算错', () => {
    const t = 'lecture' as const;
    let s = createListeningSheet(DEMO_LISTENING[t]);
    s = sheetReducer(s, { type: 'answer', index: 0, value: 'D' });
    s = sheetReducer(s, { type: 'answer', index: 1, value: 'A' });
    const g = gradeListening(set(t), s);
    expect(g).toMatchObject({ score: 1, maxScore: 4, wrongCount: 3, unanswered: 2 });
    expect(g.items[1]).toEqual({ index: 1, correct: false, expected: 'B', given: 'A' });
    const ref = gradeObjective({ type: t, payload: DEMO_LISTENING[t] }, listeningAnswers(s));
    expect(g.items).toEqual(ref.items);
  });

  it('全对', () => {
    let s = createListeningSheet(DEMO_LISTENING.passage);
    DEMO_LISTENING.passage.questions.forEach((q, index) => {
      s = sheetReducer(s, { type: 'answer', index, value: q.answer });
    });
    expect(gradeListening(set('passage'), s)).toMatchObject({ score: 3, wrongCount: 0 });
  });

  it('题干：念题打开时念到才显示；关掉念题、交卷后都显示', () => {
    const o = { readQuestions: true, submitted: false, readUpTo: 1 };
    expect(stemVisible(0, o)).toBe(true);
    expect(stemVisible(1, o)).toBe(true);
    expect(stemVisible(2, o)).toBe(false);
    expect(stemVisible(2, { ...o, readQuestions: false })).toBe(true);
    expect(stemVisible(2, { ...o, submitted: true })).toBe(true);
    expect(stemVisible(0, { ...o, readUpTo: -1 })).toBe(false);
  });
});

describe('六级听力卷面折合', () => {
  it('按大纲比例：长对话、篇章每题 1 分，讲座每题 2 分', () => {
    expect(CET6_LISTENING_WEIGHTS).toEqual({
      long_conversation: { percent: 8, items: 8 },
      passage: { percent: 7, items: 7 },
      lecture: { percent: 20, items: 10 },
    });
    expect(cet6PaperScore('long_conversation', 3, 4)).toEqual({
      points: 3,
      maxPoints: 4,
      percent: 8,
      perItem: 1,
    });
    expect(cet6PaperScore('passage', 2, 3)).toMatchObject({ points: 2, maxPoints: 3 });
    expect(cet6PaperScore('lecture', 3, 4)).toMatchObject({ points: 6, maxPoints: 8, perItem: 2 });
  });
});
