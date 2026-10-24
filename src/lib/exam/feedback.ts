/**
 * 主观题点评的存取：评分结果 → attempt 行的字段（含 feedback JSON 文本），以及从 attempt.feedback 读回点评。
 * 存库 JSON 顶层带 version（FEEDBACK_VERSION）和 promptVersion（GRADE_PROMPT_VERSION）；
 * v1 时期的老记录没有 version，按 v1 宽松读（新字段可选），不做数据迁移。
 */
import type { z } from 'zod';

import type { SubjectiveGrade } from './grade';
import {
  FEEDBACK_SCHEMAS,
  FEEDBACK_V1_SCHEMAS,
  FEEDBACK_VERSION,
  summarizeIssues,
  type FeedbackOf,
  type StoredFeedbackOf,
} from './schemas';
import type { AttemptRow, SubjectiveType } from './types';

/** attempt 行里和评分有关的字段 */
export type AttemptGradeFields = Pick<
  AttemptRow,
  'score' | 'max_score' | 'feedback' | 'wrong_count' | 'needs_redo'
>;

/** 点评写进 attempt.feedback 的 JSON 文本：顶层加 version、promptVersion */
export function serializeFeedback<F extends object>(feedback: F, promptVersion: number): string {
  return JSON.stringify({ version: FEEDBACK_VERSION, promptVersion, ...feedback });
}

/** 主观题评分结果 → attempt 行的评分字段（needs_redo 已按 score < 9 算好） */
export function subjectiveAttemptFields<F extends object>(
  grade: SubjectiveGrade<F>,
): AttemptGradeFields {
  return {
    score: grade.score,
    max_score: grade.maxScore,
    feedback: serializeFeedback(grade.feedback, grade.promptVersion),
    wrong_count: 0,
    needs_redo: grade.needsRedo ? 1 : 0,
  };
}

export type StoredFeedbackResult<T extends SubjectiveType> =
  | {
      ok: true;
      /** 1：老记录，criteria 等新字段可能缺；2：当前结构，字段齐全 */
      version: number;
      feedback: StoredFeedbackOf<T>;
    }
  | { ok: false; error: string };

/**
 * 读 attempt.feedback。
 * - null / 空串：ok: false（评分失败或没有点评）
 * - 没有 version：按 v1 读（criteria 可选；翻译 rewrite 可选；写作 band 可选）
 * - version 2：按当前结构严格读
 * - version 比 FEEDBACK_VERSION 新或不合法、不是 JSON、校验不过：ok: false 和中文原因
 * 读出的文字同样经过清洗和截断。
 */
export function parseStoredFeedback<T extends SubjectiveType>(
  type: T,
  text: string | null | undefined,
): StoredFeedbackResult<T> {
  if (text == null || text.trim() === '') return { ok: false, error: '没有点评' };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: '点评内容不是有效的 JSON' };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data))
    return { ok: false, error: '点评内容不是 JSON 对象' };
  const raw = (data as { version?: unknown }).version;
  const version = raw === undefined ? 1 : raw;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1)
    return { ok: false, error: `点评版本不合法：${String(raw)}` };
  if (version > FEEDBACK_VERSION)
    return { ok: false, error: '这条点评来自更新版本的 App，请先升级' };
  const schema = (version >= 2 ? FEEDBACK_SCHEMAS : FEEDBACK_V1_SCHEMAS)[
    type
  ] as unknown as z.ZodType<StoredFeedbackOf<T>>;
  const r = schema.safeParse(data);
  return r.success
    ? { ok: true, version, feedback: r.data }
    : { ok: false, error: `点评内容格式不对：\n${summarizeIssues(r.error)}` };
}

/** v2 点评是否字段齐全（用于界面判断能否显示分项点评和改写示例） */
export function isCurrentFeedback<T extends SubjectiveType>(
  r: StoredFeedbackResult<T>,
): r is { ok: true; version: number; feedback: StoredFeedbackOf<T> & FeedbackOf<T> } {
  return r.ok && r.version >= FEEDBACK_VERSION;
}
