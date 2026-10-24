/**
 * 每种题型的 payload schema（zod v4），以及主观题评分结果的 schema。
 * 除了结构，也在 superRefine 里检查业务规则（空位数量、答案范围、不重复等）。
 * zod 只在 src/lib/exam 里使用；其它目录拿到的都是这里推导出的普通 TS 类型。
 */
import { z } from 'zod';

import {
  CHOICE_LETTERS,
  SUBJECTIVE_MAX_SCORE,
  type QuestionType,
  type SubjectiveType,
} from './types';

/** 题目 JSON 的结构版本，存进 question.schema_version；以后改结构时靠它兼容旧题 */
export const SCHEMA_VERSION = 1;

/** 选词填空：候选词个数和空位个数 */
export const BANKED_CLOZE_OPTIONS = 15;
export const BANKED_CLOZE_BLANKS = 10;
/** 段落匹配：陈述个数 */
export const MATCHING_STATEMENTS = 10;
/** 仔细阅读：每篇题数 */
export const CAREFUL_READING_QUESTIONS = 5;
/** 写作字数要求 */
export const ESSAY_MIN_WORDS = 150;
export const ESSAY_MAX_WORDS = 200;

/** 选词填空短文里的空位标记，如 {{1}} … {{10}} */
export const BLANK_MARKER = /\{\{(\d+)\}\}/g;
export const blankMarker = (n: number): string => `{{${n}}}`;

const text = z.string().trim().min(1, '不能为空');
const explanation = text.describe('解析');
const letter = z.enum(CHOICE_LETTERS);

/** 四选一的单题（仔细阅读、听力共用） */
const choiceQuestion = z.object({
  stem: text,
  options: z.array(text).length(4, '每题必须 4 个选项'),
  answer: letter,
  explanation,
});

/** 四个选项不能重复 */
function checkDistinctOptions(
  questions: readonly { options: readonly string[] }[],
  ctx: z.RefinementCtx,
): void {
  questions.forEach((q, i) => {
    const seen = new Set(q.options.map((o) => o.trim().toLowerCase()));
    if (seen.size !== q.options.length)
      ctx.addIssue({ code: 'custom', message: '选项有重复', path: ['questions', i, 'options'] });
  });
}

// ---------- 阅读 ----------
export const bankedClozeSchema = z
  .object({
    passage: text,
    options: z.array(text).length(BANKED_CLOZE_OPTIONS, `必须 ${BANKED_CLOZE_OPTIONS} 个候选词`),
    /** 第 i 项对应短文里的 {{i+1}} */
    blanks: z
      .array(
        z.object({
          /** 候选词下标（0 起） */
          answer: z
            .number()
            .int()
            .min(0)
            .max(BANKED_CLOZE_OPTIONS - 1),
          explanation,
        }),
      )
      .length(BANKED_CLOZE_BLANKS, `必须 ${BANKED_CLOZE_BLANKS} 个空`),
  })
  .superRefine((v, ctx) => {
    const words = new Set(v.options.map((o) => o.toLowerCase()));
    if (words.size !== v.options.length)
      ctx.addIssue({ code: 'custom', message: '候选词有重复', path: ['options'] });
    const answers = v.blanks.map((b) => b.answer);
    if (new Set(answers).size !== answers.length)
      ctx.addIssue({ code: 'custom', message: '答案下标不能重复', path: ['blanks'] });
    const markers = [...v.passage.matchAll(BLANK_MARKER)].map((m) => Number(m[1]));
    const expected = Array.from({ length: BANKED_CLOZE_BLANKS }, (_, i) => i + 1);
    if (markers.length !== expected.length || markers.some((n, i) => n !== expected[i]))
      ctx.addIssue({
        code: 'custom',
        message: `短文里必须按顺序各出现一次 {{1}} 到 {{${BANKED_CLOZE_BLANKS}}}，实际为 [${markers.join(',')}]`,
        path: ['passage'],
      });
  });

