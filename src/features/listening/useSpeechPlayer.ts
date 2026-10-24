/** 听力页的朗读器：一页一个播放器；页面失焦时暂停、卸载时停止，不会在别的页面继续念。 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import type { SpeechItem } from '../../lib/exam/listening';
import { loadVoicePlan, newSpeechPlayer, type PlayerSnapshot, type SpeechPlayer } from './service';

export function useSpeechPlayer(
  items: readonly SpeechItem[],
  rate: number,
): [PlayerSnapshot, SpeechPlayer] {
  const [player] = useState(() => newSpeechPlayer({ items, rate }));
  const snap = useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot);

  useEffect(() => player.setItems(items), [player, items]);
  useEffect(() => player.setRate(rate), [player, rate]);
  useEffect(() => {
    let alive = true;
    void loadVoicePlan().then((plan) => {
      if (alive) player.setVoices(plan);
    });
    return () => {
      alive = false;
    };
  }, [player]);
  useEffect(() => () => player.stop(), [player]);
  // 切到别的页面（比如去设置）时暂停
  useFocusEffect(useCallback(() => () => player.dispatch({ type: 'pause' }), [player]));

  return [snap, player];
}
