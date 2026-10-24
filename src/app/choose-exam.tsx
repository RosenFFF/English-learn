import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { leaveExamPicker, parseExamPickerFrom } from '@/features/exam/navigation';
import {
  chooseExam,
  EXAMS,
  STATUS_LABEL,
  useSelectedExam,
  type ExamMeta,
} from '@/features/exam/service';
import { errorMessage } from '@/features/shared';
import { Notice, PressableScale, Screen, Txt } from '@/ui/primitives';
import { radius, space, usePalette } from '@/ui/theme';

function ExamCard({
  exam,
  current,
  onPick,
}: {
  exam: ExamMeta;
  current: boolean;
  onPick: (exam: ExamMeta) => void;
}) {
  const p = usePalette();
  const soon = exam.status !== 'available';
  const color = p.exam[exam.id];
  return (
    <PressableScale
      onPress={() => onPick(exam)}
      disabled={soon}
      accessibilityRole="button"
      accessibilityLabel={`${exam.name}${soon ? `，${STATUS_LABEL.coming_soon}` : ''}${current ? '，当前考试' : ''}`}
      accessibilityHint={soon ? undefined : '选这门考试，进入它的首页'}
      accessibilityState={{ disabled: soon, selected: current }}
      testID={`exam-${exam.id}`}
      style={[
        styles.card,
        {
          backgroundColor: p.surface,
          borderColor: current ? color : p.border,
          borderWidth: current ? 2 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: soon ? p.border : color }]} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="headline" numberOfLines={1}>
          {exam.name}
        </Txt>
        <Txt variant="caption" tone="secondary" numberOfLines={2}>
          {exam.tagline}
        </Txt>
      </View>
      {soon ? (
        <View style={[styles.pill, { backgroundColor: p.surfaceAlt }]}>
          <Txt variant="overline" tone="tertiary">
            {STATUS_LABEL.coming_soon}
          </Txt>
        </View>
      ) : current ? (
        <View style={[styles.pill, { backgroundColor: color }]}>
          <Txt variant="overline" style={{ color: '#fff' }}>
            当前
          </Txt>
        </View>
      ) : (
        <Txt variant="headline" tone="tertiary" importantForAccessibility="no">
          ›
        </Txt>
      )}
    </PressableScale>
  );
}

export default function ChooseExamScreen() {
  const params = useLocalSearchParams<{ from?: string }>();
  const from = parseExamPickerFrom(params.from);
  const { data: current } = useSelectedExam();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const pick = (exam: ExamMeta): void => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    chooseExam(exam.id).then(
      () => {
        setBusy(false);
        leaveExamPicker(from);
      },
      (e: unknown) => {
        setBusy(false);
        setFailure(`没能保存选择：${errorMessage(e)}`);
      },
    );
  };

  return (
    <>
      {/* 首次启动没有返回的地方，不显示导航栏；从首页或「我的」进来时显示返回按钮 */}
      <Stack.Screen options={{ headerShown: Boolean(from), title: '切换考试' }} />
      <Screen edges={from ? [] : ['top']}>
        <View style={styles.header}>
          <Txt variant="title" accessibilityRole="header">
            你在准备哪门考试？
          </Txt>
          <Txt variant="callout" tone="secondary" style={{ marginTop: space.xs }}>
            之后可以在「我的」切换
          </Txt>
        </View>
        <View style={{ gap: space.md }}>
          {EXAMS.map((e) => (
            <ExamCard key={e.id} exam={e} current={current === e.id} onPick={pick} />
          ))}
        </View>
        {failure ? (
          <View style={{ marginTop: space.md }}>
            <Notice>{failure}</Notice>
          </View>
        ) : null}
        <Txt variant="caption" tone="tertiary" style={{ marginTop: space.lg, textAlign: 'center' }}>
          切换考试不会影响已经背过的单词进度
        </Txt>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: space.xxl, paddingBottom: space.xl },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderRadius: radius.lg,
    padding: space.lg,
    minHeight: 76,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  pill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
});