export const matchingSchema = z
  .object({
    title: text,
    paragraphs: z
      .array(z.object({ label: z.string().regex(/^[A-Z]$/, '段落编号必须是单个大写字母'), text }))
      .min(8, '至少 8 段')
      .max(16, '最多 16 段'),
    statements: z
      .array(z.object({ text, answer: z.string().regex(/^[A-Z]$/), explanation }))
      .length(MATCHING_STATEMENTS, `必须 ${MATCHING_STATEMENTS} 道陈述`),
  })
  .superRefine((v, ctx) => {
    const labels = v.paragraphs.map((p) => p.label);
    const expected = labels.map((_, i) => String.fromCharCode(65 + i));
    if (labels.some((l, i) => l !== expected[i]))
      ctx.addIssue({
        code: 'custom',
        message: `段落编号必须从 A 开始连续：${labels.join('')}`,
        path: ['paragraphs'],
      });
    const set = new Set(labels);
    v.statements.forEach((s, i) => {
      if (!set.has(s.answer))
        ctx.addIssue({
          code: 'custom',
          message: `答案 ${s.answer} 不是存在的段落`,
          path: ['statements', i, 'answer'],
        });
    });
  });

export const carefulReadingSchema = z
  .object({
    passage: text,
    questions: z
      .array(choiceQuestion)
      .length(CAREFUL_READING_QUESTIONS, `必须 ${CAREFUL_READING_QUESTIONS} 题`),
  })
  .superRefine((v, ctx) => checkDistinctOptions(v.questions, ctx));

// ---------- 翻译、写作 ----------
const HAN = /\p{Script=Han}/u;

export const translationSchema = z
  .object({
    /** 中文原文一段 */
    source: text,
    /** 参考译文 */
    reference: text,
    explanation,
  })
  .superRefine((v, ctx) => {
    if (!HAN.test(v.source))
      ctx.addIssue({ code: 'custom', message: '原文必须是中文', path: ['source'] });
    if (HAN.test(v.reference))
      ctx.addIssue({ code: 'custom', message: '参考译文不能含中文', path: ['reference'] });
  });

export const essaySchema = z.object({
  title: text,
  /** 写作指令（英文，仿六级 Directions） */
  directions: text,
  minWords: z.literal(ESSAY_MIN_WORDS),
  maxWords: z.literal(ESSAY_MAX_WORDS),
  /** 审题和写作思路 */
  explanation,
});

// ---------- 听力 ----------
const transcriptLine = z.object({ speaker: text, text });

function listeningSchema(opts: { questions: [number, number]; minSpeakers: number }) {
  const [min, max] = opts.questions;
  return z
    .object({
      transcript: z.array(transcriptLine).min(1),
      questions: z.array(choiceQuestion).min(min, `至少 ${min} 题`).max(max, `最多 ${max} 题`),
    })
    .superRefine((v, ctx) => {
      checkDistinctOptions(v.questions, ctx);
      const speakers = new Set(v.transcript.map((l) => l.speaker));
      if (speakers.size < opts.minSpeakers)
        ctx.addIssue({
          code: 'custom',
          message: `原文至少要有 ${opts.minSpeakers} 位说话人`,
          path: ['transcript'],
        });
    });
}

export const longConversationSchema = listeningSchema({ questions: [4, 4], minSpeakers: 2 });
export const passageSchema = listeningSchema({ questions: [3, 4], minSpeakers: 1 });
export const lectureSchema = listeningSchema({ questions: [3, 4], minSpeakers: 1 });

export const PAYLOAD_SCHEMAS = {
  banked_cloze: bankedClozeSchema,
  matching: matchingSchema,
  careful_reading: carefulReadingSchema,
  translation: translationSchema,
  essay: essaySchema,
  long_conversation: longConversationSchema,
  passage: passageSchema,
  lecture: lectureSchema,
} as const satisfies Record<QuestionType, z.ZodType>;

