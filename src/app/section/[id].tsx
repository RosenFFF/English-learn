import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { liveSectionHref } from '@/features/exam/navigation';
import { getSection, isSectionId } from '@/features/exam/service';
import { Button, Card, Screen, Txt } from '@/ui/primitives';
import { space } from '@/ui/theme';

function goHome(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/home');
}

/** 还没做的板块：说明这个板块练什么。id 白名单来自 src/lib/exams.ts（经 features/exam） */
export default function SectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  if (!isSectionId(id))
    return (
      <>
        <Stack.Screen options={{ title: '找不到页面' }} />
        <Screen edges={[]}>
          <View style={styles.center} testID="section-not-found">
            <Txt variant="headline">这个板块不存在。</Txt>
            <View style={{ marginTop: space.lg, alignSelf: 'stretch' }}>
              <Button label="回到首页" kind="secondary" onPress={() => router.replace('/home')} />
            </View>
          </View>
        </Screen>
      </>
    );

  const section = getSection(id);
  // 已上线的板块有自己的页面
  const live = liveSectionHref(section.id);
  if (live) return <Redirect href={live} />;

  return (
    <>
      <Stack.Screen options={{ title: section.title }} />
      <Screen edges={[]}>
        <Txt variant="title" accessibilityRole="header" style={styles.title}>
          {section.title}
        </Txt>
        <View testID={`section-page-${section.id}`}>
          <Card style={{ gap: space.sm, padding: space.xl }}>
            <Txt variant="overline" tone="tertiary">
              即将上线
            </Txt>
            <Txt variant="body">{section.description}</Txt>
            <Txt variant="caption" tone="secondary">
              题目会按真题题型由你配置的大模型生成，不照搬真题原文；做过的题会保存下来，方便重复练。
            </Txt>
          </Card>
        </View>
        <View style={{ marginTop: space.xl }}>
          <Button label="返回首页" kind="secondary" onPress={goHome} testID="section-back" />
        </View>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  title: { paddingTop: space.lg, paddingBottom: space.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
});
