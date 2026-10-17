const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const eslintConfigPrettier = require('eslint-config-prettier');

/**
 * Native capabilities. Only src/platform may import these; src/db alone may import expo-sqlite.
 * Everything else reaches them through a thin wrapper in src/platform.
 * UI-only Expo packages (expo-router, expo-status-bar, @expo/vector-icons) are not listed.
 */
const PLATFORM_NATIVE_MODULES = [
  'expo-secure-store',
  'expo-speech',
  'expo-audio',
  'expo-av',
  'expo-file-system',
  'expo-file-system/*',
  'expo-document-picker',
  'expo-sharing',
  'expo-haptics',
  'expo-clipboard',
  'expo-notifications',
  'expo-localization',
  'expo-device',
  'expo-network',
  'expo-media-library',
  'expo-image-picker',
  'expo-camera',
];
const SQLITE_MODULES = ['expo-sqlite', 'expo-sqlite/*'];
const REACT_PATHS = (dir) =>
  ['react', 'react-dom', 'react-native', 'expo-router'].map((name) => ({
    name,
    message: `${dir} must not depend on React.`,
  }));

const nativeOnlyInPlatform = {
  group: PLATFORM_NATIVE_MODULES,
  message: 'Native capabilities live in src/platform. Import the wrapper from there instead.',
};
const sqliteOnlyInDb = {
  group: SQLITE_MODULES,
  message: 'Only src/db may open SQLite or run SQL.',
};

module.exports = defineConfig([
  {
    ignores: [
      'dist/**',
      'android/**',
      'ios/**',
      'coverage/**',
      'node_modules/**',
      '.expo/**',
      'web-build/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  expoConfig,
  eslintConfigPrettier,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // 密钥和学习数据不能进日志：只允许 warn / error
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  // Any other directory under src/ (future ones included): no native modules, no SQLite.
  {
    files: ['src/**/*.{ts,tsx,js}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [nativeOnlyInPlatform, sqliteOnlyInDb] }],
    },
  },
  {
    files: ['src/app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/db',
                '@/db/*',
                '@/lib',
                '@/lib/*',
                '@/platform',
                '@/platform/*',
                '@/components',
                '@/components/*',
                '../*',
                '../../*',
                '../../../*',
              ],
              message:
                'Route modules may only call src/features, plus the Expo Router and React Native runtime.',
            },
            nativeOnlyInPlatform,
            sqliteOnlyInDb,
          ],
        },
      ],
    },
  },
  {
    files: ['src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app', '@/app/*'],
              message: 'Features must not import route modules.',
            },
            nativeOnlyInPlatform,
            sqliteOnlyInDb,
          ],
        },
      ],
    },
  },
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/app',
                '@/app/*',
                '@/db',
                '@/db/*',
                '**/db/*',
                '@/platform',
                '@/platform/*',
                '**/platform/*',
              ],
              message:
                'src/ui holds presentational components only: no routes, SQL, secrets, or native calls.',
            },
            nativeOnlyInPlatform,
            sqliteOnlyInDb,
          ],
        },
      ],
    },
  },
  {
    files: ['src/lib/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: REACT_PATHS('src/lib'),
          patterns: [
            {
              group: [
                '@/app',
                '@/app/*',
                '@/features',
                '@/features/*',
                '@/db',
                '@/db/*',
                '@/platform',
                '@/platform/*',
                '**/platform/*',
                '@/components',
                '@/components/*',
              ],
              message:
                'src/lib is React-free and must not import app, features, db, platform, or components.',
            },
            {
              group: ['expo', 'expo-*', 'expo-*/*', '@expo/*'],
              message: 'src/lib holds pure logic only; wrap native capabilities in src/platform.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/db/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: REACT_PATHS('src/db'),
          patterns: [
            {
              group: [
                '@/app',
                '@/app/*',
                '@/features',
                '@/features/*',
                '@/components',
                '@/components/*',
              ],
              message:
                'src/db is the SQL layer and must not import routes, features, or components.',
            },
            nativeOnlyInPlatform,
          ],
        },
      ],
    },
  },
  {
    files: ['src/platform/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: REACT_PATHS('src/platform'),
          patterns: [
            {
              group: [
                '@/app',
                '@/app/*',
                '@/features',
                '@/features/*',
                '@/db',
                '@/db/*',
                '**/db/*',
                '@/ui',
                '@/ui/*',
                '@/components',
                '@/components/*',
              ],
              message:
                'src/platform holds thin native wrappers and must not import routes, features, db, or UI.',
            },
            sqliteOnlyInDb,
          ],
        },
      ],
    },
  },
]);
