import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type AccessibilityState,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { easeOut, useReducedMotion } from './motion';
import { MAX_WIDTH, radius, space, usePalette } from './theme';

// ---------- 文字 ----------
type Variant = 'display' | 'title' | 'headline' | 'body' | 'callout' | 'caption' | 'overline';
const variants: Record<Variant, TextStyle> = {
  display: { fontSize: 40, lineHeight: 48, fontWeight: '700', letterSpacing: -0.8 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -0.4 },
  headline: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24 },
  callout: { fontSize: 15, lineHeight: 22 },
  caption: { fontSize: 13, lineHeight: 18 },
  overline: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.4 },
};

export function Txt({
  variant = 'body',
  tone = 'primary',
  style,
  ...rest
}: TextProps & {
  variant?: Variant;
  tone?: 'primary' | 'secondary' | 'tertiary' | 'accent' | 'danger';
}) {
  const p = usePalette();
  const color = {
    primary: p.text,
    secondary: p.textSecondary,
    tertiary: p.textTertiary,
    accent: p.primary,
    danger: p.danger,
  }[tone];
  return <Text {...rest} style={[variants[variant], { color }, style]} />;
}

// ---------- 页面容器 ----------
export function Screen({
  children,
  scroll = true,
  edges = ['top'],
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: ('top' | 'bottom')[];
}) {
  const p = usePalette();
  const inner = <View style={styles.inner}>{children}</View>;
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: p.bg }}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {inner}
        </ScrollView>
      ) : (
        <View style={[styles.scrollContent, { flex: 1 }]}>{inner}</View>
      )}
    </SafeAreaView>
  );
}

// ---------- 按下缩放的 Pressable（160ms ease-out，pointer-down 立即反馈） ----------
// 系统开了「减少动态效果」时不缩放，改成轻微变淡（保留反馈，去掉形变）
export function PressableScale({
  style,
  outerStyle,
  children,
  disabled,
  dimWhenDisabled = true,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  outerStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
  /** 禁用时整体半透明；自己用颜色表达禁用状态的组件传 false */
  dimWhenDisabled?: boolean;
}) {
  const reduced = useReducedMotion();
  const [press] = useState(() => new Animated.Value(0));
  const to = (v: number): void => {
    Animated.timing(press, {
      toValue: v,
      duration: 160,
      easing: easeOut,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  };
  const feedback = reduced
    ? { opacity: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.7] }) }
    : { transform: [{ scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.97] }) }] };
  return (
    <Pressable
      {...rest}
      style={outerStyle}
      disabled={disabled}
      onPressIn={(e) => {
        to(1);
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        to(0);
        rest.onPressOut?.(e);
      }}
    >
      <Animated.View
        style={[style, feedback, disabled && dimWhenDisabled ? { opacity: 0.5 } : null]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}

// ---------- 按钮 ----------
export function Button({
  label,
  onPress,
  kind = 'primary',
  size = 'lg',
  disabled,
  loading,
  accessibilityHint,
  testID,
  color,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'ghost';
  size?: 'lg' | 'md';
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
  testID?: string;
  color?: string;
}) {
  const p = usePalette();
  const bg =
    kind === 'primary' ? (color ?? p.primary) : kind === 'secondary' ? p.surfaceAlt : 'transparent';
  const fg = kind === 'primary' ? p.primaryText : (color ?? p.primary);
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      testID={testID}
      style={[
        styles.button,
        size === 'lg' ? styles.buttonLg : styles.buttonMd,
        { backgroundColor: bg },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[size === 'lg' ? styles.buttonTextLg : styles.buttonTextMd, { color: fg }]}>
          {label}
        </Text>
      )}
    </PressableScale>
  );
}

// ---------- 卡片 ----------
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  return (
    <View style={[styles.card, { backgroundColor: p.surface, borderColor: p.border }, style]}>
      {children}
    </View>
  );
}

// ---------- 进度条 ----------
export function ProgressBar({
  value,
  color,
  label,
  height = 6,
}: {
  value: number;
  color?: string;
  label: string;
  height?: number;
}) {
  const p = usePalette();
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}
      style={{ height, borderRadius: height, backgroundColor: p.surfaceAlt, overflow: 'hidden' }}
    >
      <View
        style={{
          width: `${v * 100}%`,
          height: '100%',
          backgroundColor: color ?? p.primary,
          borderRadius: height,
        }}
      />
    </View>
  );
}

