/** 选词填空：上面是正文（空位可点），下面固定词库；判分后正文标出对错，下面逐空给解析。 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View, useWindowDimensions, ScrollView } from 'react-native';

import { Card, Txt } from '../../ui/primitives';
import { radius, space, usePalette } from '../../ui/theme';
import {
  ChoiceButton,
  ResetScroll,
  ScoreCard,
  Verdict,
  breakLongWords,
  type ChoiceState,
} from './parts';
import {
  indexOfValue,
  letterOf,
  splitClozePassage,
  type AnswerSheet,
  type AnswerValue,
  type BankedClozePayload,
  type GradeResult,
  type SetOf,
  type SheetAction,
} from './service';

const NBSP = '\u00A0';
// 空位前后用不换行空格当内边距：背景色不会在行尾露出一截，序号和词也不会被拆到两行
const BLANK_EMPTY = '\u2002\u2002\u2002\u2002';

function wordOf(p: BankedClozePayload, v: AnswerValue | null | undefined): string | null {
  if (typeof v !== 'number') return null;
  return p.options[v] ?? null;
}

/** 「B barely」 */
function labelOf(p: BankedClozePayload, v: AnswerValue | null | undefined): string | null {
  return typeof v === 'number' ? `${letterOf(v)} ${wordOf(p, v) ?? ''}`.trim() : null;
}

function Passage({
  payload,
  sheet,
  grade,
  dispatch,
}: {
  payload: BankedClozePayload;
  sheet: AnswerSheet;
  grade: GradeResult | null;
  dispatch: (a: SheetAction) => void;
}) {
  const p = usePalette();
  return (
    <View style={{ gap: space.md }}>
      {payload.passage.split(/\n{2,}/).map((para, pi) => (
        <Txt key={pi} variant="body" style={[styles.passage, breakLongWords]}>
          {splitClozePassage(para).map((seg, si) => {
            if (seg.kind === 'text') return seg.text;
            const i = seg.index;
            const chosen = sheet.answers[i];
            const n = i + 1;
            if (grade) {
              const r = grade.items[i];
              const ok = Boolean(r?.correct);
              const color = ok ? p.success : p.danger;
              const bg = ok ? p.successSoft : p.dangerSoft;
              const given = wordOf(payload, chosen);
              return (
                <Txt
                  key={si}
                  variant="body"
                  style={[styles.passage, styles.gradedBlank, { backgroundColor: bg, color }]}
                >
                  {`${NBSP}(${n})${NBSP}`}
                  {!ok && given ? (
                    <Txt variant="body" style={[styles.struck, { color }]}>
                      {given}
                    </Txt>
                  ) : null}
                  {!ok && given ? NBSP : null}
                  <Txt variant="body" style={{ color: p.success, fontWeight: '700' }}>
                    {wordOf(payload, r?.expected)}
                  </Txt>
                  {NBSP}
                </Txt>
              );
            }
            const focused = sheet.focus === i;
            const word = wordOf(payload, chosen);
            return (
              <Txt
                key={si}
                variant="body"
                onPress={() => dispatch({ type: 'focus', index: i })}
                accessibilityRole="button"
                accessibilityLabel={`第 ${n} 空，${word ?? '未填'}${focused ? '，当前空位' : ''}`}
                testID={`cloze-blank-${n}`}
                style={[
                  styles.passage,
                  styles.blank,
                  {
                    color: focused ? p.primary : word ? p.text : p.textSecondary,
                    backgroundColor: focused ? p.primarySoft : p.surfaceAlt,
                    textDecorationColor: focused ? p.primary : p.textTertiary,
                  },
                ]}
              >
                {`${NBSP}(${n})${NBSP}${word ?? BLANK_EMPTY}${NBSP}`}
              </Txt>
            );
          })}
        </Txt>
      ))}
    </View>
  );
}

