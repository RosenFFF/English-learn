import type { ExpoConfig } from 'expo/config';

import { resolveAndroidRelease } from './src/lib/android-version';

const androidRelease = resolveAndroidRelease();

const config: ExpoConfig = {
  name: '英语词汇',
  slug: 'english-learn',
  version: androidRelease.version,
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'englishlearn',
  // 跟随系统深色模式（安卓上需要 expo-system-ui 才生效）
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.rosenfff.englishlearn',
  },
  android: {
    package: 'com.rosenfff.englishlearn',
    versionCode: androidRelease.versionCode,
    // Android's default is true. Leave it on so a system backup can carry
    // learning progress to a new phone. expo-secure-store excludes the API key.
    allowBackup: true,
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    bundler: 'metro',
    // single：只导出一个 index.html，由前端路由接管。static 模式在本项目（以及当前 main 骨架）导出的
    // HTML 里没有注入任何 JS，页面无法交互；词库和进度都在浏览器端 SQLite 里，也没有可预渲染的内容。
    output: 'single',
    favicon: './assets/images/favicon.png',
    lang: 'zh-CN',
  },
  plugins: [
    'expo-router',
    'expo-sqlite',
    'expo-sharing',
    [
      'expo-secure-store',
      {
        // Default. Backup and data-extraction rules exclude SecureStore shared preferences.
        configureAndroidBackup: true,
      },
    ],
    './plugins/withAndroidReleaseSigning',
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        resizeMode: 'contain',
        backgroundColor: '#ffffff',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    router: {
      root: 'src/app',
    },
  },
};

export default config;
