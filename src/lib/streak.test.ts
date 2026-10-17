import { computeStreak, type DayRecord } from './streak';

const d = (date: string, sessions = 1, freezeUsed = false): DayRecord => ({
  date,
  sessions,
  freezeUsed,
});

describe('连续打卡', () => {
  it('没有记录为 0', () => {
    expect(computeStreak([], '2026-10-17')).toEqual({ current: 0, longest: 0, todayDone: false });
  });

  it('今天已打卡：从今天往前数', () => {
    const r = computeStreak([d('2026-10-15'), d('2026-10-16'), d('2026-10-17')], '2026-10-17');
    expect(r).toEqual({ current: 3, longest: 3, todayDone: true });
  });

  it('今天还没打卡：昨天之前的连续仍然有效（今天结束前不算断）', () => {
    const r = computeStreak([d('2026-10-15'), d('2026-10-16')], '2026-10-17');
    expect(r.current).toBe(2);
    expect(r.todayDone).toBe(false);
  });

  it('只有学习量但没完成一组（sessions=0）不算打卡', () => {
    expect(computeStreak([d('2026-10-17', 0)], '2026-10-17').current).toBe(0);
  });

  it('中间断一天就重新计算，最长连续保留', () => {
    const r = computeStreak(
      [d('2026-10-01'), d('2026-10-02'), d('2026-10-03'), d('2026-10-05'), d('2026-10-06')],
      '2026-10-06',
    );
    expect(r.current).toBe(2);
    expect(r.longest).toBe(3);
  });

  it('前天之前的连续，昨天也没打卡 → 已断', () => {
    expect(computeStreak([d('2026-10-14'), d('2026-10-15')], '2026-10-17').current).toBe(0);
  });

  it('冻结卡保住连续但不增加天数', () => {
    const r = computeStreak(
      [d('2026-10-14'), d('2026-10-15', 0, true), d('2026-10-16'), d('2026-10-17')],
      '2026-10-17',
    );
    expect(r.current).toBe(3);
  });

  it('跨月、跨年连续', () => {
    expect(computeStreak([d('2025-12-31'), d('2026-01-01')], '2026-01-01').current).toBe(2);
    expect(computeStreak([d('2026-09-30'), d('2026-10-01')], '2026-10-01').current).toBe(2);
  });
});
