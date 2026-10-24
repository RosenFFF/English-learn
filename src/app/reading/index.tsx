import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { READING_QUESTION_TYPES, READING_TYPE_META } from '@/features/reading/service';
import { Notice, PressableScale, Screen, Txt } from '@/ui/primitives';
import { radius, space, usePalette } from '@/ui/theme';

/** 阅读板块首页：选题型 */
export default function ReadingHome() {
  const p = usePalette();
  return (
    <Screen edges={[]}>
      <Txt variant="title" accessibilityRole="header" style={styles.title}>
        阅读
      </Txt>
      <Notice tone="info">
        现在用的是内置的原创示例题，先熟悉作答方式；接入题库后会由你配置的大模型出题。
      </Notice>
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
