import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAiExplain } from '@/features/ai/useAiExplain';
import { getAutoSpeak, speakWord, stopSpeaking } from '@/features/study/speech';
import { useStudySession, type GroupResult } from '@/features/study/useStudySession';
import type { SessionCard } from '@/features/study/service';
import { formatInterval, RATING_LABEL, UI_RATINGS, type UiRating } from '@/features/study/ratings';
import { Celebration } from '@/ui/Celebration';
import { Markdown } from '@/ui/Markdown';
import { easeOut, useReducedMotion } from '@/ui/motion';
import {
  Button,
  Card,
  ErrorView,
  Loading,
  PressableScale,
  ProgressBar,
  Txt,
} from '@/ui/primitives';
import { MAX_WIDTH, radius, space, usePalette } from '@/ui/theme';

const KIND_LABEL = { new: '新词', review: '复习', learning: '再看一次' } as const;

function close(): void {
  stopSpeaking();
  if (router.canGoBack()) router.back();
  else router.replace('/vocab');
}

function SpeakButton({ word }: { word: string }) {
  const p = usePalette();
  return (
    <Pressable
      onPress={() => speakWord(word)}
      accessibilityRole="button"
      accessibilityLabel={`朗读 ${word}`}
      hitSlop={8}
      style={({ pressed }) => [
        styles.speak,
        { backgroundColor: pressed ? p.border : p.surfaceAlt },
      ]}
      testID="speak"
    >
      <Ionicons name="volume-medium" size={22} color={p.primary} />
    </Pressable>
  );
}

function Phonetics({ item }: { item: SessionCard }) {
  const { phoneticUs, phoneticUk } = item.word;
  if (!phoneticUs && !phoneticUk) return null;
  return (
    <View
      style={{ flexDirection: 'row', gap: space.md, flexWrap: 'wrap', justifyContent: 'center' }}
    >
      {phoneticUs ? (
        <Txt tone="secondary" accessibilityLabel={`美式音标 ${phoneticUs}`}>
          美 {phoneticUs}
        </Txt>
      ) : null}
      {phoneticUk && phoneticUk !== phoneticUs ? (
        <Txt tone="secondary" accessibilityLabel={`英式音标 ${phoneticUk}`}>
          英 {phoneticUk}
        </Txt>
      ) : null}
    </View>
  );
}

function headwordSize(w: string): number {
  if (w.length > 22) return 26;
  if (w.length > 14) return 32;
  return 44;
}

function Front({ item, onFlip }: { item: SessionCard; onFlip: () => void }) {
  const p = usePalette();
  return (
    <Pressable
      onPress={onFlip}
      accessibilityRole="button"
      accessibilityLabel={`${item.word.headword}。先回忆意思，点按翻面查看释义`}
      style={{ flex: 1 }}
      testID="card-front"
    >
      <Card style={styles.frontCard}>
        <Txt variant="overline" tone="tertiary" style={styles.kind}>
          {KIND_LABEL[item.kind]}
        </Txt>
        <View style={{ alignItems: 'center', gap: space.md }}>
          <Txt
            style={{
              fontSize: headwordSize(item.word.headword),
              lineHeight: headwordSize(item.word.headword) * 1.2,
              fontWeight: '700',
              letterSpacing: -0.02 * headwordSize(item.word.headword),
              color: p.text,
              textAlign: 'center',
            }}
            testID="headword"
          >
            {item.word.headword}
          </Txt>
          <Phonetics item={item} />
          <SpeakButton word={item.word.headword} />
        </View>
        <Txt variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>
          先在心里回忆它的意思，再翻面
        </Txt>
      </Card>
    </Pressable>
  );
}

