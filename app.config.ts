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
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
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
