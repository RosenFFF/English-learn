/**
 * 题库与作答记录的类型（纯 TS，不依赖 React / Expo）。
 * 考试和板块 id 以 src/lib/exams.ts 为准；这里只补充细分题型。
 */
import type { ExamId, SectionId } from '../exams';

/** 有题库的板块（词汇走 FSRS，错题本是汇总页，都不进题库） */
export const PRACTICE_SECTION_IDS = ['reading', 'translation', 'writing', 'listening'] as const;
export type PracticeSectionId = Extract<SectionId, (typeof PRACTICE_SECTION_IDS)[number]>;

/** 细分题型，对应 question.type / attempt.type */
export const QUESTION_TYPES = [
  'banked_cloze',
  'matching',
  'careful_reading',
  'translation',
  'essay',
  'long_conversation',
  'passage',
  'lecture',
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** 题型所属板块 */
export const QUESTION_SECTION: Readonly<Record<QuestionType, PracticeSectionId>> = {
  banked_cloze: 'reading',
  matching: 'reading',
  careful_reading: 'reading',
  translation: 'translation',
  essay: 'writing',
  long_conversation: 'listening',
  passage: 'listening',
  lecture: 'listening',
};

/** 中文名，界面和报错用 */
export const QUESTION_TYPE_LABEL: Readonly<Record<QuestionType, string>> = {
  banked_cloze: '选词填空',
  matching: '长篇阅读（段落匹配）',
  careful_reading: '仔细阅读',
  translation: '翻译',
  essay: '写作',
  long_conversation: '听力·长对话',
  passage: '听力·短文',
  lecture: '听力·讲座',
};

/**
 * 主观题：LLM 评分，wrong_count 固定 0；低于 REDO_THRESHOLD 标「待重练」（needs_redo = 1），
 * 错题本里带「待重练」标签列出，重做达到 REDO_THRESHOLD 后移出。
 */
export const SUBJECTIVE_TYPES = ['translation', 'essay'] as const;
export type SubjectiveType = (typeof SUBJECTIVE_TYPES)[number];
export type ObjectiveType = Exclude<QuestionType, SubjectiveType>;

/** 主观题满分（六级翻译、写作都是 15 分制） */
export const SUBJECTIVE_MAX_SCORE = 15;
/** 主观题低于这个分数标为「待重练」 */
export const REDO_THRESHOLD = 9;

export function isQuestionType(v: unknown): v is QuestionType {
  return typeof v === 'string' && (QUESTION_TYPES as readonly string[]).includes(v);
}

export function isPracticeSection(v: unknown): v is PracticeSectionId {
  return typeof v === 'string' && (PRACTICE_SECTION_IDS as readonly string[]).includes(v);
}

export function isSubjectiveType(t: QuestionType): t is SubjectiveType {
  return (SUBJECTIVE_TYPES as readonly string[]).includes(t);
}

/** 选择题选项字母 */
export const CHOICE_LETTERS = ['A', 'B', 'C', 'D'] as const;
export type ChoiceLetter = (typeof CHOICE_LETTERS)[number];

/** question 表的一行（payload 是校验通过的题目 JSON 文本） */
export interface QuestionRow {
  id: string;
  exam: ExamId;
  section: PracticeSectionId;
  type: QuestionType;
  schema_version: number;
  payload: string;
  /** 目前只有 'llm'，以后可能有 'builtin' */
  source: string;
  model: string | null;
  prompt_version: number;
  created_at: number;
  deleted: number;
}

/** attempt 表的一行 */
export interface AttemptRow {
  id: string;
  question_id: string;
  exam: ExamId;
  section: PracticeSectionId;
  type: QuestionType;
  /** 作答 JSON 文本 */
  answer: string;
  /** 评分失败时为 null */
  score: number | null;
  max_score: number;
  /** 主观题的 LLM 点评 JSON 文本；客观题为 null */
  feedback: string | null;
  /** 客观题答错（含未答）的题数；主观题固定 0 */
  wrong_count: number;
  /** 主观题得分低于 9 时为 1（待重练）；客观题固定 0 */
  needs_redo: number;
  duration_ms: number | null;
  started_at: number;
  submitted_at: number;
}
