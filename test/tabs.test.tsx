import { renderRouter, screen } from 'expo-router/testing-library';

// 不在单测里打开真实数据库：根布局直接进入就绪状态，各页面的数据加载失败也不影响标签栏渲染
jest.mock('@/features/app/init', () => ({
  useAppReady: () => ({ ready: true, error: null, retry: () => undefined }),
}));

// 图标字体是资源文件，单测环境里没有资源注册表；用空组件代替
jest.mock('@expo/vector-icons/Ionicons', () => {
  const Icon = () => null;
  return { __esModule: true, default: Icon };
});

const tabLabels = ['首页', '我的'];

describe('tabs', () => {
  it('renders the two tabs', async () => {
    await renderRouter('./src/app', { initialUrl: '/home' });

    for (const label of tabLabels) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });
});
