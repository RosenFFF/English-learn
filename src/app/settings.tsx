import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import {
  clearLlmSettings,
  KEY_UNREADABLE_TEXT,
  saveLlmSettings,
  SECRET_PERSISTED,
  testLlmConnection,
  useLlmSettings,
  validateBaseUrl,
  type LlmSettings,
} from '@/features/settings/service';
import { confirmAsync } from '@/ui/confirm';
import { Button, Card, Loading, Notice, Screen, Txt } from '@/ui/primitives';
import { radius, space, usePalette } from '@/ui/theme';

const PRESETS = [
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  {
    name: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
  },
  { name: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
];

function Field({
  label,
  value,
  onChange,
  placeholder,
  secure,
  error,
  testID,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  secure?: boolean;
  error?: string | null;
  testID: string;
  hint?: string;
}) {
  const p = usePalette();
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="callout" style={{ fontWeight: '600' }} nativeID={`${testID}-label`}>
        {label}
      </Txt>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={p.textTertiary}
        secureTextEntry={secure}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        accessibilityLabel={label}
        accessibilityHint={hint}
        accessibilityLabelledBy={`${testID}-label`}
        testID={testID}
        style={[
          styles.input,
          {
            color: p.text,
            backgroundColor: p.surfaceAlt,
            borderColor: error ? p.danger : 'transparent',
          },
        ]}
      />
      {error ? (
        <Txt variant="caption" tone="danger" accessibilityRole="alert">
          {error}
        </Txt>
      ) : hint ? (
        <Txt variant="caption" tone="tertiary">
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

export default function SettingsScreen() {
  const { settings, reload } = useLlmSettings();
  if (!settings)
    return (
      <Screen edges={[]}>
        <Loading />
      </Screen>
    );
  return <SettingsForm settings={settings} reload={reload} />;
}

function SettingsForm({ settings, reload }: { settings: LlmSettings; reload: () => void }) {
  const p = usePalette();
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
  const [model, setModel] = useState(settings.model);
  const [apiKey, setApiKey] = useState('');
  const [touched, setTouched] = useState(false);
  const [status, setStatus] = useState<{ text: string; tone: 'info' | 'warning' } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const urlError = touched && baseUrl ? validateBaseUrl(baseUrl) : null;

  const onTest = async (): Promise<void> => {
    abort.current?.abort();
    abort.current = new AbortController();
    setTesting(true);
    setStatus(null);
    const r = await testLlmConnection({ baseUrl, model, apiKey }, abort.current.signal);
    setTesting(false);
    setStatus(
      r.ok
        ? { text: `连接成功，用时 ${(r.ms / 1000).toFixed(1)} 秒`, tone: 'info' }
        : { text: `连接失败：${r.message}`, tone: 'warning' },
    );
  };
  const onSave = async (): Promise<void> => {
    setTouched(true);
    setSaving(true);
    try {
      await saveLlmSettings({ baseUrl, model, apiKey });
      setApiKey('');
      reload();
      setStatus({ text: '已保存。背词时卡片背面会出现「AI 讲解」。', tone: 'info' });
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : String(e), tone: 'warning' });
    } finally {
      setSaving(false);
    }
  };
  const onClear = async (): Promise<void> => {
    if (
      !(await confirmAsync(
        '清除大模型配置',
        '会删除接口地址、模型名和保存的密钥，AI 讲解将隐藏。',
        '清除',
      ))
    )
      return;
    await clearLlmSettings();
    setBaseUrl('');
    setModel('');
    setApiKey('');
    reload();
    setStatus({ text: '已清除', tone: 'info' });
  };

  const canSave = Boolean(baseUrl.trim() && model.trim() && (apiKey.trim() || settings.hasKey));

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen edges={[]}>
        <Txt
          variant="callout"
          tone="secondary"
          style={{ marginTop: space.lg, marginBottom: space.md }}
        >
          填写任意兼容 OpenAI 格式的大模型接口，用于「AI
          讲解」。请求从手机直接发到你填的地址，不经过任何其他服务器。不填也不影响背单词。
        </Txt>

        {settings.keyUnreadable ? (
          <View style={{ marginBottom: space.md }} testID="llm-key-unreadable">
            <Notice tone="warning">{KEY_UNREADABLE_TEXT}</Notice>
          </View>
        ) : null}

        <View style={styles.presets} accessibilityLabel="常用服务商，点一下自动填入地址和模型名">
          {PRESETS.map((pr) => (
            <Pressable
              key={pr.name}
              onPress={() => {
                setBaseUrl(pr.baseUrl);
                setModel(pr.model);
              }}
              accessibilityRole="button"
              accessibilityLabel={`填入 ${pr.name} 的地址和模型名`}
              style={({ pressed }) => [
                styles.chip,
                { backgroundColor: pressed ? p.border : p.surfaceAlt },
              ]}
            >
              <Txt variant="caption">{pr.name}</Txt>
            </Pressable>
          ))}
        </View>

        <Card style={{ gap: space.lg }}>
          <Field
            label="接口地址"
            value={baseUrl}
            onChange={(v) => {
              setBaseUrl(v);
              setTouched(true);
            }}
            placeholder="https://api.deepseek.com/v1"
            error={urlError}
            testID="llm-base-url"
            hint="必须是 https 地址，填到 /v1 即可"
          />
          <Field
            label="API 密钥"
            value={apiKey}
            onChange={setApiKey}
            placeholder={
              settings.hasKey
                ? '已保存（留空表示不修改）'
                : settings.keyUnreadable
                  ? '请重新填写密钥'
                  : 'sk-...'
            }
            secure
            testID="llm-api-key"
            hint={
              SECRET_PERSISTED
                ? '加密保存在手机系统的安全存储里，不会写入数据库或备份文件'
                : '网页调试版没有安全存储：密钥只保存在内存里，刷新页面后需要重新填写'
            }
          />
          <Field
            label="模型名"
            value={model}
            onChange={setModel}
            placeholder="deepseek-chat"
            testID="llm-model"
          />
        </Card>

        {status ? (
          <View style={{ marginTop: space.md }}>
            <Notice tone={status.tone}>{status.text}</Notice>
          </View>
        ) : null}

        <View style={{ gap: space.sm, marginTop: space.lg }}>
          <Button
            label="保存"
            onPress={() => void onSave()}
            loading={saving}
            disabled={!canSave}
            testID="llm-save"
          />
          <Button
            label="测试连接"
            kind="secondary"
            onPress={() => void onTest()}
            loading={testing}
            testID="llm-test"
          />
          {settings.baseUrl || settings.hasKey || settings.keyUnreadable ? (
            <Button
              label="清除配置"
              kind="ghost"
              color={p.danger}
              size="md"
              onPress={() => void onClear()}
            />
          ) : null}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 48,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    fontSize: 16,
    borderWidth: 1,
  },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  chip: {
    borderRadius: 999,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    minHeight: 32,
    justifyContent: 'center',
  },
});
