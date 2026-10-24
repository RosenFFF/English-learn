import { StyleSheet, View } from 'react-native';

import {
  DAILY_NEW_OPTIONS,
  EXAM_LABEL,
  EXAM_SUBTITLE,
  REVIEW_CAP_OPTIONS,
} from '@/features/books/constants';
import {
  chooseBook,
  setBookAmounts,
  useBooksOverview,
  type BookOverview,
} from '@/features/books/service';
import {
  Card,
  ErrorView,
  Loading,
  PressableScale,
  ProgressBar,
  Screen,
  SectionTitle,
  Segmented,
  Txt,
} from '@/ui/primitives';
import { radius, space, usePalette } from '@/ui/theme';

function BookCard({ book }: { book: BookOverview }) {
  const p = usePalette();
  const color = p.exam[book.exam];
  const ratio = book.word_count ? book.learned / book.word_count : 0;
  return (
    <PressableScale
      onPress={() => void chooseBook(book.id)}
      accessibilityRole="radio"
      accessibilityState={{ selected: book.active, checked: book.active }}
      accessibilityLabel={`${EXAM_LABEL[book.exam]}，${book.name}，共 ${book.word_count} 词，已学 ${book.learned} 词${book.active ? '，当前词书' : ''}`}
      accessibilityHint={book.active ? undefined : '设为当前词书'}
      testID={`book-${book.id}`}
      style={[
        styles.book,
        {
          backgroundColor: p.surface,
          borderColor: book.active ? color : p.border,
          borderWidth: book.active ? 2 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      <View style={styles.bookTop}>
        <View style={[styles.badge, { backgroundColor: color }]}>
          <Txt variant="headline" style={{ color: '#fff' }}>
            {EXAM_LABEL[book.exam]}
          </Txt>
        </View>
        <View style={{ flex: 1 }}>
          <Txt variant="headline">{book.name}</Txt>
          <Txt variant="caption" tone="secondary">
            {EXAM_SUBTITLE[book.exam]}
          </Txt>
        </View>
        {book.active ? (
          <View style={[styles.current, { backgroundColor: color }]}>
            <Txt variant="overline" style={{ color: '#fff' }}>
              当前
            </Txt>
          </View>
        ) : null}
      </View>
      <View style={{ gap: 6, marginTop: space.md }}>
        <ProgressBar value={ratio} color={color} label={`${book.name} 学习进度`} />
        <Txt variant="caption" tone="tertiary" style={{ fontVariant: ['tabular-nums'] }}>
          已学 {book.learned} / {book.word_count} 词 ·{' '}
          {(ratio * 100).toFixed(ratio > 0 && ratio < 0.01 ? 1 : 0)}%
        </Txt>
      </View>
    </PressableScale>
  );
}

export default function BooksScreen() {
  const { data, error, reload } = useBooksOverview();
  if (error)
    return (
      <Screen edges={[]}>
        <ErrorView message={error} onRetry={reload} />
      </Screen>
    );
  if (!data)
    return (
      <Screen edges={[]}>
        <Loading />
      </Screen>
    );
  const active = data.find((b) => b.active);

  return (
    <Screen edges={[]}>
      <Txt variant="title" accessibilityRole="header" style={styles.title}>
        词书
      </Txt>
      <View accessibilityRole="radiogroup" accessibilityLabel="选择词书" style={{ gap: space.md }}>
        {data.map((b) => (
          <BookCard key={b.id} book={b} />
        ))}
      </View>

      {active ? (
        <>
          <SectionTitle>{`每日计划 · ${active.name}`}</SectionTitle>
          <Card style={{ gap: space.lg }}>
            <View style={{ gap: space.sm }}>
              <Txt variant="callout">每日新词</Txt>
              <Segmented
                label="每日新词"
                options={DAILY_NEW_OPTIONS}
                value={nearest(DAILY_NEW_OPTIONS, active.dailyNew)}
                onChange={(v) => void setBookAmounts(active.id, v, active.dailyReviewCap)}
              />
            </View>
            <View style={{ gap: space.sm }}>
              <Txt variant="callout">每日复习上限</Txt>
              <Segmented
                label="每日复习上限"
                options={REVIEW_CAP_OPTIONS}
                value={nearest(REVIEW_CAP_OPTIONS, active.dailyReviewCap)}
                onChange={(v) => void setBookAmounts(active.id, active.dailyNew, v)}
              />
              <Txt variant="caption" tone="tertiary">
                超过上限的复习会顺延，分几天补完；有欠账时新词自动减量，避免越欠越多。
              </Txt>
            </View>
          </Card>
        </>
      ) : (
        <Txt variant="caption" tone="tertiary" style={{ marginTop: space.lg, textAlign: 'center' }}>
          点一本词书设为当前词书，各词书之间的单词进度互通。
        </Txt>
      )}
    </Screen>
  );
}

function nearest<T extends number>(opts: readonly T[], v: number): T {
  return opts.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a), opts[0] as T);
}

const styles = StyleSheet.create({
  title: { paddingTop: space.lg, paddingBottom: space.lg },
  book: { borderRadius: radius.lg, padding: space.lg },
  bookTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  badge: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  current: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
});
