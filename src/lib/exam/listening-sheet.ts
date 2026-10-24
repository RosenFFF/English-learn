/**
 * 听力作答（纯 TS）：答题卡沿用阅读的 AnswerSheet / sheetReducer（每题 A–D 四选一），
 * 判分用 grade.ts 的 gradeObjective（和阅读同一规则：没答算错）。
 */
import { gradeObjective } from './grade';
import type { ListeningQuestionType } from './listening';
import type { AnswerSheet, GradeResult } from './reading';
import type { ListeningPayload } from './schemas';
import { CHOICE_LETTERS, type ChoiceLetter } from './types';

export interface ListeningSet {
  /** 这次练习的 id（换题 / 再做一遍时用来重建界面） */
  id: string;
  type: ListeningQuestionType;
  /** question 表的 id */
  questionId: string;
  payload: ListeningPayload;
}

export function createListeningSheet(payload: Pick<ListeningPayload, 'questions'>): AnswerSheet {
  return {
    answers: payload.questions.map(() => null),
    choices: payload.questions.map(() => CHOICE_LETTERS),
    focus: null,
    unique: false,
    submitted: false,
  };
}

/** 写进 attempt.answer 的作答数组（= ObjectiveAnswerMap[听力题型]） */
export function listeningAnswers(sheet: AnswerSheet): (ChoiceLetter | null)[] {
  return sheet.answers.map((a) =>
    typeof a === 'string' && (CHOICE_LETTERS as readonly string[]).includes(a)
      ? (a as ChoiceLetter)
      : null,
  );
}

/** 判分（gradeObjective 的结果 + 没答的题数，界面用） */
export function gradeListening(set: ListeningSet, sheet: AnswerSheet): GradeResult {
  const g = gradeObjective({ type: set.type, payload: set.payload }, listeningAnswers(sheet));
  return {
    score: g.score,
    maxScore: g.maxScore,
    wrongCount: g.wrongCount,
    unanswered: g.items.filter((i) => i.given === null).length,
    items: g.items,
  };
}

/**
 * 念题打开时题干先不显示，念到这一题之后才出现（真题卷面上也只印选项）；
 * 念题关掉、已经交卷时都直接显示。readUpTo = 已经念到的最大题号（没念到为 -1）。
 */
export function stemVisible(
  questionIndex: number,
  o: { readQuestions: boolean; submitted: boolean; readUpTo: number },
): boolean {
  return !o.readQuestions || o.submitted || questionIndex <= o.readUpTo;
}
