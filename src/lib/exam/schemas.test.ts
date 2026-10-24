import {
  VALID_ESSAY_FEEDBACK,
  VALID_PAYLOADS,
  VALID_TRANSLATION_FEEDBACK,
} from './__testutils__/fixtures';
import {
  essayFeedbackSchema,
  PAYLOAD_SCHEMAS,
  parsePayload,
  summarizeIssues,
  type PayloadOf,
  translationFeedbackSchema,
} from './schemas';
import { QUESTION_TYPES, type QuestionType } from './types';

/** 故意写坏、类型上不允许的字段：绕过类型检查 */
const loose = (o: object): Record<string, unknown> => o as Record<string, unknown>;

/** 深拷贝一份合格 payload 再改坏 */
function mutate<T extends QuestionType>(type: T, fn: (p: PayloadOf<T>) => void): unknown {
  const p = structuredClone(VALID_PAYLOADS[type]) as PayloadOf<T>;
  fn(p);
  return p;
}

function messages(type: QuestionType, data: unknown): string {
  const r = parsePayload(type, data);
  if (r.success) throw new Error('应该校验失败');
  return summarizeIssues(r.error);
}

describe('题目 schema：合格样例都能通过', () => {
  it.each(QUESTION_TYPES)('%s', (type) => {
    expect(PAYLOAD_SCHEMAS[type].safeParse(VALID_PAYLOADS[type]).success).toBe(true);
  });

  it('每种题型都有 schema', () => {
    expect(Object.keys(PAYLOAD_SCHEMAS).sort()).toEqual([...QUESTION_TYPES].sort());
  });
});

describe('选词填空的业务规则', () => {
  it('候选词不是 15 个', () => {
    expect(
      messages(
        'banked_cloze',
        mutate('banked_cloze', (p) => p.options.pop()),
      ),
    ).toMatch(/15 个候选词/);
  });
  it('候选词重复（忽略大小写）', () => {
    expect(
      messages(
        'banked_cloze',
        mutate('banked_cloze', (p) => (p.options[1] = 'ABUNDANT')),
      ),
    ).toMatch(/候选词有重复/);
  });
  it('空不是 10 个', () => {
    expect(
      messages(
        'banked_cloze',
        mutate('banked_cloze', (p) => p.blanks.pop()),
      ),
    ).toMatch(/10 个空/);
  });
  it('答案下标重复', () => {
    expect(
      messages(
        'banked_cloze',
        mutate('banked_cloze', (p) => (p.blanks[1].answer = 2)),
      ),
    ).toMatch(/答案下标不能重复/);
  });
  it('答案下标越界', () => {
    expect(
      parsePayload(
        'banked_cloze',
        mutate('banked_cloze', (p) => (p.blanks[0].answer = 15)),
      ).success,
    ).toBe(false);
    expect(
      parsePayload(
        'banked_cloze',
        mutate('banked_cloze', (p) => (p.blanks[0].answer = 1.5)),
      ).success,
    ).toBe(false);
  });
  it('短文里的空位标记缺失、重复或乱序', () => {
    const missing = mutate('banked_cloze', (p) => (p.passage = p.passage.replace('{{10}}', '___')));
    expect(messages('banked_cloze', missing)).toMatch(/\{\{1\}\} 到 \{\{10\}\}/);
    const dup = mutate('banked_cloze', (p) => (p.passage += ' {{3}}'));
    expect(parsePayload('banked_cloze', dup).success).toBe(false);
    const swapped = mutate('banked_cloze', (p) => {
      p.passage = p.passage
        .replace('{{1}}', '{{X}}')
        .replace('{{2}}', '{{1}}')
        .replace('{{X}}', '{{2}}');
    });
    expect(parsePayload('banked_cloze', swapped).success).toBe(false);
    const extra = mutate('banked_cloze', (p) => (p.passage += ' {{11}}'));
    expect(parsePayload('banked_cloze', extra).success).toBe(false);
  });
});

describe('段落匹配的业务规则', () => {
  it('答案不是存在的段落字母', () => {
    expect(
      messages(
        'matching',
        mutate('matching', (p) => (p.statements[0].answer = 'Z')),
      ),
    ).toMatch(/Z 不是存在的段落/);
  });
  it('段落编号不从 A 连续', () => {
    expect(
      messages(
        'matching',
        mutate('matching', (p) => (p.paragraphs[2].label = 'K')),
      ),
    ).toMatch(/从 A 开始连续/);
  });
  it('段落编号不是单个大写字母', () => {
    expect(
      parsePayload(
        'matching',
        mutate('matching', (p) => (p.paragraphs[0].label = 'a')),
      ).success,
    ).toBe(false);
  });
  it('陈述不是 10 道', () => {
    expect(
      messages(
        'matching',
        mutate('matching', (p) => p.statements.pop()),
      ),
    ).toMatch(/10 道陈述/);
  });
  it('段落太少', () => {
    expect(
      parsePayload(
        'matching',
        mutate('matching', (p) => (p.paragraphs = p.paragraphs.slice(0, 5))),
      ).success,
    ).toBe(false);
  });
});

