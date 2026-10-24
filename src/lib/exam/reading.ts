/**
 * 阅读作答状态：纯函数 + reducer（不依赖 React / Expo）。
 *
 * 一次练习是一个 ReadingSet：选词填空、段落匹配各 1 道题（question 表 1 行），
 * 仔细阅读 2 道题（两篇文章，各 5 小题）。所有小题按顺序摊平成一张「答题卡」，
 * 格子里存的值和 grade.ts 的 ObjectiveAnswerMap 一致：选词填空存候选词下标（number），
 * 段落匹配存段落字母，仔细阅读存 A–D；null 表示没答。
 * - 选词填空：`unique` 为 true，一个词只能填进一个空；有「当前空位」focus，点词填进 focus。
 * - 段落匹配、仔细阅读：`unique` 为 false，同一个段落可以被多句选中。
 * 提交之后答题卡锁定，除 reset 外的操作都不改状态。
 */
import type { ObjectiveAnswerMap } from './grade';
import { BLANK_MARKER, type PayloadOf } from './schemas';
import { CHOICE_LETTERS, QUESTION_SECTION, type QuestionType } from './types';

/** 阅读板块的三种题型（= types.ts 里 section 为 reading 的题型，单测校验） */
export const READING_QUESTION_TYPES = [
  'banked_cloze',
  'matching',
  'careful_reading',
] as const satisfies readonly QuestionType[];
export type ReadingQuestionType = (typeof READING_QUESTION_TYPES)[number];

export function isReadingQuestionType(v: unknown): v is ReadingQuestionType {
  return typeof v === 'string' && (READING_QUESTION_TYPES as readonly string[]).includes(v);
}

/** 题型是不是属于阅读板块（和 READING_QUESTION_TYPES 互相校验） */
export const isReadingSectionType = (t: QuestionType): boolean => QUESTION_SECTION[t] === 'reading';

/** 每道题作答数组的形状 = grade.ts 的 ObjectiveAnswerMap */
export type ReadingAnswerMap = Pick<ObjectiveAnswerMap, ReadingQuestionType>;

/** 一道题（question 表的一行）：id 是 question.id */
export interface ReadingPart<T extends ReadingQuestionType> {
  id: string;
  payload: PayloadOf<T>;
}

/** 一次练习 */
export type ReadingSet = {
  [T in ReadingQuestionType]: { id: string; type: T; parts: ReadingPart<T>[] };
}[ReadingQuestionType];

export type AnswerValue = number | string;

export interface AnswerSheet {
  answers: readonly (AnswerValue | null)[];
  /** 每个格子可选的值 */
  choices: readonly (readonly AnswerValue[])[];
  /** 选词填空的当前空位；其它题型为 null */
  focus: number | null;
  unique: boolean;
  submitted: boolean;
}

export type SheetAction =
  | { type: 'focus'; index: number }
  | { type: 'answer'; index: number; value: AnswerValue }
  /** 选词填空：把词填进当前空位；再点一次当前空位里的词就清空 */
  | { type: 'pick'; value: AnswerValue }
  | { type: 'clear'; index: number }
  | { type: 'submit' }
  /** 再做一遍：清空答案、解锁 */
  | { type: 'reset' };

/** 显示用字母：下标 0 → A */
export function letterOf(i: number): string {
  return String.fromCharCode(65 + i);
}

/** 摊平后的一个小题 */
export interface SheetItem {
  /** 属于第几道题（parts 下标） */
  part: number;
  /** 在这道题里是第几小题 */
  local: number;
  expected: AnswerValue;
  explanation: string;
  choices: AnswerValue[];
}

