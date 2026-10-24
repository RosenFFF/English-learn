import { Stack } from 'expo-router';

import { usePalette } from '@/ui/theme';

/** 听力板块：选题型 → 作答。作答页自己画顶栏（关闭、进度、提交） */
export default function ListeningLayout() {
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
      <Stack.Screen name="index" options={{ title: '听力' }} />
      <Stack.Screen name="[type]" options={{ headerShown: false, title: '听力练习' }} />
    </Stack>
  );
}
