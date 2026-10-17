/** 背词会话状态机：加载一组 → 正面 → 翻面 → 评分 →（需要时放回队列）→ 完成页 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { previewIntervals, type UiRating } from '../../lib/fsrs';
import { needsRequeue, requeue } from '../../lib/queue';
import { errorMessage } from '../shared';
import { finishGroup, startGroup, submitRating, type SessionCard } from './service';

export type Phase = 'loading' | 'empty' | 'front' | 'back' | 'done' | 'error';

export interface GroupResult {
  total: number;
  newCount: number;
  ratings: Record<UiRating, number>;
  minutes: number;
  streak: number;
  streakIncreased: boolean;
}

const zeroRatings = (): Record<UiRating, number> => ({ again: 0, hard: 0, good: 0, easy: 0 });

export function useStudySession() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [queue, setQueue] = useState<SessionCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GroupResult | null>(null);
  const [initialSize, setInitialSize] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const busy = useRef(false);
  const [intervals, setIntervals] = useState<Record<UiRating, number> | null>(null);
  const stats = useRef({
    startedAt: 0,
    ratings: zeroRatings(),
    unique: new Set<number>(),
    newCount: 0,
  });

  const load = useCallback(() => {
    startGroup().then(
      (items) => {
        stats.current = {
          startedAt: Date.now(),
          ratings: zeroRatings(),
          unique: new Set(),
          newCount: 0,
        };
        setQueue(items);
        setInitialSize(items.length);
        setDoneCount(0);
        setPhase(items.length === 0 ? 'empty' : 'front');
      },
      (e: unknown) => {
        setError(errorMessage(e));
        setPhase('error');
      },
    );
  }, []);

  useEffect(load, [load]);

  const restart = useCallback(() => {
    setPhase('loading');
    setResult(null);
    load();
  }, [load]);

  const current = queue[0] ?? null;

  const flip = useCallback(() => {
    if (phase !== 'front' || !current) return;
    setIntervals(previewIntervals(current.card, Date.now()));
    setPhase('back');
  }, [phase, current]);

  const rate = useCallback(
    async (rating: UiRating) => {
      if (!current || busy.current) return;
      busy.current = true;
      try {
        const now = Date.now();
        const updated = await submitRating(current, rating, now);
        const s = stats.current;
        s.ratings[rating]++;
        if (!s.unique.has(current.wordId)) {
          s.unique.add(current.wordId);
          if (current.kind === 'new') s.newCount++;
        }
        let rest = queue.slice(1);
        if (needsRequeue(updated, now)) {
          rest = requeue(rest, { ...current, card: updated, kind: 'learning' });
        } else {
          setDoneCount((n) => n + 1);
        }
        if (rest.length === 0) {
          const { streak, firstToday } = await finishGroup(s.startedAt, Date.now());
          setResult({
            total: s.unique.size,
            newCount: s.newCount,
            ratings: { ...s.ratings },
            minutes: Math.max(1, Math.round((Date.now() - s.startedAt) / 60_000)),
            streak: streak.current,
            streakIncreased: firstToday,
          });
          setQueue([]);
          setPhase('done');
        } else {
          setQueue(rest);
          setPhase('front');
        }
      } catch (e) {
        setError(errorMessage(e));
        setPhase('error');
      } finally {
        busy.current = false;
      }
    },
    [current, queue],
  );

  return {
    phase,
    current,
    intervals,
    error,
    result,
    flip,
    rate,
    restart,
    progress: { done: doneCount, total: initialSize, remaining: queue.length },
  };
}
