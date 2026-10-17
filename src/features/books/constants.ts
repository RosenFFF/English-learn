import type { ExamId } from '../../db/wordsRepo';

export type { ExamId };

export const DEFAULT_DAILY_NEW = 20;
export const DEFAULT_DAILY_REVIEW_CAP = 200;
export const DAILY_NEW_OPTIONS = [10, 20, 30, 50] as const;
export const REVIEW_CAP_OPTIONS = [100, 200, 300, 500] as const;

export const EXAM_LABEL: Record<ExamId, string> = {
  cet4: '四级',
  cet6: '六级',
  kaoyan: '考研',
  ielts: '雅思',
};
export const EXAM_SUBTITLE: Record<ExamId, string> = {
  cet4: '大学英语四级 · 核心词汇',
  cet6: '大学英语六级 · 进阶词汇',
  kaoyan: '考研英语一 / 二',
  ielts: '雅思学术 / 培训类',
};
