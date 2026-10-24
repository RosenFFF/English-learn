/**
 * 听力作答页：出题 → 听（作答时不显示原文）→ 选 A–D → 交卷本地判分、写 attempt →
 * 结果页看对错和解析，可以展开分角色原文、逐句重听。错题本重做（redoId）用题库原题、不需要大模型。
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, usePreventRemove } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { confirmAsync } from '../../ui/confirm';
import { HighlightCard } from '../../ui/HighlightCard';
import { Button, Card, Notice, PressableScale, Txt } from '../../ui/primitives';
import { MAX_WIDTH, space, usePalette } from '../../ui/theme';
import { useGenerationSession } from '../generation/useGenerationSession';
import { GenerationPhaseView, PracticeTopBar } from '../generation/views';
import { breakLongWords, ChoiceButton, gradedState, ScoreCard, Verdict } from '../reading/parts';
import { PlayerPanel } from './PlayerPanel';
import {
  LISTENING_TYPE_META,
  answeredCount,
  describeListeningError,
  gradeListening,
  isNarrator,
  letterOf,
  narratedQuestion,
  needsExitConfirm,
  plainStem,
  redoOutcomeText,
  startListeningRedo,
  startListeningSet,
  stemVisible,
  submitListeningSet,
  submitPrompt,
  toSpeechQueue,
  useListeningSheet,
  type ListeningQuestionType,
  type ListeningSet,
  type PlayerSnapshot,
  type SpeechPlayer,
  type SpeechRate,
} from './service';
import { useSpeechPlayer } from './useSpeechPlayer';

function leave(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/listening');
}

function leaveRedo(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/mistakes');
}

type SaveState =
  | { kind: 'idle' | 'saving' }
  | { kind: 'saved'; wrongCount: number }
  | { kind: 'failed'; message: string };

/** 选项文字 16 号（正文字号下限） */
const OPTION_TEXT = { fontSize: 16, lineHeight: 22 } as const;

/** 结果页的听力原文：分角色列出，点一句重听这一句 */
function Transcript({ snap, player }: { snap: PlayerSnapshot; player: SpeechPlayer }) {
  const p = usePalette();
  const [open, setOpen] = useState(false);
  const lines = snap.items
    .map((item, index) => ({ item, index }))
    .filter((x) => !isNarrator(x.item));
  return (
    <Card style={{ gap: space.md }}>
      <PressableScale
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={open ? '收起听力原文' : '展开听力原文'}
        accessibilityState={{ expanded: open }}
        testID="listening-transcript-toggle"
        style={styles.transcriptHead}
      >
        <Txt variant="headline" style={{ flex: 1 }}>
          听力原文
        </Txt>
        <Txt variant="callout" tone="accent">
          {open ? '收起' : '展开'}
        </Txt>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={p.primary} />
      </PressableScale>
      {open ? (
        <View style={{ gap: space.sm }} testID="listening-transcript">
          <Txt variant="caption" tone="tertiary">
            点一句可以单独重听这一句
          </Txt>
          {lines.map(({ item, index }) => {
            const active = snap.current !== null && snap.index === index;
            return (
              <PressableScale
                key={index}
                onPress={() => player.dispatch({ type: 'playOne', index })}
                accessibilityRole="button"
                accessibilityLabel={`重听 ${item.name}：${item.text}`}
                testID={`listening-line-${index}`}
              >
                <HighlightCard active={active} style={styles.line}>
                  <Txt
                    variant="caption"
                    style={{
                      color: item.gender === 'female' ? p.exam.ielts : p.primary,
                      fontWeight: '600',
                    }}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Txt>
                  <Txt variant="body" style={breakLongWords}>
                    {item.text}
                  </Txt>
                </HighlightCard>
              </PressableScale>
            );
          })}
        </View>
      ) : null}
    </Card>
  );
}

