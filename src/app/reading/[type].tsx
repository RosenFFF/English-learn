import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CarefulView } from '@/features/reading/CarefulView';
import { ClozeView } from '@/features/reading/ClozeView';
import { MatchingView } from '@/features/reading/MatchingView';
import {
  READING_TYPE_META,
  answeredCount,
  describeReadingError,
  gradeSheet,
  isReadingQuestionType,
  needsExitConfirm,
  submitPrompt,
  submitReadingSet,
  useAnswerSheet,
  type ReadingQuestionType,
  type ReadingSet,
} from '@/features/reading/service';
import { useReadingSession, type ReadingPhase } from '@/features/reading/useReadingSession';
import { confirmAsync } from '@/ui/confirm';
import { Button, Notice, ProgressBar, Screen, Txt } from '@/ui/primitives';
import { MAX_WIDTH, radius, space, usePalette } from '@/ui/theme';

function leave(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/reading');
}

type SaveState = { kind: 'idle' | 'saving' | 'saved' } | { kind: 'failed'; message: string };

function Attempt({
  set,
  skipped,
  startedAt,
  onRestart,
}: {
  set: ReadingSet;
  /** 题库里读不出来、被跳过的旧题的原因 */
  skipped: string[];
  startedAt: number;
  onRestart: () => void;
}) {
  const p = usePalette();
  const [sheet, dispatch] = useAnswerSheet(set);
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
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
    if (!(await confirmAsync(title, message, '提交'))) return;
    dispatch({ type: 'submit' });
    setSave({ kind: 'saving' });
    try {
      await submitReadingSet(set, sheet, startedAt);
      setSave({ kind: 'saved' });
    } catch (e) {
      setSave({ kind: 'failed', message: describeReadingError(e).replace(/^出题失败：/, '') });
    }
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

      {skipped.length > 0 && !grade ? (
        <View style={styles.skipped} testID="reading-skipped">
          <Notice>
            {`题库里有 ${skipped.length} 道没做过的旧题读不出来，已跳过：${[...new Set(skipped)].join('；')}`}
          </Notice>
        </View>
      ) : null}
      <View style={{ flex: 1 }}>{view}</View>

      {grade ? (
        <View style={[styles.footer, { borderColor: p.border, backgroundColor: p.bg }]}>
          <Txt
            variant="caption"
            tone={save.kind === 'failed' ? 'danger' : 'tertiary'}
            style={styles.saveNote}
            testID="reading-saved"
          >
            {save.kind === 'saving'
              ? '正在保存到练习记录…'
              : save.kind === 'saved'
                ? '已保存到练习记录'
                : save.kind === 'failed'
                  ? `练习记录没保存上：${save.message}`
                  : ''}
          </Txt>
          <View style={styles.footerInner}>
            <View style={{ flex: 1 }}>
              <Button
                label="再做一遍"
                kind="secondary"
                size="md"
                onPress={() => {
                  dispatch({ type: 'reset' });
                  setSave({ kind: 'idle' });
                  onRestart();
                }}
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

/** 出题前后的几种状态共用的页面：左上角关闭 + 标题 + 内容居中 */
function StatusPage({ title, children }: { title: string; children: ReactNode }) {
  const p = usePalette();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }} edges={['top', 'bottom']}>
      <View style={styles.topWrap}>
        <View style={styles.top}>
          <Pressable
            onPress={leave}
            accessibilityRole="button"
            accessibilityLabel="返回"
            hitSlop={6}
            style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: p.surfaceAlt }]}
            testID="reading-close"
          >
            <Ionicons name="close" size={26} color={p.textSecondary} />
          </Pressable>
          <Txt variant="headline" numberOfLines={1} style={{ flex: 1 }}>
            {title}
          </Txt>
        </View>
      </View>
      <View style={styles.statusBody}>
        <View style={styles.statusInner}>{children}</View>
      </View>
    </SafeAreaView>
  );
}

