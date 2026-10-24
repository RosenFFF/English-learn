import {
  asModelOutput,
  DEMO_ESSAY,
  DEMO_ESSAY_FEEDBACK,
  DEMO_TRANSLATION,
  DEMO_TRANSLATION_FEEDBACK,
  SAMPLE_ESSAY_ANSWER,
} from './__testutils__/subjective-fixtures';
import { V1_ESSAY_FEEDBACK, V1_TRANSLATION_FEEDBACK } from './__testutils__/fixtures';
import { gradeEssay, gradeTranslation } from './grade';
import type { ChatFn } from './generate';
import { GENERATION_SCHEMAS, FEEDBACK_SCHEMAS } from './schemas';
import {
  ANSWER_MAX_LENGTH,
  countHan,
  criterionLabel,
  gradeToView,
  countWords,
  draftKey,
  lengthHint,
  parseDraft,
  submitCheck,
  toGradeView,
  verdictText,
} from './subjective';

const cfg = { baseUrl: 'https://llm.example/v1', apiKey: 'k', model: 'm' };
const chatReturning = (v: unknown) => (async () => JSON.stringify(v)) as unknown as ChatFn;

describe('测试数据本身合格', () => {
  it('题目过生成 schema，评分结果过评分 schema', () => {
    expect(GENERATION_SCHEMAS.translation.safeParse(DEMO_TRANSLATION).success).toBe(true);
    expect(GENERATION_SCHEMAS.essay.safeParse(DEMO_ESSAY).success).toBe(true);
    expect(FEEDBACK_SCHEMAS.translation.safeParse(DEMO_TRANSLATION_FEEDBACK).success).toBe(true);
    expect(FEEDBACK_SCHEMAS.essay.safeParse(DEMO_ESSAY_FEEDBACK).success).toBe(true);
  });
  it('翻译原文 180 到 200 个汉字左右', () => {
    expect(countHan(DEMO_TRANSLATION.source)).toBeGreaterThanOrEqual(150);
    expect(countHan(DEMO_TRANSLATION.source)).toBeLessThanOrEqual(210);
  });
});

describe('字数', () => {
  it('英文词数：缩写、连字符词各算一个，中文和标点不算', () => {
    expect(countWords('')).toBe(0);
    expect(countWords("It's a well-known fact, isn’t it?")).toBe(6);
    expect(countWords('  multiple   spaces\nand\tlines ')).toBe(4);
    expect(countWords('中文不算 but English counts 2026')).toBe(4);
  });
  it('建议字数：写作按题目，翻译按参考译文一半作为下限', () => {
    expect(lengthHint('essay', DEMO_ESSAY)).toEqual({
      min: 150,
      max: 200,
      text: '建议 150–200 词',
    });
    const t = lengthHint('translation', DEMO_TRANSLATION);
    expect(t.max).toBeNull();
    expect(t.min).toBe(Math.round(countWords(DEMO_TRANSLATION.reference) / 2));
  });
});

describe('交卷前检查', () => {
  const hint = lengthHint('essay', DEMO_ESSAY);
  it('空白：提示记 0 分', () => {
    expect(submitCheck('   \n ', hint)).toMatchObject({ kind: 'blank', title: '还没有写内容' });
    expect(submitCheck('……！', hint).kind).toBe('blank');
  });
  it('太短：说出词数和建议字数', () => {
    const c = submitCheck(SAMPLE_ESSAY_ANSWER, hint);
    expect(c.kind).toBe('short');
    expect(c.title).toBe(`只写了 ${countWords(SAMPLE_ESSAY_ANSWER)} 词`);
    expect(c.message).toContain('建议 150–200 词');
  });
  it('够长：普通确认', () => {
    expect(submitCheck('word '.repeat(160), hint)).toMatchObject({
      kind: 'ok',
      title: '交卷评分？',
    });
  });
});

describe('草稿', () => {
  it('能读回合法草稿，坏数据当没有', () => {
    const d = { questionId: 'q1', text: 'hi', startedAt: 1, savedAt: 2 };
    expect(parseDraft(JSON.stringify(d))).toEqual(d);
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft('')).toBeNull();
    expect(parseDraft('{oops')).toBeNull();
    expect(parseDraft(JSON.stringify({ ...d, questionId: '' }))).toBeNull();
    expect(parseDraft(JSON.stringify({ ...d, text: 3 }))).toBeNull();
    expect(draftKey('essay')).toBe('draft_essay');
    expect(draftKey('essay', 'practice')).toBe('draft_essay');
    expect(draftKey('translation', 'redo')).toBe('draft_redo_translation');
  });
});

