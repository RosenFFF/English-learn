import {
  V1_ESSAY_FEEDBACK,
  V1_TRANSLATION_FEEDBACK,
  VALID_ESSAY_FEEDBACK,
  VALID_TRANSLATION_FEEDBACK,
} from './__testutils__/fixtures';
import {
  isCurrentFeedback,
  parseStoredFeedback,
  serializeFeedback,
  subjectiveAttemptFields,
} from './feedback';
import type { SubjectiveGrade } from './grade';
import { GRADE_PROMPT_VERSION } from './prompts';
import { FEEDBACK_VERSION, type EssayFeedback, type TranslationFeedback } from './schemas';

const tGrade = (score: number): SubjectiveGrade<TranslationFeedback> => ({
  score,
  maxScore: 15,
  wrongCount: 0,
  needsRedo: score < 9,
  feedback: { ...(VALID_TRANSLATION_FEEDBACK as TranslationFeedback), score },
  model: 'm',
  feedbackVersion: FEEDBACK_VERSION,
  promptVersion: GRADE_PROMPT_VERSION,
});

describe('serializeFeedback / subjectiveAttemptFields', () => {
  it('JSON 顶层带 version 和 promptVersion', () => {
    const text = serializeFeedback(VALID_ESSAY_FEEDBACK, 2);
    expect(JSON.parse(text)).toEqual({
      version: FEEDBACK_VERSION,
      promptVersion: 2,
      ...VALID_ESSAY_FEEDBACK,
    });
  });

  it('低于 9 分 needs_redo = 1；wrong_count 固定 0', () => {
    expect(subjectiveAttemptFields(tGrade(8.5))).toMatchObject({
      score: 8.5,
      max_score: 15,
      wrong_count: 0,
      needs_redo: 1,
    });
  });

  it('正好 9 分 needs_redo = 0', () => {
    expect(subjectiveAttemptFields(tGrade(9)).needs_redo).toBe(0);
  });

  it('存进去再读出来一致（v2）', () => {
    const fields = subjectiveAttemptFields(tGrade(10));
    const r = parseStoredFeedback('translation', fields.feedback);
    expect(r).toEqual({ ok: true, version: 2, feedback: VALID_TRANSLATION_FEEDBACK });
    expect(isCurrentFeedback(r)).toBe(true);
  });
});

describe('parseStoredFeedback', () => {
  it('v1 翻译老记录（没有 version、criteria、rewrite）能读，按 v1 处理', () => {
    const r = parseStoredFeedback('translation', JSON.stringify(V1_TRANSLATION_FEEDBACK));
    expect(r).toEqual({ ok: true, version: 1, feedback: V1_TRANSLATION_FEEDBACK });
    expect(isCurrentFeedback(r)).toBe(false);
    if (r.ok) {
      expect(r.feedback.criteria).toBeUndefined();
      expect(r.feedback.rewrite).toBeUndefined();
    }
  });

  it('v1 写作老记录（没有 band、criteria）能读，band 按分数补上', () => {
    const r = parseStoredFeedback('essay', JSON.stringify(V1_ESSAY_FEEDBACK));
    expect(r).toEqual({ ok: true, version: 1, feedback: { ...V1_ESSAY_FEEDBACK, band: 8 } });
    if (r.ok) expect(r.feedback.criteria).toBeUndefined();
  });

  it('v1 记录里的文字同样被清洗', () => {
    const r = parseStoredFeedback(
      'essay',
      JSON.stringify({ ...V1_ESSAY_FEEDBACK, summary: ' 总评\u0000 ' }),
    );
    expect(r.ok && r.feedback.summary).toBe('总评');
  });

  it('v1 记录里存的 band 与分数不符时按分数重新算，不拒绝', () => {
    const r = parseStoredFeedback(
      'translation',
      JSON.stringify({ ...V1_TRANSLATION_FEEDBACK, score: 14 }),
    );
    expect(r.ok && r.feedback.band).toBe(14);
  });

  it('v2 记录里的 band 同样按分数重新算', () => {
    const r = parseStoredFeedback(
      'essay',
      JSON.stringify({ version: 2, ...VALID_ESSAY_FEEDBACK, band: 0 }),
    );
    expect(r.ok && r.feedback.band).toBe(8);
  });

  it('v2 记录缺 criteria 时拒绝（v2 字段必须齐全）', () => {
    const { criteria: _omit, ...rest } = VALID_ESSAY_FEEDBACK;
    const r = parseStoredFeedback('essay', JSON.stringify({ version: 2, ...rest }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/criteria/);
  });

  it('v2 写作记录正常读出', () => {
    const r = parseStoredFeedback(
      'essay',
      serializeFeedback(VALID_ESSAY_FEEDBACK as EssayFeedback, GRADE_PROMPT_VERSION),
    );
    expect(r).toEqual({ ok: true, version: 2, feedback: VALID_ESSAY_FEEDBACK });
  });

  it('更新版本的点评提示升级', () => {
    const r = parseStoredFeedback(
      'essay',
      JSON.stringify({ ...VALID_ESSAY_FEEDBACK, version: FEEDBACK_VERSION + 1 }),
    );
    expect(r).toEqual({ ok: false, error: '这条点评来自更新版本的 App，请先升级' });
  });

  it.each([0, 1.5, '2', null])('version %p 不合法', (version) => {
    const r = parseStoredFeedback('essay', JSON.stringify({ ...VALID_ESSAY_FEEDBACK, version }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/点评版本不合法/);
  });

  it.each([
    [null, '没有点评'],
    ['', '没有点评'],
    ['{', '点评内容不是有效的 JSON'],
    ['[1]', '点评内容不是 JSON 对象'],
    ['"x"', '点评内容不是 JSON 对象'],
  ])('%p → %s', (text, error) => {
    expect(parseStoredFeedback('translation', text)).toEqual({ ok: false, error });
  });
});