export function itemsOf(set: ReadingSet): SheetItem[] {
  switch (set.type) {
    case 'banked_cloze':
      return set.parts.flatMap((p, part) =>
        p.payload.blanks.map((b, local) => ({
          part,
          local,
          expected: b.answer,
          explanation: b.explanation,
          choices: p.payload.options.map((_, i) => i),
        })),
      );
    case 'matching':
      return set.parts.flatMap((p, part) =>
        p.payload.statements.map((s, local) => ({
          part,
          local,
          expected: s.answer,
          explanation: s.explanation,
          choices: p.payload.paragraphs.map((x) => x.label),
        })),
      );
    case 'careful_reading':
      return set.parts.flatMap((p, part) =>
        p.payload.questions.map((q, local) => ({
          part,
          local,
          expected: q.answer,
          explanation: q.explanation,
          choices: q.options.map((_, i) => CHOICE_LETTERS[i] ?? letterOf(i)),
        })),
      );
  }
}

/** 每道题第一个小题在答题卡里的下标 */
export function partOffsets(set: ReadingSet): number[] {
  const offsets: number[] = [];
  itemsOf(set).forEach((item, n) => {
    if (item.local === 0) offsets.push(n);
  });
  return offsets;
}

export function createSheet(set: ReadingSet): AnswerSheet {
  const choices = itemsOf(set).map((i) => i.choices);
  const cloze = set.type === 'banked_cloze';
  return {
    answers: choices.map(() => null),
    choices,
    focus: cloze && choices.length > 0 ? 0 : null,
    unique: cloze,
    submitted: false,
  };
}

function inRange(sheet: AnswerSheet, index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < sheet.answers.length;
}

/** 某个值现在填在哪一格（unique 题型用）；没用过返回 -1 */
export function indexOfValue(sheet: AnswerSheet, value: AnswerValue): number {
  return sheet.answers.indexOf(value);
}

export function usedValues(sheet: AnswerSheet): Set<AnswerValue> {
  const used = new Set<AnswerValue>();
  for (const a of sheet.answers) if (a !== null) used.add(a);
  return used;
}

export function answeredCount(sheet: AnswerSheet): number {
  return sheet.answers.filter((a) => a !== null).length;
}

export function unansweredCount(sheet: AnswerSheet): number {
  return sheet.answers.length - answeredCount(sheet);
}

/** 从 from 之后（不含）往后找第一个没答的格子，到末尾再从头找；都答了返回 null */
export function nextUnanswered(sheet: AnswerSheet, from: number): number | null {
  const n = sheet.answers.length;
  for (let step = 1; step <= n; step++) {
    const i = (((from + step) % n) + n) % n;
    if (sheet.answers[i] === null) return i;
  }
  return null;
}

function setAnswer(sheet: AnswerSheet, index: number, value: AnswerValue | null): AnswerSheet {
  const answers = sheet.answers.slice();
  answers[index] = value;
  return { ...sheet, answers };
}

export function sheetReducer(sheet: AnswerSheet, action: SheetAction): AnswerSheet {
  if (action.type === 'reset') {
    return {
      ...sheet,
      answers: sheet.answers.map(() => null),
      focus: sheet.unique && sheet.answers.length > 0 ? 0 : null,
      submitted: false,
    };
  }
  if (sheet.submitted) return sheet;

  switch (action.type) {
    case 'focus':
      if (!sheet.unique || !inRange(sheet, action.index)) return sheet;
      return sheet.focus === action.index ? sheet : { ...sheet, focus: action.index };

    case 'answer': {
      const { index, value } = action;
      if (!inRange(sheet, index) || !sheet.choices[index]?.includes(value)) return sheet;
      if (sheet.answers[index] === value) return sheet;
      // 一个词只能用一次：已经填在别的空里就不能再填
      if (sheet.unique && indexOfValue(sheet, value) !== -1) return sheet;
      return setAnswer(sheet, index, value);
    }

    case 'pick': {
      const index = sheet.focus;
      if (index === null || !inRange(sheet, index)) return sheet;
      if (!sheet.choices[index]?.includes(action.value)) return sheet;
      if (sheet.answers[index] === action.value) return setAnswer(sheet, index, null);
      if (sheet.unique && indexOfValue(sheet, action.value) !== -1) return sheet;
      const next = setAnswer(sheet, index, action.value);
      return { ...next, focus: nextUnanswered(next, index) ?? index };
    }

    case 'clear':
      if (!inRange(sheet, action.index) || sheet.answers[action.index] === null) return sheet;
      return setAnswer(sheet, action.index, null);

    case 'submit':
      return { ...sheet, submitted: true, focus: null };
  }
}

