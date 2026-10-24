import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import {
  READING_QUESTION_TYPES,
  READING_TYPE_META,
  getReadingLlmStatus,
} from '@/features/reading/service';
import { useLoader } from '@/features/shared';
import { Button, Notice, PressableScale, Screen, Txt } from '@/ui/primitives';
import { radius, space, usePalette } from '@/ui/theme';

/** 阅读板块首页：选题型 */
export default function ReadingHome() {
  const p = usePalette();
  const { data: status } = useLoader(getReadingLlmStatus);
  return (
    <Screen edges={[]}>
      <Txt variant="title" accessibilityRole="header" style={styles.title}>
        阅读
      </Txt>
      {status && !status.ready ? (
        <View testID="reading-unconfigured-notice" style={{ gap: space.md }}>
          <Notice>
            {`还没有配置大模型，没法出题。阅读题由你自己配置的大模型现场出题，还缺：${status.missing.join('、') || '可用的密钥'}。`}
          </Notice>
          <Button
            label="去设置大模型"
            kind="secondary"
            size="md"
            onPress={() => router.push('/settings')}
            testID="reading-index-go-settings"
          />
        </View>
      ) : (
        <Txt variant="callout" tone="secondary">
          每次由你配置的大模型现场写一篇原创短文并配题，做完自动判分、记进练习记录。
        </Txt>
      )}
      <View style={styles.list}>
        {READING_QUESTION_TYPES.map((t) => {
          const m = READING_TYPE_META[t];
          return (
            <PressableScale
              key={t}
              onPress={() => router.push({ pathname: '/reading/[type]', params: { type: t } })}
              accessibilityRole="button"
              accessibilityLabel={`${m.title}，${m.size}`}
              accessibilityHint={m.summary}
              testID={`reading-type-${t}`}
              style={[styles.card, { backgroundColor: p.surface, borderColor: p.border }]}
            >
              <View style={{ flex: 1, minWidth: 0, gap: space.xs }}>
                <View style={styles.head}>
                  <Txt variant="headline">{m.title}</Txt>
                  <Txt variant="caption" tone="tertiary" style={{ fontVariant: ['tabular-nums'] }}>
                    {m.size}
                  </Txt>
                </View>
                <Txt variant="callout" tone="secondary">
                  {m.summary}
                </Txt>
              </View>
              <Ionicons name="chevron-forward" size={18} color={p.textTertiary} />
            </PressableScale>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { paddingTop: space.lg, paddingBottom: space.lg },
  list: { gap: space.md, marginTop: space.lg },
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 88,
  },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, flexWrap: 'wrap' },
});
