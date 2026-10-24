/**
 * 现场出题共用：先用题库里没做过的旧题，不够再让大模型生成（带上同题型最近的话题让它避开），
 * 生成的题存进 question 表。阅读、翻译、写作都走这里。
 */
import {
  getQuestion,
  insertQuestion,
  listAttemptsForQuestion,
  listQuestions,
  listRecentTopics,
} from '../../db/questionRepo';
import type { SqlDb } from '../../db/types';
import { generateQuestion, type LlmDeps } from '../../lib/exam/generate';
import { parseStoredPayload, type PayloadOf } from '../../lib/exam/schemas';
import { QUESTION_SECTION, type QuestionRow, type QuestionType } from '../../lib/exam/types';
import type { ExamId } from '../../lib/exams';
import { uuidv4 } from '../../lib/uuid';
import { readSelectedExam } from '../exam/service';
import { StoredQuestionError } from './llm';

export interface StoredQuestion<T extends QuestionType> {
  id: string;
  payload: PayloadOf<T>;
}

/** 题库里读不出来、被跳过的旧题（中文原因，界面要显示） */
export interface SkippedQuestion {
  id: string;
  error: string;
}

export interface PrepareOptions {
  deps: LlmDeps;
  now?: () => number;
  /** 每准备好一道题回调一次（仔细阅读要两道） */
  onProgress?: (done: number, total: number) => void;
  /** 优先用这道题（比如草稿对应的题），前提是还没做过、能读出来 */
  preferId?: string | null;
}

export interface PreparedQuestions<T extends QuestionType> {
  exam: ExamId;
  parts: StoredQuestion<T>[];
  skipped: SkippedQuestion[];
}

async function attempted(user: SqlDb, id: string): Promise<boolean> {
  return (await listAttemptsForQuestion(user, id)).length > 0;
}

function parseRow<T extends QuestionType>(
  type: T,
  row: QuestionRow,
): StoredQuestion<T> | SkippedQuestion {
  const r = parseStoredPayload(type, row.schema_version, row.payload);
  return r.ok ? { id: row.id, payload: r.payload } : { id: row.id, error: r.error };
}

/**
 * 题库里生成过、但一次都没做过的题（比如出完题就退出了），新的在前；先用它们，省一次调用。
 * 读不出来的（版本太新、内容损坏）跳过并记下原因。
 */
async function unattempted<T extends QuestionType>(
  user: SqlDb,
  exam: ExamId,
  type: T,
  need: number,
  preferId: string | null | undefined,
) {
  const parts: StoredQuestion<T>[] = [];
  const skipped: SkippedQuestion[] = [];
  const take = (r: StoredQuestion<T> | SkippedQuestion) => {
    if ('error' in r) skipped.push(r);
    else parts.push(r);
  };
  if (preferId) {
    const row = await getQuestion(user, preferId);
    if (row && !row.deleted && row.type === type && row.exam === exam)
      if (!(await attempted(user, row.id))) take(parseRow(type, row));
  }
  for (const row of await listQuestions(user, exam, type, 20)) {
    if (parts.length >= need) break;
    if (row.id === preferId || (await attempted(user, row.id))) continue;
    take(parseRow(type, row));
  }
  return { parts: parts.slice(0, need), skipped };
}

/** 准备 total 道 type 题：先用没做过的旧题，不够再生成并存库 */
export async function prepareQuestions<T extends QuestionType>(
  user: SqlDb,
  type: T,
  total: number,
  opts: PrepareOptions,
): Promise<PreparedQuestions<T>> {
  const now = opts.now ?? Date.now;
  const exam = (await readSelectedExam(user)) ?? 'cet6';
  const { parts, skipped } = await unattempted(user, exam, type, total, opts.preferId);
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
          section: QUESTION_SECTION[type],
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
        return { id: row.id, payload: q.payload as PayloadOf<T> };
      }),
    );
    parts.push(...fresh);
  }
  return { exam, parts, skipped };
}

/**
 * 错题本重做：按 id 取题库里的原题（不重新出题）。软删除的题也能取。
 * 找不到、题型不对、读不出来（版本太新、内容损坏）都抛 StoredQuestionError（中文原因）。
 */
export async function loadStoredQuestion<T extends QuestionType>(
  user: SqlDb,
  type: T,
  id: string,
): Promise<StoredQuestion<T>> {
  const row = await getQuestion(user, id);
  if (!row || row.type !== type) throw new StoredQuestionError('找不到这道题，可能已经被清除了');
  const r = parseRow(type, row);
  if ('error' in r) throw new StoredQuestionError(`这道题读不出来，没法重做：${r.error}`);
  return r;
}
