/**
 * 设置页（src/app/settings.tsx；测试放在 src/app 外面，免得被 expo-router 当成路由）：密钥解不开时显示「请重新填写」提示，接口地址和模型名照常回填。
 */
import { render, screen } from '@testing-library/react-native';

import SettingsScreen from '@/app/settings';

jest.mock('@/features/settings/service', () => ({
  KEY_UNREADABLE_TEXT: '密钥无法读取（可能是换了手机），请重新填写。接口地址和模型名已保留。',
  SECRET_PERSISTED: true,
  clearLlmSettings: jest.fn(),
  saveLlmSettings: jest.fn(),
  testLlmConnection: jest.fn(),
  validateBaseUrl: () => null,
  useLlmSettings: () => ({
    settings: {
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      hasKey: false,
      keyUnreadable: true,
    },
    reload: jest.fn(),
  }),
}));

it('密钥解不开时显示提示，地址和模型名保留', async () => {
  await render(<SettingsScreen />);
  expect(await screen.findByText(/密钥无法读取（可能是换了手机），请重新填写/)).toBeTruthy();
  expect(screen.getByTestId('llm-base-url').props.value).toBe('https://api.deepseek.com/v1');
  expect(screen.getByTestId('llm-model').props.value).toBe('deepseek-chat');
  expect(screen.getByTestId('llm-api-key').props.placeholder).toBe('请重新填写密钥');
});
