import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { openExamPicker, sectionHref } from '@/features/exam/navigation';
import {
  examSections,
  getExam,
  useSelectedExam,
  type SectionId,
  type SectionMeta,
} from '@/features/exam/service';
import { useTodaySummary, type TodaySummary } from '@/features/study/service';
import { ErrorView, Loading, PressableScale, Screen, Txt } from '@/ui/primitives';
import { radius, space, usePalette } from '@/ui/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];
const SECTION_ICON: Record<SectionId, IconName> = {
  vocab: 'book-outline',
  reading: 'document-text-outline',
  translation: 'language-outline',
  writing: 'create-outline',
  listening: 'headset-outline',
  mistakes: 'bookmark-outline',
};

/** 已上线板块卡片上的小字（词汇显示今天的任务，另算） */
const LIVE_CAPTION: Partial<Record<SectionId, string>> = {
  reading: '3 种题型 · 大模型出题',
  translation: '汉译英 · 大模型评分',
  writing: '15 分制 · 大模型评分',
  listening: '3 种题型 · 系统朗读',
  mistakes: '错题 · 待重练',
};

function VocabStatus({ data }: { data: TodaySummary | null }) {
  if (!data)
    return (
      <Txt variant="caption" tone="tertiary">
        正在统计…
      </Txt>
    );
  if (!data.book)
    return (
      <Txt variant="caption" tone="secondary">
        先选一本词书
      </Txt>
    );
  if (data.reviewToDo + data.newToDo === 0)
    return (
      <Txt variant="caption" tone="secondary">
        今天已完成 ✓
      </Txt>
    );
  return (
    <View style={{ gap: 2 }}>
      <Txt
        variant="caption"
        tone="secondary"
        style={{ fontVariant: ['tabular-nums'] }}
        testID="home-vocab-review"
      >
        待复习 {data.reviewToDo}
      </Txt>
      <Txt
        variant="caption"
        tone="secondary"
        style={{ fontVariant: ['tabular-nums'] }}
        testID="home-vocab-new"
      >
        新词 {data.newToDo}
      </Txt>
    </View>
  );
}

function SectionCard({
  section,
  accent,
  today,
}: {
  section: SectionMeta;
  accent: string;
  today: TodaySummary | null;
}) {
  const p = usePalette();
  const live = section.available;
  const data = today;
  const vocabLabel =
    section.id === 'vocab' && data?.book
      ? `，待复习 ${data.reviewToDo} 个，新词 ${data.newToDo} 个`
      : LIVE_CAPTION[section.id]
        ? `，${LIVE_CAPTION[section.id]}`
        : '';
  return (
    <PressableScale
      onPress={() => router.push(sectionHref(section.id))}
      accessibilityRole="button"
      accessibilityLabel={`${section.title}${live ? vocabLabel : '，即将上线'}`}
      accessibilityHint={section.description}
      testID={`section-${section.id}`}
      outerStyle={styles.cellOuter}
      style={[
        styles.cell,
        {
          backgroundColor: live ? p.surface : p.surfaceAlt,
          borderColor: p.border,
        },
      ]}
    >
      <View
        style={[styles.icon, { backgroundColor: live ? p.primarySoft : p.surface }]}
        importantForAccessibility="no-hide-descendants"
      >
        <Ionicons
          name={SECTION_ICON[section.id]}
          size={20}
          color={live ? accent : p.textTertiary}
        />
      </View>
      <Txt variant="headline" tone={live ? 'primary' : 'secondary'} numberOfLines={1}>
        {section.title}
      </Txt>
      {live ? (
        section.id === 'vocab' ? (
          <VocabStatus data={today} />
        ) : LIVE_CAPTION[section.id] ? (
          <Txt variant="caption" tone="secondary">
            {LIVE_CAPTION[section.id]}
          </Txt>
        ) : null
      ) : (
        <Txt variant="caption" tone="tertiary">
          即将上线
        </Txt>
      )}
    </PressableScale>
  );
}

export default function HomeScreen() {
  const p = usePalette();
  const { data: examId, error, loading, reload } = useSelectedExam();
  const { data: today } = useTodaySummary();

  if (error)
    return (
      <Screen>
        <ErrorView message={error} onRetry={reload} />
      </Screen>
    );
  if (!examId)
    return loading ? (
      <Screen>
        <Loading />
      </Screen>
    ) : (
      <Redirect href="/choose-exam" />
    );

  const exam = getExam(examId);
  const accent = p.exam[exam.id];
  return (
    <Screen>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Txt variant="caption" tone="tertiary">
            备考
          </Txt>
          <Txt variant="title" accessibilityRole="header" numberOfLines={1} testID="home-exam">
            {exam.name}
          </Txt>
        </View>
        <Pressable
          onPress={() => openExamPicker('home')}
          accessibilityRole="button"
          accessibilityLabel="切换考试"
          hitSlop={8}
          testID="switch-exam"
          style={({ pressed }) => [
            styles.switch,
            { backgroundColor: pressed ? p.border : p.surfaceAlt },
          ]}
        >
          <Txt variant="callout" tone="accent" style={{ fontWeight: '600' }}>
            切换 ›
          </Txt>
        </Pressable>
      </View>

      <View style={styles.grid}>
        {examSections(exam.id).map((s) => (
          <SectionCard key={s.id} section={s} accent={accent} today={today} />
        ))}
      </View>

      <Txt variant="caption" tone="tertiary" style={{ textAlign: 'center', marginTop: space.lg }}>
        {`${exam.shortName}各题型的练习题由你配置的大模型生成，陆续上线`}
      </Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.md,
    paddingTop: space.lg,
    paddingBottom: space.lg,
  },
  switch: {
    height: 36,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    justifyContent: 'center',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  cellOuter: { flexGrow: 1, flexBasis: '45%' },
  cell: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    gap: space.sm,
    minHeight: 132,
    // 同一行的两张卡片等高
    flexGrow: 1,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
