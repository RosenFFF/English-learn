import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { usePracticeLists, type PracticeWord } from '@/features/practice/service';
import { speakWord } from '@/features/study/speech';
import { Card, Divider, ErrorView, Loading, Screen, Segmented, Txt } from '@/ui/primitives';
import { space, usePalette } from '@/ui/theme';

type ListKind = '弱点词' | '生词';

function WordRow({ item, kind }: { item: PracticeWord; kind: ListKind }) {
  const p = usePalette();
  const meaning = item.word.meanings.map((m) => `${m.pos ? `${m.pos}. ` : ''}${m.zh}`).join('；');
  const phonetic = item.word.phoneticUs ?? item.word.phoneticUk ?? '';
  return (
    <Pressable
      onPress={() => speakWord(item.word.headword)}
      accessibilityRole="button"
      accessibilityLabel={`${item.word.headword}，${meaning}${kind === '弱点词' ? `，忘记 ${item.forgotten} 次` : ''}`}
      accessibilityHint="朗读这个单词"
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: p.surfaceAlt }]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <View
          style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm, flexWrap: 'wrap' }}
        >
          <Txt variant="headline" style={{ flexShrink: 1 }}>
            {item.word.headword}
          </Txt>
          {phonetic ? (
            <Txt variant="caption" tone="tertiary">
              {phonetic}
            </Txt>
          ) : null}
        </View>
        <Txt variant="callout" tone="secondary" numberOfLines={2}>
          {meaning || '（暂无释义）'}
        </Txt>
      </View>
      {kind === '弱点词' && item.forgotten > 0 ? (
        <View style={[styles.lapse, { backgroundColor: p.warningSoft }]}>
          <Txt variant="caption" style={{ color: p.warningText }}>
            忘 {item.forgotten} 次
          </Txt>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function PracticeScreen() {
  const [kind, setKind] = useState<ListKind>('弱点词');
  const { data, error, reload } = usePracticeLists();
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
  const list = kind === '弱点词' ? data.weak : data.recent;

  return (
    <Screen>
      <Txt
        variant="title"
        accessibilityRole="header"
        style={{ paddingTop: space.lg, paddingBottom: space.lg }}
      >
        练习
      </Txt>
      <Segmented
        label="单词列表"
        options={['弱点词', '生词'] as const}
        value={kind}
        onChange={setKind}
        format={(v) =>
          v === '弱点词' ? `弱点词 ${data.weak.length}` : `近 7 天生词 ${data.recent.length}`
        }
      />
      <Txt
        variant="caption"
        tone="tertiary"
        style={{ marginVertical: space.md, marginLeft: space.xs }}
      >
        {kind === '弱点词'
          ? '最近\u00a014\u00a0天选过「忘了」，或累计忘记过\u00a02\u00a0次以上的词。'
          : '最近\u00a07\u00a0天第一次学的词，按时间倒序。'}
        {/* 操作提示单独一行，窄屏上也不会把「点一下」拆开；数字和单位之间用不换行空格 */}
        {'\n点一下单词听发音。'}
      </Txt>
      {list.length === 0 ? (
        <Card style={{ alignItems: 'center', paddingVertical: space.xxl }}>
          <Txt variant="headline">{kind === '弱点词' ? '还没有弱点词' : '最近 7 天还没学新词'}</Txt>
          <Txt
            variant="caption"
            tone="secondary"
            style={{ marginTop: space.xs, textAlign: 'center' }}
          >
            {kind === '弱点词' ? '背词时选「忘了」的单词会出现在这里。' : '去「今天」开始一组吧。'}
          </Txt>
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {list.map((item, i) => (
            <View key={item.word.id}>
              {i > 0 ? <Divider /> : null}
              <WordRow item={item} kind={kind} />
            </View>
          ))}
        </Card>
      )}
      <Txt variant="caption" tone="tertiary" style={{ textAlign: 'center', marginTop: space.lg }}>
        拼写、听写和例句填空会在下一版加入
      </Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 60,
  },
  lapse: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
});