function Attempt({
  set,
  skipped,
  startedAt,
  onRestart,
  redo,
}: {
  set: ListeningSet;
  skipped: string[];
  startedAt: number;
  onRestart: () => void;
  redo: boolean;
}) {
  const p = usePalette();
  const exit = redo ? leaveRedo : leave;
  const meta = LISTENING_TYPE_META[set.type];
  const [sheet, dispatch] = useListeningSheet(set);
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const [leaving, setLeaving] = useState(false);
  const [rate, setRate] = useState<SpeechRate>(1);
  // 奶龙定的：念题默认打开（和真题一样）
  const [readQuestions, setReadQuestions] = useState(true);
  const items = useMemo(
    () => toSpeechQueue(set.payload, { readQuestions }),
    [set.payload, readQuestions],
  );
  const [snap, player] = useSpeechPlayer(items, rate);
  const grade = useMemo(() => (sheet.submitted ? gradeListening(set, sheet) : null), [set, sheet]);
  const done = answeredCount(sheet);
  const total = sheet.answers.length;

  // 念到过的最大题号：念题打开时题干念到才显示
  const [readUpTo, setReadUpTo] = useState(-1);
  const reading = narratedQuestion(snap.current)?.questionIndex ?? null;
  // 渲染时调整（React 推荐的「根据变化更新 state」写法，不用 effect）
  if (reading !== null && reading > readUpTo) setReadUpTo(reading);

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
    player.stop();
    dispatch({ type: 'submit' });
    setSave({ kind: 'saving' });
    try {
      const { wrongCount } = await submitListeningSet(set, sheet, startedAt);
      setSave({ kind: 'saved', wrongCount });
    } catch (e) {
      setSave({ kind: 'failed', message: describeListeningError(e).replace(/^出题失败：/, '') });
    }
  };

  const retry = useCallback(() => {
    player.stop();
    dispatch({ type: 'reset' });
    setSave({ kind: 'idle' });
    setReadUpTo(-1);
    onRestart();
  }, [player, dispatch, onRestart]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }} edges={['top', 'bottom']}>
      <PracticeTopBar
        title={redo ? `重做 · ${meta.title}` : meta.title}
        onClose={exit}
        closeLabel="退出练习"
        testIDPrefix="listening"
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
      <ScrollView contentContainerStyle={styles.scroll} testID="listening-scroll">
        <View style={styles.inner}>
          {skipped.length > 0 && !grade ? (
            <View testID="listening-skipped">
              <Notice>
                {`题库里有 ${skipped.length} 道没做过的旧题读不出来，已跳过：${[...new Set(skipped)].join('；')}`}
              </Notice>
            </View>
          ) : null}
          {grade ? <ScoreCard grade={grade} type={set.type} testIDPrefix="listening" /> : null}
          <PlayerPanel
            snap={snap}
            player={player}
            title={`${meta.section} · ${meta.title}`}
            rate={rate}
            onRate={setRate}
            readQuestions={readQuestions}
            onReadQuestions={setReadQuestions}
          />
          {!grade ? (
            <Txt variant="callout" tone="tertiary" style={styles.tip}>
              和考试一样，作答时不显示原文；交卷后可以展开原文逐句重听。
            </Txt>
          ) : null}
          {set.payload.questions.map((q, qi) => {
            const chosen = sheet.answers[qi] ?? null;
            const r = grade?.items[qi];
            const showStem = stemVisible(qi, {
              readQuestions,
              submitted: sheet.submitted,
              readUpTo,
            });
            return (
              <HighlightCard key={qi} active={reading === qi} testID={`listening-q-${qi + 1}`}>
                <View style={styles.qHead}>
                  <Txt variant="overline" tone={reading === qi ? 'accent' : 'tertiary'}>
                    {reading === qi ? `第 ${qi + 1} 题 · 正在念` : `第 ${qi + 1} 题`}
                  </Txt>
                </View>
                {showStem ? (
                  <Txt
                    variant="body"
                    style={[{ fontWeight: '600' }, breakLongWords]}
                    testID={`listening-stem-${qi + 1}`}
                  >
                    {plainStem(q.stem)}
                  </Txt>
                ) : (
                  <Txt variant="body" tone="tertiary" testID={`listening-stem-${qi + 1}`}>
                    题干会在原文念完后念出
                  </Txt>
                )}
                <View
                  style={{ gap: space.sm }}
                  accessibilityRole="radiogroup"
                  accessibilityLabel={`第 ${qi + 1} 题`}
                >
                  {q.options.map((text, oi) => {
                    const key = letterOf(oi);
                    const state = r
                      ? gradedState(key, chosen, r.expected)
                      : chosen === key
                        ? 'selected'
                        : 'idle';
                    return (
                      <ChoiceButton
                        key={key}
                        label={key}
                        text={text}
                        state={state}
                        inactive={Boolean(grade)}
                        onPress={() => dispatch({ type: 'answer', index: qi, value: key })}
                        accessibilityLabel={`第 ${qi + 1} 题选 ${key}：${text}`}
                        testID={`listening-${qi + 1}-${key}`}
                        textStyle={OPTION_TEXT}
                      />
                    );
                  })}
                </View>
                {r ? (
                  <Verdict
                    correct={r.correct}
                    chosen={r.given === null ? null : String(r.given)}
                    answer={String(r.expected)}
                    explanation={q.explanation}
                    testID={`listening-result-${qi + 1}`}
                  />
                ) : null}
              </HighlightCard>
            );
          })}
          {grade ? <Transcript snap={snap} player={player} /> : null}
        </View>
      </ScrollView>
      {grade ? (
        <View style={[styles.footer, { borderColor: p.border, backgroundColor: p.bg }]}>
          <Txt
            variant="caption"
            tone={save.kind === 'failed' ? 'danger' : 'tertiary'}
            style={styles.saveNote}
            testID="listening-saved"
          >
            {save.kind === 'saving'
              ? '正在保存到练习记录…'
              : save.kind === 'saved'
                ? redo
                  ? `已保存 · ${redoOutcomeText({ kind: 'objective', wrongCount: save.wrongCount })}`
                  : '已保存到练习记录'
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
                onPress={retry}
                testID="listening-retry"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="完成" size="md" onPress={exit} testID="listening-done" />
            </View>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const PHASE_COPY = {
  unconfigured: '听力题由你自己配置的大模型现场写原创稿子并配题，再用手机自带的语音朗读。',
  generating: '大模型正在写一段原创听力稿子并配题，通常需要 20 秒到 1 分钟。',
  unit: '段',
};

const REDO_COPY = {
  ...PHASE_COPY,
  preparingTitle: '正在打开原题…',
  generating: '从题库里取出这道题，马上就好。',
  errorTitle: '这道题打不开',
  errorActions: 'stored' as const,
};

export function ListeningSession({
  type,
  redoId,
}: {
  type: ListeningQuestionType;
  redoId: string | null;
}) {
  const start = useCallback(
    (o: { signal: AbortSignal; onProgress: (done: number, total: number) => void }) =>
      redoId ? startListeningRedo(type, redoId) : startListeningSet(type, o),
    [type, redoId],
  );
  const { phase, retry, restart } = useGenerationSession(start, { checkLlm: !redoId });
  const title = redoId
    ? `重做 · ${LISTENING_TYPE_META[type].title}`
    : LISTENING_TYPE_META[type].title;
  if (phase.kind !== 'ready')
    return (
      <GenerationPhaseView
        title={title}
        phase={phase}
        retry={() => void retry()}
        onClose={redoId ? leaveRedo : leave}
        testIDPrefix="listening"
        copy={redoId ? REDO_COPY : PHASE_COPY}
      />
    );
  return (
    <Attempt
      key={phase.value.set.id}
      set={phase.value.set}
      skipped={phase.value.skipped}
      startedAt={phase.startedAt}
      onRestart={restart}
      redo={Boolean(redoId)}
    />
  );
}

const styles = StyleSheet.create({
  scroll: { padding: space.lg, paddingTop: space.sm, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MAX_WIDTH, gap: space.md },
  tip: { paddingHorizontal: space.xs },
  qHead: { flexDirection: 'row', alignItems: 'center' },
  transcriptHead: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  line: { padding: space.md, gap: space.xs, borderRadius: 14 },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
    alignItems: 'center',
  },
  footerInner: { width: '100%', maxWidth: MAX_WIDTH, flexDirection: 'row', gap: space.md },
  saveNote: { textAlign: 'center', marginBottom: space.sm, minHeight: 18 },
});
