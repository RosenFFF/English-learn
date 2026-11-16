import { router, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CarefulView } from '@/features/reading/CarefulView';
import { ClozeView } from '@/features/reading/ClozeView';
import { MatchingView } from '@/features/reading/MatchingView';
import {
  READING_TYPE_META,
  answeredCount,
  gradeSheet,
  isReadingQuestionType,
  needsExitConfirm,
  redoOutcomeText,
  unsavedLeaveCopy,
  unsavedResetCopy,
  unsavedSubmitGuard,
  submitPrompt,
  submitReadingSet,
  useAnswerSheet,
  type ReadingQuestionType,
  type ReadingSet,
} from '@/features/reading/service';
import { useReadingSession } from '@/features/reading/useReadingSession';
import { practiceSaveError } from '@/features/generation/llm';
import { GenerationPhaseView, PracticeTopBar } from '@/features/generation/views';
import { confirmAsync } from '@/ui/confirm';
import { Button, Notice, Screen, Txt } from '@/ui/primitives';
import { MAX_WIDTH, space, usePalette } from '@/ui/theme';

function leave(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/reading');
}

/** 错题本重做：没有上一页时回错题本 */
function leaveRedo(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/mistakes');
}

type SaveState =
  | { kind: 'idle' | 'saving' }
  | { kind: 'saved'; wrongCount: number }
  | { kind: 'failed'; message: string };