export type BankedClozePayload = z.infer<typeof bankedClozeSchema>;
export type MatchingPayload = z.infer<typeof matchingSchema>;
export type CarefulReadingPayload = z.infer<typeof carefulReadingSchema>;
export type TranslationPayload = z.infer<typeof translationSchema>;
export type EssayPayload = z.infer<typeof essaySchema>;
export type ListeningPayload = z.infer<typeof longConversationSchema>;
export type ChoiceQuestion = z.infer<typeof choiceQuestion>;

export type PayloadOf<T extends QuestionType> = z.infer<(typeof PAYLOAD_SCHEMAS)[T]>;

/** 带题型标签的题目，便于按 type 收窄 payload */
export type Question = { [T in QuestionType]: { type: T; payload: PayloadOf<T> } }[QuestionType];

// ---------- 主观题评分结果 ----------
/** 六级翻译 / 写作的五个档次（14、11、8、5、2 分档）以及 0 分 */
export const BANDS = [14, 11, 8, 5, 2, 0] as const;
export type Band = (typeof BANDS)[number];
/** 每个档次允许的分数范围（含端点） */
export const BAND_RANGE: Readonly<Record<Band, readonly [number, number]>> = {
  14: [12.5, 15],
  11: [9.5, 12.5],
  8: [6.5, 9.5],
  5: [3.5, 6.5],
  2: [0.5, 3.5],
  0: [0, 0.5],
};

const score15 = z.number().min(0, '分数不能小于 0').max(SUBJECTIVE_MAX_SCORE, '分数不能大于 15');

export const translationFeedbackSchema = z
  .object({
    score: score15,
    band: z.union(BANDS.map((b) => z.literal(b)) as [z.ZodLiteral<Band>, ...z.ZodLiteral<Band>[]]),
    /** 总评 */
    summary: text,
    /** 逐句点评 */
    sentences: z
      .array(z.object({ original: text, problem: text, improvement: text }))
      .min(1, '至少点评 1 句'),
  })
  .superRefine((v, ctx) => {
    const [lo, hi] = BAND_RANGE[v.band];
    if (v.score < lo || v.score > hi)
      ctx.addIssue({
        code: 'custom',
        message: `分数 ${v.score} 与档次 ${v.band} 不符（应在 ${lo} 到 ${hi} 之间）`,
        path: ['score'],
      });
  });

export const essayFeedbackSchema = z.object({
  score: score15,
  /** 总评 */
  summary: text,
  /** 问题清单 */
  issues: z.array(z.object({ excerpt: z.string(), problem: text, suggestion: text })),
  /** 改写示范 */
  rewrite: text,
});

export const FEEDBACK_SCHEMAS = {
  translation: translationFeedbackSchema,
  essay: essayFeedbackSchema,
} as const satisfies Record<SubjectiveType, z.ZodType>;

export type TranslationFeedback = z.infer<typeof translationFeedbackSchema>;
export type EssayFeedback = z.infer<typeof essayFeedbackSchema>;
export type FeedbackOf<T extends SubjectiveType> = z.infer<(typeof FEEDBACK_SCHEMAS)[T]>;

/** 把 zod 的校验错误压缩成几行中文提示：既回给模型重试，也放进报错信息 */
export function summarizeIssues(error: z.ZodError, max = 8): string {
  const lines = error.issues.slice(0, max).map((i) => {
    const path = i.path.length ? i.path.map(String).join('.') : '(根)';
    return `- ${path}: ${i.message}`;
  });
  if (error.issues.length > max) lines.push(`- ……另有 ${error.issues.length - max} 处`);
  return lines.join('\n');
}

/** 校验一道题的 payload（读库、导入时也可以用） */
export function parsePayload<T extends QuestionType>(
  type: T,
  data: unknown,
): z.ZodSafeParseResult<PayloadOf<T>> {
  return (PAYLOAD_SCHEMAS[type] as unknown as z.ZodType<PayloadOf<T>>).safeParse(data);
}
