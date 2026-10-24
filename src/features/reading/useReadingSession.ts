/** 阅读作答页的出题流程（通用流程见 ../generation/useGenerationSession） */
import { useCallback } from 'react';

import { useGenerationSession, type GenerationPhase } from '../generation/useGenerationSession';
import { startReadingSet, type PreparedReading, type ReadingQuestionType } from './service';

export type ReadingPhase = GenerationPhase<PreparedReading>;

export function useReadingSession(type: ReadingQuestionType | null) {
  const start = useCallback(
    (o: { signal: AbortSignal; onProgress: (done: number, total: number) => void }) =>
      startReadingSet(type!, o),
    [type],
  );
  return useGenerationSession(type ? start : null);
}
