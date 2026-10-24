/**
 * 翻译、写作作答的纯逻辑：字数统计、交卷前检查、草稿格式，以及把 grade.ts 的评分结果
 * 转成结果页要显示的结构（toGradeView，评分字段的对接只在这一个函数里）。
 */
import {
  isCurrentFeedback,
  parseStoredFeedback,
  subjectiveAttemptFields,
  type AttemptGradeFields,
} from './feedback';
import type { SubjectiveGrade } from './grade';
import { ANSWER_MAX_CHARS } from './prompts';
import {
  CRITERION_LABEL,
  CRITERION_LEVEL_LABEL,
  type Band,
  type CriterionLevel,
  type EssayFeedback,
  type EssayPayload,
  type TranslationFeedback,
  type TranslationPayload,
} from './schemas';
import { REDO_THRESHOLD, SUBJECTIVE_MAX_SCORE, type SubjectiveType } from './types';

export const SUBJECTIVE_QUESTION_TYPES = [
  'translation',
  'essay',
] as const satisfies readonly SubjectiveType[];

/** 输入框 maxLength：和评分 prompt 里作答的截断上限一致 */
export const ANSWER_MAX_LENGTH: Readonly<Record<SubjectiveType, number>> = ANSWER_MAX_CHARS;

export function isSubjectiveQuestionType(v: unknown): v is SubjectiveType {
  return v === 'translation' || v === 'essay';
}

// ---------- 字数 ----------

const WORD = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g;
const HAN = /\p{Script=Han}/gu;

/** 英文词数：字母数字连在一起算一个词，can't、well-known 各算一个 */
export function countWords(text: string): number {
  return text.match(WORD)?.length ?? 0;
}

/** 汉字个数（翻译原文用） */
export function countHan(text: string): number {
  return text.match(HAN)?.length ?? 0;
}

export interface LengthHint {
  /** 建议最少词数 */
  min: number;
  /** 建议最多词数；翻译没有上限为 null */
  max: number | null;
  /** 给用户看的一句话，如「建议 150–200 词」 */
  text: string;
}

/**
 * 建议字数：写作按题目的 minWords–maxWords；翻译没有官方字数要求，
 * 按参考译文词数的一半作为「太短」的下限（只用于交卷提示，不显示参考译文长度）。
 */
export function lengthHint(type: 'translation', q: TranslationPayload): LengthHint;
export function lengthHint(type: 'essay', q: EssayPayload): LengthHint;
export function lengthHint(type: SubjectiveType, q: TranslationPayload | EssayPayload): LengthHint;
export function lengthHint(type: SubjectiveType, q: TranslationPayload | EssayPayload): LengthHint {
  if (type === 'essay') {
    const e = q as EssayPayload;
    return { min: e.minWords, max: e.maxWords, text: `建议 ${e.minWords}–${e.maxWords} 词` };
  }
  const t = q as TranslationPayload;
  const min = Math.max(1, Math.round(countWords(t.reference) * 0.5));
  return { min, max: null, text: '整段译完，不要漏句' };
}

export type SubmitCheck =
  | { kind: 'blank'; title: string; message: string }
  | { kind: 'short'; title: string; message: string }
  | { kind: 'ok'; title: string; message: string };

/** 交卷前的确认文案：空白、太短要提示 */
export function submitCheck(text: string, hint: LengthHint): SubmitCheck {
  const n = countWords(text);
  if (text.trim() === '' || n === 0)
    return { kind: 'blank', title: '还没有写内容', message: '现在交卷会直接记 0 分，确定交卷吗？' };
  if (n < hint.min)
    return {
      kind: 'short',
      title: `只写了 ${n} 词`,
      message: `${hint.text}，篇幅明显不足会被扣分。确定交卷吗？`,
    };
  return { kind: 'ok', title: '交卷评分？', message: `共 ${n} 词，交卷后由大模型评分。` };
}

// ---------- 草稿 ----------

export interface SubjectiveDraft {
  questionId: string;
  text: string;
  /** 第一次开始写的时间 */
  startedAt: number;
  savedAt: number;
}

/** 读草稿；格式不对就当没有 */
export function parseDraft(raw: string | null): SubjectiveDraft | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const d = v as Record<string, unknown>;
  if (
    typeof d.questionId !== 'string' ||
    !d.questionId ||
    typeof d.text !== 'string' ||
    typeof d.startedAt !== 'number' ||
    typeof d.savedAt !== 'number'
  )
    return null;
  return { questionId: d.questionId, text: d.text, startedAt: d.startedAt, savedAt: d.savedAt };
}

