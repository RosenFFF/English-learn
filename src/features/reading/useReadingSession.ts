/** 阅读作答页的出题流程（通用流程见 ../generation/useGenerationSession） */
import { useCallback } from 'react';

import { useGenerationSession, type GenerationPhase } from '../generation/useGenerationSession';
import {
  startReadingRedo,
  startReadingSet,
  type PreparedReading,
  type ReadingQuestionType,
} from './service';

export type ReadingPhase = GenerationPhase<PreparedReading>;

/** redoId：错题本重做这道原题（不出题、不需要大模型） */
export function useReadingSession(type: ReadingQuestionType | null, redoId: string | null = null) {
  const start = useCallback(
    (o: { signal: AbortSignal; onProgress: (done: number, total: number) => void }) =>
      redoId ? startReadingRedo(type!, redoId) : startReadingSet(type!, o),
    [type, redoId],
  );
  return useGenerationSession(type ? start : null, { checkLlm: !redoId });
}
