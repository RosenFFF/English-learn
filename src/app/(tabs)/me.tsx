import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { exportProgress, importProgress } from '@/features/backup/service';
import { getAutoSpeak, setAutoSpeak, loadLlmSettings } from '@/features/settings/service';
import { useStats } from '@/features/stats/service';
import { confirmAsync } from '@/ui/confirm';
import {
  Card,
  Divider,
  ErrorView,
  Loading,
  Notice,
  Row,
  Screen,
  SectionTitle,
  Txt,
} from '@/ui/primitives';
import { radius, space, usePalette } from '@/ui/theme';

function StatTile({ value, label }: { value: string; label: string }) {
  const p = usePalette();
  return (
    <View
      style={[styles.tile, { backgroundColor: p.surface, borderColor: p.border }]}
      accessible
      accessibilityLabel={`${label} ${value}`}
    >
      <Txt variant="title" style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </Txt>
      <Txt variant="caption" tone="secondary">
        {label}
      </Txt>
    </View>
  );
}

export default function MeScreen() {
  const p = usePalette();
  const { data, error, reload } = useStats();
  const [autoSpeak, setAuto] = useState(true);
  const [aiStatus, setAiStatus] = useState('');
  const [msg, setMsg] = useState<{ text: string; tone: 'info' | 'warning' } | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void getAutoSpeak().then(setAuto);
      void loadLlmSettings().then((s) =>
        setAiStatus(
          s.baseUrl && s.model && s.hasKey
            ? s.model
            : s.keyUnreadable
              ? '需重新填写密钥'
              : '未配置',
        ),
      );
    }, []),
  );

  const doExport = async (): Promise<void> => {
    setBusy(true);
    try {
      setMsg({ text: await exportProgress(), tone: 'info' });
    } catch (e) {
      setMsg({ text: `导出失败：${e instanceof Error ? e.message : String(e)}`, tone: 'warning' });
    } finally {
      setBusy(false);
    }
  };
  const doImport = async (): Promise<void> => {
    const ok = await confirmAsync(
      '导入进度',
      '导入会用备份文件替换当前全部学习进度（AI 讲解缓存保留）。建议先导出一份当前进度。',
      '选择文件',
    );
    if (!ok) return;
    setBusy(true);
    try {
      const r = await importProgress();
      if (r) {
        setMsg({ text: r, tone: 'info' });
        reload();
      }
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), tone: 'warning' });
    } finally {
      setBusy(false);
    }
  };

  if (error)
    return (
      <Screen>
        <ErrorView message={error} onRetry={reload} />
      </Screen>
    );
  if (!data)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  const max = Math.max(1, ...data.last7.map((d) => d.count));

  return (
    <Screen>
      <Txt
        variant="title"
        accessibilityRole="header"
        style={{ paddingTop: space.lg, paddingBottom: space.lg }}
      >
        我的
      </Txt>

      <View style={styles.tiles}>
        <StatTile value={String(data.cards.total)} label="已学单词" />
        <StatTile value={String(data.cards.mastered)} label="已掌握" />
        <StatTile value={`${data.streak.current}天`} label="连续打卡" />
        <StatTile
          value={data.retention30 == null ? '—' : `${Math.round(data.retention30 * 100)}%`}
          label="近30天记住率"
        />
      </View>

      <Card style={{ marginTop: space.md }}>
        <Txt variant="callout" tone="secondary" style={{ marginBottom: space.md }}>
          最近 7 天 · 共学习 {data.totalMinutes} 分钟 · 累计评分 {data.totalReviews} 次
        </Txt>
        <View
          style={styles.chart}
          accessible
          accessibilityLabel={`最近 7 天学习量：${data.last7.map((d) => `${d.label} ${d.count} 个`).join('，')}`}
        >
          {data.last7.map((d) => (
            <View key={d.date} style={styles.barCol}>
              <View style={styles.barTrack}>
                <View
                  style={{
                    height: `${Math.max(d.count ? 6 : 2, (d.count / max) * 100)}%`,
                    backgroundColor: d.count ? p.primary : p.border,
                    borderRadius: 4,
                  }}
                />
              </View>
              <Txt
                variant="caption"
                tone={d.label === '今天' ? 'accent' : 'tertiary'}
                style={{ fontSize: 11 }}
              >
                {d.label}
              </Txt>
            </View>
          ))}
        </View>
      </Card>

      <SectionTitle>设置</SectionTitle>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <Row
          title="大模型设置"
          value={aiStatus}
          onPress={() => router.push('/settings')}
          hint="填写接口地址、密钥和模型名"
          testID="open-settings"
        />
        <Divider />
        <Row
          title="显示单词时自动发音"
          right={
            <Switch
              value={autoSpeak}
              onValueChange={(v) => {
                setAuto(v);
                void setAutoSpeak(v);
              }}
              accessibilityLabel="显示单词时自动发音"
              trackColor={{ true: p.primary, false: p.border }}
            />
          }
        />
      </Card>

      <SectionTitle>数据</SectionTitle>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <Row
          title="导出学习进度"
          onPress={busy ? undefined : () => void doExport()}
          hint="保存为 JSON 备份文件，换手机时导入"
          testID="export"
        />
        <Divider />
        <Row
          title="导入学习进度"
          onPress={busy ? undefined : () => void doImport()}
          hint="从备份文件恢复，会替换当前进度"
          testID="import"
        />
      </Card>
      {msg ? (
        <View style={{ marginTop: space.sm }}>
          <Notice tone={msg.tone}>{msg.text}</Notice>
        </View>
      ) : null}
      <Txt variant="caption" tone="tertiary" style={{ marginTop: space.sm, marginLeft: space.xs }}>
        所有数据只存在这台设备上。备份文件不包含 API 密钥。
      </Txt>

      <SectionTitle>关于</SectionTitle>
      <Card>
        <Txt variant="caption" tone="secondary">
          词库来源：{data.wordsSource || '未知'}
          {'\n'}许可证：{data.wordsLicense || '未知'}
        </Txt>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    gap: 2,
  },
  chart: { flexDirection: 'row', height: 96, gap: space.sm, alignItems: 'flex-end' },
  barCol: { flex: 1, alignItems: 'center', gap: 4, height: '100%' },
  barTrack: { flex: 1, width: '60%', justifyContent: 'flex-end' },
});
