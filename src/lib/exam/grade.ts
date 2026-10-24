/**
 * 评分：客观题本地判分，不调用 LLM；翻译、写作调用 LLM 按六级 15 分制评分，结果同样用 zod 校验并重试。
 * 规则：客观题 wrongCount = 答错（含未答）的题数、needsRedo = false；
 * 主观题 wrongCount 固定 0（不进错题本），needsRedo = score < 9（待重练）。
 */
import type { z } from 'zod';

import { askJson, type LlmDeps } from './generate';
import { essayGradingMessages, translationGradingMessages } from './prompts';
import {
  essayFeedbackSchema,
  translationFeedbackSchema,
  type BankedClozePayload,
  type EssayFeedback,
  type EssayPayload,
  type ListeningPayload,
  type CarefulReadingPayload,
  type MatchingPayload,
  type TranslationFeedback,
  type TranslationPayload,
} from './schemas';
import {
  REDO_THRESHOLD,
  SUBJECTIVE_MAX_SCORE,
  type ChoiceLetter,
  type ObjectiveType,
} from './types';

// ---------- 客观题 ----------
/** 客观题作答：每个空 / 每道题一项，未答为 null */
export interface ObjectiveAnswerMap {
  /** 候选词下标 */
  banked_cloze: (number | null)[];
  /** 段落字母 */
  matching: (string | null)[];
  careful_reading: (ChoiceLetter | null)[];
  long_conversation: (ChoiceLetter | null)[];
  passage: (ChoiceLetter | null)[];
  lecture: (ChoiceLetter | null)[];
}

export interface ObjectivePayloadMap {
  banked_cloze: BankedClozePayload;
  matching: MatchingPayload;
  careful_reading: CarefulReadingPayload;
  long_conversation: ListeningPayload;
  passage: ListeningPayload;
  lecture: ListeningPayload;
}

export type ObjectiveQuestion = {
  [T in ObjectiveType]: { type: T; payload: ObjectivePayloadMap[T] };
}[ObjectiveType];

export interface ItemResult<V> {
  index: number;
  correct: boolean;
  expected: V;
  given: V | null;
}

export interface ObjectiveGrade<V = number | string> {
  /** 答对题数（每题 1 分） */
  score: number;
  maxScore: number;
  /** 答错（含未答）的题数，写进 attempt.wrong_count */
  wrongCount: number;
  needsRedo: false;
  items: ItemResult<V>[];
}

function compare<V>(expected: readonly V[], given: readonly (V | null)[]): ObjectiveGrade<V> {
  const items = expected.map((e, index) => {
    const g = given[index] ?? null;
    return { index, correct: g !== null && g === e, expected: e, given: g };
  });
  const score = items.filter((i) => i.correct).length;
  return {
    score,
    maxScore: items.length,
    wrongCount: items.length - score,
    needsRedo: false,
    items,
  };
}

/** 客观题标准答案，顺序与作答数组一致 */
export function objectiveKey(q: ObjectiveQuestion): (number | string)[] {
  switch (q.type) {
    case 'banked_cloze':
      return q.payload.blanks.map((b) => b.answer);
    case 'matching':
      return q.payload.statements.map((s) => s.answer);
    default:
      return q.payload.questions.map((x) => x.answer);
  }
}

/** 客观题本地判分 */
export function gradeObjective<T extends ObjectiveType>(
  q: Extract<ObjectiveQuestion, { type: T }>,
  answers: ObjectiveAnswerMap[T],
): ObjectiveGrade {
  return compare<number | string>(objectiveKey(q), answers);
}

// ---------- 主观题 ----------
export interface SubjectiveGrade<F> {
  score: number;
  maxScore: typeof SUBJECTIVE_MAX_SCORE;
  wrongCount: 0;
  needsRedo: boolean;
  feedback: F;
  model: string;
}

function subjective<F extends { score: number }>(feedback: F, model: string): SubjectiveGrade<F> {
  return {
    score: feedback.score,
    maxScore: SUBJECTIVE_MAX_SCORE,
    wrongCount: 0,
    needsRedo: feedback.score < REDO_THRESHOLD,
    feedback,
    model,
  };
}

/** 没写任何内容：直接 0 分，不调用 LLM */
const isBlank = (s: string): boolean => s.trim() === '';

/** 翻译评分。最终失败抛 ExamGenError；LlmError 原样抛出。 */
export async function gradeTranslation(
  q: TranslationPayload,
  answer: string,
  deps: LlmDeps,
): Promise<SubjectiveGrade<TranslationFeedback>> {
  const model = deps.cfg.model.trim();
  if (isBlank(answer))
    return subjective(
      {
        score: 0,
        band: 0,
        summary: '未作答。',
        sentences: [{ original: '（空）', problem: '未作答', improvement: q.reference }],
      },
      model,
    );
  const feedback = await askJson(deps, {
    messages: translationGradingMessages(q, answer),
    schema: translationFeedbackSchema as z.ZodType<TranslationFeedback>,
    what: '翻译评分',
    temperature: 0.2,
  });
  return subjective(feedback, model);
}

/** 写作评分。最终失败抛 ExamGenError；LlmError 原样抛出。 */
export async function gradeEssay(
  q: EssayPayload,
  answer: string,
  deps: LlmDeps,
): Promise<SubjectiveGrade<EssayFeedback>> {
  const model = deps.cfg.model.trim();
  if (isBlank(answer))
    return subjective(
      {
        score: 0,
        summary: '未作答。',
        issues: [],
        rewrite: `（未作答，没有可改写的内容。题目：${q.title}）`,
      },
      model,
    );
  const feedback = await askJson(deps, {
    messages: essayGradingMessages(q, answer),
    schema: essayFeedbackSchema,
    what: '写作评分',
    temperature: 0.2,
  });
  return subjective(feedback, model);
}
