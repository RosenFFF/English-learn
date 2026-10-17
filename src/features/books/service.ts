import { getDatabases } from '../../db/open';
import { activatePlan, getLearnedWordIds, getPlans, updatePlanAmounts } from '../../db/userRepo';
import { getBookWordIds, listBooks, type BookRow } from '../../db/wordsRepo';
import { notifyDataChanged, useLoader } from '../shared';
import { DEFAULT_DAILY_NEW, DEFAULT_DAILY_REVIEW_CAP } from './constants';

export interface BookOverview extends BookRow {
  learned: number;
  active: boolean;
  dailyNew: number;
  dailyReviewCap: number;
}

export async function loadBooksOverview(): Promise<BookOverview[]> {
  const { words, user } = await getDatabases();
  const [books, plans, learned] = await Promise.all([
    listBooks(words),
    getPlans(user),
    getLearnedWordIds(user),
  ]);
  const out: BookOverview[] = [];
  for (const b of books) {
    const ids = await getBookWordIds(words, b.id);
    const plan = plans.find((p) => p.book_id === b.id);
    out.push({
      ...b,
      learned: ids.reduce((n, id) => n + (learned.has(id) ? 1 : 0), 0),
      active: plan?.active === 1,
      dailyNew: plan?.daily_new ?? DEFAULT_DAILY_NEW,
      dailyReviewCap: plan?.daily_review_cap ?? DEFAULT_DAILY_REVIEW_CAP,
    });
  }
  return out;
}

export function useBooksOverview() {
  return useLoader(loadBooksOverview);
}

export async function chooseBook(bookId: string): Promise<void> {
  const { user } = await getDatabases();
  await activatePlan(
    user,
    bookId,
    { dailyNew: DEFAULT_DAILY_NEW, dailyReviewCap: DEFAULT_DAILY_REVIEW_CAP },
    Date.now(),
  );
  notifyDataChanged();
}

export async function setBookAmounts(
  bookId: string,
  dailyNew: number,
  dailyReviewCap: number,
): Promise<void> {
  const { user } = await getDatabases();
  await updatePlanAmounts(user, bookId, dailyNew, dailyReviewCap);
  notifyDataChanged();
}
