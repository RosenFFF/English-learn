/**
 * 六级阅读按大纲分值比例折合卷面分（纯函数）。
 *
 * 来源（官方）：
 * - 中国教育考试网「CET笔试考核内容？」https://cet.neea.edu.cn/html1/report/16123/177-1.htm
 *   六级阅读理解：词汇理解（选词填空）10 题占 5%，长篇阅读（匹配）10 题占 10%，
 *   仔细阅读（单选）10 题占 20%；整卷合计 100%。
 * - 《全国大学英语四、六级考试大纲（2016 年修订版）》
 *   https://cet.neea.edu.cn/res/Home/1704/55b02330ac17274664f06d9d3db8249d.pdf
 *   同样的分值比例；并说明报道分经等值处理、参照常模转换（均值 500、标准差 70，220–710）。
 *
 * 所以这里只按分值比例折成「百分制整卷里的卷面分」（选词填空每题 0.5、长篇阅读每题 1、
 * 仔细阅读每题 2）。不换算成 710 分制的报道分：官方报道分不是卷面分的线性换算，算出来是编的。
 */
import type { ReadingQuestionType } from './reading-types';

export interface Cet6Weight {
  /** 这一题型占整卷的百分比 */
  percent: number;
  /** 官方题量 */
  items: number;
}

export const CET6_READING_WEIGHTS: Readonly<Record<ReadingQuestionType, Cet6Weight>> = {
  banked_cloze: { percent: 5, items: 10 },
  matching: { percent: 10, items: 10 },
  careful_reading: { percent: 20, items: 10 },
};

export interface Cet6PaperScore {
  /** 按比例折合的卷面分（百分制整卷） */
  points: number;
  /** 这次练习的满分（题量不足官方题量时按实际题数折） */
  maxPoints: number;
  /** 这一题型在整卷里的占比，如 5 */
  percent: number;
  /** 每题分值 */
  perItem: number;
}

/** 保留两位小数，避免 0.1 + 0.2 这类浮点尾巴 */
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * 答对 correct 题、共 total 题时，按六级大纲比例折合的卷面分。
 * 每题分值 = 占比 / 官方题量，与这次实际出了几题无关。
 */
export function cet6PaperScore(
  type: ReadingQuestionType,
  correct: number,
  total: number,
): Cet6PaperScore {
  const w = CET6_READING_WEIGHTS[type];
  const perItem = w.percent / w.items;
  const t = Math.max(0, Math.floor(total));
  const c = Math.min(t, Math.max(0, Math.floor(correct)));
  return {
    points: round2(c * perItem),
    maxPoints: round2(t * perItem),
    percent: w.percent,
    perItem: round2(perItem),
  };
}