// ---------- 分段选择 ----------
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  format,
  tall,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  format?: (v: T) => string;
  /** 段高 44（触控目标达标）；默认 36 保持原来几页的样子 */
  tall?: boolean;
}) {
  const p = usePalette();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[styles.segmented, { backgroundColor: p.surfaceAlt }]}
    >
      {options.map((o) => {
        const selected = o === value;
        const text = format ? format(o) : String(o);
        const state: AccessibilityState = { selected, checked: selected };
        return (
          <Pressable
            key={String(o)}
            onPress={() => onChange(o)}
            accessibilityRole="radio"
            accessibilityLabel={`${label}：${text}`}
            accessibilityState={state}
            testID={`segment-${String(o)}`}
            style={[
              styles.segment,
              tall && { minHeight: 44 },
              selected && { backgroundColor: p.surface, borderColor: p.border },
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                {
                  color: selected ? p.text : p.textSecondary,
                  fontWeight: selected ? '600' : '400',
                },
              ]}
            >
              {text}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------- 列表行 ----------
export function Row({
  title,
  value,
  onPress,
  right,
  hint,
  testID,
}: {
  title: string;
  value?: string;
  onPress?: () => void;
  right?: ReactNode;
  hint?: string;
  testID?: string;
}) {
  const p = usePalette();
  const content = (
    <View style={styles.row}>
      <Txt variant="body" style={{ flex: 1 }}>
        {title}
      </Txt>
      {value ? (
        <Txt variant="callout" tone="secondary" numberOfLines={1} style={{ maxWidth: '55%' }}>
          {value}
        </Txt>
      ) : null}
      {right}
      {onPress ? (
        <Text style={{ color: p.textTertiary, fontSize: 18, marginLeft: 6 }}>›</Text>
      ) : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${title}，${value}` : title}
      accessibilityHint={hint}
      testID={testID}
      style={({ pressed }) => pressed && { backgroundColor: p.surfaceAlt }}
    >
      {content}
    </Pressable>
  );
}

export function Divider() {
  const p = usePalette();
  return (
    <View
      style={{ height: StyleSheet.hairlineWidth, backgroundColor: p.border, marginLeft: space.lg }}
    />
  );
}

export function SectionTitle({ children }: { children: string }) {
  return (
    <Txt
      variant="overline"
      tone="tertiary"
      accessibilityRole="header"
      style={{ marginTop: space.xl, marginBottom: space.sm, marginLeft: space.xs }}
    >
      {children}
    </Txt>
  );
}

export function Notice({
  children,
  tone = 'warning',
}: {
  children: ReactNode;
  tone?: 'warning' | 'info';
}) {
  const p = usePalette();
  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.notice,
        { backgroundColor: tone === 'warning' ? p.warningSoft : p.primarySoft },
      ]}
    >
      <Txt variant="caption" style={{ color: tone === 'warning' ? p.warningText : p.primary }}>
        {children}
      </Txt>
    </View>
  );
}

export function Loading({ label = '加载中…' }: { label?: string }) {
  const p = usePalette();
  return (
    <View accessibilityLabel={label} accessibilityRole="progressbar" style={styles.center}>
      <ActivityIndicator color={p.primary} />
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={[styles.center, { gap: space.md }]}>
      <Txt tone="danger" accessibilityRole="alert">
        出错了：{message}
      </Txt>
      {onRetry ? <Button label="重试" kind="secondary" size="md" onPress={onRetry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingBottom: space.xxl,
  },
  inner: { width: '100%', maxWidth: MAX_WIDTH, flexGrow: 1 },
  button: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  buttonLg: { minHeight: 56 },
  buttonMd: { minHeight: 44 },
  buttonTextLg: { fontSize: 17, fontWeight: '600' },
  buttonTextMd: { fontSize: 15, fontWeight: '600' },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.lg },
  segmented: { flexDirection: 'row', borderRadius: radius.sm, padding: 3, gap: 3 },
  segment: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  segmentText: { fontSize: 15 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: space.lg,
    gap: space.sm,
  },
  notice: { borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: space.sm },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
    minHeight: 200,
  },
});
