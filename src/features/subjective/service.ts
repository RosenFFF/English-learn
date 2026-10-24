/**
 * 翻译、写作：出题（同阅读，先用没做过的旧题）、草稿自动保存、大模型评分、写作答记录。
 * 页面只经过这里（src/lib、src/db 不让页面直接引用）。
 */
import { getDatabases } from '../../db/open';
import { insertAttempt } from '../../db/questionRepo';
import type { SqlDb } from '../../db/types';
import { kvGet, kvSet } from '../../db/userRepo';
import type { LlmDeps } from '../../lib/exam/generate';
import { gradeEssay, gradeTranslation, type SubjectiveGrade } from '../../lib/exam/grade';
import type {
  EssayFeedback,
  EssayPayload,
  PayloadOf,
  TranslationFeedback,
  TranslationPayload,
} from '../../lib/exam/schemas';
import {
  draftKey,
  gradeToView,
  parseDraft,
  type DraftSlot,
  type GradeView,
  type SubjectiveDraft,
} from '../../lib/exam/subjective';
import { QUESTION_SECTION, type AttemptRow, type SubjectiveType } from '../../lib/exam/types';
import { uuidv4 } from '../../lib/uuid';
import { readSelectedExam } from '../exam/service';
import { LlmNotConfiguredError } from '../generation/llm';
import {
  loadStoredQuestion,
  prepareQuestions,
  type PrepareOptions,
  type SkippedQuestion,
} from '../generation/questions';
import { getLlmConfig } from '../settings/service';
import { notifyDataChanged } from '../shared';

export {
  ANSWER_MAX_LENGTH,
  countHan,
  countWords,
  isSubjectiveQuestionType,
  lengthHint,
  submitCheck,
  verdictText,
  type CommentItem,
  type DimensionItem,
  type GradeView,
  type LengthHint,
  type SubmitCheck,
} from '../../lib/exam/subjective';
export { redoOutcomeText } from '../../lib/exam/mistakes';
export type { DraftSlot } from '../../lib/exam/subjective';
export type { EssayPayload, TranslationPayload } from '../../lib/exam/schemas';
export type { SubjectiveType } from '../../lib/exam/types';

export interface SubjectiveMeta {
  type: SubjectiveType;
  title: string;
  /** 回退到哪（没有上一页时） */
  home: '/home';
  /** 未配置时的说明 */
  unconfigured: string;
  generating: string;
  placeholder: string;
}

export const SUBJECTIVE_META: Readonly<Record<SubjectiveType, SubjectiveMeta>> = {
  translation: {
    type: 'translation',
    title: '翻译',
    home: '/home',
    unconfigured: '翻译题由你自己配置的大模型现场出题并评分，每次都是新写的原创段落。',
    generating: '大模型正在写一段原创中文短文并准备参考译文，通常需要 10 到 30 秒。',
    placeholder: '在这里写英文译文…',
  },
  essay: {
    type: 'essay',
    title: '写作',
    home: '/home',
    unconfigured: '写作题由你自己配置的大模型现场出题并评分，每次都是新的题目。',
    generating: '大模型正在出一道仿六级的写作题，通常需要 10 到 30 秒。',
    placeholder: '在这里写作文…',
  },
};

// ---------- 出题 ----------

export type SubjectiveQuestion<T extends SubjectiveType = SubjectiveType> = {
  [K in T]: { type: K; id: string; payload: PayloadOf<K> };
}[T];

export interface PreparedSubjective {
  question: SubjectiveQuestion;
  /** 这道题的草稿（中途退出后再进来恢复），没有为 null */
  draft: SubjectiveDraft | null;
  skipped: SkippedQuestion[];
}

export async function readDraft(
  user: SqlDb,
  type: SubjectiveType,
  slot: DraftSlot = 'practice',
): Promise<SubjectiveDraft | null> {
  return parseDraft(await kvGet(user, draftKey(type, slot)));
}

export async function writeDraft(
  user: SqlDb,
  type: SubjectiveType,
  draft: SubjectiveDraft | null,
  slot: DraftSlot = 'practice',
): Promise<void> {
  await kvSet(user, draftKey(type, slot), draft ? JSON.stringify(draft) : '');
}

/** 准备一道题：有草稿就接着写草稿那道；否则先用没做过的旧题，不够再生成 */
export async function prepareSubjective(
  user: SqlDb,
  type: SubjectiveType,
  opts: PrepareOptions,
): Promise<PreparedSubjective> {
  const draft = await readDraft(user, type);
  const { parts, skipped } = await prepareQuestions(user, type, 1, {
    ...opts,
    preferId: draft?.questionId ?? null,
  });
  const part = parts[0]!;
  return {
    question: { type, id: part.id, payload: part.payload } as SubjectiveQuestion,
    draft: draft && draft.questionId === part.id ? draft : null,
    skipped,
  };
}