describe('结果页对接（toGradeView）', () => {
  it('翻译新版点评：档次、四个分项（中文名、等级）、逐句点评、改写示例都有', async () => {
    const g = await gradeTranslation(DEMO_TRANSLATION, 'x', {
      cfg,
      chat: chatReturning(asModelOutput(DEMO_TRANSLATION_FEEDBACK)),
    });
    const { fields, view: v } = gradeToView('translation', g);
    expect(fields).toMatchObject({ score: 10, max_score: 15, wrong_count: 0, needs_redo: 0 });
    expect(v).toMatchObject({
      score: 10,
      maxScore: 15,
      band: 11,
      needsRedo: false,
      commentsTitle: '逐句点评',
      rewrite: DEMO_TRANSLATION_FEEDBACK.rewrite,
      note: null,
    });
    expect(v.dimensions!.map((d) => [d.key, d.label, d.levelLabel])).toEqual([
      ['accuracy', '忠实原文', '好'],
      ['vocabulary', '词汇', '一般'],
      ['grammar', '语法', '薄弱'],
      ['fluency', '通顺连贯', '一般'],
    ]);
    expect(v.comments[0]).toEqual({
      quote: DEMO_TRANSLATION_FEEDBACK.sentences[0]!.original,
      problem: DEMO_TRANSLATION_FEEDBACK.sentences[0]!.problem,
      suggestion: DEMO_TRANSLATION_FEEDBACK.sentences[0]!.improvement,
    });
    expect(verdictText(v)).toBe('达到 9 分及以上');
  });

  it('写作新版点评：8 分待重练、8 分档，分项和改写示例都有', async () => {
    const g = await gradeEssay(DEMO_ESSAY, 'x', {
      cfg,
      chat: chatReturning(asModelOutput(DEMO_ESSAY_FEEDBACK)),
    });
    const { fields, view: v } = gradeToView('essay', g);
    expect(fields.needs_redo).toBe(1);
    expect(v).toMatchObject({ score: 8, band: 8, needsRedo: true, commentsTitle: '问题清单' });
    expect(v.dimensions!.map((d) => d.label)).toEqual(['切题与内容', '结构与衔接', '词汇', '语法']);
    expect(v.rewrite).toBe(DEMO_ESSAY_FEEDBACK.rewrite);
    expect(v.comments).toHaveLength(2);
    expect(verdictText(v)).toContain('待重练');
  });

  it('旧版（v1）点评：只显示总分（和总评），不显示分项、逐句点评和改写', () => {
    for (const [type, fb] of [
      ['translation', V1_TRANSLATION_FEEDBACK],
      ['essay', V1_ESSAY_FEEDBACK],
    ] as const) {
      const v = toGradeView(type, {
        score: 8,
        max_score: 15,
        needs_redo: 1,
        wrong_count: 0,
        feedback: JSON.stringify(fb),
      });
      expect(v).toMatchObject({ score: 8, needsRedo: true, dimensions: null, rewrite: null });
      expect(v.comments).toEqual([]);
      expect(v.note).toMatch(/旧版本/);
    }
  });

  it('点评读不出来（未来版本 / 坏 JSON）：只显示总分，附中文原因', () => {
    const base = { score: 12, max_score: 15, needs_redo: 0, wrong_count: 0 };
    const future = toGradeView('essay', { ...base, feedback: JSON.stringify({ version: 99 }) });
    expect(future).toMatchObject({ score: 12, dimensions: null, rewrite: null });
    expect(future.note).toMatch(/升级/);
    expect(toGradeView('essay', { ...base, feedback: '{oops' }).note).toMatch(/[\u4e00-\u9fff]/);
  });

  it('模型返回超长文字：被截断成 …，结果页照常显示', async () => {
    const long = 'a'.repeat(5000);
    const g = await gradeEssay(DEMO_ESSAY, 'x', {
      cfg,
      chat: chatReturning({
        ...asModelOutput(DEMO_ESSAY_FEEDBACK),
        summary: '很长'.repeat(400),
        rewrite: long,
      }),
    });
    const { view } = gradeToView('essay', g);
    expect(view.rewrite!.endsWith('…')).toBe(true);
    expect(view.rewrite!.length).toBeLessThanOrEqual(3000);
    expect(view.summary.endsWith('…')).toBe(true);
  });

  it('维度中文名只在 criterionLabel 映射，未知 key 原样显示', () => {
    expect(criterionLabel('accuracy')).toBe('忠实原文');
    expect(criterionLabel('style')).toBe('style');
  });

  it('输入框上限和评分截断一致', () => {
    expect(ANSWER_MAX_LENGTH).toEqual({ translation: 2000, essay: 4000 });
  });

  it('空白作答：grade 直接 0 分、待重练，不调用大模型', async () => {
    const chat = jest.fn() as unknown as ChatFn;
    const { view } = gradeToView('essay', await gradeEssay(DEMO_ESSAY, '  ', { cfg, chat }));
    expect(chat).not.toHaveBeenCalled();
    expect(view).toMatchObject({ score: 0, needsRedo: true });
  });
});
