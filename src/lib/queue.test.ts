import { CardState } from './fsrs';
import {
  buildSessionQueue,
  computeDailyBudget,
  needsRequeue,
  pickNewWords,
  pickReviews,
  requeue,
  type DueCard,
} from './queue';

const plan = { dailyNew: 20, dailyReviewCap: 100 };
const DAY = 86_400_000;

describe('computeDailyBudget：每日上限与欠账分摊', () => {
  it('没有欠账：新词按计划，复习全部做完', () => {
    expect(computeDailyBudget(plan, { newDone: 0, reviewDone: 0 }, 40)).toEqual({
      newQuota: 20,
      newRemaining: 20,
      reviewRemaining: 40,
      overflow: 0,
      backlogDays: 0,
    });
  });

  it('刚好等于上限不算欠账', () => {
    const b = computeDailyBudget(plan, { newDone: 0, reviewDone: 0 }, 100);
    expect(b.overflow).toBe(0);
    expect(b.reviewRemaining).toBe(100);
    expect(b.newQuota).toBe(20);
  });

  it('超出上限：只做上限个，其余顺延；按比例减少新词；给出分摊天数', () => {
    const b = computeDailyBudget(plan, { newDone: 0, reviewDone: 0 }, 150);
    expect(b.reviewRemaining).toBe(100);
    expect(b.overflow).toBe(50);
    expect(b.newQuota).toBe(10); // 欠账占上限一半 → 新词减半
    expect(b.backlogDays).toBe(2);
  });

  it('断卡很久（欠账 3000+）：当天不出新词，分 31 天消化，每天仍只做上限个', () => {
    const b = computeDailyBudget(plan, { newDone: 0, reviewDone: 0 }, 3050);
    expect(b.newQuota).toBe(0);
    expect(b.reviewRemaining).toBe(100);
    expect(b.backlogDays).toBe(31);
  });

  it('一天之内边学边算：欠账数字保持稳定，剩余额度递减', () => {
    // 开始时到期 150；做了 60 个后还剩 90 个到期
    const b = computeDailyBudget(plan, { newDone: 4, reviewDone: 60 }, 90);
    expect(b.overflow).toBe(50);
    expect(b.reviewRemaining).toBe(40);
    expect(b.newRemaining).toBe(6);
  });

  it('达到上限后不再出复习，即使还有到期卡', () => {
    expect(computeDailyBudget(plan, { newDone: 20, reviewDone: 100 }, 50).reviewRemaining).toBe(0);
  });

  it('新词超额完成时剩余为 0，不出现负数', () => {
    expect(computeDailyBudget(plan, { newDone: 25, reviewDone: 0 }, 0).newRemaining).toBe(0);
  });

  it('异常参数：上限为 0 时按 1 处理，负数到期按 0', () => {
    expect(
      computeDailyBudget({ dailyNew: 5, dailyReviewCap: 0 }, { newDone: 0, reviewDone: 0 }, -3),
    ).toEqual({ newQuota: 5, newRemaining: 5, reviewRemaining: 0, overflow: 0, backlogDays: 0 });
  });
});

describe('pickReviews：欠账时优先最容易忘的', () => {
  const now = Date.UTC(2026, 9, 17);
  const mk = (id: number, stability: number, daysAgo: number): DueCard => ({
    word_id: id,
    due: now - daysAgo * DAY + stability * DAY,
    state: CardState.Review,
    stability,
    last_review: now - daysAgo * DAY,
  });

  it('按回忆概率从低到高，且只取 n 个', () => {
    const cards = [mk(1, 10, 11), mk(2, 2, 20), mk(3, 30, 31)];
    expect(pickReviews(cards, 2, now)).toEqual([2, 1]);
  });

  it('跳过非复习状态，n<=0 返回空', () => {
    expect(pickReviews([{ ...mk(9, 1, 5), state: CardState.Learning }], 5, now)).toEqual([]);
    expect(pickReviews([mk(1, 1, 1)], 0, now)).toEqual([]);
  });
});

describe('pickNewWords', () => {
  it('按词书顺序跳过已学的词', () => {
    expect(pickNewWords([5, 6, 7, 8, 9], new Set([6, 8]), 2)).toEqual([5, 7]);
    expect(pickNewWords([1, 2], new Set([1, 2]), 5)).toEqual([]);
  });
});

describe('buildSessionQueue', () => {
  it('学习中卡在最前；新词穿插在复习里（每 3 个复习插 1 个）', () => {
    const q = buildSessionQueue({
      learning: [100],
      reviews: [1, 2, 3, 4, 5, 6],
      news: [50, 51],
      groupSize: 20,
    });
    expect(q.map((x) => `${x.kind[0]}${x.wordId}`)).toEqual([
      'l100',
      'r1',
      'r2',
      'r3',
      'n50',
      'r4',
      'r5',
      'r6',
      'n51',
    ]);
  });

  it('不超过一组的大小', () => {
    const q = buildSessionQueue({
      learning: [],
      reviews: [1, 2, 3, 4, 5],
      news: [10, 11, 12],
      groupSize: 4,
    });
    expect(q).toHaveLength(4);
  });

  it('只有新词时全部是新词；都没有时为空', () => {
    expect(
      buildSessionQueue({ learning: [], reviews: [], news: [1, 2], groupSize: 20 }).map(
        (x) => x.kind,
      ),
    ).toEqual(['new', 'new']);
    expect(buildSessionQueue({ learning: [], reviews: [], news: [], groupSize: 20 })).toEqual([]);
  });
});

describe('requeue / needsRequeue', () => {
  it('放回当前位置之后第 4 个；队列短就放末尾', () => {
    expect(requeue([1, 2, 3, 4, 5, 6], 99)).toEqual([1, 2, 3, 4, 99, 5, 6]);
    expect(requeue([1], 99)).toEqual([1, 99]);
    expect(requeue([], 99)).toEqual([99]);
  });

  it('学习中且 20 分钟内到期需要本组再出现；复习卡不需要', () => {
    const now = 1_000_000;
    expect(needsRequeue({ state: CardState.Learning, due: now + 60_000 }, now)).toBe(true);
    expect(needsRequeue({ state: CardState.Relearning, due: now + 10 * 60_000 }, now)).toBe(true);
    expect(needsRequeue({ state: CardState.Learning, due: now + 2 * DAY }, now)).toBe(false);
    expect(needsRequeue({ state: CardState.Review, due: now + 60_000 }, now)).toBe(false);
  });
});
