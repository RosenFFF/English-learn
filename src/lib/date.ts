/** 日期工具（纯函数）。数据库里时间一律存 Unix 毫秒；「哪一天」按设备本地时区的自然日计算。 */

export const DAY_MS = 86_400_000;

const pad = (n: number): string => String(n).padStart(2, '0');

/** 本地日期键 YYYY-MM-DD */
export function localDateKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** 本地当天 23:59:59.999 */
export function endOfLocalDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - 1;
}

/** 在日期键上加减天数（按日历，避开夏令时问题） */
export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return localDateKey(new Date(y, m - 1, d + days, 12).getTime());
}

/** 把毫秒间隔格式化成按钮下方的小字：「1分钟」「10分钟」「3天」「2个月」 */
export function formatInterval(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min}分钟`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}小时`;
  const d = Math.round(ms / DAY_MS);
  if (d < 31) return `${d}天`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo}个月`;
  return `${(d / 365).toFixed(1).replace(/\.0$/, '')}年`;
}
