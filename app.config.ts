import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: '英语词汇',
  slug: 'english-learn',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'englishlearn',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.rosenfff.englishlearn',
  },
  android: {
    package: 'com.rosenfff.englishlearn',
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
    'expo-secure-store',
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
