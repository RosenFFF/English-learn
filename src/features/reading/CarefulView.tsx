/** 仔细阅读：两篇（两道题）分段切换，每篇先文章后 5 道四选一；两篇常驻，各自保留滚动位置。 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, Segmented, Txt } from '../../ui/primitives';
import { space } from '../../ui/theme';
import {
  ChoiceButton,
  ResetScroll,
  ScoreCard,
  Verdict,
  breakLongWords,
  gradedState,
  type ChoiceState,
} from './parts';
import {
  letterOf,
  partOffsets,
  plainStem,
  type AnswerSheet,
  type GradeResult,
  type SetOf,
  type SheetAction,
} from './service';

const PASSAGE_NAMES = ['第一篇', '第二篇', '第三篇', '第四篇'];
const PASSAGE_EN = ['Passage One', 'Passage Two', 'Passage Three', 'Passage Four'];

export function CarefulView({
  set,
  sheet,
  grade,
  dispatch,
}: {
  set: SetOf<'careful_reading'>;
  sheet: AnswerSheet;
  grade: GradeResult | null;
  dispatch: (a: SheetAction) => void;
}) {
  const [current, setCurrent] = useState(0);
  // 每篇第一题在整张答题卡里的序号
  const offsets = partOffsets(set);
  const names = set.parts.map((_, i) => PASSAGE_NAMES[i] ?? `第 ${i + 1} 篇`);
  const doneIn = (pi: number): number => {
    const from = offsets[pi] ?? 0;
    const n = set.parts[pi]?.payload.questions.length ?? 0;
    return sheet.answers.slice(from, from + n).filter((a) => a !== null).length;
  };

  return (
    <View style={{ flex: 1 }}>
      {/* 错题本重做只有一篇，不用切换 */}
      {set.parts.length > 1 ? (
        <View style={styles.switchBar}>
          <View style={styles.switchInner}>
            <Segmented
              options={set.parts.map((_, i) => i)}
              value={current}
              onChange={setCurrent}
              label="切换文章"
              tall
              format={(i) =>
                grade
                  ? (names[i] ?? '')
                  : `${names[i]} ${doneIn(i)}/${set.parts[i]?.payload.questions.length ?? 0}`
              }
            />
          </View>
        </View>
      ) : null}
      {set.parts.map((part, pi) => (
        <ResetScroll
          key={part.id}
          resetKey={sheet.submitted}
          style={[{ flex: 1 }, pi !== current && styles.hidden]}
          contentContainerStyle={styles.scroll}
          testID={`careful-passage-${pi + 1}`}
        >
          <View style={styles.inner}>
            {grade ? <ScoreCard grade={grade} type={set.type} /> : null}
            <Card style={{ gap: space.md }}>
              <Txt variant="overline" tone="tertiary" accessibilityRole="header">
                {PASSAGE_EN[pi] ?? `Passage ${pi + 1}`}
              </Txt>
              {part.payload.passage.split(/\n{2,}/).map((para, i) => (
                <Txt key={i} variant="body" style={breakLongWords}>
                  {para}
                </Txt>
              ))}
            </Card>
            {part.payload.questions.map((q, qi) => {
              const index = (offsets[pi] ?? 0) + qi;
              const chosen = sheet.answers[index] ?? null;
              const r = grade?.items[index];
              return (
                <Card key={qi} style={{ gap: space.md }}>
                  <Txt
                    variant="body"
                    style={[{ fontWeight: '600' }, breakLongWords]}
                    testID={`careful-stem-${index + 1}`}
                  >
                    {`${index + 1}. ${plainStem(q.stem)}`}
                  </Txt>
                  <View
                    style={{ gap: space.sm }}
                    accessibilityRole="radiogroup"
                    accessibilityLabel={`第 ${index + 1} 题`}
                  >
                    {q.options.map((text, oi) => {
                      const key = letterOf(oi);
                      const state: ChoiceState = r
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
                          onPress={() => dispatch({ type: 'answer', index, value: key })}
                          accessibilityLabel={`第 ${index + 1} 题选 ${key}：${text}`}
                          testID={`careful-${index + 1}-${key}`}
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
                      testID={`result-${index + 1}`}
                    />
                  ) : null}
                </Card>
              );
            })}
          </View>
        </ResetScroll>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  switchBar: { paddingHorizontal: space.lg, paddingBottom: space.sm, alignItems: 'center' },
  switchInner: { width: '100%', maxWidth: 560 },
  hidden: { display: 'none' },
  scroll: { padding: space.lg, paddingTop: space.sm, alignItems: 'center' },
  inner: { width: '100%', maxWidth: 560, gap: space.md },
});
