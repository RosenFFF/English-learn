/**
 * 完成一组时的庆祝：中心徽章 ease-out 放大淡入 + 一圈彩色纸屑向外散开后淡出。
 * 这是全 App 唯一的「好玩」动画；减少动态效果时只保留淡入。只动 transform 和 opacity。
 */
import { useEffect, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';

import { easeOut, useReducedMotion } from './motion';
import { Txt } from './primitives';
import { usePalette } from './theme';

const PIECES = 14;

export function Celebration({ emoji = '🎉' }: { emoji?: string }) {
  const p = usePalette();
  const reduced = useReducedMotion();
  const [t] = useState(() => new Animated.Value(0));
  const [badge] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const native = Platform.OS !== 'web';
    Animated.parallel([
      Animated.timing(badge, {
        toValue: 1,
        duration: 420,
        easing: easeOut,
        useNativeDriver: native,
      }),
      Animated.timing(t, { toValue: 1, duration: 1100, easing: easeOut, useNativeDriver: native }),
    ]).start();
  }, [badge, t]);

  const colors = [p.rating.good, p.rating.easy, p.rating.hard, p.exam.ielts, p.rating.again];
  return (
    <View
      style={styles.wrap}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {!reduced &&
        Array.from({ length: PIECES }, (_, i) => {
          const angle = (i / PIECES) * Math.PI * 2;
          const dist = 70 + (i % 3) * 18;
          return (
            <Animated.View
              key={i}
              style={[
                styles.piece,
                {
                  backgroundColor: colors[i % colors.length],
                  borderRadius: i % 2 ? 2 : 5,
                  opacity: t.interpolate({
                    inputRange: [0, 0.15, 0.75, 1],
                    outputRange: [0, 1, 1, 0],
                  }),
                  transform: [
                    {
                      translateX: t.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, Math.cos(angle) * dist],
                      }),
                    },
                    {
                      translateY: t.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, Math.sin(angle) * dist + 16],
                      }),
                    },
                    {
                      rotate: t.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', `${(i % 2 ? 1 : -1) * 160}deg`],
                      }),
                    },
                  ],
                },
              ]}
            />
          );
        })}
      <Animated.View
        style={[
          styles.badge,
          { backgroundColor: p.primarySoft },
          {
            opacity: badge,
            transform: reduced
              ? []
              : [{ scale: badge.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
          },
        ]}
      >
        <Txt style={{ fontSize: 44, lineHeight: 52 }}>{emoji}</Txt>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 200, alignItems: 'center', justifyContent: 'center' },
  piece: { position: 'absolute', width: 10, height: 10 },
  badge: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
