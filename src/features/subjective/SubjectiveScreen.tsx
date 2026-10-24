/**
 * 翻译 / 写作作答页：出题 → 写（草稿自动保存）→ 交卷确认 → 大模型评分 → 结果页。
 * 结构和视觉与阅读一致（顶栏关闭 + 标题 + 右上角提交）。提交按钮在顶栏，键盘弹出也挡不住；
 * 底部字数条放在 KeyboardAvoidingView 里，跟着键盘上移。
 */
import { router } from 'expo-router';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { confirmAsync } from '../../ui/confirm';
import { Button, Card, Notice, Txt } from '../../ui/primitives';
import { MAX_WIDTH, radius, space, usePalette, type Palette } from '../../ui/theme';
import { describeGenerationError, isAbort } from '../generation/llm';
import { useGenerationSession, type StartOptions } from '../generation/useGenerationSession';
import { GenerationPhaseView, PracticeTopBar, practiceStyles } from '../generation/views';
import { breakLongWords } from '../reading/parts';
import {
  ANSWER_MAX_LENGTH,
  SUBJECTIVE_META,
  countHan,
  countWords,
  lengthHint,
  saveDraft,
  startSubjective,
  submitCheck,
  submitSubjective,
  verdictText,
  type DimensionItem,
  type GradeView,
  type PreparedSubjective,
  type SubjectiveType,
} from './service';

function leave(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/home');
}

/** 路由用的 testID 前缀：写作的板块 id 是 writing */
const PREFIX: Record<SubjectiveType, string> = { translation: 'translation', essay: 'writing' };

type Stage =
  | { kind: 'writing' }
  | { kind: 'grading' }
  | { kind: 'gradeError'; message: string }
  | { kind: 'graded'; view: GradeView };

type DraftState = 'idle' | 'saving' | 'saved' | 'failed';

