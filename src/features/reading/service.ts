/**
 * 阅读板块：出题（调用户配置的大模型 → zod 校验 → 存进题库）、判分、写作答记录。
 * 页面只经过这里拿题目和作答逻辑（src/lib、src/db 不让页面直接引用）。
 */
import { useReducer } from 'react';

import { getDatabases } from '../../db/open';
import { insertAttempt } from '../../db/questionRepo';
import type { SqlDb } from '../../db/types';
import { gradeObjective, type ObjectiveGrade, type ObjectiveQuestion } from '../../lib/exam/grade';
import {
  answersByPart,
  createSheet,
  sheetReducer,
  type AnswerSheet,
  type ReadingQuestionType,
  type ReadingSet,
  type SheetAction,
} from '../../lib/exam/reading';
import type { AttemptRow } from '../../lib/exam/types';
import { uuidv4 } from '../../lib/uuid';
import { readSelectedExam } from '../exam/service';
import { describeGenerationError, LlmNotConfiguredError } from '../generation/llm';
import {
  loadStoredQuestion,
  prepareQuestions,
  type PrepareOptions,
  type SkippedQuestion,
} from '../generation/questions';
import { getLlmConfig } from '../settings/service';
import { notifyDataChanged } from '../shared';

export { cet6PaperScore, type Cet6PaperScore } from '../../lib/exam/cet6-score';
export { redoOutcomeText } from '../../lib/exam/mistakes';
export {
  READING_QUESTION_TYPES,
  answeredCount,
  answersByPart,
  gradeSheet,
  indexOfValue,
  isReadingQuestionType,
  itemsOf,
  letterOf,
  needsExitConfirm,
  partOffsets,
  splitClozePassage,
  submitPrompt,
  unansweredCount,
  valueLabel,
  type AnswerSheet,
  type AnswerValue,
  type ClozeSegment,
  type GradeResult,
  type ItemResult,
  type ReadingQuestionType,
  type ReadingSet,
  type SheetAction,
} from '../../lib/exam/reading';
export type {
  BankedClozePayload,
  CarefulReadingPayload,
  MatchingPayload,
} from '../../lib/exam/schemas';

export type SetOf<T extends ReadingQuestionType> = Extract<ReadingSet, { type: T }>;

export interface ReadingTypeMeta {
  type: ReadingQuestionType;
  title: string;
  /** 一句话说明，题型列表用 */
  summary: string;
  /** 规模，如「10 空 · 15 词」 */
  size: string;
  /** 一次练习几道题（question 表几行）：仔细阅读两篇 */
  parts: number;
}

export const READING_TYPE_META: Readonly<Record<ReadingQuestionType, ReadingTypeMeta>> = {
  banked_cloze: {
    type: 'banked_cloze',
    title: '选词填空',
    summary: '一篇短文 10 个空，从 15 个词里选，每个词只能用一次。',
    size: '10 空 · 15 词',
    parts: 1,
  },
  matching: {
    type: 'matching',
    title: '长篇阅读',
    summary: '10 个陈述句，各找出信息出自哪一段，一段可以对应多句。',
    size: '10 题',
    parts: 1,
  },
  careful_reading: {
    type: 'careful_reading',
    title: '仔细阅读',
    summary: '两篇短文，每篇 5 道四选一。',
    size: '2 篇 · 10 题',
    parts: 2,
  },
};

// ---------- 大模型配置（和翻译、写作共用，见 ../generation/llm） ----------

export {
  getGenerationLlmStatus as getReadingLlmStatus,
  LlmNotConfiguredError as ReadingNotConfiguredError,
  isAbort,
  type GenerationLlmStatus as ReadingLlmStatus,
} from '../generation/llm';

/** 出题 / 保存失败时给用户看的中文说明 */
export function describeReadingError(e: unknown): string {
  return describeGenerationError(e);
}

// ---------- 出题 ----------

/** 一次练习：题目，以及题库里读不出来、被跳过的旧题（中文原因，界面要显示） */
export interface PreparedReading {
  set: ReadingSet;
  skipped: SkippedQuestion[];
}

export type { PrepareOptions };