describe('仔细阅读的业务规则', () => {
  it('不是 5 题', () => {
    expect(
      messages(
        'careful_reading',
        mutate('careful_reading', (p) => p.questions.pop()),
      ),
    ).toMatch(/5 题/);
  });
  it('选项不是 4 个', () => {
    expect(
      messages(
        'careful_reading',
        mutate('careful_reading', (p) => p.questions[0].options.pop()),
      ),
    ).toMatch(/4 个选项/);
  });
  it('答案不是 A 到 D', () => {
    expect(
      parsePayload(
        'careful_reading',
        mutate('careful_reading', (p) => (loose(p.questions[0]).answer = 'E')),
      ).success,
    ).toBe(false);
    expect(
      parsePayload(
        'careful_reading',
        mutate('careful_reading', (p) => (loose(p.questions[0]).answer = 'a')),
      ).success,
    ).toBe(false);
  });
  it('选项重复', () => {
    expect(
      messages(
        'careful_reading',
        mutate('careful_reading', (p) => (p.questions[0].options[1] = p.questions[0].options[0])),
      ),
    ).toMatch(/选项有重复/);
  });
  it('缺解析', () => {
    expect(
      parsePayload(
        'careful_reading',
        mutate('careful_reading', (p) => delete loose(p.questions[0]).explanation),
      ).success,
    ).toBe(false);
  });
});

describe('翻译、写作', () => {
  it('翻译原文必须是中文，参考译文不能含中文', () => {
    expect(
      messages(
        'translation',
        mutate('translation', (p) => (p.source = 'Tea culture.')),
      ),
    ).toMatch(/原文必须是中文/);
    expect(
      messages(
        'translation',
        mutate('translation', (p) => (p.reference += ' 茶')),
      ),
    ).toMatch(/参考译文不能含中文/);
  });
  it('翻译缺参考译文或解析', () => {
    expect(
      parsePayload(
        'translation',
        mutate('translation', (p) => delete loose(p).reference),
      ).success,
    ).toBe(false);
    expect(
      parsePayload(
        'translation',
        mutate('translation', (p) => (p.explanation = '  ')),
      ).success,
    ).toBe(false);
  });
  it('写作字数要求必须是 150 到 200', () => {
    expect(
      parsePayload(
        'essay',
        mutate('essay', (p) => (loose(p).minWords = 120)),
      ).success,
    ).toBe(false);
    expect(
      parsePayload(
        'essay',
        mutate('essay', (p) => (loose(p).maxWords = 300)),
      ).success,
    ).toBe(false);
  });
});

describe('听力', () => {
  it('长对话必须 4 题、至少两位说话人', () => {
    expect(
      parsePayload(
        'long_conversation',
        mutate('long_conversation', (p) => p.questions.pop()),
      ).success,
    ).toBe(false);
    expect(
      messages(
        'long_conversation',
        mutate('long_conversation', (p) =>
          p.transcript.forEach((l: { speaker: string }) => (l.speaker = 'W')),
        ),
      ),
    ).toMatch(/2 位说话人/);
  });
  it('短文、讲座 3 到 4 题', () => {
    expect(
      parsePayload(
        'passage',
        mutate('passage', (p) => p.questions.pop()),
      ).success,
    ).toBe(false);
    expect(
      parsePayload(
        'lecture',
        mutate('lecture', (p) => p.questions.push(p.questions[0])),
      ).success,
    ).toBe(false);
  });
  it('原文行必须有 speaker 和 text', () => {
    expect(
      parsePayload(
        'passage',
        mutate('passage', (p) => (loose(p).transcript = [{ text: 'x' }])),
      ).success,
    ).toBe(false);
    expect(
      parsePayload(
        'passage',
        mutate('passage', (p) => (p.transcript = [])),
      ).success,
    ).toBe(false);
  });
});

describe('主观题评分结果 schema', () => {
  it('合格样例通过', () => {
    expect(translationFeedbackSchema.safeParse(VALID_TRANSLATION_FEEDBACK).success).toBe(true);
    expect(essayFeedbackSchema.safeParse(VALID_ESSAY_FEEDBACK).success).toBe(true);
  });
  it.each([-1, 15.5, Number.NaN, '10'])('分数 %p 不合法', (score) => {
    expect(essayFeedbackSchema.safeParse({ ...VALID_ESSAY_FEEDBACK, score }).success).toBe(false);
  });
  it('翻译分数要和档次对得上', () => {
    const r = translationFeedbackSchema.safeParse({ ...VALID_TRANSLATION_FEEDBACK, score: 14 });
    expect(r.success).toBe(false);
    expect(summarizeIssues(r.error!)).toMatch(/与档次 11 不符/);
    expect(
      translationFeedbackSchema.safeParse({ ...VALID_TRANSLATION_FEEDBACK, band: 7 }).success,
    ).toBe(false);
  });
  it('翻译至少点评一句', () => {
    expect(
      translationFeedbackSchema.safeParse({ ...VALID_TRANSLATION_FEEDBACK, sentences: [] }).success,
    ).toBe(false);
  });
});

it('summarizeIssues 最多列 max 条，并注明剩余数量', () => {
  const r = parsePayload('careful_reading', { passage: '', questions: [] });
  expect(r.success).toBe(false);
  const s = summarizeIssues(r.error!, 1);
  expect(s.split('\n')).toHaveLength(2);
  expect(s).toMatch(/另有 \d+ 处/);
});
