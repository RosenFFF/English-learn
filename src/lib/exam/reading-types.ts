/**
 * 阅读三种题型的临时题目类型（纯 TS）。
 *
 * ⚠️ 临时文件：和 PR-B（feat/question-bank，head 5fb9466）里的
 * `src/lib/exam/types.ts`、`schemas.ts`、`grade.ts` 完全同形。PR-B 合并后整个文件改成：
 *
 *   export { CHOICE_LETTERS, type ChoiceLetter } from './types';
 *   export { BLANK_MARKER, BANKED_CLOZE_OPTIONS, BANKED_CLOZE_BLANKS, MATCHING_STATEMENTS,
 *     CAREFUL_READING_QUESTIONS, type BankedClozePayload, type MatchingPayload,
 *     type CarefulReadingPayload, type ChoiceQuestion } from './schemas';
 *   export type ReadingQuestion = Extract<Question, { type: ReadingQuestionType }>;
 *   export type ReadingAnswerMap = Pick<ObjectiveAnswerMap, ReadingQuestionType>;
 *
 * 字段名、题型枚举、答案结构都不要在这里自己改，改了就和题库对不上。
 */

/** = types.ts CHOICE_LETTERS */
export const CHOICE_LETTERS = ['A', 'B', 'C', 'D'] as const;
export type ChoiceLetter = (typeof CHOICE_LETTERS)[number];

/** = schemas.ts 里的常量 */
export const BANKED_CLOZE_OPTIONS = 15;
export const BANKED_CLOZE_BLANKS = 10;
export const MATCHING_STATEMENTS = 10;
export const CAREFUL_READING_QUESTIONS = 5;
/** 选词填空短文里的空位标记 {{1}} … {{10}} */
export const BLANK_MARKER = /\{\{(\d+)\}\}/g;

/** 阅读的三种题型（= types.ts QUESTION_TYPES 里 section 为 reading 的三个） */
export const READING_QUESTION_TYPES = ['banked_cloze', 'matching', 'careful_reading'] as const;
export type ReadingQuestionType = (typeof READING_QUESTION_TYPES)[number];

export function isReadingQuestionType(v: unknown): v is ReadingQuestionType {
  return typeof v === 'string' && (READING_QUESTION_TYPES as readonly string[]).includes(v);
}

/** = schemas.ts BankedClozePayload */
export interface BankedClozePayload {
  passage: string;
  /** 15 个候选词，界面上按下标显示成 A–O */
  options: string[];
  /** 第 i 项对应短文里的 {{i+1}} */
  blanks: {
    /** 候选词下标（0 起） */
    answer: number;
    explanation: string;
  }[];
}

/** = schemas.ts MatchingPayload */
export interface MatchingPayload {
  title: string;
  /** label 从 A 开始连续 */
  paragraphs: { label: string; text: string }[];
  /** answer 是段落 label；一个段落可以对应多句 */
  statements: { text: string; answer: string; explanation: string }[];
}

/** = schemas.ts ChoiceQuestion */
export interface ChoiceQuestion {
  stem: string;
  /** 4 个选项，按下标显示成 A–D */
  options: string[];
  answer: ChoiceLetter;
  explanation: string;
}

/** = schemas.ts CarefulReadingPayload：一篇文章 5 题；六级的两篇是两道题（两行 question） */
export interface CarefulReadingPayload {
  passage: string;
  questions: ChoiceQuestion[];
}

export interface ReadingPayloadMap {
  banked_cloze: BankedClozePayload;
  matching: MatchingPayload;
  careful_reading: CarefulReadingPayload;
}

/** = Extract<schemas.ts Question, { type: ReadingQuestionType }> */
export type ReadingQuestion = {
  [T in ReadingQuestionType]: { type: T; payload: ReadingPayloadMap[T] };
}[ReadingQuestionType];

/** = Pick<grade.ts ObjectiveAnswerMap, ReadingQuestionType>：每空 / 每题一项，未答为 null */
export interface ReadingAnswerMap {
  /** 候选词下标 */
  banked_cloze: (number | null)[];
  /** 段落字母 */
  matching: (string | null)[];
  careful_reading: (ChoiceLetter | null)[];
}
