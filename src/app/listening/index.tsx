import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import {
  LISTENING_QUESTION_TYPES,
  LISTENING_TYPE_META,
  getListeningLlmStatus,
} from '@/features/listening/service';
import { useLoader } from '@/features/shared';
import { Button, Notice, PressableScale, Screen, Txt } from '@/ui/primitives';
import { radius, space, usePalette } from '@/ui/theme';

/** 听力板块首页：选题型 */
export default function ListeningHome() {
  const p = usePalette();
  const { data: status } = useLoader(getListeningLlmStatus);
  return (
    <Screen edges={[]}>
      <Txt variant="title" accessibilityRole="header" style={styles.title}>
        听力
      </Txt>
      {status && !status.ready ? (
        <View testID="listening-unconfigured-notice" style={{ gap: space.md }}>
          <Notice>
            {`还没有配置大模型，没法出题。听力稿子由你自己配置的大模型现场写，还缺：${status.missing.join('、') || '可用的密钥'}。`}
          </Notice>
          <Button
            label="去设置大模型"
            kind="secondary"
            size="md"
            onPress={() => router.push('/settings')}
            testID="listening-index-go-settings"
          />
        </View>
      ) : (
        <Txt variant="body" tone="secondary">
          大模型现场写一段原创稿子并配题，用手机自带的英语语音分角色朗读。和考试一样先听后答，交卷后再看原文。
        </Txt>
      )}
      <View style={styles.list}>
        {LISTENING_QUESTION_TYPES.map((t) => {
          const m = LISTENING_TYPE_META[t];
          return (
            <PressableScale
              key={t}
              onPress={() => router.push({ pathname: '/listening/[type]', params: { type: t } })}
              accessibilityRole="button"
              accessibilityLabel={`${m.title}，${m.size}`}
              accessibilityHint={m.summary}
              testID={`listening-type-${t}`}
              style={[styles.card, { backgroundColor: p.surface, borderColor: p.border }]}
            >
              <View style={{ flex: 1, minWidth: 0, gap: space.xs }}>
                <Txt variant="overline" tone="tertiary">
                  {m.section}
                </Txt>
                <View style={styles.head}>
                  <Txt variant="headline">{m.title}</Txt>
                  <Txt variant="caption" tone="tertiary" style={{ fontVariant: ['tabular-nums'] }}>
                    {m.size}
                  </Txt>
                </View>
                <Txt variant="body" tone="secondary">
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
