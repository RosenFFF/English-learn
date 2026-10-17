import { useCallback, useEffect, useRef, useState } from 'react';

import type { ExamId } from '../../db/wordsRepo';
import type { WordDetail } from '../../lib/words';
import { explainWord, isAiConfigured } from './explain';

export type AiState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; text: string }
  | { status: 'error'; message: string };

/** 卡片背面的 AI 讲解；没配置大模型时 enabled=false，界面不显示入口 */
export function useAiExplain(word: WordDetail | null, exam: ExamId) {
  const [enabled, setEnabled] = useState(false);
  const [state, setState] = useState<AiState>({ status: 'idle' });
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    void isAiConfigured().then(setEnabled);
  }, []);

  // 卡片组件按单词 key 挂载；卸载（换卡）时取消进行中的请求
  useEffect(() => () => ctrl.current?.abort(), []);

  const run = useCallback(async () => {
    if (!word) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setState({ status: 'loading' });
    const r = await explainWord(word, exam, c.signal);
    if (c.signal.aborted) return;
    setState(r.ok ? { status: 'done', text: r.text } : { status: 'error', message: r.message });
  }, [word, exam]);

  return { enabled, state, run };
}