export function draftKey(type: SubjectiveType): string {
  return `draft_${type}`;
}

// ---------- 结果页（评分字段的对接只在这一段） ----------

/** 一条点评：原文片段、问题、建议 */
export interface CommentItem {
  quote: string;
  problem: string;
  suggestion: string;
}

/** 分项点评：维度、等级、点评 */
export interface DimensionItem {
  key: string;
  label: string;
  level: CriterionLevel;
  levelLabel: string;
  comment: string;
}

export interface GradeView {
  score: number;
  maxScore: number;
  /** 档次（14、11、8、5、2、0）；旧版写作点评没有 */
  band: Band | null;
  /** 低于 9 分：待重练 */
  needsRedo: boolean;
  summary: string;
  /** 分项点评；旧版点评或读不出来时为 null，结果页不显示这一块 */
  dimensions: DimensionItem[] | null;
  /** 逐句点评（翻译）/ 问题清单（写作）；旧版点评为空 */
  comments: CommentItem[];
  commentsTitle: string;
  /** 改写示例；旧版点评为 null，结果页不显示这一块 */
  rewrite: string | null;
  /** 点评读不出来、或是旧版时的说明 */
  note: string | null;
}

/**
 * 维度 key → 界面上的中文名。字段名还可能改，前端只在这里映射；
 * 目前和 schemas.ts 的 CRITERION_LABEL 一致，没有的 key 原样显示。
 */
export function criterionLabel(key: string): string {
  return (CRITERION_LABEL as Readonly<Record<string, string>>)[key] ?? key;
}

/**
 * attempt 的评分字段（score、max_score、needs_redo、feedback JSON）→ 结果页。
 * 刚评完分和以后从练习记录里读旧作答都走这里：feedback 用 parseStoredFeedback 读，
 * isCurrentFeedback 为真才显示分项点评、逐句点评和改写示例；旧版只显示总分和总评。
 */
export function toGradeView(type: SubjectiveType, fields: AttemptGradeFields): GradeView {
  const score = fields.score ?? 0;
  const base: GradeView = {
    score,
    maxScore: fields.max_score ?? SUBJECTIVE_MAX_SCORE,
    band: null,
    needsRedo: fields.needs_redo === 1,
    summary: '',
    dimensions: null,
    comments: [],
    commentsTitle: type === 'translation' ? '逐句点评' : '问题清单',
    rewrite: null,
    note: null,
  };
  const r = parseStoredFeedback(type, fields.feedback);
  if (!r.ok) return { ...base, note: `点评读不出来：${r.error}` };
  const f = r.feedback as { summary: string; band?: Band };
  const withSummary = { ...base, summary: f.summary, band: f.band ?? null };
  if (!isCurrentFeedback(r))
    return { ...withSummary, note: '这是旧版本的点评，没有分项点评和改写示例。' };
  const cur = r.feedback as TranslationFeedback | EssayFeedback;
  const criteria: { key: string; level: CriterionLevel; comment: string }[] = cur.criteria;
  const dimensions = criteria.map((c) => ({
    key: c.key,
    label: criterionLabel(c.key),
    level: c.level,
    levelLabel: CRITERION_LEVEL_LABEL[c.level],
    comment: c.comment,
  }));
  const comments =
    type === 'translation'
      ? (cur as TranslationFeedback).sentences.map((s) => ({
          quote: s.original,
          problem: s.problem,
          suggestion: s.improvement,
        }))
      : (cur as EssayFeedback).issues.map((s) => ({
          quote: s.excerpt,
          problem: s.problem,
          suggestion: s.suggestion,
        }));
  return { ...withSummary, dimensions, comments, rewrite: cur.rewrite || null };
}

/** 刚评完分：评分结果 → attempt 字段（subjectiveAttemptFields）→ 结果页 */
export function gradeToView<F extends object>(
  type: SubjectiveType,
  grade: SubjectiveGrade<F>,
): { fields: AttemptGradeFields; view: GradeView } {
  const fields = subjectiveAttemptFields(grade);
  return { fields, view: toGradeView(type, fields) };
}

/** 结果页的结论一句话 */
export function verdictText(v: Pick<GradeView, 'needsRedo'>): string {
  return v.needsRedo
    ? `低于 ${REDO_THRESHOLD} 分，已标「待重练」`
    : `达到 ${REDO_THRESHOLD} 分及以上`;
}
