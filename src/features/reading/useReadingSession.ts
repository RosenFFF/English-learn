/** 作答页的出题流程：检查大模型配置 → 出题（可取消）→ 作答；失败可重试，从设置页回来自动重查。 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  describeReadingError,
  getReadingLlmStatus,
  isAbort,
  startReadingSet,
  type PreparedReading,
  type ReadingQuestionType,
  type ReadingSet,
} from './service';

export type ReadingPhase =
  | { kind: 'checking' }
  | { kind: 'unconfigured'; missing: string[]; keyUnreadable: boolean }
  | { kind: 'generating'; done: number; total: number }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready';
      set: ReadingSet;
      /** 题库里读不出来、被跳过的旧题（中文原因） */
      skipped: PreparedReading['skipped'];
      startedAt: number;
    };

export function useReadingSession(type: ReadingQuestionType | null) {
  const [phase, setPhase] = useState<ReadingPhase>({ kind: 'checking' });
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  const ctrl = useRef<AbortController | null>(null);

  const start = useCallback(async () => {
    if (!type) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setPhase({ kind: 'checking' });
    try {
      const status = await getReadingLlmStatus();
      if (c.signal.aborted) return;
      if (!status.ready) {
        setPhase({
          kind: 'unconfigured',
          missing: status.missing,
          keyUnreadable: status.keyUnreadable,
        });
        return;
      }
      setPhase({ kind: 'generating', done: 0, total: 1 });
      const { set, skipped } = await startReadingSet(type, {
        signal: c.signal,
        onProgress: (done, total) => {
          if (!c.signal.aborted) setPhase({ kind: 'generating', done, total });
        },
      });
      if (!c.signal.aborted) setPhase({ kind: 'ready', set, skipped, startedAt: Date.now() });
    } catch (e) {
      if (c.signal.aborted || isAbort(e)) return;
      setPhase({ kind: 'error', message: describeReadingError(e) });
    }
  }, [type]);

  // 第一次进来，以及从设置页填完回来时（之前是「未配置」）重新检查
  useFocusEffect(
    useCallback(() => {
      const k = phaseRef.current.kind;
      if (k === 'checking' || k === 'unconfigured') void start();
    }, [start]),
  );
  useEffect(() => () => ctrl.current?.abort(), []);

  /** 取消出题（退出页面时） */
  const cancel = useCallback(() => ctrl.current?.abort(), []);
  /** 再做一遍：同一套题重新计时 */
  const restart = useCallback(() => {
    setPhase((p) => (p.kind === 'ready' ? { ...p, startedAt: Date.now() } : p));
  }, []);

  return { phase, retry: start, cancel, restart };
}
