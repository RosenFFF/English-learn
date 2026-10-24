/** 现场出题的页面流程：检查大模型配置 → 出题（可取消）→ 作答；失败可重试，从设置页回来自动重查。 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { describeGenerationError, getGenerationLlmStatus, isAbort } from './llm';

export interface StartOptions {
  signal: AbortSignal;
  onProgress: (done: number, total: number) => void;
}

export type GenerationPhase<T> =
  | { kind: 'checking' }
  | { kind: 'unconfigured'; missing: string[]; keyUnreadable: boolean }
  | { kind: 'generating'; done: number; total: number }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; value: T; startedAt: number };

/** start 为 null 时什么都不做（比如路由参数不合法） */
export function useGenerationSession<T>(start: ((o: StartOptions) => Promise<T>) | null) {
  const [phase, setPhase] = useState<GenerationPhase<T>>({ kind: 'checking' });
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  const ctrl = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    if (!start) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setPhase({ kind: 'checking' });
    try {
      const status = await getGenerationLlmStatus();
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
      const value = await start({
        signal: c.signal,
        onProgress: (done, total) => {
          if (!c.signal.aborted) setPhase({ kind: 'generating', done, total });
        },
      });
      if (!c.signal.aborted) setPhase({ kind: 'ready', value, startedAt: Date.now() });
    } catch (e) {
      if (c.signal.aborted || isAbort(e)) return;
      setPhase({ kind: 'error', message: describeGenerationError(e) });
    }
  }, [start]);

  // 第一次进来，以及从设置页填完回来时（之前是「未配置」）重新检查
  useFocusEffect(
    useCallback(() => {
      const k = phaseRef.current.kind;
      if (k === 'checking' || k === 'unconfigured') void run();
    }, [run]),
  );
  useEffect(() => () => ctrl.current?.abort(), []);

  const cancel = useCallback(() => ctrl.current?.abort(), []);
  /** 同一套题重新计时 */
  const restart = useCallback(() => {
    setPhase((p) => (p.kind === 'ready' ? { ...p, startedAt: Date.now() } : p));
  }, []);

  return { phase, retry: run, cancel, restart };
}
