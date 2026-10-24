/**
 * 长篇阅读（段落匹配）：「原文 / 题目」分段切换，两页都常驻、各自保留滚动位置。
 * 题目里选了段落后可以点「看 X 段」直接跳到原文那一段核对。
 */
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';

import { Card, Segmented, Txt } from '../../ui/primitives';
import { radius, space, usePalette } from '../../ui/theme';
import {
  ChoiceButton,
  ScoreCard,
  Verdict,
  breakLongWords,
  gradedState,
  useScrollTopOn,
  type ChoiceState,
} from './parts';
import {
  answeredCount,
  type AnswerSheet,
  type GradeResult,
  type SetOf,
  type SheetAction,
} from './service';

type Pane = '原文' | '题目';

export function MatchingView({
  set,
  sheet,
  grade,
  dispatch,
}: {
  set: SetOf<'matching'>;
  sheet: AnswerSheet;
  grade: GradeResult | null;
  dispatch: (a: SheetAction) => void;
}) {
  const p = usePalette();
  // 六级长篇阅读一次一篇
  const payload = set.parts[0]!.payload;
  // 先看原文；判分后直接看题目和解析
  const [pane, setPane] = useState<Pane>('原文');
  const [lastSubmitted, setLastSubmitted] = useState(sheet.submitted);
  if (sheet.submitted !== lastSubmitted) {
    setLastSubmitted(sheet.submitted);
    if (sheet.submitted) setPane('题目');
  }
  const passageRef = useRef<ScrollViewInstance>(null);
  const paraRefs = useRef<Record<string, ComponentRef<typeof View> | null>>({});
  const contentRef = useRef<ComponentRef<typeof View>>(null);

  // 跳到某一段：先切到原文，等原文显示出来（提交到界面之后）再滚动，隐藏状态下滚动无效
  const pendingJump = useRef<string | null>(null);
  const [jumpTick, setJumpTick] = useState(0);
  const jumpTo = (key: string): void => {
    pendingJump.current = key;
    setPane('原文');
    setJumpTick((n) => n + 1);
  };
  useEffect(() => {
    const key = pendingJump.current;
    if (pane !== '原文' || key === null) return;
    pendingJump.current = null;
    // 跳转时现量位置（onLayout 在网页上给的是相对坐标，不可靠）
    const para = paraRefs.current[key];
    const content = contentRef.current;
    if (!para || !content) return;
    para.measureLayout(
      content,
      (_x, y) => passageRef.current?.scrollTo({ y: Math.max(0, y), animated: false }),
      () => undefined,
    );
  }, [pane, jumpTick]);

  const questionsRef = useScrollTopOn(sheet.submitted);
  const done = answeredCount(sheet);
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.switchBar}>
        <View style={styles.switchInner} testID="matching-pane">
          <Segmented
            options={['原文', '题目'] as const}
            value={pane}
            onChange={setPane}
            label="切换原文和题目"
            tall
            format={(v) => (v === '题目' && !grade ? `题目 ${done}/${sheet.answers.length}` : v)}
          />
        </View>
      </View>

      <ScrollView
        ref={passageRef}
        style={[{ flex: 1 }, pane !== '原文' && styles.hidden]}
        contentContainerStyle={styles.scroll}
        testID="matching-passage"
      >
        <View ref={contentRef} style={styles.inner}>
          <Txt variant="title" accessibilityRole="header" style={{ fontSize: 22, lineHeight: 28 }}>
            {payload.title}
          </Txt>
          {payload.paragraphs.map((para) => (
            <View
              key={para.label}
              style={styles.para}
              ref={(el) => {
                paraRefs.current[para.label] = el;
              }}
              testID={`para-${para.label}`}
            >
              <View style={[styles.paraKey, { backgroundColor: p.primarySoft }]}>
                <Txt variant="callout" tone="accent" style={{ fontWeight: '700' }}>
                  {para.label}
                </Txt>
              </View>
              <Txt variant="body" style={[{ flex: 1, minWidth: 0 }, breakLongWords]}>
                {para.text}
              </Txt>
            </View>
          ))}
        </View>
      </ScrollView>

      <ScrollView
        ref={questionsRef}
        style={[{ flex: 1 }, pane !== '题目' && styles.hidden]}
        contentContainerStyle={styles.scroll}
        testID="matching-questions"
      >
        <View style={styles.inner}>
          {grade ? <ScoreCard grade={grade} type={set.type} /> : null}
          {payload.statements.map((st, i) => {
            const chosen = sheet.answers[i] ?? null;
            const r = grade?.items[i];
            return (
              <Card key={i} style={{ gap: space.md }}>
                <Txt variant="body" style={breakLongWords}>
                  <Txt variant="body" tone="tertiary" style={{ fontWeight: '700' }}>
                    {`${i + 1}. `}
                  </Txt>
                  {st.text}
                </Txt>
                <View
                  style={styles.keys}
                  accessibilityRole="radiogroup"
                  accessibilityLabel={`第 ${i + 1} 题选段落`}
                >
                  {payload.paragraphs.map((para) => {
                    const state: ChoiceState = r
                      ? gradedState(para.label, chosen, r.expected)
                      : chosen === para.label
                        ? 'selected'
                        : 'idle';
                    return (
                      <ChoiceButton
                        key={para.label}
                        label={para.label}
                        state={state}
                        inactive={Boolean(grade)}
                        onPress={() =>
                          chosen === para.label
                            ? dispatch({ type: 'clear', index: i })
                            : dispatch({ type: 'answer', index: i, value: para.label })
                        }
                        accessibilityLabel={`第 ${i + 1} 题选 ${para.label} 段${chosen === para.label ? '，已选，再点取消' : ''}`}
                        testID={`match-${i + 1}-${para.label}`}
                      />
                    );
                  })}
                </View>
                {r ? (
                  <Verdict
                    correct={r.correct}
                    chosen={r.given === null ? null : String(r.given)}
                    answer={String(r.expected)}
                    explanation={st.explanation}
                    testID={`result-${i + 1}`}
                  />
                ) : null}
                {chosen !== null || r ? (
                  <Pressable
                    onPress={() => jumpTo(String(r ? r.expected : chosen))}
                    accessibilityRole="link"
                    testID={`jump-${i + 1}`}
                    style={({ pressed }) => [
                      styles.jump,
                      { backgroundColor: pressed ? p.surfaceAlt : 'transparent' },
                    ]}
                  >
                    <Txt variant="callout" tone="accent" style={{ fontWeight: '600' }}>
                      {`看原文 ${String(r ? r.expected : chosen)} 段 ›`}
                    </Txt>
                  </Pressable>
                ) : null}
              </Card>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  switchBar: { paddingHorizontal: space.lg, paddingBottom: space.sm, alignItems: 'center' },
  switchInner: { width: '100%', maxWidth: 560 },
  hidden: { display: 'none' },
  scroll: { padding: space.lg, paddingTop: space.sm, alignItems: 'center' },
  inner: { width: '100%', maxWidth: 560, gap: space.md },
  para: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  paraKey: {
    width: 28,
    height: 28,
    borderRadius: radius.sm - 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 0,
  },
  keys: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  jump: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    marginLeft: -space.sm,
    marginVertical: -space.sm,
    borderRadius: radius.sm,
  },
});
