import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/tabs';
import type { ComponentProps } from 'react';
import { Platform, Text } from 'react-native';

import { usePalette } from '@/ui/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];
const TABS: { name: string; title: string; icon: IconName; iconActive: IconName }[] = [
  { name: 'today', title: '今天', icon: 'sunny-outline', iconActive: 'sunny' },
  { name: 'books', title: '词书', icon: 'library-outline', iconActive: 'library' },
  { name: 'practice', title: '练习', icon: 'flash-outline', iconActive: 'flash' },
  { name: 'me', title: '我的', icon: 'person-outline', iconActive: 'person' },
];

export default function TabsLayout() {
  const p = usePalette();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: 'none',
        tabBarActiveTintColor: p.primary,
        tabBarInactiveTintColor: p.textTertiary,
        tabBarStyle: {
          backgroundColor: p.surface,
          borderTopColor: p.border,
          ...(Platform.OS === 'web' ? { height: 58 } : null),
        },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarAccessibilityLabel: `${t.title}标签页`,
            tabBarButtonTestID: `tab-${t.name}`,
            // 自定义标签：中文字形比拉丁字母高，默认标签在网页版会被裁掉下半截
            tabBarLabel: ({ color }) => (
              <Text
                style={{ color, fontSize: 11, lineHeight: 15, fontWeight: '500', marginTop: 2 }}
              >
                {t.title}
              </Text>
            ),
            tabBarIcon: ({ color, focused, size }) => (
              <Ionicons
                name={focused ? t.iconActive : t.icon}
                color={color as string}
                size={size - 2}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