/** 准备一次练习：先用没做过的旧题，不够再生成，生成的题存进 question 表 */
export async function prepareReadingSet<T extends ReadingQuestionType>(
  user: SqlDb,
  type: T,
  opts: PrepareOptions,
): Promise<PreparedReading> {
  const { parts, skipped } = await prepareQuestions(
    user,
    type,
    READING_TYPE_META[type].parts,
    opts,
  );
  return { set: { id: uuidv4(), type, parts } as unknown as ReadingSet, skipped };
}

/** 页面用：读配置、开库、准备一次练习。没配大模型抛 ReadingNotConfiguredError */
export async function startReadingSet(
  type: ReadingQuestionType,
  opts: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {},
): Promise<PreparedReading> {
  const cfg = await getLlmConfig();
  if (!cfg) throw new LlmNotConfiguredError();
  const { user } = await getDatabases();
  const prepared = await prepareReadingSet(user, type, {
    deps: { cfg, signal: opts.signal },
    onProgress: opts.onProgress,
  });
  notifyDataChanged();
  return prepared;
}

/**
 * 错题本重做：只做这一道原题（仔细阅读也只做这一篇），不重新出题、不需要大模型。
 * 找不到 / 读不出来抛 StoredQuestionError（中文原因）。
 */
export async function prepareReadingRedo(
  user: SqlDb,
  type: ReadingQuestionType,
  questionId: string,
): Promise<PreparedReading> {
  const part = await loadStoredQuestion(user, type, questionId);
  return { set: { id: uuidv4(), type, parts: [part] } as unknown as ReadingSet, skipped: [] };
}

/** 页面用：错题本重做 */
export async function startReadingRedo(
  type: ReadingQuestionType,
  questionId: string,
): Promise<PreparedReading> {
  const { user } = await getDatabases();
  return prepareReadingRedo(user, type, questionId);
}

// ---------- 交卷 ----------

/**
 * 判分并写 attempt：每道题一行。客观题 score = 答对题数、max_score = 小题数、
 * wrong_count = 答错（含未答）题数、needs_redo = 0、feedback = null（同 grade.ts 的规则）。
 */
export async function saveReadingAttempts(
  user: SqlDb,
  set: ReadingSet,
  sheet: AnswerSheet,
  times: { startedAt: number; submittedAt: number },
): Promise<{ rows: AttemptRow[]; grades: ObjectiveGrade[] }> {
  const exam = (await readSelectedExam(user)) ?? 'cet6';
  const byPart = answersByPart(set as never, sheet) as (string | number | null)[][];
  const rows: AttemptRow[] = [];
  const grades: ObjectiveGrade[] = [];
  set.parts.forEach((part, i) => {
    const answer = byPart[i] ?? [];
    const g = gradeObjective(
      { type: set.type, payload: part.payload } as ObjectiveQuestion,
      answer as never,
    );
    grades.push(g);
    rows.push({
      id: uuidv4(),
      question_id: part.id,
      exam,
      section: 'reading',
      type: set.type,
      answer: JSON.stringify(answer),
      score: g.score,
      max_score: g.maxScore,
      feedback: null,
      wrong_count: g.wrongCount,
      needs_redo: 0,
      duration_ms: Math.max(0, times.submittedAt - times.startedAt),
      started_at: times.startedAt,
      submitted_at: times.submittedAt,
    });
  });
  for (const r of rows) await insertAttempt(user, r);
  return { rows, grades };
}

/** 页面用：交卷写记录；返回每道题答错的题数（错题本重做据此提示移没移出） */
export async function submitReadingSet(
  set: ReadingSet,
  sheet: AnswerSheet,
  startedAt: number,
): Promise<{ wrongCount: number }> {
  const { user } = await getDatabases();
  const { rows } = await saveReadingAttempts(user, set, sheet, {
    startedAt,
    submittedAt: Date.now(),
  });
  notifyDataChanged();
  return { wrongCount: rows.reduce((n, r) => n + r.wrong_count, 0) };
}

/** 一套题的答题卡（reducer 在 src/lib，纯函数可单测） */
export function useAnswerSheet(set: ReadingSet): [AnswerSheet, (a: SheetAction) => void] {
  return useReducer(sheetReducer, set, createSheet);
}
