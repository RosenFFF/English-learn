import { useEffect, useState } from 'react';
import { AccessibilityInfo, Easing } from 'react-native';

/** 设计准则里的曲线 */
export const easeOut = Easing.bezier(0.23, 1, 0.32, 1);

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduced(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}
