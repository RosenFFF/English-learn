/**
 * 错题本（纯函数，不依赖 React / Expo）：把 listOpenMistakes 查出来的行变成界面用的条目并按板块分组。
 *
 * 规则（作答记录只追加、不修改）：
 * - 客观题：某道题最近一次作答 wrong_count > 0 就在错题本里；重做全对（wrong_count = 0）后移出。
 *   重做还有错就留着，显示最新一次错了几题。
 * - 主观题（翻译、写作）：最近一次作答 needs_redo = 1（< 9 分）就显示「待重练」；重做 ≥ 9 分后移出。
 * - 题目读不出来（版本太新、内容损坏）照样列出，显示中文原因，不能点进去重做。
 */
import { getSection, type ExamId, type SectionId } from '../exams';
import { BLANK_MARKER, parseStoredPayload } from './schemas';
import {
  QUESTION_TYPE_LABEL,
  REDO_THRESHOLD,
  isSubjectiveType,
  type PracticeSectionId,
  type QuestionType,
} from './types';

/** listOpenMistakes 的一行：某道题最近一次作答（还没过）+ 题目本身 + 累计没过的次数 */
export interface OpenMistakeRow {
  question_id: string;
  exam: ExamId;
  section: PracticeSectionId;
  type: QuestionType;
  /** 最近一次作答的得分 / 满分（评分失败为 null） */
  score: number | null;
  max_score: number;
  /** 最近一次作答答错（含未答）的题数（客观题） */
  wrong_count: number;
  /** 最近一次作答是否待重练（主观题） */
  needs_redo: number;
  /** 最近一次作答的提交时间 */
  submitted_at: number;
  /** 这道题一共有几次作答没过（wrong_count > 0 或 needs_redo = 1） */
  miss_times: number;
  /** 题目的 schema_version / payload（可能读不出来） */
  schema_version: number;
  payload: string;
}

/** 点进去重做走哪个作答页；null 表示现在不能重做 */
export type RedoTarget =
  | { screen: 'reading'; type: 'banked_cloze' | 'matching' | 'careful_reading' }
  | { screen: 'translation' }
  | { screen: 'writing' };

export interface MistakeItem {
  questionId: string;
  type: QuestionType;
  section: PracticeSectionId;
  /** 题型中文名，如「仔细阅读」 */
  typeLabel: string;
  /** 一两行题目摘要（原文开头 / 标题）；读不出来时为空串 */
  preview: string;
  kind: 'objective' | 'subjective';
  /** 小标签：客观题「错 2 题」，主观题「待重练」 */
  badge: string;
  /** 主要信息：「上次错 2 题 · 共 5 题」/「上次 6 / 15 分」 */
  detail: string;
  /** 累计没过的次数（≥ 1） */
  missTimes: number;
  submittedAt: number;
  /** 上次作答日期，如「10月23日」（本地时区） */
  dateLabel: string;
  redo: RedoTarget | null;
  /** 不能重做的原因（中文）；能重做为 null */
  blocked: string | null;
}

export interface MistakeGroup {
  section: PracticeSectionId;
  title: string;
  items: MistakeItem[];
}

const PREVIEW_MAX = 80;

/** 压成一行并截断到 max 个字符（超出加 …） */
export function clip(text: string, max = PREVIEW_MAX): string {
  const one = text.replace(/\s+/g, ' ').trim();
  const chars = [...one];
  return chars.length > max ? `${chars.slice(0, max).join('').trimEnd()}…` : one;
}

