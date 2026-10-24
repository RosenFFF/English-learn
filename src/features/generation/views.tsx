/**
 * 现场出题的作答页共用的界面：顶栏（关闭、标题、进度、提交）和出题前后的状态页
 * （检查中 / 未配置大模型 / 出题中 / 出题失败）。阅读、翻译、写作同一套结构和视觉。
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Notice, ProgressBar, Txt } from '../../ui/primitives';
import { MAX_WIDTH, radius, space, usePalette } from '../../ui/theme';

import type { GenerationPhase } from './useGenerationSession';

export interface TopBarProps {
  title: string;
  onClose: () => void;
  closeLabel?: string;
  /** testID 前缀：`${p}-close`、`${p}-progress`、`${p}-submit` */
  testIDPrefix: string;
  /** 右上角小字，如「已答 3/10」「128 词」 */
  status?: string;
  progress?: { value: number; color?: string; label: string };
  submit?: { label: string; accessibilityLabel: string; active: boolean; onPress: () => void };
}

export function PracticeTopBar(props: TopBarProps) {
  const p = usePalette();
  const { submit } = props;
  return (
    <View style={styles.topWrap}>
      <View style={styles.top}>
        <Pressable
          onPress={props.onClose}
          accessibilityRole="button"
          accessibilityLabel={props.closeLabel ?? '返回'}
          hitSlop={6}
          style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: p.surfaceAlt }]}
          testID={`${props.testIDPrefix}-close`}
        >
          <Ionicons name="close" size={26} color={p.textSecondary} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          <View style={styles.titleRow}>
            <Txt variant="headline" numberOfLines={1} style={{ flexShrink: 1 }}>
              {props.title}
            </Txt>
            {props.status !== undefined ? (
              <Txt
                variant="caption"
                tone="secondary"
                style={{ fontVariant: ['tabular-nums'] }}
                testID={`${props.testIDPrefix}-progress`}
              >
                {props.status}
              </Txt>
            ) : null}
          </View>
          {props.progress ? (
            <ProgressBar
              value={props.progress.value}
              color={props.progress.color}
              label={props.progress.label}
            />
          ) : null}
        </View>
        {submit ? (
          <Pressable
            onPress={submit.onPress}
            accessibilityRole="button"
            accessibilityLabel={submit.accessibilityLabel}
            style={({ pressed }) => [
              styles.submit,
              {
                backgroundColor: submit.active ? p.primary : p.surfaceAlt,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
            testID={`${props.testIDPrefix}-submit`}
          >
            <Txt
              variant="callout"
              style={{
                fontWeight: '600',
                color: submit.active ? p.primaryText : p.textSecondary,
              }}
            >
              {submit.label}
            </Txt>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** 状态页：顶栏只有关闭和标题，内容居中 */
export function StatusPage({
  title,
  onClose,
  testIDPrefix,
  children,
}: {
  title: string;
  onClose: () => void;
  testIDPrefix: string;
  children: ReactNode;
}) {
  const p = usePalette();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }} edges={['top', 'bottom']}>
      <PracticeTopBar title={title} onClose={onClose} testIDPrefix={testIDPrefix} />
      <View style={styles.statusBody}>
        <View style={styles.statusInner}>{children}</View>
      </View>
    </SafeAreaView>
  );
}

export interface PhaseCopy {
  /** 未配置时的说明，如「阅读题由你自己配置的大模型现场出题，每次都是新写的原创短文。」 */
  unconfigured: string;
  /** 出题中的说明 */
  generating: string;
  /** 进度单位，如「篇」 */
  unit?: string;
  /** 准备中的标题，默认「正在出题…」（错题本重做是「正在打开原题…」） */
  preparingTitle?: string;
  /** 失败页标题，默认「这次没出成题」 */
  errorTitle?: string;
  /**
   * 失败页的按钮：generation（默认）是「重试」+「检查大模型设置」；
   * stored 是错题本重做打不开原题，只给「返回」（重试也没用、和大模型无关）
   */
  errorActions?: 'generation' | 'stored';
}

/** 出题前后的几种状态（ready 以外） */
export function GenerationPhaseView<T>({
  title,
  phase,
  retry,
  onClose,
  testIDPrefix: id,
  copy,
}: {
  title: string;
  phase: Exclude<GenerationPhase<T>, { kind: 'ready' }>;
  retry: () => void;
  onClose: () => void;
  testIDPrefix: string;
  copy: PhaseCopy;
}) {
  const p = usePalette();
  const page = (children: ReactNode) => (
    <StatusPage title={title} onClose={onClose} testIDPrefix={id}>
      {children}
    </StatusPage>
  );
  switch (phase.kind) {
    case 'checking':
      return page(<ActivityIndicator color={p.primary} accessibilityLabel="加载中" />);
    case 'unconfigured':
      return page(
        <View testID={`${id}-unconfigured`} style={styles.stack}>
          <View style={[styles.badge, { backgroundColor: p.warningSoft }]}>
            <Ionicons name="sparkles-outline" size={26} color={p.warningText} />
          </View>
          <Txt variant="title" style={styles.centerText} accessibilityRole="header">
            还没有配置大模型
          </Txt>
          <Txt variant="body" tone="secondary" style={styles.centerText}>
            {copy.unconfigured}
            {phase.missing.length ? `还缺：${phase.missing.join('、')}。` : ''}
          </Txt>
          {phase.keyUnreadable ? (
            <Notice>密钥无法读取（可能是换了手机），请重新填写。</Notice>
          ) : null}
          <View style={{ marginTop: space.md }}>
            <Button
              label="去设置大模型"
              onPress={() => router.push('/settings')}
              testID={`${id}-go-settings`}
            />
          </View>
          <Txt variant="caption" tone="tertiary" style={styles.centerText}>
            填好后回到这里会自动开始出题
          </Txt>
        </View>,
      );
    case 'generating':
      return page(
        <View
          testID={`${id}-generating`}
          style={{ gap: space.md, alignItems: 'center' }}
          accessibilityLiveRegion="polite"
        >
          <ActivityIndicator size="large" color={p.primary} />
          <Txt variant="headline" style={styles.centerText}>
            {copy.preparingTitle ?? '正在出题…'}
          </Txt>
          <Txt variant="callout" tone="secondary" style={styles.centerText}>
            {copy.generating}
          </Txt>
          {phase.total > 1 ? (
            <Txt
              variant="caption"
              tone="tertiary"
              style={{ fontVariant: ['tabular-nums'] }}
              testID={`${id}-generating-progress`}
            >
              {`已准备好 ${phase.done}/${phase.total} ${copy.unit ?? '道'}`}
            </Txt>
          ) : null}
          <View style={{ alignSelf: 'stretch', marginTop: space.md }}>
            <Button label="取消" kind="secondary" size="md" onPress={onClose} />
          </View>
        </View>,
      );
    case 'error':
      return page(
        <View testID={`${id}-error`} style={styles.stack}>
          <Txt variant="headline" style={styles.centerText}>
            {copy.errorTitle ?? '这次没出成题'}
          </Txt>
          <Txt
            variant="body"
            tone="danger"
            style={styles.centerText}
            accessibilityRole="alert"
            testID={`${id}-error-message`}
          >
            {phase.message}
          </Txt>
          {copy.errorActions === 'stored' ? (
            <View style={{ marginTop: space.md }}>
              <Button label="返回" kind="secondary" onPress={onClose} testID={`${id}-error-back`} />
            </View>
          ) : (
            <View style={{ marginTop: space.md, gap: space.md }}>
              <Button label="重试" onPress={retry} testID={`${id}-retry-generate`} />
              <Button
                label="检查大模型设置"
                kind="secondary"
                size="md"
                onPress={() => router.push('/settings')}
              />
            </View>
          )}
        </View>,
      );
  }
}

export const practiceStyles = StyleSheet.create({
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
    alignItems: 'center',
  },
  footerInner: { width: '100%', maxWidth: MAX_WIDTH, flexDirection: 'row', gap: space.md },
});

const styles = StyleSheet.create({
  topWrap: { alignItems: 'center', paddingHorizontal: space.sm },
  top: {
    width: '100%',
    maxWidth: MAX_WIDTH + space.lg * 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submit: {
    minHeight: 44,
    minWidth: 64,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.sm,
  },
  statusBody: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: space.xl },
  statusInner: { width: '100%', maxWidth: 420, alignItems: 'center' },
  stack: { gap: space.md, alignSelf: 'stretch' },
  centerText: { textAlign: 'center' },
  badge: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
});
