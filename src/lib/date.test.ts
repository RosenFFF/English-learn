import { addDaysToKey, endOfLocalDay, formatInterval, localDateKey, startOfLocalDay } from './date';

describe('date', () => {
  it('本地日期键与加减天数', () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05');
    expect(addDaysToKey('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDaysToKey('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('一天的开始和结束', () => {
    const t = new Date(2026, 9, 17, 15, 30).getTime();
    expect(startOfLocalDay(t)).toBe(new Date(2026, 9, 17).getTime());
    expect(endOfLocalDay(t)).toBe(new Date(2026, 9, 18).getTime() - 1);
  });

  it('间隔格式化', () => {
    expect(formatInterval(30_000)).toBe('1分钟');
    expect(formatInterval(10 * 60_000)).toBe('10分钟');
    expect(formatInterval(3 * 3_600_000)).toBe('3小时');
    expect(formatInterval(3 * 86_400_000)).toBe('3天');
    expect(formatInterval(65 * 86_400_000)).toBe('2个月');
    expect(formatInterval(400 * 86_400_000)).toBe('1.1年');
  });
});
