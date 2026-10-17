/** features 共用：数据变更通知 + 页面聚焦时自动刷新的加载 hook。 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

type Listener = () => void;
const listeners = new Set<Listener>();

/** 写入学习数据后调用，让所有页面重新加载 */
export function notifyDataChanged(): void {
  for (const l of listeners) l();
}

export interface Loaded<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** 加载数据：首次、页面重新聚焦、以及 notifyDataChanged() 时都会刷新 */
export function useLoader<T>(load: () => Promise<T>): Loaded<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  // load 应该是模块级的稳定函数
  const reload = useCallback(() => {
    const id = ++seq.current;
    setLoading(true);
    load()
      .then((d) => {
        if (id === seq.current) {
          setData(d);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (id === seq.current) setError(errorMessage(e));
      })
      .finally(() => {
        if (id === seq.current) setLoading(false);
      });
  }, [load]);

  useFocusEffect(reload);
  useEffect(() => {
    listeners.add(reload);
    return () => {
      listeners.delete(reload);
    };
  }, [reload]);

  return { data, error, loading, reload };
}
