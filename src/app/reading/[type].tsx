import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CarefulView } from '@/features/reading/CarefulView';
import { ClozeView } from '@/features/reading/ClozeView';
import { MatchingView } from '@/features/reading/MatchingView';
import {
  READING_TYPE_META,
  answeredCount,
  gradeSheet,
  isReadingQuestionType,
  loadReadingSet,
  needsExitConfirm,
  parseReadingSource,
  submitPrompt,
  useAnswerSheet,
  type ReadingSet,
} from '@/features/reading/service';
import { confirmAsync } from '@/ui/confirm';
import { Button, ProgressBar, Screen, Txt } from '@/ui/primitives';
import { MAX_WIDTH, radius, space, usePalette } from '@/ui/theme';

function leave(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/reading');
}

function Attempt({ set }: { set: ReadingSet }) {
  const p = usePalette();
  const [sheet, dispatch] = useAnswerSheet(set);
  const [leaving, setLeaving] = useState(false);
  const grade = useMemo(() => (sheet.submitted ? gradeSheet(set, sheet) : null), [set, sheet]);
  const meta = READING_TYPE_META[set.type];
  const done = answeredCount(sheet);
  const total = sheet.answers.length;

  // 中途退出（关闭按钮、系统返回、iOS 侧滑）：答过题还没提交时先确认
  usePreventRemove(needsExitConfirm(sheet) && !leaving, ({ repeat }) => {
    void confirmAsync('退出这次练习？', `已经答了 ${done} 题，退出后不会保存。`, '退出').then(
      (ok) => {
        if (!ok) return;
        setLeaving(true);
        repeat();
      },
    );
  });

  const submit = async (): Promise<void> => {
    const { title, message } = submitPrompt(sheet);
    if (await confirmAsync(title, message, '提交')) dispatch({ type: 'submit' });
  };

  const view =
    set.type === 'banked_cloze' ? (
      <ClozeView set={set} sheet={sheet} grade={grade} dispatch={dispatch} />
    ) : set.type === 'matching' ? (
      <MatchingView set={set} sheet={sheet} grade={grade} dispatch={dispatch} />
    ) : (
      <CarefulView set={set} sheet={sheet} grade={grade} dispatch={dispatch} />
    );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }} edges={['top', 'bottom']}>
      <View style={styles.topWrap}>
        <View style={styles.top}>
          <Pressable
            onPress={leave}
            accessibilityRole="button"
            accessibilityLabel="退出练习"
            hitSlop={6}
            style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: p.surfaceAlt }]}
            testID="reading-close"
          >
            <Ionicons name="close" size={26} color={p.textSecondary} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
            <View style={styles.titleRow}>
              <Txt variant="headline" numberOfLines={1} style={{ flexShrink: 1 }}>
                {meta.title}
              </Txt>
              <Txt
                variant="caption"
                tone="secondary"
                style={{ fontVariant: ['tabular-nums'] }}
                testID="reading-progress"
              >
                {grade ? `答对 ${grade.score}/${total}` : `已答 ${done}/${total}`}
              </Txt>
            </View>
            <ProgressBar
              value={grade ? grade.score / total : done / total}
              color={grade ? p.success : undefined}
              label={grade ? '得分' : '答题进度'}
            />
          </View>
          {grade ? null : (
            <Pressable
              onPress={() => void submit()}
              accessibilityRole="button"
              accessibilityLabel={`提交，已答 ${done} 题，共 ${total} 题`}
              style={({ pressed }) => [
                styles.submit,
                {
                  backgroundColor: done > 0 ? p.primary : p.surfaceAlt,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
              testID="reading-submit"
            >
              <Txt
                variant="callout"
                style={{ fontWeight: '600', color: done > 0 ? p.primaryText : p.textSecondary }}
              >
                提交
              </Txt>
            </Pressable>
          )}
        </View>
      </View>

      <View style={{ flex: 1 }}>{view}</View>

      {grade ? (
        <View style={[styles.footer, { borderColor: p.border, backgroundColor: p.bg }]}>
          <View style={styles.footerInner}>
            <View style={{ flex: 1 }}>
              <Button
                label="再做一遍"
                kind="secondary"
                size="md"
                onPress={() => dispatch({ type: 'reset' })}
                testID="reading-retry"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="完成" size="md" onPress={leave} testID="reading-done" />
            </View>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

export default function ReadingAttemptScreen() {
  const { type, demo } = useLocalSearchParams<{ type: string; demo?: string }>();
  const source = parseReadingSource(demo);
  const set = useMemo(
    () => (isReadingQuestionType(type) ? loadReadingSet(type, source) : null),
    [type, source],
  );

  if (!set)
    return (
      <Screen>
        <View style={styles.center} testID="reading-not-found">
          <Txt variant="headline">没有这种题型。</Txt>
          <View style={{ marginTop: space.lg, alignSelf: 'stretch' }}>
            <Button label="回到阅读" kind="secondary" onPress={() => router.replace('/reading')} />
          </View>
        </View>
      </Screen>
    );
  // 换一套题（id 变了）时重新建答题卡
  return <Attempt key={set.id} set={set} />;
}

const styles = StyleSheet.create({
  topWrap: { alignItems: 'center', paddingHorizontal: space.sm },
  top: {
    width: '100%',
    maxWidth: MAX_WIDTH + space.lg * 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submit: {
    minHeight: 44,
    minWidth: 64,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.sm,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  footerInner: { width: '100%', maxWidth: MAX_WIDTH, flexDirection: 'row', gap: space.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
});