/** 题目摘要：阅读取短文开头（空位换成 ____）、段落匹配取标题、翻译取原文、写作取题目、听力取话题或第一句 */
export function mistakePreview(type: QuestionType, payload: unknown): string {
  const p = (payload ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  switch (type) {
    case 'banked_cloze':
      return clip(str(p.passage).replace(new RegExp(BLANK_MARKER.source, 'g'), '____'));
    case 'careful_reading':
      return clip(str(p.passage));
    case 'matching':
      return clip(str(p.title));
    case 'translation':
      return clip(str(p.source));
    case 'essay':
      return clip(str(p.title));
    default: {
      if (str(p.topic)) return clip(str(p.topic));
      const lines = (
        Array.isArray(p.transcript) ? p.transcript : Array.isArray(p.script) ? p.script : []
      ) as {
        text?: unknown;
      }[];
      return clip(str(lines[0]?.text));
    }
  }
}

export function redoTarget(type: QuestionType): RedoTarget | null {
  switch (type) {
    case 'banked_cloze':
    case 'matching':
    case 'careful_reading':
      return { screen: 'reading', type };
    case 'translation':
      return { screen: 'translation' };
    case 'essay':
      return { screen: 'writing' };
    default:
      return null;
  }
}

/** 「10月23日」（本地时区） */
export function shortDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function fmtScore(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function toMistakeItem(row: OpenMistakeRow): MistakeItem {
  const subjective = isSubjectiveType(row.type);
  const parsed = parseStoredPayload(row.type, row.schema_version, row.payload);
  const target = redoTarget(row.type);
  const blocked = !parsed.ok
    ? `这道题读不出来，没法重做：${parsed.error.split('\n')[0]}`
    : !target
      ? `${getSection(row.section).title}界面上线后就能重做`
      : null;
  const detail = subjective
    ? row.score === null
      ? '上次没评上分'
      : `上次 ${fmtScore(row.score)} / ${fmtScore(row.max_score)} 分`
    : `上次错 ${row.wrong_count} 题 · 共 ${fmtScore(row.max_score)} 题`;
  return {
    questionId: row.question_id,
    type: row.type,
    section: row.section,
    typeLabel: QUESTION_TYPE_LABEL[row.type],
    preview: parsed.ok ? mistakePreview(row.type, parsed.payload) : '',
    kind: subjective ? 'subjective' : 'objective',
    badge: subjective ? '待重练' : `错 ${row.wrong_count} 题`,
    detail,
    missTimes: Math.max(1, row.miss_times),
    submittedAt: row.submitted_at,
    dateLabel: shortDate(row.submitted_at),
    redo: blocked ? null : target,
    blocked,
  };
}

/**
 * 按板块分组：顺序跟这门考试首页的板块顺序一致（sectionOrder），组内保持查询顺序（最近的在前）；
 * 没有错题的板块不出现。
 */
export function groupMistakes(
  rows: readonly OpenMistakeRow[],
  sectionOrder: readonly SectionId[],
): MistakeGroup[] {
  const items = rows.map(toMistakeItem);
  const order = (s: PracticeSectionId): number => {
    const i = sectionOrder.indexOf(s);
    return i < 0 ? sectionOrder.length : i;
  };
  const sections = [...new Set(items.map((i) => i.section))].sort((a, b) => order(a) - order(b));
  return sections.map((section) => ({
    section,
    title: getSection(section).title,
    items: items.filter((i) => i.section === section),
  }));
}

export function countMistakes(groups: readonly MistakeGroup[]): number {
  return groups.reduce((n, g) => n + g.items.length, 0);
}

/** 重做之后这道题还在不在错题本里（和 listOpenMistakes 的规则一致） */
export function stillMistake(
  r: { kind: 'objective'; wrongCount: number } | { kind: 'subjective'; score: number },
): boolean {
  return r.kind === 'objective' ? r.wrongCount > 0 : r.score < REDO_THRESHOLD;
}

/** 重做交卷后给用户看的一句话 */
export function redoOutcomeText(
  r: { kind: 'objective'; wrongCount: number } | { kind: 'subjective'; score: number },
): string {
  if (!stillMistake(r)) return '重做通过，已从错题本移出';
  return r.kind === 'objective'
    ? `还错 ${r.wrongCount} 题，先留在错题本里`
    : `还没到 ${REDO_THRESHOLD} 分，先留在错题本里`;
}
