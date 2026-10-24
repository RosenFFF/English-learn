/**
 * 阅读板块：出题（调用户配置的大模型 → zod 校验 → 存进题库）、判分、写作答记录。
 * 页面只经过这里拿题目和作答逻辑（src/lib、src/db 不让页面直接引用）。
 */
import { useReducer } from 'react';

import { getDatabases } from '../../db/open';
import {
  insertAttempt,
  insertQuestion,
  listAttemptsForQuestion,
  listQuestions,
  listRecentTopics,
} from '../../db/questionRepo';
import type { SqlDb } from '../../db/types';
import { ExamGenError, generateQuestion, type LlmDeps } from '../../lib/exam/generate';
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
import { parseStoredPayload } from '../../lib/exam/schemas';
import type { AttemptRow, QuestionRow } from '../../lib/exam/types';
import type { ExamId } from '../../lib/exams';
import { LlmError } from '../../lib/llm';
import { uuidv4 } from '../../lib/uuid';
import { readSelectedExam } from '../exam/service';
import { describeLlmError, getLlmConfig, loadLlmSettings } from '../settings/service';
import { notifyDataChanged } from '../shared';

export { cet6PaperScore, type Cet6PaperScore } from '../../lib/exam/cet6-score';
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

// ---------- 大模型配置 ----------

export type ReadingLlmStatus =
  | { ready: true }
  | {
      ready: false;
      /** 缺了哪几项，如 ['接口地址', '模型名'] */
      missing: string[];
      /** 保存过密钥但现在解不开 */
      keyUnreadable: boolean;
    };

/** 能不能出题：接口地址、密钥、模型名都齐了才行 */
export async function getReadingLlmStatus(): Promise<ReadingLlmStatus> {
  if (await getLlmConfig()) return { ready: true };
  const s = await loadLlmSettings();
  const missing = [
    s.baseUrl.trim() ? null : '接口地址',
    s.hasKey ? null : '密钥',
    s.model.trim() ? null : '模型名',
  ].filter((x): x is string => x !== null);
  return { ready: false, missing, keyUnreadable: s.keyUnreadable };
}

/** 没配大模型时出题 */
export class ReadingNotConfiguredError extends Error {
  constructor() {
    super('还没有配置大模型：请先在「大模型设置」里填写接口地址、密钥和模型名');
    this.name = 'ReadingNotConfiguredError';
  }
}

/** 出题 / 保存失败时给用户看的中文说明 */
export function describeReadingError(e: unknown): string {
  if (e instanceof ExamGenError || e instanceof ReadingNotConfiguredError) return e.message;
  if (e instanceof LlmError) return `出题失败：${describeLlmError(e)}`;
  return `出题失败：${e instanceof Error ? e.message : String(e)}`;
}

export function isAbort(e: unknown): boolean {
  return e instanceof LlmError && e.kind === 'aborted';
}

// ---------- 出题 ----------

/** 一次练习：题目，以及题库里读不出来、被跳过的旧题（中文原因，界面要显示） */
export interface PreparedReading {
  set: ReadingSet;
  skipped: { id: string; error: string }[];
}

/**
 * 题库里生成过、但一次都没做过的题（比如出完题就退出了），新的在前；先用它们，省一次调用。
 * 读不出来的（版本太新、内容损坏）跳过并记下原因。
 */
async function unattempted<T extends ReadingQuestionType>(
  user: SqlDb,
  exam: ExamId,
  type: T,
  need: number,
) {
  const parts: { id: string; payload: unknown }[] = [];
  const skipped: PreparedReading['skipped'] = [];
  for (const row of await listQuestions(user, exam, type, 20)) {
    if (parts.length >= need) break;
    if ((await listAttemptsForQuestion(user, row.id)).length > 0) continue;
    const r = parseStoredPayload(type, row.schema_version, row.payload);
    if (r.ok) parts.push({ id: row.id, payload: r.payload });
    else skipped.push({ id: row.id, error: r.error });
  }
  return { parts, skipped };
}

export interface PrepareOptions {
  deps: LlmDeps;
  now?: () => number;
  /** 每准备好一道题回调一次（仔细阅读要两道） */
  onProgress?: (done: number, total: number) => void;
}

/** 准备一次练习：先用没做过的旧题，不够再生成，生成的题存进 question 表 */
export async function prepareReadingSet<T extends ReadingQuestionType>(
  user: SqlDb,
  type: T,
  opts: PrepareOptions,
): Promise<PreparedReading> {
  const now = opts.now ?? Date.now;
  const exam = (await readSelectedExam(user)) ?? 'cet6';
  const total = READING_TYPE_META[type].parts;
  const { parts, skipped } = await unattempted(user, exam, type, total);
  let done = parts.length;
  opts.onProgress?.(done, total);
  if (done < total) {
    // 同题型最近的话题（已去重、新的在前），让模型换个话题；清洗在 generateQuestion 里做
    const avoidTopics = await listRecentTopics(user, exam, type);
    const fresh = await Promise.all(
      Array.from({ length: total - done }, async () => {
        const q = await generateQuestion(type, { ...opts.deps, avoidTopics });
        const row: QuestionRow = {
          id: uuidv4(),
          exam,
          section: 'reading',
          type,
          schema_version: q.schemaVersion, // 用生成时的版本（v2 起带 topic），不写死
          payload: JSON.stringify(q.payload),
          source: 'llm',
          model: q.model || null,
          prompt_version: q.promptVersion,
          created_at: now(),
          deleted: 0,
        };
        await insertQuestion(user, row);
        opts.onProgress?.(++done, total);
        return { id: row.id, payload: q.payload as unknown };
      }),
    );
    parts.push(...fresh);
  }
  return { set: { id: uuidv4(), type, parts } as ReadingSet, skipped };
}

/** 页面用：读配置、开库、准备一次练习。没配大模型抛 ReadingNotConfiguredError */
export async function startReadingSet(
  type: ReadingQuestionType,
  opts: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {},
): Promise<PreparedReading> {
  const cfg = await getLlmConfig();
  if (!cfg) throw new ReadingNotConfiguredError();
  const { user } = await getDatabases();
  const prepared = await prepareReadingSet(user, type, {
    deps: { cfg, signal: opts.signal },
    onProgress: opts.onProgress,
  });
  notifyDataChanged();
  return prepared;
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

/** 页面用：交卷写记录 */
export async function submitReadingSet(
  set: ReadingSet,
  sheet: AnswerSheet,
  startedAt: number,
): Promise<void> {
  const { user } = await getDatabases();
  await saveReadingAttempts(user, set, sheet, { startedAt, submittedAt: Date.now() });
  notifyDataChanged();
}

/** 一套题的答题卡（reducer 在 src/lib，纯函数可单测） */
export function useAnswerSheet(set: ReadingSet): [AnswerSheet, (a: SheetAction) => void] {
  return useReducer(sheetReducer, set, createSheet);
}
