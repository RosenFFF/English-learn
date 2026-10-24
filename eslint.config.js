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
/**
 * zod 只在 src/lib/exam 里用（题目 schema 校验），其它地方只用那里推导出的普通类型。
 * 注意：同一条规则在后面的配置对象里会整体覆盖前面的，所以每个目录的 no-restricted-imports
 * 都要带上这一条；src/lib/exam 单独一段配置，只去掉 zod 这一条、其它限制照旧。
 */
const zodOnlyInExam = {
  group: ['zod', 'zod/*'],
  message: 'zod is only used inside src/lib/exam. Import the inferred types from there instead.',
};

/** src/lib 的 no-restricted-imports；extra 是额外的 pattern（src/lib/exam 以外要禁 zod） */
const libRestrictedImports = (extra) => [
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
      ...extra,
    ],
  },
];

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
  // src 以外（scripts、e2e、plugins、test 等）也不能用 zod；src 下各目录在后面各自合并这一条
  {
    files: ['**/*.{ts,tsx,js,mjs,cjs}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [zodOnlyInExam] }],
    },
  },
  // Any other directory under src/ (future ones included): no native modules, no SQLite.
  {
    files: ['src/**/*.{ts,tsx,js}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [nativeOnlyInPlatform, sqliteOnlyInDb, zodOnlyInExam] },
      ],
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
            zodOnlyInExam,
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
            zodOnlyInExam,
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
            zodOnlyInExam,
          ],
        },
      ],
    },
  },
  {
    files: ['src/lib/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': libRestrictedImports([zodOnlyInExam]) },
  },
  // 只有 src/lib/exam 可以用 zod；src/lib 的其它限制照旧
  {
    files: ['src/lib/exam/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': libRestrictedImports([]) },
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
            zodOnlyInExam,
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
            zodOnlyInExam,
          ],
        },
      ],
    },
  },
]);