function PhaseView({
  type,
  phase,
  retry,
}: {
  type: ReadingQuestionType;
  phase: Exclude<ReadingPhase, { kind: 'ready' }>;
  retry: () => void;
}) {
  const p = usePalette();
  const meta = READING_TYPE_META[type];
  switch (phase.kind) {
    case 'checking':
      return (
        <StatusPage title={meta.title}>
          <ActivityIndicator color={p.primary} accessibilityLabel="加载中" />
        </StatusPage>
      );
    case 'unconfigured':
      return (
        <StatusPage title={meta.title}>
          <View testID="reading-unconfigured" style={{ gap: space.md, alignSelf: 'stretch' }}>
            <View style={[styles.badge, { backgroundColor: p.warningSoft }]}>
              <Ionicons name="sparkles-outline" size={26} color={p.warningText} />
            </View>
            <Txt variant="title" style={{ textAlign: 'center' }} accessibilityRole="header">
              还没有配置大模型
            </Txt>
            <Txt variant="body" tone="secondary" style={{ textAlign: 'center' }}>
              阅读题由你自己配置的大模型现场出题，每次都是新写的原创短文。
              {phase.missing.length ? `还缺：${phase.missing.join('、')}。` : ''}
            </Txt>
            {phase.keyUnreadable ? (
              <Notice>密钥无法读取（可能是换了手机），请重新填写。</Notice>
            ) : null}
            <View style={{ marginTop: space.md }}>
              <Button
                label="去设置大模型"
                onPress={() => router.push('/settings')}
                testID="reading-go-settings"
              />
            </View>
            <Txt variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>
              填好后回到这里会自动开始出题
            </Txt>
          </View>
        </StatusPage>
      );
    case 'generating':
      return (
        <StatusPage title={meta.title}>
          <View
            testID="reading-generating"
            style={{ gap: space.md, alignItems: 'center' }}
            accessibilityLiveRegion="polite"
          >
            <ActivityIndicator size="large" color={p.primary} />
            <Txt variant="headline" style={{ textAlign: 'center' }}>
              正在出题…
            </Txt>
            <Txt variant="callout" tone="secondary" style={{ textAlign: 'center' }}>
              大模型正在写一篇原创短文并配题，通常需要 20 秒到 1 分钟。
            </Txt>
            {phase.total > 1 ? (
              <Txt
                variant="caption"
                tone="tertiary"
                style={{ fontVariant: ['tabular-nums'] }}
                testID="reading-generating-progress"
              >
                {`已准备好 ${phase.done}/${phase.total} 篇`}
              </Txt>
            ) : null}
            <View style={{ alignSelf: 'stretch', marginTop: space.md }}>
              <Button label="取消" kind="secondary" size="md" onPress={leave} />
            </View>
          </View>
        </StatusPage>
      );
    case 'error':
      return (
        <StatusPage title={meta.title}>
          <View testID="reading-error" style={{ gap: space.md, alignSelf: 'stretch' }}>
            <Txt variant="headline" style={{ textAlign: 'center' }}>
              这次没出成题
            </Txt>
            <Txt
              variant="body"
              tone="danger"
              style={{ textAlign: 'center' }}
              accessibilityRole="alert"
              testID="reading-error-message"
            >
              {phase.message}
            </Txt>
            <View style={{ marginTop: space.md, gap: space.md }}>
              <Button label="重试" onPress={retry} testID="reading-retry-generate" />
              <Button
                label="检查大模型设置"
                kind="secondary"
                size="md"
                onPress={() => router.push('/settings')}
              />
            </View>
          </View>
        </StatusPage>
      );
  }
}

function Session({ type }: { type: ReadingQuestionType }) {
  const { phase, retry, restart } = useReadingSession(type);
  if (phase.kind !== 'ready')
    return <PhaseView type={type} phase={phase} retry={() => void retry()} />;
  // 换一套题（id 变了）时重新建答题卡
  return (
    <Attempt
      key={phase.set.id}
      set={phase.set}
      skipped={phase.skipped.map((x) => x.error)}
      startedAt={phase.startedAt}
      onRestart={restart}
    />
  );
}

export default function ReadingAttemptScreen() {
  const { type } = useLocalSearchParams<{ type: string }>();
  if (!isReadingQuestionType(type))
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
  return <Session type={type} />;
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
    paddingTop: space.sm,
    paddingBottom: space.md,
    alignItems: 'center',
  },
  footerInner: { width: '100%', maxWidth: MAX_WIDTH, flexDirection: 'row', gap: space.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  statusBody: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: space.xl },
  statusInner: { width: '100%', maxWidth: 420, alignItems: 'center' },
  badge: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  skipped: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  saveNote: { textAlign: 'center', marginBottom: space.sm, minHeight: 18 },
});
