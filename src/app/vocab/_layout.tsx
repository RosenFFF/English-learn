import { Stack } from 'expo-router';

import { usePalette } from '@/ui/theme';

/** 词汇板块：今日背词 → 词书 / 弱点词练习。页面自己有大标题，导航栏只放返回按钮 */
export default function VocabLayout() {
  const p = usePalette();
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        headerTitle: '',
        headerStyle: { backgroundColor: p.bg },
        headerTintColor: p.primary,
        contentStyle: { backgroundColor: p.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: '词汇' }} />
      <Stack.Screen name="books" options={{ title: '词书' }} />
      <Stack.Screen name="practice" options={{ title: '练习' }} />
    </Stack>
  );
}