function WordBank({
  payload,
  sheet,
  dispatch,
}: {
  payload: BankedClozePayload;
  sheet: AnswerSheet;
  dispatch: (a: SheetAction) => void;
}) {
  const p = usePalette();
  // 词库最多占屏幕四成高，超出可以滚，保证正文始终看得到
  const { height } = useWindowDimensions();
  const focus = sheet.focus ?? 0;
  const current = sheet.answers[focus] ?? null;
  const total = sheet.answers.length;
  const step = (d: number): void => dispatch({ type: 'focus', index: (focus + d + total) % total });
  return (
    <View style={[styles.bank, { backgroundColor: p.surface, borderColor: p.border }]}>
      <View style={styles.bankInner}>
        <View style={styles.bankBar}>
          <Pressable
            onPress={() => step(-1)}
            accessibilityRole="button"
            accessibilityLabel="上一空"
            style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: p.surfaceAlt }]}
            testID="cloze-prev"
          >
            <Ionicons name="chevron-back" size={20} color={p.primary} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="headline" numberOfLines={1} testID="cloze-focus">
              第 {focus + 1} 空
            </Txt>
            <Txt variant="caption" tone="secondary" numberOfLines={1}>
              {current !== null ? `已填 ${wordOf(payload, current)}` : '点下面的词填进来'}
            </Txt>
          </View>
          {current !== null ? (
            <Pressable
              onPress={() => dispatch({ type: 'clear', index: focus })}
              accessibilityRole="button"
              accessibilityLabel={`清空第 ${focus + 1} 空`}
              style={({ pressed }) => [
                styles.clearBtn,
                { backgroundColor: pressed ? p.border : p.surfaceAlt },
              ]}
              testID="cloze-clear"
            >
              <Txt variant="callout" tone="secondary" style={{ fontWeight: '600' }}>
                清空
              </Txt>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => step(1)}
            accessibilityRole="button"
            accessibilityLabel="下一空"
            style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: p.surfaceAlt }]}
            testID="cloze-next"
          >
            <Ionicons name="chevron-forward" size={20} color={p.primary} />
          </Pressable>
        </View>
        <ScrollView
          style={{ maxHeight: Math.round(height * 0.42) }}
          contentContainerStyle={styles.words}
          testID="cloze-bank"
        >
          {payload.options.map((word, i) => {
            const letter = letterOf(i);
            const at = indexOfValue(sheet, i);
            const inFocus = at === focus;
            const state: ChoiceState = inFocus ? 'selected' : at !== -1 ? 'used' : 'idle';
            return (
              <ChoiceButton
                key={i}
                label={letter}
                text={word}
                state={state}
                inactive={state === 'used'}
                onPress={() => dispatch({ type: 'pick', value: i })}
                accessibilityLabel={
                  state === 'used'
                    ? `${letter} ${word}，已填在第 ${at + 1} 空`
                    : inFocus
                      ? `${letter} ${word}，在当前空里，再点一次清空`
                      : `${letter} ${word}，填进第 ${focus + 1} 空`
                }
                testID={`cloze-word-${letter}`}
                outerStyle={styles.wordCell}
                style={styles.word}
                textStyle={styles.wordText}
              >
                {state === 'used' ? (
                  <Txt variant="caption" tone="tertiary" style={styles.usedTag}>
                    {at + 1}
                  </Txt>
                ) : null}
              </ChoiceButton>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

export function ClozeView({
  set,
  sheet,
  grade,
  dispatch,
}: {
  set: SetOf<'banked_cloze'>;
  sheet: AnswerSheet;
  grade: GradeResult | null;
  dispatch: (a: SheetAction) => void;
}) {
  // 六级选词填空一次只有一篇；答题卡下标即空位序号
  const payload = set.parts[0]?.payload;
  if (!payload) return null;
  return (
    <View style={{ flex: 1 }}>
      <ResetScroll
        resetKey={sheet.submitted}
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        testID="cloze-passage-scroll"
      >
        <View style={styles.inner}>
          {grade ? <ScoreCard grade={grade} type={set.type} /> : null}
          <Card style={{ gap: space.md }}>
            <Txt variant="overline" tone="tertiary">
              从 15 个词中选 10 个填空，每个词只能用一次
            </Txt>
            <Passage payload={payload} sheet={sheet} grade={grade} dispatch={dispatch} />
          </Card>
          {grade ? (
            <View style={{ gap: space.md }} testID="cloze-results">
              {payload.blanks.map((b, i) => {
                const r = grade.items[i];
                return (
                  <Card key={i} style={{ gap: space.sm }}>
                    <Txt variant="headline">第 {i + 1} 空</Txt>
                    <Verdict
                      correct={Boolean(r?.correct)}
                      chosen={labelOf(payload, r?.given)}
                      answer={labelOf(payload, b.answer) ?? ''}
                      explanation={b.explanation}
                      testID={`result-${i + 1}`}
                    />
                  </Card>
                );
              })}
            </View>
          ) : null}
        </View>
      </ResetScroll>
      {grade ? null : <WordBank payload={payload} sheet={sheet} dispatch={dispatch} />}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: space.lg, alignItems: 'center' },
  inner: { width: '100%', maxWidth: 560, gap: space.md },
  passage: { lineHeight: 32 },
  blank: {
    fontWeight: '600',
    textDecorationLine: 'underline',
    borderRadius: 6,
  },
  gradedBlank: { fontWeight: '600', borderRadius: 6 },
  struck: { textDecorationLine: 'line-through', fontWeight: '400' },
  bank: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.md,
    alignItems: 'center',
  },
  bankInner: { width: '100%', maxWidth: 560, gap: space.sm },
  bankBar: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtn: {
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    justifyContent: 'center',
  },
  words: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  // 词块按内容宽度从左往右排（像词卡一样）：长词自己占宽一点、超长词在块内换行，
  // 不挤进固定三列，360 宽也不会把普通单词拆开
  wordCell: { maxWidth: '100%' },
  word: { paddingHorizontal: space.md, gap: 6 },
  wordText: { flexGrow: 0, flexShrink: 1, flexBasis: 'auto' },
  usedTag: { fontVariant: ['tabular-nums'] },
});
