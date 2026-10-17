import { getDatabases } from '../../db/open';
import {
  countCardStates,
  countReviews,
  listDayStats,
  reviewRetention,
  type CardStateCounts,
} from '../../db/userRepo';
import { getMeta } from '../../db/wordsRepo';
import { addDaysToKey, DAY_MS, localDateKey } from '../../lib/date';
import { computeStreak, type StreakInfo } from '../../lib/streak';
import { useLoader } from '../shared';

export interface DayBar {
  date: string;
  label: string;
  count: number;
}

export interface StatsOverview {
  cards: CardStateCounts;
  totalReviews: number;
  /** 近 30 天复习记住率（0–1），没有数据为 null */
  retention30: number | null;
  streak: StreakInfo;
  totalMinutes: number;
  last7: DayBar[];
  wordsSource: string;
  wordsLicense: string;
}

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

export async function loadStats(now: number = Date.now()): Promise<StatsOverview> {
  const { words, user } = await getDatabases();
  const today = localDateKey(now);
  const [cards, totalReviews, ret, days, source, license] = await Promise.all([
    countCardStates(user),
    countReviews(user),
    reviewRetention(user, now - 30 * DAY_MS),
    listDayStats(user),
    getMeta(words, 'source'),
    getMeta(words, 'license'),
  ]);
  const byDate = new Map(days.map((d) => [d.date, d]));
  const last7: DayBar[] = [];
  for (let i = 6; i >= 0; i--) {
    const key = addDaysToKey(today, -i);
    const d = byDate.get(key);
    const [y, m, dd] = key.split('-').map(Number) as [number, number, number];
    last7.push({
      date: key,
      label: i === 0 ? '今天' : `周${WEEK[new Date(y, m - 1, dd).getDay()]}`,
      count: (d?.new_count ?? 0) + (d?.review_count ?? 0),
    });
  }
  return {
    cards,
    totalReviews,
    retention30: ret.total > 0 ? ret.remembered / ret.total : null,
    streak: computeStreak(
      days.map((d) => ({
        date: d.date,
        sessions: d.sessions,
        freezeUsed: d.streak_freeze_used === 1,
      })),
      today,
    ),
    totalMinutes: Math.round(days.reduce((n, d) => n + d.minutes, 0)),
    last7,
    wordsSource: source ?? '',
    wordsLicense: license ?? '',
  };
}

const load = (): Promise<StatsOverview> => loadStats();
export function useStats() {
  return useLoader(load);
}
