/** 阅读三种题型共用的小组件：选项按钮、判分说明、得分卡。 */
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewInstance,
  type ScrollViewProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { Card, PressableScale, Txt } from '../../ui/primitives';
import { radius, space, usePalette, type Palette } from '../../ui/theme';
import {
  cet6PaperScore,
  type AnswerValue,
  type GradeResult,
  type ReadingQuestionType,
} from './service';

/**
 * 超长单词（没有断点）在网页上不会自动断开，会撑出容器；原生端本来就会按字符断。
 * overflow-wrap: break-word 只在一个词一整行都放不下时才在词中间断，也不影响最小宽度计算，
 * 正常英文不受影响（anywhere 会让 flex 布局把普通单词也拆开）。
 */
export const breakLongWords: TextStyle | null =
  Platform.OS === 'web' ? ({ overflowWrap: 'break-word' } as unknown as TextStyle) : null;

/** 提交或再做一遍时把滚动区域拉回顶部（看到得分卡 / 从第一题开始） */
export function useScrollTopOn(flag: boolean) {
  const ref = useRef<ScrollViewInstance>(null);
  useEffect(() => {
    ref.current?.scrollTo({ y: 0, animated: false });
  }, [flag]);
  return ref;
}

/** 提交 / 再做一遍时自动回到顶部的 ScrollView */
export function ResetScroll({ resetKey, ...props }: ScrollViewProps & { resetKey: boolean }) {
  const ref = useScrollTopOn(resetKey);
  return <ScrollView ref={ref} {...props} />;
}

/**
 * 选项的几种状态：
 * idle 可选 · selected 已选 · used 已被别的空用掉（变灰） ·
 * correct 判分后选对 · wrong 判分后选错 · answer 判分后的正确答案（没选它） · muted 判分后无关
 */
export type ChoiceState = 'idle' | 'selected' | 'used' | 'correct' | 'wrong' | 'answer' | 'muted';

export function choiceColors(p: Palette, state: ChoiceState) {
  switch (state) {
    case 'selected':
      return { bg: p.primary, border: p.primary, fg: p.primaryText, sub: p.primaryText };
    case 'used':
      return { bg: p.surfaceAlt, border: p.surfaceAlt, fg: p.textTertiary, sub: p.textTertiary };
    case 'correct':
      return { bg: p.successSoft, border: p.success, fg: p.success, sub: p.success };
    case 'wrong':
      return { bg: p.dangerSoft, border: p.danger, fg: p.danger, sub: p.danger };
    case 'answer':
      return { bg: p.surface, border: p.success, fg: p.success, sub: p.success };
    case 'muted':
      return { bg: p.surface, border: p.border, fg: p.textTertiary, sub: p.textTertiary };
    default:
      return { bg: p.surface, border: p.border, fg: p.text, sub: p.textSecondary };
  }
}

/** 判分后某个选项的状态 */
export function gradedState(
  key: AnswerValue,
  chosen: AnswerValue | null | undefined,
  answer: AnswerValue,
): ChoiceState {
  if (key === answer) return chosen === answer ? 'correct' : 'answer';
  if (key === chosen) return 'wrong';
  return 'muted';
}

export function ChoiceButton({
  label,
  text,
  state,
  onPress,
  accessibilityLabel,
  testID,
  style,
  outerStyle,
  inactive,
  textStyle,
  children,
}: {
  /** 字母，如 A */
  label: string;
  /** 选项内容；只有字母的方块按钮不传 */
  text?: string;
  state: ChoiceState;
  onPress?: () => void;
  accessibilityLabel: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  outerStyle?: StyleProp<ViewStyle>;
  /** 不响应点击（已用掉、已判分），但不用 disabled 的半透明，颜色自己控制 */
  inactive?: boolean;
  /** 选项文字的额外样式（默认占满剩余宽度） */
  textStyle?: StyleProp<TextStyle>;
  children?: ReactNode;
}) {
  const p = usePalette();
  const c = choiceColors(p, state);
  const selected = state === 'selected' || state === 'correct' || state === 'wrong';
  return (
    <PressableScale
      onPress={onPress}
      disabled={inactive}
      dimWhenDisabled={false}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected, disabled: Boolean(inactive) }}
      testID={testID}
      outerStyle={outerStyle}
      style={[
        text === undefined ? styles.square : styles.wide,
        { backgroundColor: c.bg, borderColor: c.border },
        style,
      ]}
    >
      <Txt
        variant="callout"
        style={[
          { color: text === undefined ? c.fg : c.sub, fontWeight: '700' },
          text === undefined ? null : styles.letter,
        ]}
      >
        {label}
      </Txt>
      {text !== undefined ? (
        <Txt
          variant="callout"
          style={[{ color: c.fg, flex: 1, minWidth: 0 }, breakLongWords, textStyle]}
        >
          {text}
        </Txt>
      ) : null}
      {children}
    </PressableScale>
  );
}