/**
 * 错题本重做：取题库里的原题（不重新出题）。草稿用单独的 redo 槽，只有同一道题的才恢复。
 * 找不到 / 读不出来抛 StoredQuestionError（中文原因）。
 */
export async function prepareSubjectiveRedo(
  user: SqlDb,
  type: SubjectiveType,
  questionId: string,
): Promise<PreparedSubjective> {
  const part = await loadStoredQuestion(user, type, questionId);
  const draft = await readDraft(user, type, 'redo');
  return {
    question: { type, id: part.id, payload: part.payload } as SubjectiveQuestion,
    draft: draft && draft.questionId === part.id ? draft : null,
    skipped: [],
  };
}

/** 页面用：错题本重做（评分要大模型，配置由页面流程先检查） */
export async function startSubjectiveRedo(
  type: SubjectiveType,
  questionId: string,
): Promise<PreparedSubjective> {
  const { user } = await getDatabases();
  return prepareSubjectiveRedo(user, type, questionId);
}

/** 页面用：读配置、开库、准备一道题。没配大模型抛 LlmNotConfiguredError */
export async function startSubjective(
  type: SubjectiveType,
  opts: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {},
): Promise<PreparedSubjective> {
  const cfg = await getLlmConfig();
  if (!cfg) throw new LlmNotConfiguredError();
  const { user } = await getDatabases();
  const prepared = await prepareSubjective(user, type, {
    deps: { cfg, signal: opts.signal },
    onProgress: opts.onProgress,
  });
  notifyDataChanged();
  return prepared;
}

/** 页面用：保存草稿（自动保存调用） */
export async function saveDraft(
  type: SubjectiveType,
  draft: SubjectiveDraft,
  slot: DraftSlot = 'practice',
): Promise<void> {
  const { user } = await getDatabases();
  await writeDraft(user, type, draft, slot);
}

// ---------- 评分 ----------

type AnyGrade = SubjectiveGrade<TranslationFeedback> | SubjectiveGrade<EssayFeedback>;

function callGrade(q: SubjectiveQuestion, answer: string, deps: LlmDeps): Promise<AnyGrade> {
  return q.type === 'translation'
    ? gradeTranslation(q.payload as TranslationPayload, answer, deps)
    : gradeEssay(q.payload as EssayPayload, answer, deps);
}

/**
 * 评分并写 attempt（成功后才写；失败抛错，草稿保留可重试）。
 * 主观题：score = 0–15、max_score = 15、wrong_count = 0、needs_redo = score < 9、
 * feedback = 带 version 的点评 JSON（subjectiveAttemptFields）。写完清掉草稿。
 */
export async function gradeAndSave(
  user: SqlDb,
  q: SubjectiveQuestion,
  answer: string,
  opts: { deps: LlmDeps; startedAt: number; now?: () => number; slot?: DraftSlot },
): Promise<{ view: GradeView; row: AttemptRow }> {
  const grade = await callGrade(q, answer, opts.deps);
  // 评分字段（score、max_score、feedback JSON、wrong_count、needs_redo）一律由 feedback.ts 生成
  const { fields, view } = gradeToView<object>(q.type, grade as SubjectiveGrade<object>);
  const submittedAt = (opts.now ?? Date.now)();
  const exam = (await readSelectedExam(user)) ?? 'cet6';
  const row: AttemptRow = {
    id: uuidv4(),
    question_id: q.id,
    exam,
    section: QUESTION_SECTION[q.type],
    type: q.type,
    answer: JSON.stringify(answer),
    ...fields,
    duration_ms: Math.max(0, submittedAt - opts.startedAt),
    started_at: opts.startedAt,
    submitted_at: submittedAt,
  };
  await insertAttempt(user, row);
  await writeDraft(user, q.type, null, opts.slot);
  return { view, row };
}

/** 页面用：交卷评分 */
export async function submitSubjective(
  q: SubjectiveQuestion,
  answer: string,
  startedAt: number,
  signal?: AbortSignal,
  slot: DraftSlot = 'practice',
): Promise<GradeView> {
  const cfg = await getLlmConfig();
  if (!cfg) throw new LlmNotConfiguredError();
  const { user } = await getDatabases();
  const { view } = await gradeAndSave(user, q, answer, {
    deps: { cfg, signal },
    startedAt,
    slot,
  });
  notifyDataChanged();
  return view;
}
