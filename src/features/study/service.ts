/** 背词：今日概况、组队列、评分写入。页面通过 useStudySession / useTodaySummary 使用。 */
import { getDatabases } from '../../db/open';
import {
  countDueLearning,
  countDueReviews,
  getActivePlan,
  getCards,
  getDayStat,
  getDueLearning,
  getDueReviews,
  getLearnedWordIds,
  kvGet,
  listDayStats,
  recordReview,
  recordSessionDone,
} from '../../db/userRepo';
import { getBook, getBookWordIds, getWords, type BookRow } from '../../db/wordsRepo';
import { addDaysToKey, endOfLocalDay, localDateKey } from '../../lib/date';
import { CardState, newCardRow, rateCard, type CardRow, type UiRating } from '../../lib/fsrs';
import {
  buildSessionQueue,
  computeDailyBudget,
  LEARN_AHEAD_MS,
  pickNewWords,
  pickReviews,
  type DailyBudget,
  type QueueItem,
} from '../../lib/queue';
import { computeStreak, type StreakInfo } from '../../lib/streak';
import { uuidv4 } from '../../lib/uuid';
import type { WordDetail } from '../../lib/words';
import { notifyDataChanged, useLoader } from '../shared';

export const DEFAULT_GROUP_SIZE = 20;

export interface TodaySummary {
  book: BookRow | null;
  budget: DailyBudget | null;
  /** 今天还要做的复习数（含学习中卡） */
  reviewToDo: number;
  newToDo: number;
  newDone: number;
  reviewDone: number;
  streak: StreakInfo;
  bookLearned: number;
  reviewCap: number;
}

async function streakNow(now: number): Promise<StreakInfo> {
  const { user } = await getDatabases();
  const today = localDateKey(now);
  const days = await listDayStats(user, addDaysToKey(today, -400));
  return computeStreak(
    days.map((d) => ({
      date: d.date,
      sessions: d.sessions,
      freezeUsed: d.streak_freeze_used === 1,
    })),
    today,
  );
}

export async function loadTodaySummary(now: number = Date.now()): Promise<TodaySummary> {
  const { words, user } = await getDatabases();
  const plan = await getActivePlan(user);
  const streak = await streakNow(now);
  const day = await getDayStat(user, localDateKey(now));
  const newDone = day?.new_count ?? 0;
  const reviewDone = day?.review_count ?? 0;
  if (!plan)
    return {
      book: null,
      budget: null,
      reviewToDo: 0,
      newToDo: 0,
      newDone,
      reviewDone,
      streak,
      bookLearned: 0,
      reviewCap: 0,
    };

  const book = await getBook(words, plan.book_id);
  const eod = endOfLocalDay(now);
  const [dueReviews, dueLearning, learned, bookIds] = await Promise.all([
    countDueReviews(user, eod),
    countDueLearning(user, eod),
    getLearnedWordIds(user),
    getBookWordIds(words, plan.book_id),
  ]);
  const budget = computeDailyBudget(
    { dailyNew: plan.daily_new, dailyReviewCap: plan.daily_review_cap },
    { newDone, reviewDone },
    dueReviews,
  );
  const unlearned = bookIds.reduce((n, id) => n + (learned.has(id) ? 0 : 1), 0);
  return {
    book,
    budget,
    reviewToDo: budget.reviewRemaining + dueLearning,
    newToDo: Math.min(budget.newRemaining, unlearned),
    newDone,
    reviewDone,
    streak,
    bookLearned: bookIds.length - unlearned,
    reviewCap: plan.daily_review_cap,
  };
}

const loadToday = (): Promise<TodaySummary> => loadTodaySummary();
export function useTodaySummary() {
  return useLoader(loadToday);
}

export interface SessionCard extends QueueItem {
  word: WordDetail;
  card: CardRow;
  exam: BookRow['exam'];
}

export async function getGroupSize(): Promise<number> {
  const { user } = await getDatabases();
  const v = Number(await kvGet(user, 'group_size'));
  return Number.isFinite(v) && v >= 5 ? v : DEFAULT_GROUP_SIZE;
}

/** 生成一组卡片；返回空数组表示今天没有任务了 */
export async function startGroup(now: number = Date.now()): Promise<SessionCard[]> {
  const { words, user } = await getDatabases();
  const plan = await getActivePlan(user);
  if (!plan) return [];
  const book = await getBook(words, plan.book_id);
  const day = await getDayStat(user, localDateKey(now));
  const eod = endOfLocalDay(now);
  const [dueReviews, dueLearning, learned, bookIds, groupSize] = await Promise.all([
    getDueReviews(user, eod),
    getDueLearning(user, now + LEARN_AHEAD_MS),
    getLearnedWordIds(user),
    getBookWordIds(words, plan.book_id),
    getGroupSize(),
  ]);
  const budget = computeDailyBudget(
    { dailyNew: plan.daily_new, dailyReviewCap: plan.daily_review_cap },
    { newDone: day?.new_count ?? 0, reviewDone: day?.review_count ?? 0 },
    dueReviews.length,
  );
  const queue = buildSessionQueue({
    learning: dueLearning.map((c) => c.word_id),
    reviews: pickReviews(dueReviews, budget.reviewRemaining, now),
    news: pickNewWords(bookIds, learned, budget.newRemaining),
    groupSize,
  });
  const ids = queue.map((q) => q.wordId);
  const [details, cards] = await Promise.all([getWords(words, ids), getCards(user, ids)]);
  const cardMap = new Map(cards.map((c) => [c.word_id, c]));
  const out: SessionCard[] = [];
  for (const q of queue) {
    const word = details.get(q.wordId);
    if (!word) continue; // 词库升级后删掉的词，跳过
    out.push({
      ...q,
      word,
      card: cardMap.get(q.wordId) ?? newCardRow(q.wordId, now),
      exam: book?.exam ?? 'cet4',
    });
  }
  return out;
}

/** 评分并落库，返回新的卡片状态 */
export async function submitRating(
  item: SessionCard,
  rating: UiRating,
  now: number = Date.now(),
): Promise<CardRow> {
  const { user } = await getDatabases();
  const { card, log } = rateCard(item.card, rating, now, uuidv4());
  const kind =
    item.card.state === CardState.New
      ? 'new'
      : item.card.state === CardState.Review
        ? 'review'
        : 'learning';
  await recordReview(user, card, log, localDateKey(now), kind);
  return card;
}

/** 记一组完成；firstToday=true 表示这一组让今天完成打卡 */
export async function finishGroup(
  startedAt: number,
  now: number = Date.now(),
): Promise<{ streak: StreakInfo; firstToday: boolean }> {
  const { user } = await getDatabases();
  const minutes = Math.min(120, Math.max(0, (now - startedAt) / 60_000));
  const key = localDateKey(now);
  await recordSessionDone(user, key, Math.round(minutes * 10) / 10);
  const day = await getDayStat(user, key);
  notifyDataChanged();
  return { streak: await streakNow(now), firstToday: (day?.sessions ?? 0) === 1 };
}
