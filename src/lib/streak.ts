/**
 * 连续打卡（纯函数）。规则学多邻国：每天完成 1 组就算打卡，与每日目标分开。
 * 当天还没打卡时，连续天数从昨天往前算（今天结束前都不算断）。
 * 使用冻结卡的日子保住连续但不增加天数。
 */
import { addDaysToKey } from './date';

export interface DayRecord {
  date: string;
  sessions: number;
  freezeUsed: boolean;
}

export interface StreakInfo {
  current: number;
  longest: number;
  todayDone: boolean;
}

export function computeStreak(days: readonly DayRecord[], todayKey: string): StreakInfo {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const done = (k: string): boolean => (byDate.get(k)?.sessions ?? 0) > 0;
  const frozen = (k: string): boolean => byDate.get(k)?.freezeUsed === true && !done(k);

  const todayDone = done(todayKey);
  let current = 0;
  let k = todayDone ? todayKey : addDaysToKey(todayKey, -1);
  for (let guard = 0; guard < 10_000; guard++) {
    if (done(k)) current++;
    else if (!frozen(k)) break;
    k = addDaysToKey(k, -1);
  }

  // 最长连续：按日期排序后扫描
  const keys = [...byDate.keys()].filter((key) => done(key) || frozen(key)).sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const key of keys) {
    run = prev !== null && addDaysToKey(prev, 1) === key ? run : 0;
    if (done(key)) run++;
    longest = Math.max(longest, run);
    prev = key;
  }
  return { current, longest: Math.max(longest, current), todayDone };
}
