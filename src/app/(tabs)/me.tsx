import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import {
  AutoBackupError,
  exportProgress,
  formatBackupTime,
  listAutoBackups,
  prepareImport,
  prepareRestoreLatest,
  type AutoBackupInfo,
} from '@/features/backup/service';
import { openExamPicker } from '@/features/exam/navigation';
import { getExam, useSelectedExam } from '@/features/exam/service';
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
  const { data: examId } = useSelectedExam();
  const [autoSpeak, setAuto] = useState(true);
  const [aiStatus, setAiStatus] = useState('');
  const [msg, setMsg] = useState<{ text: string; tone: 'info' | 'warning' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [latestAuto, setLatestAuto] = useState<AutoBackupInfo | null>(null);
  const refreshAutoBackups = useCallback(() => {
    void listAutoBackups().then((list) => setLatestAuto(list[0] ?? null));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void getAutoSpeak().then(setAuto);
      refreshAutoBackups();
      void loadLlmSettings().then((s) =>
        setAiStatus(
          s.baseUrl && s.model && s.hasKey
            ? s.model
            : s.keyUnreadable
              ? '需重新填写密钥'
              : '未配置',
        ),
      );
    }, [refreshAutoBackups]),
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
  // AutoBackupError / BackupError 的文案本身就是给用户看的，不含密钥或原始异常
  const failText = (e: unknown): string =>
    e instanceof AutoBackupError || e instanceof Error ? e.message : '操作失败，现有进度没有改动';

  const doImport = async (): Promise<void> => {
    setBusy(true);
    setMsg(null);
    try {
      // 选文件 → 校验（只读）；确认后 apply() 先自动备份再覆盖，备份失败会抛错，不会导入
      const prepared = await prepareImport();
      if (!prepared) return;
      const ok = await confirmAsync(
        '导入进度',
        `将导入 ${prepared.cards} 个单词的进度（备份于 ${formatBackupTime(prepared.exportedAt)}）。\n\n会覆盖当前进度，覆盖前会先自动备份一份，可在「我的 → 从自动备份恢复」找回。AI 讲解缓存保留。`,
        '导入',
      );
      if (!ok) {
        setMsg({ text: '已取消导入，当前进度没有改动', tone: 'info' });
        return;
      }
      setMsg({ text: await prepared.apply(), tone: 'info' });
      reload();
    } catch (e) {
      setMsg({ text: failText(e), tone: 'warning' });
    } finally {
      refreshAutoBackups();
      setBusy(false);
    }
  };

  const doRestoreAuto = async (): Promise<void> => {
    setBusy(true);
    setMsg(null);
    try {
      const prepared = await prepareRestoreLatest();
      if (!prepared) {
        setMsg({ text: '还没有自动备份。导入备份文件前会自动生成一份。', tone: 'info' });
        return;
      }
      const ok = await confirmAsync(
        '从自动备份恢复',
        `将恢复 ${formatBackupTime(prepared.target.createdAt)} 的自动备份（${prepared.cards} 个单词）。\n\n会覆盖当前进度，覆盖前会先自动备份一份当前进度，需要时可以再恢复回来。`,
        '恢复',
      );
      if (!ok) {
        setMsg({ text: '已取消恢复，当前进度没有改动', tone: 'info' });
        return;
      }
      setMsg({ text: await prepared.apply(), tone: 'info' });
      reload();
    } catch (e) {
      setMsg({ text: failText(e), tone: 'warning' });
    } finally {
      refreshAutoBackups();
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

      <Card style={{ padding: 0, overflow: 'hidden', marginBottom: space.md }}>
        <Row
          title={`当前考试：${examId ? getExam(examId).shortName : '未选择'}`}
          value="切换"
          onPress={() => openExamPicker('me')}
          hint="换一门考试，单词进度不受影响"
          testID="me-switch-exam"
        />
      </Card>

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
          hint="从备份文件恢复，会覆盖当前进度（导入前自动备份一份）"
          testID="import"
        />
        <Divider />
        <Row
          title="从自动备份恢复"
          onPress={busy ? undefined : () => void doRestoreAuto()}
          hint={
            latestAuto
              ? `最近一份：${formatBackupTime(latestAuto.createdAt)}（保留最近 5 份）`
              : '还没有自动备份，导入前会自动生成'
          }
          testID="restore-auto"
        />
      </Card>
      {msg ? (
        <View style={{ marginTop: space.sm }}>
          <Notice tone={msg.tone}>{msg.text}</Notice>
        </View>
      ) : null}
      <Txt variant="caption" tone="tertiary" style={{ marginTop: space.sm, marginLeft: space.xs }}>
        所有数据只存在这台设备上。备份文件和自动备份都不包含 API 密钥。
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