/**
 * 按题拆出作答数组，形状 = grade.ts 的 ObjectiveAnswerMap[type]，
 * 每道题直接交给 gradeObjective、写进 attempt.answer。
 */
export function answersByPart<T extends ReadingQuestionType>(
  set: Extract<ReadingSet, { type: T }>,
  sheet: AnswerSheet,
): ReadingAnswerMap[T][] {
  const out: (AnswerValue | null)[][] = set.parts.map(() => []);
  itemsOf(set).forEach((item, i) => {
    out[item.part]?.push(sheet.answers[i] ?? null);
  });
  return out as ReadingAnswerMap[T][];
}

/** 字段名同 grade.ts 的 ItemResult / ObjectiveGrade；多了 unanswered，界面用 */
export interface ItemResult {
  index: number;
  correct: boolean;
  expected: AnswerValue;
  given: AnswerValue | null;
}

export interface GradeResult {
  /** 答对题数（每题 1 分） */
  score: number;
  maxScore: number;
  /** 答错（含未答）的题数 */
  wrongCount: number;
  /** 其中没答的题数 */
  unanswered: number;
  items: ItemResult[];
}

/** 判分：整套题摊平后逐题比对，没答算错（与 gradeObjective 同规则，单测校验两者一致） */
export function gradeSheet(set: ReadingSet, sheet: AnswerSheet): GradeResult {
  const items = itemsOf(set).map((item, index): ItemResult => {
    const given = sheet.answers[index] ?? null;
    return {
      index,
      correct: given !== null && given === item.expected,
      expected: item.expected,
      given,
    };
  });
  const score = items.filter((r) => r.correct).length;
  return {
    score,
    maxScore: items.length,
    wrongCount: items.length - score,
    unanswered: items.filter((r) => r.given === null).length,
    items,
  };
}

/** 提交前确认的文案：有没答的题时提醒具体数量 */
export function submitPrompt(sheet: AnswerSheet): { title: string; message: string } {
  const left = unansweredCount(sheet);
  return left > 0
    ? {
        title: `还有 ${left} 题没答`,
        message: '没答的题按错题计分。提交后就不能再改答案了，确定提交吗？',
      }
    : { title: '提交答案？', message: '提交后就不能再改答案了。' };
}

/** 是否需要退出确认：答过题、还没提交 */
export function needsExitConfirm(sheet: AnswerSheet): boolean {
  return !sheet.submitted && answeredCount(sheet) > 0;
}

/** 选项显示用的字母：选词填空的下标转 A–O，其余本身就是字母 */
export function valueLabel(v: AnswerValue): string {
  return typeof v === 'number' ? letterOf(v) : v;
}

// ---------- 选词填空正文 ----------

export type ClozeSegment = { kind: 'text'; text: string } | { kind: 'blank'; index: number };

/** 把带 `{{n}}` 的正文切成文字段和空位段；n 从 1 开始，返回的 index 从 0 开始 */
export function splitClozePassage(passage: string): ClozeSegment[] {
  const out: ClozeSegment[] = [];
  const re = new RegExp(BLANK_MARKER.source, 'g');
  let last = 0;
  for (let m = re.exec(passage); m; m = re.exec(passage)) {
    if (m.index > last) out.push({ kind: 'text', text: passage.slice(last, m.index) });
    out.push({ kind: 'blank', index: Number(m[1]) - 1 });
    last = m.index + m[0].length;
  }
  if (last < passage.length) out.push({ kind: 'text', text: passage.slice(last) });
  return out;
}
