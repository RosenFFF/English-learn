import { useLocalSearchParams } from 'expo-router';

import { SubjectiveScreen } from '@/features/subjective/SubjectiveScreen';

/** ?redo=题目 id：从错题本进来重做那道原题 */
export default function WritingScreen() {
  const { redo } = useLocalSearchParams<{ redo?: string }>();
  return <SubjectiveScreen type="essay" redoId={typeof redo === 'string' && redo ? redo : null} />;
}
