/** 高亮卡片：active 时背景和边框换成主色的浅色，颜色用 200ms 轻微过渡（只动颜色，不位移、不缩放）。 */
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { radius, space, usePalette } from './theme';

/** 颜色过渡用 ease（设计准则：hover / 颜色变化用 ease，不用 ease-in） */
const ease = Easing.bezier(0.25, 0.1, 0.25, 1);

export function HighlightCard({
  active,
  children,
  style,
  testID,
}: {
  active: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const p = usePalette();
  const [t] = useState(() => new Animated.Value(active ? 1 : 0));
  useEffect(() => {
    // 「减少动态效果」也保留颜色过渡（准则：减少而非清零，颜色 / 透明度可以留着）
    const a = Animated.timing(t, {
      toValue: active ? 1 : 0,
      duration: 200,
      easing: ease,
      useNativeDriver: false,
    });
    a.start();
    return () => a.stop();
  }, [active, t]);
  return (
    <Animated.View
      testID={testID}
      style={[
        styles.card,
        {
          backgroundColor: t.interpolate({
            inputRange: [0, 1],
            outputRange: [p.surface, p.primarySoft],
          }),
          borderColor: t.interpolate({ inputRange: [0, 1], outputRange: [p.border, p.primary] }),
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: space.lg,
    gap: space.md,
  },
});
