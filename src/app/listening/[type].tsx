import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ListeningSession } from '@/features/listening/ListeningScreen';
import { isListeningQuestionType } from '@/features/listening/service';
import { Button, Screen, Txt } from '@/ui/primitives';
import { space } from '@/ui/theme';

/** /listening/[type]，?redo=题目 id：从错题本进来重做那道原题 */
export default function ListeningAttemptScreen() {
  const { type, redo } = useLocalSearchParams<{ type: string; redo?: string }>();
  if (!isListeningQuestionType(type))
    return (
      <Screen>
        <View style={styles.center} testID="listening-not-found">
          <Txt variant="headline">没有这种题型。</Txt>
          <View style={{ marginTop: space.lg, alignSelf: 'stretch' }}>
            <Button
              label="回到听力"
              kind="secondary"
              onPress={() => router.replace('/listening')}
            />
          </View>
        </View>
      </Screen>
    );
  return <ListeningSession type={type} redoId={typeof redo === 'string' && redo ? redo : null} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
});
