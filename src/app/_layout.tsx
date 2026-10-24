import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useAppReady } from '@/features/app/init';
import { ErrorView, Loading, Txt } from '@/ui/primitives';
import { usePalette } from '@/ui/theme';

export default function RootLayout() {
  const p = usePalette();
  const { ready, error, retry } = useAppReady();
  const base = p.scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      background: p.bg,
      card: p.surface,
      text: p.text,
      border: p.border,
      primary: p.primary,
    },
  };

  return (
    <SafeAreaProvider>
      <ThemeProvider value={navTheme}>
        <StatusBar style={p.scheme === 'dark' ? 'light' : 'dark'} />
        {ready ? (
          <Stack
            screenOptions={{
              headerShadowVisible: false,
              headerBackButtonDisplayMode: 'minimal',
              contentStyle: { backgroundColor: p.bg },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            {/* 这两页自己有大标题：导航栏只放返回按钮，底色和页面一致 */}
            <Stack.Screen
              name="choose-exam"
              options={{
                title: '切换考试',
                headerTitle: '',
                headerStyle: { backgroundColor: p.bg },
              }}
            />
            <Stack.Screen name="vocab" options={{ headerShown: false }} />
            <Stack.Screen name="reading" options={{ headerShown: false }} />
            <Stack.Screen name="listening" options={{ headerShown: false }} />
            <Stack.Screen name="translation" options={{ headerShown: false, title: '翻译' }} />
            <Stack.Screen name="writing" options={{ headerShown: false, title: '写作' }} />
            <Stack.Screen
              name="mistakes"
              options={{ title: '错题本', headerTitle: '', headerStyle: { backgroundColor: p.bg } }}
            />
            <Stack.Screen
              name="section/[id]"
              options={{ headerTitle: '', headerStyle: { backgroundColor: p.bg } }}
            />
            <Stack.Screen
              name="study"
              options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }}
            />
            <Stack.Screen name="settings" options={{ title: '大模型设置' }} />
          </Stack>
        ) : (
          <View style={{ flex: 1, backgroundColor: p.bg, justifyContent: 'center' }}>
            {error ? (
              <ErrorView message={error} onRetry={retry} />
            ) : (
              <>
                <Loading label="正在准备词库" />
                <Txt
                  tone="secondary"
                  variant="caption"
                  style={{ textAlign: 'center', marginTop: -80 }}
                >
                  正在准备词库…
                </Txt>
              </>
            )}
          </View>
        )}
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