function Attempt({
  set,
  skipped,
  startedAt,
  onRestart,
  redo,
}: {
  set: ReadingSet;
  /** 题库里读不出来、被跳过的旧题的原因 */
  skipped: string[];
  startedAt: number;
  onRestart: () => void;
  /** 从错题本进来重做这道原题 */
  redo: boolean;
}) {
  const p = usePalette();
  const exit = redo ? leaveRedo : leave;
  const [sheet, dispatch] = useAnswerSheet(set);
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const [leaving, setLeaving] = useState(false);
  const grade = useMemo(() => (sheet.submitted ? gradeSheet(set, sheet) : null), [set, sheet]);
  const meta = READING_TYPE_META[set.type];
  const done = answeredCount(sheet);
  const total = sheet.answers.length;
  const saveLock = useRef(false);

  // 中途退出（关闭、完成、系统返回）：没交卷，或交了但练习记录没写上，都先确认
  const failedSave = unsavedSubmitGuard(sheet.submitted, save.kind);
  usePreventRemove((needsExitConfirm(sheet) || failedSave) && !leaving, ({ repeat }) => {
    const copy = failedSave
      ? unsavedLeaveCopy()
      : {
          title: '退出这次练习？',
          message: `已经答了 ${done} 题，退出后不会保存。`,
          confirm: '退出',
        };
    void confirmAsync(copy.title, copy.message, copy.confirm).then((ok) => {
      if (!ok) return;
      setLeaving(true);
      repeat();
    });
  });

  const writeOnce = useCallback(async (): Promise<void> => {
    setSave({ kind: 'saving' });
    try {
      const { wrongCount } = await submitReadingSet(set, sheet, startedAt);
      setSave({ kind: 'saved', wrongCount });
    } catch (e) {
      setSave({ kind: 'failed', message: practiceSaveError(e) });
    }
  }, [set, sheet, startedAt]);

  // 确认框还开着、或正在写库时，再点一次直接忽略。失败后的「重试保存」走同一把锁。
  const persist = useCallback(async (): Promise<void> => {
    if (saveLock.current) return;
    saveLock.current = true;
    try {
      await writeOnce();
    } finally {
      saveLock.current = false;
    }
  }, [writeOnce]);

  const submit = async (): Promise<void> => {
    if (saveLock.current || sheet.submitted) return;
    saveLock.current = true;
    try {
      const { title, message } = submitPrompt(sheet);
      if (!(await confirmAsync(title, message, '提交'))) return;
      dispatch({ type: 'submit' });
      await writeOnce();
    } finally {
      saveLock.current = false;
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
      <PracticeTopBar
        title={redo ? `重做 · ${meta.title}` : meta.title}
        onClose={exit}
        closeLabel="退出练习"
        testIDPrefix="reading"
        status={grade ? `答对 ${grade.score}/${total}` : `已答 ${done}/${total}`}
        progress={{
          value: grade ? grade.score / total : done / total,
          color: grade ? p.success : undefined,
          label: grade ? '得分' : '答题进度',
        }}
        submit={
          grade
            ? undefined
            : {
                label: '提交',
                accessibilityLabel: `提交，已答 ${done} 题，共 ${total} 题`,
                active: done > 0,
                onPress: () => void submit(),
              }
        }
      />

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
            accessibilityRole={save.kind === 'failed' ? 'alert' : undefined}
            accessibilityLiveRegion="polite"
            testID="reading-saved"
          >
            {save.kind === 'saving'
              ? '正在保存到练习记录…'
              : save.kind === 'saved'
                ? redo
                  ? `已保存 · ${redoOutcomeText({ kind: 'objective', wrongCount: save.wrongCount })}`
                  : '已保存到练习记录'
                : save.kind === 'failed'
                  ? save.message
                  : ''}
          </Txt>
          {save.kind === 'failed' ? (
            <View style={[styles.footerInner, { marginBottom: space.sm }]}>
              <View style={{ flex: 1 }}>
                <Button
                  label="重试保存"
                  size="md"
                  onPress={() => void persist()}
                  accessibilityHint="再保存这次作答，已选答案会保留"
                  testID="reading-retry-save"
                />
              </View>
            </View>
          ) : null}
          <View style={styles.footerInner}>
            <View style={{ flex: 1 }}>
              <Button
                label="再做一遍"
                kind="secondary"
                size="md"
                disabled={save.kind === 'saving'}
                onPress={() => {
                  void (async () => {
                    if (unsavedSubmitGuard(sheet.submitted, save.kind)) {
                      const copy = unsavedResetCopy();
                      if (!(await confirmAsync(copy.title, copy.message, copy.confirm))) return;
                    }
                    dispatch({ type: 'reset' });
                    setSave({ kind: 'idle' });
                    onRestart();
                  })();
                }}
                testID="reading-retry"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="完成"
                size="md"
                disabled={save.kind === 'saving'}
                onPress={exit}
                testID="reading-done"
              />
            </View>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const PHASE_COPY = {
  unconfigured: '阅读题由你自己配置的大模型现场出题，每次都是新写的原创短文。',
  generating: '大模型正在写一篇原创短文并配题，通常需要 20 秒到 1 分钟。',
  unit: '篇',
};

const REDO_COPY = {
  ...PHASE_COPY,
  preparingTitle: '正在打开原题…',
  generating: '从题库里取出这道题，马上就好。',
  errorTitle: '这道题打不开',
  errorActions: 'stored' as const,
};

function Session({ type, redoId }: { type: ReadingQuestionType; redoId: string | null }) {
  const { phase, retry, restart } = useReadingSession(type, redoId);
  if (phase.kind !== 'ready')
    return (
      <GenerationPhaseView
        title={redoId ? `重做 · ${READING_TYPE_META[type].title}` : READING_TYPE_META[type].title}
        phase={phase}
        retry={() => void retry()}
        onClose={redoId ? leaveRedo : leave}
        testIDPrefix="reading"
        copy={redoId ? REDO_COPY : PHASE_COPY}
      />
    );
  // 换一套题（id 变了）时重新建答题卡
  return (
    <Attempt
      key={phase.value.set.id}
      set={phase.value.set}
      skipped={phase.value.skipped.map((x) => x.error)}
      startedAt={phase.startedAt}
      onRestart={restart}
      redo={Boolean(redoId)}
    />
  );
}

export default function ReadingAttemptScreen() {
  const { type, redo } = useLocalSearchParams<{ type: string; redo?: string }>();
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
  return <Session type={type} redoId={typeof redo === 'string' && redo ? redo : null} />;
}

const styles = StyleSheet.create({
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
    alignItems: 'center',
  },
  footerInner: { width: '100%', maxWidth: MAX_WIDTH, flexDirection: 'row', gap: space.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  skipped: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  saveNote: { textAlign: 'center', marginBottom: space.sm, minHeight: 18 },
});