function Composer({
  prepared,
  startedAt: sessionStart,
  onNext,
}: {
  prepared: PreparedSubjective;
  startedAt: number;
  onNext: () => void;
}) {
  const p = usePalette();
  const { question, draft, skipped } = prepared;
  const type = question.type;
  const id = PREFIX[type];
  const meta = SUBJECTIVE_META[type];
  const hint = useMemo(
    () => lengthHint(question.type, question.payload),
    [question.type, question.payload],
  );

  const [text, setText] = useState(draft?.text ?? '');
  const [stage, setStage] = useState<Stage>({ kind: 'writing' });
  const [draftState, setDraftState] = useState<DraftState>(draft ? 'saved' : 'idle');
  const startedAt = draft?.startedAt ?? sessionStart;

  // 长文本：字数按延后的值算，打字不卡
  const deferred = useDeferredValue(text);
  const words = useMemo(() => countWords(deferred), [deferred]);

  // ---------- 草稿自动保存（停笔 600ms 后存；离开页面时把没存的补上） ----------
  const lastSaved = useRef(draft?.text ?? '');
  const latest = useRef({ text, writing: true });
  useEffect(() => {
    latest.current = { text, writing: stage.kind === 'writing' };
  }, [text, stage.kind]);
  const persist = useCallback(
    async (value: string) => {
      if (value === lastSaved.current) return;
      setDraftState('saving');
      try {
        await saveDraft(type, {
          questionId: question.id,
          text: value,
          startedAt,
          savedAt: Date.now(),
        });
        lastSaved.current = value;
        setDraftState('saved');
      } catch {
        setDraftState('failed');
      }
    },
    [type, question.id, startedAt],
  );
  useEffect(() => {
    if (stage.kind !== 'writing') return;
    const t = setTimeout(() => void persist(text), 600);
    return () => clearTimeout(t);
  }, [text, stage.kind, persist]);
  useEffect(
    () => () => {
      const l = latest.current;
      if (l.writing && l.text !== lastSaved.current)
        void saveDraft(type, {
          questionId: question.id,
          text: l.text,
          startedAt,
          savedAt: Date.now(),
        });
    },
    [type, question.id, startedAt],
  );

  // ---------- 交卷评分 ----------
  const ctrl = useRef<AbortController | null>(null);
  useEffect(() => () => ctrl.current?.abort(), []);
  const grade = useCallback(async () => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setStage({ kind: 'grading' });
    try {
      await persist(text); // 先把草稿存上，评分失败也不丢
      const view = await submitSubjective(question, text, startedAt, c.signal);
      if (!c.signal.aborted) setStage({ kind: 'graded', view });
    } catch (e) {
      if (c.signal.aborted || isAbort(e)) return;
      setStage({ kind: 'gradeError', message: describeGenerationError(e, '评分') });
    }
  }, [persist, question, text, startedAt]);

  const submit = async () => {
    const check = submitCheck(text, hint);
    if (await confirmAsync(check.title, check.message, '交卷')) void grade();
  };
  const backToEdit = () => {
    ctrl.current?.abort();
    setStage({ kind: 'writing' });
  };

  const status =
    stage.kind === 'graded'
      ? `${stage.view.score} / ${stage.view.maxScore} 分`
      : hint.max
        ? `${words} / ${hint.min}–${hint.max} 词`
        : `${words} 词`;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }} edges={['top', 'bottom']}>
      <PracticeTopBar
        title={meta.title}
        onClose={leave}
        closeLabel={stage.kind === 'writing' ? '退出（草稿已自动保存）' : '返回'}
        testIDPrefix={id}
        status={status}
        submit={
          stage.kind === 'writing'
            ? {
                label: '交卷',
                accessibilityLabel: `交卷评分，已写 ${words} 词`,
                active: words > 0,
                onPress: () => void submit(),
              }
            : undefined
        }
      />
      {stage.kind === 'writing' ? (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          >
            <View style={styles.inner}>
              {skipped.length > 0 ? (
                <Notice>
                  {`题库里有 ${skipped.length} 道没做过的旧题读不出来，已跳过：${[...new Set(skipped.map((s) => s.error))].join('；')}`}
                </Notice>
              ) : null}
              {draft && draft.text ? (
                <Txt variant="caption" tone="tertiary" testID={`${id}-restored`}>
                  已恢复上次没写完的草稿
                </Txt>
              ) : null}
              <PromptCard prepared={prepared} hintText={hint.text} />
              <TextInput
                value={text}
                onChangeText={setText}
                multiline
                maxLength={ANSWER_MAX_LENGTH[type]}
                placeholder={meta.placeholder}
                placeholderTextColor={p.textTertiary}
                autoCapitalize="sentences"
                autoCorrect={false}
                spellCheck={false}
                textAlignVertical="top"
                accessibilityLabel={type === 'translation' ? '英文译文' : '作文'}
                accessibilityHint={hint.text}
                testID={`${id}-input`}
                style={[
                  styles.input,
                  breakLongWords,
                  { color: p.text, backgroundColor: p.surface, borderColor: p.border },
                ]}
              />
            </View>
          </ScrollView>
          <View
            style={[styles.stats, { borderColor: p.border, backgroundColor: p.bg }]}
            accessibilityLiveRegion="polite"
          >
            <View style={styles.statsInner}>
              <Txt
                variant="callout"
                style={{
                  fontVariant: ['tabular-nums'],
                  color: words < hint.min ? p.textSecondary : p.success,
                }}
                testID={`${id}-words`}
              >
                {`${words} 词`}
              </Txt>
              <Txt variant="caption" tone="tertiary" style={{ flexShrink: 1 }} numberOfLines={1}>
                {hint.text}
              </Txt>
              <Txt
                variant="caption"
                tone={draftState === 'failed' ? 'danger' : 'tertiary'}
                style={{ marginLeft: 'auto' }}
                testID={`${id}-draft`}
              >
                {draftState === 'saving'
                  ? '保存中…'
                  : draftState === 'saved'
                    ? '草稿已保存'
                    : draftState === 'failed'
                      ? '草稿没保存上'
                      : ''}
              </Txt>
            </View>
          </View>
        </KeyboardAvoidingView>
      ) : stage.kind === 'grading' ? (
        <View style={styles.center} testID={`${id}-grading`} accessibilityLiveRegion="polite">
          <ActivityIndicator size="large" color={p.primary} />
          <Txt variant="headline" style={styles.centerText}>
            正在评分…
          </Txt>
          <Txt variant="callout" tone="secondary" style={styles.centerText}>
            大模型正在按六级评分标准打分并逐条点评，通常需要 10 到 30 秒。
          </Txt>
          <View style={styles.centerBtns}>
            <Button label="返回修改" kind="secondary" size="md" onPress={backToEdit} />
          </View>
        </View>
      ) : stage.kind === 'gradeError' ? (
        <View style={styles.center} testID={`${id}-grade-error`}>
          <Txt variant="headline" style={styles.centerText}>
            这次没评上分
          </Txt>
          <Txt
            variant="body"
            tone="danger"
            style={styles.centerText}
            accessibilityRole="alert"
            testID={`${id}-grade-error-message`}
          >
            {stage.message}
          </Txt>
          <Txt variant="caption" tone="tertiary" style={styles.centerText}>
            你写的内容已经存成草稿，不会丢。
          </Txt>
          <View style={styles.centerBtns}>
            <Button label="重试评分" onPress={() => void grade()} testID={`${id}-retry-grade`} />
            <Button label="返回修改" kind="secondary" size="md" onPress={backToEdit} />
          </View>
        </View>
      ) : (
        <>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll}>
            <View style={styles.inner}>
              <Result id={id} view={stage.view} prepared={prepared} answer={text} />
            </View>
          </ScrollView>
          <View style={[practiceStyles.footer, { borderColor: p.border, backgroundColor: p.bg }]}>
            <Txt variant="caption" tone="tertiary" style={styles.saveNote} testID={`${id}-saved`}>
              已保存到练习记录
            </Txt>
            <View style={practiceStyles.footerInner}>
              <View style={{ flex: 1 }}>
                <Button label="再来一题" kind="secondary" onPress={onNext} testID={`${id}-next`} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="完成" onPress={leave} testID={`${id}-done`} />
              </View>
            </View>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

function PromptCard({ prepared, hintText }: { prepared: PreparedSubjective; hintText: string }) {
  const q = prepared.question;
  if (q.type === 'translation')
    return (
      <Card style={{ gap: space.sm }}>
        <Txt variant="overline" tone="tertiary">
          将下面这段话译成英文
        </Txt>
        <Txt variant="body" style={[styles.reading, breakLongWords]} testID="translation-source">
          {q.payload.source}
        </Txt>
        <Txt variant="caption" tone="tertiary">
          {`原文 ${countHan(q.payload.source)} 字 · ${hintText}`}
        </Txt>
      </Card>
    );
  return (
    <Card style={{ gap: space.sm }}>
      <Txt variant="overline" tone="tertiary">
        Directions
      </Txt>
      <Txt variant="headline" style={breakLongWords} testID="writing-title">
        {q.payload.title}
      </Txt>
      <Txt variant="body" style={[styles.reading, breakLongWords]}>
        {q.payload.directions}
      </Txt>
      <Txt variant="caption" tone="tertiary">
        {`${hintText} · 满分 15 分`}
      </Txt>
    </Card>
  );
}

function Section({
  title,
  testID,
  children,
}: {
  title: string;
  testID?: string;
  children: React.ReactNode;
}) {
  return (
    <Card style={{ gap: space.md }}>
      <View testID={testID} style={{ gap: space.md }}>
        <Txt variant="overline" tone="tertiary" accessibilityRole="header">
          {title}
        </Txt>
        {children}
      </View>
    </Card>
  );
}

function Result({
  id,
  view,
  prepared,
  answer,
}: {
  id: string;
  view: GradeView;
  prepared: PreparedSubjective;
  answer: string;
}) {
  const p = usePalette();
  const ratio = view.maxScore ? view.score / view.maxScore : 0;
  const color = ratio >= 0.6 ? p.success : ratio >= 0.4 ? p.rating.hard : p.danger;
  const q = prepared.question;
  return (
    <>
      <Card style={{ gap: space.md }}>
        <View style={styles.scoreRow}>
          <View accessible accessibilityLabel={`得分 ${view.score}，满分 ${view.maxScore}`}>
            <Txt variant="overline" tone="tertiary">
              本次得分
            </Txt>
            <Txt
              variant="display"
              style={{ color, fontVariant: ['tabular-nums'] }}
              testID={`${id}-score`}
            >
              {view.score}
              <Txt variant="headline" tone="tertiary">
                {` / ${view.maxScore}`}
              </Txt>
            </Txt>
          </View>
          <View style={{ alignItems: 'flex-end', gap: space.xs, flexShrink: 1 }}>
            <View
              style={[
                styles.pill,
                { backgroundColor: view.needsRedo ? p.dangerSoft : p.successSoft },
              ]}
              testID={view.needsRedo ? `${id}-redo` : `${id}-pass`}
            >
              <Txt
                variant="caption"
                style={{ color: view.needsRedo ? p.danger : p.success, fontWeight: '600' }}
              >
                {view.needsRedo ? '待重练' : '达标'}
              </Txt>
            </View>
            {view.band !== null ? (
              <Txt variant="caption" tone="secondary" testID={`${id}-band`}>
                {`${view.band} 分档`}
              </Txt>
            ) : null}
          </View>
        </View>
        <Txt variant="caption" tone="tertiary">
          {`六级评分标准，满分 ${view.maxScore} 分；${verdictText(view)}。`}
        </Txt>
        {view.summary ? (
          <Txt variant="body" style={breakLongWords} testID={`${id}-summary`}>
            {view.summary}
          </Txt>
        ) : null}
      </Card>

      {view.note ? (
        <Txt variant="caption" tone="tertiary" testID={`${id}-feedback-note`}>
          {view.note}
        </Txt>
      ) : null}

      {view.dimensions ? (
        <Section title="分项点评" testID={`${id}-dimensions`}>
          {view.dimensions.map((d) => (
            <View key={d.key} style={{ gap: 2 }} testID={`${id}-criterion-${d.key}`}>
              <View style={styles.dimHead}>
                <Txt variant="headline" style={{ flexShrink: 1 }}>
                  {d.label}
                </Txt>
                <View style={[styles.pill, { backgroundColor: LEVEL_BG(p)[d.level] }]}>
                  <Txt variant="caption" style={{ color: LEVEL_FG(p)[d.level], fontWeight: '600' }}>
                    {d.levelLabel}
                  </Txt>
                </View>
              </View>
              <Txt variant="callout" tone="secondary" style={breakLongWords}>
                {d.comment}
              </Txt>
            </View>
          ))}
        </Section>
      ) : null}

      {view.comments.length > 0 ? (
        <Section title={view.commentsTitle} testID={`${id}-comments`}>
          {view.comments.map((c, i) => (
            <View key={i} style={[styles.comment, { borderColor: p.border }]}>
              {c.quote ? (
                <Txt variant="callout" tone="secondary" style={[styles.quote, breakLongWords]}>
                  {c.quote}
                </Txt>
              ) : null}
              <Txt variant="callout" style={[{ color: p.danger }, breakLongWords]}>
                {c.problem}
              </Txt>
              <Txt variant="callout" style={[{ color: p.success }, breakLongWords]}>
                {`→ ${c.suggestion}`}
              </Txt>
            </View>
          ))}
        </Section>
      ) : null}

      {view.rewrite ? (
        <Section title="改写示例" testID={`${id}-rewrite`}>
          <Txt variant="body" style={[styles.reading, breakLongWords]}>
            {view.rewrite}
          </Txt>
        </Section>
      ) : null}

      {q.type === 'translation' ? (
        <Section title="参考译文">
          <Txt
            variant="body"
            style={[styles.reading, breakLongWords]}
            testID="translation-reference"
          >
            {q.payload.reference}
          </Txt>
          <Txt variant="callout" tone="secondary" style={breakLongWords}>
            {`解析：${q.payload.explanation}`}
          </Txt>
        </Section>
      ) : (
        <Section title="审题思路">
          <Txt variant="callout" tone="secondary" style={breakLongWords}>
            {q.payload.explanation}
          </Txt>
        </Section>
      )}

      <Section title={`你的作答 · ${countWords(answer)} 词`}>
        <Txt variant="body" style={[styles.reading, breakLongWords]} testID={`${id}-answer`}>
          {answer.trim() ? answer : '（空白）'}
        </Txt>
      </Section>
    </>
  );
}

const LEVEL_BG = (p: Palette): Record<DimensionItem['level'], string> => ({
  good: p.successSoft,
  fair: p.warningSoft,
  weak: p.dangerSoft,
});
const LEVEL_FG = (p: Palette): Record<DimensionItem['level'], string> => ({
  good: p.success,
  fair: p.warningText,
  weak: p.danger,
});

export function SubjectiveScreen({ type }: { type: SubjectiveType }) {
  const start = useCallback((o: StartOptions) => startSubjective(type, o), [type]);
  const { phase, retry } = useGenerationSession(start);
  const meta = SUBJECTIVE_META[type];
  if (phase.kind !== 'ready')
    return (
      <GenerationPhaseView
        title={meta.title}
        phase={phase}
        retry={() => void retry()}
        onClose={leave}
        testIDPrefix={PREFIX[type]}
        copy={{ unconfigured: meta.unconfigured, generating: meta.generating }}
      />
    );
  return (
    <Composer
      key={phase.value.question.id}
      prepared={phase.value}
      startedAt={phase.startedAt}
      onNext={() => void retry()}
    />
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.xl,
    alignItems: 'center',
  },
  inner: { width: '100%', maxWidth: MAX_WIDTH, gap: space.md },
  reading: { lineHeight: 26 },
  input: {
    minHeight: 280,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    fontSize: 17,
    lineHeight: 26,
  },
  stats: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    alignItems: 'center',
  },
  statsInner: {
    width: '100%',
    maxWidth: MAX_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 28,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
    gap: space.md,
  },
  centerText: { textAlign: 'center', maxWidth: 420 },
  centerBtns: {
    alignSelf: 'stretch',
    maxWidth: 420,
    width: '100%',
    marginTop: space.md,
    gap: space.md,
    marginHorizontal: 'auto',
  },
  saveNote: { textAlign: 'center', marginBottom: space.sm, minHeight: 18 },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space.md,
  },
  pill: { borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.xs },
  dimHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: space.sm,
  },
  comment: { borderLeftWidth: 3, paddingLeft: space.md, gap: space.xs },
  quote: { fontStyle: 'italic' },
});
