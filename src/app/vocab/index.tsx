import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { EXAM_LABEL } from '@/features/books/constants';
import { useTodaySummary } from '@/features/study/service';
import {
  Button,
  Card,
  ErrorView,
  Loading,
  Notice,
  ProgressBar,
  Screen,
  Txt,
} from '@/ui/primitives';
import { radius, space, usePalette } from '@/ui/theme';

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

function dateTitle(now: Date): string {
  return `${now.getMonth() + 1}月${now.getDate()}日 周${WEEK[now.getDay()]}`;
}

function Stat({ value, label, testID }: { value: number; label: string; testID: string }) {
  return (
    <View
      style={styles.stat}
      accessible
      accessibilityLabel={`${label} ${value} 个`}
      testID={testID}
    >
      <Txt variant="display" style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </Txt>
      <Txt variant="callout" tone="secondary">
        {label}
      </Txt>
    </View>
  );
}

export default function TodayScreen() {
  const p = usePalette();
  const { data, error, reload } = useTodaySummary();

  if (error)
    return (
      <Screen>
        <ErrorView message={error} onRetry={reload} />
      </Screen>
    );
  if (!data)
    return (
      <Screen>
        <Loading />
      </Screen>
    );

  const { book, budget, streak } = data;
  const remaining = data.newToDo + data.reviewToDo;
  const doneToday = data.newDone + data.reviewDone;
  const goal = doneToday + remaining;

  return (
    <Screen>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Txt variant="caption" tone="tertiary">
            {dateTitle(new Date())}
          </Txt>
          <Txt variant="title" accessibilityRole="header">
            今天
          </Txt>
        </View>
        <View
          style={[
            styles.streak,
            { backgroundColor: streak.todayDone ? p.warningSoft : p.surfaceAlt },
          ]}
          accessible
          accessibilityLabel={`连续打卡 ${streak.current} 天${streak.todayDone ? '，今天已打卡' : '，今天还没打卡'}`}
          testID="streak"
        >
          <Txt style={{ fontSize: 16, opacity: streak.todayDone ? 1 : 0.45 }}>🔥</Txt>
          <Txt
            variant="headline"
            style={{ color: streak.todayDone ? p.warningText : p.textSecondary }}
          >
            {streak.current} 天
          </Txt>
        </View>
      </View>

      {!book ? (
        <Card style={styles.hero}>
          <Txt variant="headline">还没有选择词书</Txt>
          <Txt tone="secondary" style={{ marginTop: space.xs }}>
            先选一本：四级、六级、考研或雅思。之后每天打开这里，点一下就开始。
          </Txt>
          <View style={{ marginTop: space.xl }}>
            <Button
              label="选择词书"
              onPress={() => router.navigate('/books')}
              testID="choose-book"
            />
          </View>
        </Card>
      ) : (
        <Card style={styles.hero}>
          <View style={styles.bookLine}>
            <View style={[styles.examDot, { backgroundColor: p.exam[book.exam] }]} />
            <Txt variant="callout" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>
              {EXAM_LABEL[book.exam]} · {book.name} · 已学 {data.bookLearned}/{book.word_count}
            </Txt>
          </View>

          <View style={styles.stats}>
            <Stat value={data.newToDo} label="今日新词" testID="today-new" />
            <View style={[styles.vr, { backgroundColor: p.border }]} />
            <Stat value={data.reviewToDo} label="待复习" testID="today-review" />
          </View>

          {goal > 0 ? (
            <View style={{ gap: space.xs, marginBottom: space.lg }}>
              <ProgressBar value={doneToday / goal} label="今日进度" color={p.exam[book.exam]} />
              <Txt variant="caption" tone="tertiary">
                今天已学 {data.newDone} 个新词、复习 {data.reviewDone} 个
              </Txt>
            </View>
          ) : null}

          {budget && budget.overflow > 0 ? (
            <View style={{ marginBottom: space.lg }}>
              <Notice>
                有 {budget.overflow} 个复习超出了每日上限，会按每天最多 {data.reviewCap} 个分{' '}
                {budget.backlogDays} 天补完，不会一次压给你。期间新词暂时减到 {budget.newQuota} 个。
              </Notice>
            </View>
          ) : null}

          {remaining > 0 ? (
            <Button
              label={streak.todayDone ? '继续学习' : '开始今天'}
              onPress={() => router.push('/study')}
              accessibilityHint={`共 ${remaining} 张卡片，每组最多 20 张`}
              testID="start-today"
              color={p.exam[book.exam]}
            />
          ) : (
            <View style={{ gap: space.sm, alignItems: 'center' }}>
              <Txt variant="headline">今天的任务完成了 ✓</Txt>
              <Txt variant="caption" tone="secondary" style={{ textAlign: 'center' }}>
                明天再来。想多练可以去「练习」看看弱点词，或在「词书」里调高每日新词。
              </Txt>
            </View>
          )}
        </Card>
      )}

      <Txt variant="caption" tone="tertiary" style={{ textAlign: 'center', marginTop: space.lg }}>
        每天完成 1 组就算打卡
        {streak.longest > streak.current ? ` · 最长连续 ${streak.longest} 天` : ''}
      </Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingTop: space.lg,
    paddingBottom: space.lg,
  },
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.md,
    height: 36,
    borderRadius: radius.pill,
  },
  hero: { padding: space.xl },
  bookLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  examDot: { width: 8, height: 8, borderRadius: 4 },
  stats: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.xl },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  vr: { width: StyleSheet.hairlineWidth, height: 48 },
});
