/** 朗读控制面板：播放 / 暂停、重听本条、从头、语速、念题开关，以及当前念到哪。 */
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, Notice, PressableScale, ProgressBar, Segmented, Txt } from '../../ui/primitives';
import { radius, space, usePalette } from '../../ui/theme';
import { SPEECH_RATES, type PlayerSnapshot, type SpeechPlayer, type SpeechRate } from './service';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** 面板上那一行状态文字 */
export function playerStatusText(s: PlayerSnapshot): string {
  const scriptTotal = s.items.filter((i) => i.kind === 'script').length;
  if (s.items.length === 0) return '没有可以朗读的内容';
  if (s.status === 'done') return '已念完，可以点播放从头再听';
  const cur = s.items[Math.min(s.index, s.items.length - 1)];
  if (s.status === 'idle' && s.index === 0) return `共 ${scriptTotal} 段原文 · 点播放开始`;
  if (!cur) return '';
  const where =
    cur.kind === 'question'
      ? `念题 · 第 ${cur.questionIndex + 1} 题`
      : `第 ${Math.min(s.index + 1, scriptTotal)}/${scriptTotal} 段 · ${cur.name}`;
  return s.status === 'paused' ? `已暂停 · ${where}` : where;
}

function IconButton({
  icon,
  label,
  onPress,
  testID,
  primary,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  testID: string;
  primary?: boolean;
  disabled?: boolean;
}) {
  const p = usePalette();
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      testID={testID}
      style={[
        primary ? styles.primaryBtn : styles.iconBtn,
        { backgroundColor: primary ? p.primary : p.surfaceAlt },
      ]}
    >
      <Ionicons
        name={icon}
        size={primary ? 28 : 22}
        color={primary ? p.primaryText : p.textSecondary}
      />
    </PressableScale>
  );
}

/** 开关：整行可点（≥ 44pt），读屏是 switch */
export function ToggleRow({
  label,
  hint,
  value,
  onChange,
  testID,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  testID: string;
}) {
  const p = usePalette();
  return (
    <PressableScale
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ checked: value }}
      aria-checked={value}
      testID={testID}
      style={styles.toggleRow}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="body">{label}</Txt>
        {hint ? (
          <Txt variant="caption" tone="tertiary">
            {hint}
          </Txt>
        ) : null}
      </View>
      <View style={[styles.track, { backgroundColor: value ? p.primary : p.border }]}>
        <View
          style={[
            styles.thumb,
            { backgroundColor: p.surface, alignSelf: value ? 'flex-end' : 'flex-start' },
          ]}
        />
      </View>
    </PressableScale>
  );
}

export function PlayerPanel({
  snap,
  player,
  title,
  rate,
  onRate,
  readQuestions,
  onReadQuestions,
}: {
  snap: PlayerSnapshot;
  player: SpeechPlayer;
  /** 面板左上角小字，如「Section A · 长对话」 */
  title: string;
  rate: SpeechRate;
  onRate: (r: SpeechRate) => void;
  readQuestions: boolean;
  onReadQuestions: (v: boolean) => void;
}) {
  const playing = snap.status === 'playing';
  const total = snap.items.length;
  const progress = total ? Math.min(snap.index, total) / total : 0;
  const empty = total === 0;
  return (
    <Card style={{ gap: space.md }}>
      <View style={styles.head}>
        <Txt variant="overline" tone="tertiary" accessibilityRole="header">
          {title}
        </Txt>
      </View>
      <Txt
        variant="body"
        tone="secondary"
        style={{ fontVariant: ['tabular-nums'] }}
        accessibilityLiveRegion="polite"
        testID="listening-player-status"
      >
        {playerStatusText(snap)}
      </Txt>
      <ProgressBar value={snap.status === 'done' ? 1 : progress} label="朗读进度" height={4} />
      <View style={styles.controls}>
        <IconButton
          icon="play-skip-back"
          label="从头开始"
          onPress={() => player.dispatch({ type: 'restart' })}
          disabled={empty}
          testID="listening-restart"
        />
        <IconButton
          icon={playing ? 'pause' : 'play'}
          label={playing ? '暂停' : snap.status === 'paused' ? '继续' : '播放'}
          onPress={() => player.dispatch({ type: playing ? 'pause' : 'play' })}
          disabled={empty}
          primary
          testID="listening-play"
        />
        <IconButton
          icon="refresh"
          label="重听本条"
          onPress={() => player.dispatch({ type: 'replay' })}
          disabled={empty || (snap.status === 'idle' && snap.index === 0)}
          testID="listening-replay"
        />
      </View>
      <View style={styles.rateRow}>
        <Txt variant="body" style={{ flexShrink: 0 }}>
          语速
        </Txt>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Segmented
            options={SPEECH_RATES}
            value={rate}
            onChange={onRate}
            label="语速"
            tall
            format={(r) => (r === 1 ? '正常 1.0×' : `慢速 ${r.toFixed(1)}×`)}
          />
        </View>
      </View>
      <ToggleRow
        label="念题干"
        hint="原文念完后逐题念题干（和真题一样，不念选项）"
        value={readQuestions}
        onChange={onReadQuestions}
        testID="listening-read-questions"
      />
      {snap.error ? (
        <Notice>
          {`朗读出错：${snap.error}。点播放可以从这一段重试；一直没有声音的话，检查手机的「文字转语音」设置。`}
        </Notice>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xl,
  },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtn: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rateRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  toggleRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  track: { width: 44, height: 26, borderRadius: 13, padding: 3, justifyContent: 'center' },
  thumb: { width: 20, height: 20, borderRadius: 10 },
});
