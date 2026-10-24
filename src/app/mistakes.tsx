import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import {
  REDO_THRESHOLD,
  redoHref,
  useMistakeBook,
  type MistakeGroup,
  type MistakeItem,
} from '@/features/mistakes/service';
import { breakLongWords } from '@/features/reading/parts';
import { Button, ErrorView, Loading, PressableScale, Screen, Txt } from '@/ui/primitives';
import { radius, space, usePalette } from '@/ui/theme';

/** 右上角的小标签：客观题「错 2 题」，主观题「待重练」 */
function Badge({ item }: { item: MistakeItem }) {
  const p = usePalette();
  const subjective = item.kind === 'subjective';
  return (
    <View
      style={[styles.badge, { backgroundColor: subjective ? p.warningSoft : p.dangerSoft }]}
      testID={`mistake-badge-${item.questionId}`}
    >
      <Txt
        variant="caption"
        style={{
          color: subjective ? p.warningText : p.danger,
          fontWeight: '600',
          fontVariant: ['tabular-nums'],
        }}
      >
        {item.badge}
      </Txt>
    </View>
  );
}

function MistakeCard({ item }: { item: MistakeItem }) {
  const p = usePalette();
  const href = redoHref(item);
  const meta = [
    item.detail,
    item.missTimes > 1 ? `做错过 ${item.missTimes} 次` : null,
    item.dateLabel,
  ]
    .filter(Boolean)
    .join(' · ');
  const body = (
    <>
      <View style={styles.cardHead}>
        <Txt variant="callout" tone="secondary" style={{ flexShrink: 1 }} numberOfLines={1}>
          {item.typeLabel}
        </Txt>
        <Badge item={item} />
      </View>
      {item.preview ? (
        <Txt variant="body" numberOfLines={2} style={breakLongWords}>
          {item.preview}
        </Txt>
      ) : null}
      <Txt
        variant="callout"
        tone="secondary"
        style={{ fontVariant: ['tabular-nums'] }}
        testID={`mistake-detail-${item.questionId}`}
      >
        {meta}
      </Txt>
      {item.blocked ? (
        <Txt
          variant="callout"
          style={{ color: p.warningText }}
          testID={`mistake-blocked-${item.questionId}`}
        >
          {item.blocked}
        </Txt>
      ) : null}
    </>
  );

  if (!href)
    return (
      <View
        accessible
        accessibilityLabel={`${item.typeLabel}，${meta}。${item.blocked ?? ''}`}
        style={[styles.card, { backgroundColor: p.surfaceAlt, borderColor: p.border }]}
        testID={`mistake-${item.questionId}`}
      >
        <View style={styles.cardBody}>{body}</View>
      </View>
    );

  return (
    <PressableScale
      onPress={() => router.push(href)}
      accessibilityRole="button"
      accessibilityLabel={`${item.typeLabel}，${item.kind === 'subjective' ? '待重练，' : ''}${meta}`}
      accessibilityHint="重做这道原题"
      testID={`mistake-${item.questionId}`}
      style={[styles.card, { backgroundColor: p.surface, borderColor: p.border }]}
    >
      <View style={styles.cardBody}>{body}</View>
      <Ionicons name="chevron-forward" size={18} color={p.textTertiary} />
    </PressableScale>
  );
}

function Group({ group }: { group: MistakeGroup }) {
  return (
    <View style={styles.group} testID={`mistake-group-${group.section}`}>
      <View style={styles.groupHead}>
        <Txt variant="headline" accessibilityRole="header">
          {group.title}
        </Txt>
        <Txt variant="callout" tone="tertiary" style={{ fontVariant: ['tabular-nums'] }}>
          {`${group.items.length} 道`}
        </Txt>
      </View>
      {group.items.map((item) => (
        <MistakeCard key={item.questionId} item={item} />
      ))}
    </View>
  );
}

function Empty() {
  const p = usePalette();
  return (
    <View style={styles.empty} testID="mistakes-empty">
      <View style={[styles.emptyIcon, { backgroundColor: p.successSoft }]}>
        <Ionicons name="checkmark-done-outline" size={28} color={p.success} />
      </View>
      <Txt variant="headline" style={styles.center} accessibilityRole="header">
        现在没有要重做的题
      </Txt>
      <Txt variant="body" tone="secondary" style={styles.center}>
        {`阅读里答错的题、翻译和写作低于 ${REDO_THRESHOLD} 分的题会自动收进这里；重做通过就会移出。`}
      </Txt>
      <View style={styles.emptyBtns}>
        <Button
          label="去做阅读"
          kind="secondary"
          size="md"
          onPress={() => router.push('/reading')}
          testID="mistakes-go-reading"
        />
      </View>
    </View>
  );
}

/** 错题本：按板块分组列出没过的题，点进去重做原题；重做通过后回来就不见了 */
export default function MistakesScreen() {
  const { data, error, loading, reload } = useMistakeBook();

  return (
    <Screen edges={[]}>
      <Txt variant="title" accessibilityRole="header" style={styles.title}>
        错题本
      </Txt>
      {error ? (
        <ErrorView message={error} onRetry={reload} />
      ) : !data ? (
        loading ? (
          <Loading />
        ) : null
      ) : data.total === 0 ? (
        <Empty />
      ) : (
        <>
          <Txt variant="callout" tone="secondary" testID="mistakes-summary">
            {`共 ${data.total} 道。客观题重做全对、翻译写作重做到 ${REDO_THRESHOLD} 分就会移出。`}
          </Txt>
          {data.groups.map((g) => (
            <Group key={g.section} group={g} />
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { paddingTop: space.lg, paddingBottom: space.sm },
  group: { gap: space.md, marginTop: space.xl },
  groupHead: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 72,
  },
  cardBody: { flex: 1, minWidth: 0, gap: space.xs },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    flexShrink: 0,
  },
  empty: {
    alignItems: 'center',
    gap: space.md,
    paddingTop: space.xxl,
    paddingHorizontal: space.md,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { textAlign: 'center', maxWidth: 420 },
  emptyBtns: {
    alignSelf: 'stretch',
    marginTop: space.md,
    maxWidth: 420,
    width: '100%',
    marginHorizontal: 'auto',
  },
});
