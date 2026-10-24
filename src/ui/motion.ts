import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, Easing } from 'react-native';

/** 设计准则里的曲线 */
export const easeOut = Easing.bezier(0.23, 1, 0.32, 1);

// 「减少动态效果」：全局只订阅一次，所有组件共享（列表里几十个按钮也只有一个监听）
let reduced = false;
const listeners = new Set<() => void>();
let started = false;

function start(): void {
  if (started) return;
  started = true;
  const set = (v: boolean): void => {
    if (v === reduced) return;
    reduced = v;
    for (const l of listeners) l();
  };
  AccessibilityInfo.isReduceMotionEnabled()
    .then(set)
    .catch(() => undefined);
  AccessibilityInfo.addEventListener('reduceMotionChanged', set);
}

function subscribe(l: () => void): () => void {
  start();
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const getSnapshot = (): boolean => reduced;

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