/** 判分后的逐题说明：对错、你的答案、正确答案、解析（没有解析时显示占位） */
export function Verdict({
  correct,
  chosen,
  answer,
  explanation,
  testID,
}: {
  correct: boolean;
  chosen: string | null;
  answer: string;
  explanation: string;
  testID?: string;
}) {
  const p = usePalette();
  return (
    <View
      testID={testID}
      style={[styles.verdict, { backgroundColor: correct ? p.successSoft : p.dangerSoft }]}
    >
      <Txt variant="caption" style={{ color: correct ? p.success : p.danger, fontWeight: '600' }}>
        {correct
          ? `✓ 答对了 · ${answer}`
          : `✗ ${chosen === null ? '没有作答' : `你选了 ${chosen}`} · 正确答案 ${answer}`}
      </Txt>
      <Txt variant="caption" tone="secondary">
        {explanation.trim() ? `解析：${explanation}` : '解析：接入题库后由大模型生成。'}
      </Txt>
    </View>
  );
}

/** 得分卡：答对数 / 总数，以及按六级大纲分值比例折合的卷面分 */
export function ScoreCard({ grade, type }: { grade: GradeResult; type: ReadingQuestionType }) {
  const p = usePalette();
  const ratio = grade.maxScore ? grade.score / grade.maxScore : 0;
  const color = ratio >= 0.8 ? p.success : ratio >= 0.6 ? p.rating.hard : p.danger;
  const paper = cet6PaperScore(type, grade.score, grade.maxScore);
  const wrong = grade.wrongCount - grade.unanswered;
  return (
    <Card style={{ gap: space.md }}>
      <View style={styles.score}>
        <View accessible accessibilityLabel={`答对 ${grade.score} 题，共 ${grade.maxScore} 题`}>
          <Txt variant="overline" tone="tertiary">
            本次得分
          </Txt>
          <Txt
            variant="display"
            style={{ color, fontVariant: ['tabular-nums'] }}
            testID="reading-score"
          >
            {grade.score}
            <Txt variant="headline" tone="tertiary">
              {` / ${grade.maxScore}`}
            </Txt>
          </Txt>
        </View>
        <Txt variant="caption" tone="secondary" style={{ flexShrink: 1, textAlign: 'right' }}>
          {grade.unanswered > 0 ? `错 ${wrong} 题，没答 ${grade.unanswered} 题` : `错 ${wrong} 题`}
        </Txt>
      </View>
      <View style={[styles.paper, { borderColor: p.border }]} testID="reading-cet6">
        <Txt variant="callout" style={{ fontVariant: ['tabular-nums'] }}>
          {`六级卷面折合 ${paper.points} / ${paper.maxPoints} 分`}
        </Txt>
        <Txt variant="caption" tone="tertiary">
          {`按考试大纲分值比例：本题型占整卷 ${paper.percent}%，每题 ${paper.perItem} 分。正式成绩会再换算成 710 分制报道分，这里不做换算。`}
        </Txt>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  square: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 多行选项时字母和第一行对齐；单行时 22 行高 + 上下 11 正好 44
  wide: {
    minHeight: 44,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: 11 - 1.5,
  },
  letter: { width: 18 },
  verdict: { borderRadius: radius.sm, padding: space.md, gap: space.xs },
  paper: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.md, gap: 2 },
  score: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space.md,
  },
});
