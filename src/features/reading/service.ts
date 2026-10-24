/**
 * 阅读板块：页面只经过这里拿题目和作答逻辑（src/lib 不让页面直接引用）。
 *
 * 现在题目来自内置示例题（src/lib/exam/reading-fixtures.ts）。PR-B 合并后：
 * `loadReadingSet` 改成从题库（question 表）取题、没有就调大模型生成，
 * 提交时用 answersByPart 拆出每道题的作答写进 attempt 表，页面不用改。
 */
import { useReducer } from 'react';

import {
  createSheet,
  sheetReducer,
  type AnswerSheet,
  type ReadingSet,
  type SheetAction,
} from '../../lib/exam/reading';
import { DEMO_READING, stressReadingSet } from '../../lib/exam/reading-fixtures';
import type { ReadingQuestionType } from '../../lib/exam/reading-types';

export { cet6PaperScore, type Cet6PaperScore } from '../../lib/exam/cet6-score';
export {
  answeredCount,
  answersByPart,
  gradeSheet,
  indexOfValue,
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
  type ReadingSet,
  type SheetAction,
} from '../../lib/exam/reading';
export {
  READING_QUESTION_TYPES,
  isReadingQuestionType,
  type BankedClozePayload,
  type CarefulReadingPayload,
  type MatchingPayload,
  type ReadingQuestionType,
} from '../../lib/exam/reading-types';

export type SetOf<T extends ReadingQuestionType> = Extract<ReadingSet, { type: T }>;

export interface ReadingTypeMeta {
  type: ReadingQuestionType;
  title: string;
  /** 一句话说明，题型列表用 */
  summary: string;
  /** 规模，如「10 空 · 15 词」 */
  size: string;
}

export const READING_TYPE_META: Readonly<Record<ReadingQuestionType, ReadingTypeMeta>> = {
  banked_cloze: {
    type: 'banked_cloze',
    title: '选词填空',
    summary: '一篇短文 10 个空，从 15 个词里选，每个词只能用一次。',
    size: '10 空 · 15 词',
  },
  matching: {
    type: 'matching',
    title: '长篇阅读',
    summary: '10 个陈述句，各找出信息出自哪一段，一段可以对应多句。',
    size: '11 段 · 10 题',
  },
  careful_reading: {
    type: 'careful_reading',
    title: '仔细阅读',
    summary: '两篇短文，每篇 5 道四选一。',
    size: '2 篇 · 10 题',
  },
};

/** 题目来源：demo 为内置示例题；stress 为超长词/超长段落压测版（break-ui） */
export type ReadingSource = 'demo' | 'stress';

export function parseReadingSource(v: unknown): ReadingSource {
  return v === 'stress' ? 'stress' : 'demo';
}

/** 取一套题（现在是同步的示例题；接题库后换成异步加载） */
export function loadReadingSet(
  type: ReadingQuestionType,
  source: ReadingSource = 'demo',
): ReadingSet {
  return source === 'stress' ? stressReadingSet(type) : DEMO_READING[type];
}

/** 一套题的答题卡（reducer 在 src/lib，纯函数可单测） */
export function useAnswerSheet(set: ReadingSet): [AnswerSheet, (a: SheetAction) => void] {
  return useReducer(sheetReducer, set, createSheet);
}
