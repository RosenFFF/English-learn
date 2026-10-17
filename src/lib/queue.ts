/**
 * 每日队列与「复习上限 + 欠账分摊」规则（纯函数）。
 *
 * 规则：
 * 1. 学习中/重学中的卡（短期步骤）不受上限限制，到期就进队列，避免打断记忆过程。
 * 2. 复习卡每天最多 dailyReviewCap 个；超出部分是「欠账」，按回忆概率从低到高优先，
 *    剩下的自然顺延，按每天上限的速度分几天消化，不会一次压给用户。
 * 3. 有欠账时新词按欠账比例减量；欠账 ≥ 一天上限时当天不出新词，先还账。
 */
import { CardState, retrievability, type CardRow } from './fsrs';

export interface PlanSettings {
  dailyNew: number;
  dailyReviewCap: number;
}

export interface TodayProgress {
  newDone: number;
  reviewDone: number;
}

export interface DailyBudget {
  /** 今天计划的新词数（已按欠账减量） */
  newQuota: number;
  newRemaining: number;
  /** 今天还能复习的复习卡数（已受上限约束） */
  reviewRemaining: number;
  /** 超过今日上限、顺延到之后几天的复习数 */
  overflow: number;
  /** 按上限速度消化当前全部到期复习预计需要的天数（无欠账为 0） */
  backlogDays: number;
}

/**
 * @param dueReviewNow 现在仍到期（due ≤ 今天结束）的复习卡数，已复习过的不再计入
 */
export function computeDailyBudget(
  plan: PlanSettings,
  progress: TodayProgress,
  dueReviewNow: number,
): DailyBudget {
  const cap = Math.max(1, Math.floor(plan.dailyReviewCap));
  const dailyNew = Math.max(0, Math.floor(plan.dailyNew));
  const due = Math.max(0, dueReviewNow);
  // 用「今天开始时的到期总量」计算欠账，保证一天之内数字稳定
  const totalToday = due + progress.reviewDone;
  const overflow = Math.max(0, totalToday - cap);
  const newQuota =
    overflow === 0 ? dailyNew : Math.max(0, Math.floor(dailyNew * (1 - overflow / cap)));
  return {
    newQuota,
    newRemaining: Math.max(0, newQuota - progress.newDone),
    reviewRemaining: Math.max(0, Math.min(due, cap - progress.reviewDone)),
    overflow,
    backlogDays: overflow === 0 ? 0 : Math.ceil(totalToday / cap),
  };
}

export type DueCard = Pick<CardRow, 'word_id' | 'due' | 'state' | 'stability' | 'last_review'>;

/** 从到期复习卡里挑 n 张：回忆概率最低的优先，同概率按到期早的优先 */
export function pickReviews(due: readonly DueCard[], n: number, now: number): number[] {
  if (n <= 0) return [];
  return due
    .filter((c) => c.state === CardState.Review)
    .map((c) => ({ id: c.word_id, r: retrievability(c, now), due: c.due }))
    .sort((a, b) => a.r - b.r || a.due - b.due)
    .slice(0, n)
    .map((c) => c.id);
}

/** 从词书顺序里挑出还没学过的前 n 个新词 */
export function pickNewWords(
  bookWordIds: readonly number[],
  learned: ReadonlySet<number>,
  n: number,
): number[] {
  const out: number[] = [];
  for (const id of bookWordIds) {
    if (out.length >= n) break;
    if (!learned.has(id)) out.push(id);
  }
  return out;
}

export interface QueueItem {
  wordId: number;
  kind: 'learning' | 'review' | 'new';
}

export interface SessionInput {
  learning: readonly number[];
  reviews: readonly number[];
  news: readonly number[];
  groupSize: number;
}

/**
 * 组成一组（默认 20 个）：先放到期的学习中卡，再把新词穿插进复习词里（每 3 个复习插 1 个新词），
 * 复习不够时新词补齐。
 */
export function buildSessionQueue({
  learning,
  reviews,
  news,
  groupSize,
}: SessionInput): QueueItem[] {
  const out: QueueItem[] = [];
  const size = Math.max(1, groupSize);
  for (const id of learning) {
    if (out.length >= size) return out;
    out.push({ wordId: id, kind: 'learning' });
  }
  let r = 0;
  let n = 0;
  while (out.length < size && (r < reviews.length || n < news.length)) {
    const takeNew =
      n < news.length &&
      (r >= reviews.length || (r > 0 && r % 3 === 0 && out[out.length - 1]?.kind !== 'new'));
    if (takeNew) out.push({ wordId: news[n++] as number, kind: 'new' });
    else out.push({ wordId: reviews[r++] as number, kind: 'review' });
  }
  return out;
}

/**
 * 评分后卡片仍处于短期学习步骤（忘了/模糊）时，放回本组队列稍后再出现。
 * 插在当前位置之后第 gap 个，队列不够长就放末尾。
 */
export function requeue<T>(queue: readonly T[], item: T, gap = 4): T[] {
  const pos = Math.min(queue.length, gap);
  return [...queue.slice(0, pos), item, ...queue.slice(pos)];
}

/** 学习中卡「提前学」的窗口：到期时间在 20 分钟内的也放进本组 */
export const LEARN_AHEAD_MS = 20 * 60_000;

/** 评分后是否需要在本组内再出现一次 */
export function needsRequeue(card: Pick<CardRow, 'state' | 'due'>, now: number): boolean {
  return (
    (card.state === CardState.Learning || card.state === CardState.Relearning) &&
    card.due - now <= LEARN_AHEAD_MS
  );
}