function Back({ item }: { item: SessionCard }) {
  const reduced = useReducedMotion();
  const ai = useAiExplain(item.word, item.exam);
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    // 翻面：150ms 淡入 + 轻微放大；高频操作，保持极短
    Animated.timing(t, {
      toValue: 1,
      duration: 150,
      easing: easeOut,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [t]);
  const { word } = item;

  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: t,
        transform: reduced
          ? []
          : [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) }],
      }}
    >
      <ScrollView
        contentContainerStyle={{ gap: space.md, paddingBottom: space.lg }}
        testID="card-back"
      >
        <Card style={{ gap: space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <View style={{ flex: 1 }}>
              <Txt variant="title" style={{ flexShrink: 1 }}>
                {word.headword}
              </Txt>
              <View style={{ flexDirection: 'row', gap: space.md, flexWrap: 'wrap' }}>
                {word.phoneticUs ? (
                  <Txt variant="caption" tone="secondary">
                    美 {word.phoneticUs}
                  </Txt>
                ) : null}
                {word.phoneticUk && word.phoneticUk !== word.phoneticUs ? (
                  <Txt variant="caption" tone="secondary">
                    英 {word.phoneticUk}
                  </Txt>
                ) : null}
              </View>
            </View>
            <SpeakButton word={word.headword} />
          </View>
          <View style={{ gap: 6 }} accessibilityLabel="释义" testID="meanings">
            {word.meanings.length === 0 ? <Txt tone="secondary">（词库暂无释义）</Txt> : null}
            {word.meanings.map((m, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: space.sm }}>
                {m.pos ? (
                  <Txt
                    variant="callout"
                    tone="tertiary"
                    style={{ minWidth: 34, fontStyle: 'italic' }}
                  >
                    {m.pos}.
                  </Txt>
                ) : null}
                <Txt variant="body" style={{ flex: 1, fontWeight: i === 0 ? '600' : '400' }}>
                  {m.zh}
                </Txt>
              </View>
            ))}
          </View>
        </Card>

        {word.examples.length > 0 ? (
          <Card style={{ gap: space.md }}>
            <Txt variant="overline" tone="tertiary" accessibilityRole="header">
              例句
            </Txt>
            {word.examples.slice(0, 3).map((e, i) => (
              <Pressable
                key={i}
                onPress={() => speakWord(e.en)}
                accessibilityRole="button"
                accessibilityLabel={`例句：${e.en}。${e.zh}`}
                accessibilityHint="朗读例句"
                style={{ gap: 2 }}
              >
                <Txt variant="callout">{e.en}</Txt>
                {e.zh ? (
                  <Txt variant="caption" tone="secondary">
                    {e.zh}
                  </Txt>
                ) : null}
              </Pressable>
            ))}
          </Card>
        ) : null}

        {word.phrases.length > 0 ? (
          <Card style={{ gap: space.sm }}>
            <Txt variant="overline" tone="tertiary" accessibilityRole="header">
              常用短语
            </Txt>
            {word.phrases.slice(0, 5).map((ph, i) => (
              <Txt
                key={i}
                variant="callout"
                tone="secondary"
                accessibilityLabel={`${ph.en}，${ph.zh}`}
              >
                <Txt variant="callout" style={{ fontWeight: '600' }}>
                  {ph.en}
                </Txt>
                {'  '}
                {ph.zh}
              </Txt>
            ))}
          </Card>
        ) : null}

        {ai.enabled && ai.state.status === 'done' ? (
          <Card style={{ gap: space.md }}>
            <Txt variant="overline" tone="accent" accessibilityRole="header">
              AI 讲解
            </Txt>
            <Markdown text={ai.state.text} />
          </Card>
        ) : null}
        {ai.enabled && ai.state.status !== 'done' ? (
          <View style={{ gap: space.xs }}>
            <Button
              label="AI 讲解"
              kind="secondary"
              size="md"
              onPress={() => void ai.run()}
              loading={ai.state.status === 'loading'}
              accessibilityHint="用你配置的大模型讲解这个单词"
              testID="ai-explain"
            />
            {ai.state.status === 'error' ? (
              <Txt
                variant="caption"
                tone="danger"
                accessibilityRole="alert"
                style={{ textAlign: 'center' }}
              >
                {ai.state.message}
              </Txt>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </Animated.View>
  );
}

function RatingBar({
  intervals,
  onRate,
}: {
  intervals: Record<UiRating, number> | null;
  onRate: (r: UiRating) => void;
}) {
  const p = usePalette();
  return (
    <View style={styles.ratings} accessibilityRole="toolbar" accessibilityLabel="评价记忆程度">
      {UI_RATINGS.map((r, i) => (
        <PressableScale
          key={r}
          onPress={() => onRate(r)}
          accessibilityRole="button"
          accessibilityLabel={`${RATING_LABEL[r]}${intervals ? `，${formatInterval(intervals[r])}后再复习` : ''}`}
          accessibilityHint={Platform.OS === 'web' ? `快捷键 ${i + 1}` : undefined}
          testID={`rate-${r}`}
          outerStyle={{ flex: 1 }}
          style={[styles.rateBtn, { backgroundColor: p.surface, borderColor: p.border }]}
        >
          <Txt variant="headline" style={{ color: p.rating[r] }}>
            {RATING_LABEL[r]}
          </Txt>
          <Txt variant="caption" tone="tertiary" style={{ fontSize: 11 }}>
            {intervals ? formatInterval(intervals[r]) : ' '}
          </Txt>
        </PressableScale>
      ))}
    </View>
  );
}

function Done({ result, onAgain }: { result: GroupResult; onAgain: () => void }) {
  const p = usePalette();
  const { ratings } = result;
  const total = ratings.again + ratings.hard + ratings.good + ratings.easy;
  return (
    <ScrollView contentContainerStyle={styles.doneWrap} testID="done">
      <Celebration emoji={result.streakIncreased ? '🔥' : '🎉'} />
      <Txt variant="title" accessibilityRole="header" style={{ textAlign: 'center' }}>
        {result.streakIncreased ? '今日打卡成功！' : '这一组完成了！'}
      </Txt>
      <Txt tone="secondary" style={{ textAlign: 'center', marginTop: space.xs }}>
        连续打卡 {result.streak} 天{'\n'}本组 {result.total} 个词，其中新词 {result.newCount}{' '}
        个，用时约 {result.minutes} 分钟
      </Txt>
      <Card style={{ width: '100%', marginTop: space.xl, gap: space.md }}>
        <Txt variant="overline" tone="tertiary">
          本组评分
        </Txt>
        {UI_RATINGS.map((r) => (
          <View
            key={r}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}
            accessible
            accessibilityLabel={`${RATING_LABEL[r]} ${ratings[r]} 次`}
          >
            <Txt variant="callout" style={{ width: 36, color: p.rating[r] }}>
              {RATING_LABEL[r]}
            </Txt>
            <View style={{ flex: 1 }}>
              <ProgressBar
                value={total ? ratings[r] / total : 0}
                color={p.rating[r]}
                label={RATING_LABEL[r]}
                height={8}
              />
            </View>
            <Txt
              variant="callout"
              tone="secondary"
              style={{ width: 28, textAlign: 'right', fontVariant: ['tabular-nums'] }}
            >
              {ratings[r]}
            </Txt>
          </View>
        ))}
      </Card>
      <View style={{ width: '100%', gap: space.sm, marginTop: space.xl }}>
        <Button label="再来一组" onPress={onAgain} testID="again" />
        <Button label="返回今天" kind="secondary" onPress={close} testID="back-today" />
      </View>
    </ScrollView>
  );
}

export default function StudyScreen() {
  const p = usePalette();
  const s = useStudySession();
  const { phase, current, flip, rate } = s;

  // 自动发音：新卡片正面出现时
  const lastSpoken = useRef<number | null>(null);
  useEffect(() => {
    if (phase !== 'front' || !current) return;
    const id = current.wordId;
    void getAutoSpeak().then((on) => {
      if (on && lastSpoken.current !== id) speakWord(current.word.headword);
      lastSpoken.current = id;
    });
  }, [phase, current]);
  useEffect(() => () => stopSpeaking(), []);

  // 网页版键盘快捷键：空格/回车翻面，1–4 评分，Esc 退出（不加动画）
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Escape') return close();
      if (phase === 'front' && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        flip();
      } else if (phase === 'back' && ['1', '2', '3', '4'].includes(e.key)) {
        void rate(UI_RATINGS[Number(e.key) - 1] as UiRating);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, flip, rate]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }} edges={['top', 'bottom']}>
      <View style={styles.page}>
        <View style={styles.topBar}>
          <Pressable
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="结束本组，返回"
            hitSlop={10}
            style={styles.closeBtn}
            testID="close"
          >
            <Ionicons name="close" size={26} color={p.textSecondary} />
          </Pressable>
          {phase === 'front' || phase === 'back' ? (
            <>
              <View style={{ flex: 1 }}>
                <ProgressBar
                  value={s.progress.total ? s.progress.done / s.progress.total : 0}
                  label="本组进度"
                />
              </View>
              <Txt
                variant="caption"
                tone="secondary"
                style={{ minWidth: 44, textAlign: 'right', fontVariant: ['tabular-nums'] }}
                testID="progress-text"
              >
                {s.progress.done}/{s.progress.total}
              </Txt>
            </>
          ) : (
            <View style={{ flex: 1 }} />
          )}
        </View>

        {phase === 'loading' ? <Loading label="正在准备这一组" /> : null}
        {phase === 'error' ? (
          <ErrorView message={s.error ?? '未知错误'} onRetry={() => void s.restart()} />
        ) : null}
        {phase === 'empty' ? (
          <View style={[styles.doneWrap, { flex: 1, justifyContent: 'center' }]}>
            <Txt variant="title" style={{ textAlign: 'center' }}>
              今天没有要背的了
            </Txt>
            <Txt tone="secondary" style={{ textAlign: 'center', marginTop: space.sm }}>
              新词和复习都完成了，明天见。
            </Txt>
            <View style={{ width: '100%', marginTop: space.xl }}>
              <Button label="返回今天" onPress={close} />
            </View>
          </View>
        ) : null}
        {phase === 'done' && s.result ? (
          <Done result={s.result} onAgain={() => void s.restart()} />
        ) : null}

        {current && phase === 'front' ? (
          <>
            <Front item={current} onFlip={flip} />
            <View style={styles.bottom}>
              <Button
                label="翻面看释义"
                onPress={flip}
                accessibilityHint={Platform.OS === 'web' ? '快捷键 空格' : undefined}
                testID="flip"
              />
            </View>
          </>
        ) : null}
        {current && phase === 'back' ? (
          <>
            <Back key={`${current.wordId}-${current.card.reps}`} item={current} />
            <View style={styles.bottom}>
              <RatingBar intervals={s.intervals} onRate={(r) => void rate(r)} />
            </View>
          </>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    width: '100%',
    maxWidth: MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: space.lg,
  },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: space.md, height: 52 },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -6,
  },
  frontCard: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'stretch',
    paddingVertical: space.xl,
    marginTop: space.sm,
  },
  kind: { textAlign: 'center' },
  speak: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottom: { paddingTop: space.md, paddingBottom: space.md },
  ratings: { flexDirection: 'row', gap: space.sm },
  rateBtn: {
    flex: 1,
    minHeight: 64,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  doneWrap: { alignItems: 'center', paddingBottom: space.xl, paddingTop: space.lg },
});
