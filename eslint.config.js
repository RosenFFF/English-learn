const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const eslintConfigPrettier = require('eslint-config-prettier');

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
                '@/components',
                '@/components/*',
                '../*',
                '../../*',
                '../../../*',
              ],
              message:
                'Route modules may only call src/features, plus the Expo Router and React Native runtime.',
            },
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
          paths: [
            { name: 'react', message: 'src/lib must not depend on React.' },
            { name: 'react-dom', message: 'src/lib must not depend on React.' },
            { name: 'react-native', message: 'src/lib must not depend on React.' },
            { name: 'expo-router', message: 'src/lib must not depend on React.' },
          ],
          patterns: [
            {
              group: [
                '@/app',
                '@/app/*',
                '@/features',
                '@/features/*',
                '@/db',
                '@/db/*',
                '@/components',
                '@/components/*',
              ],
              message:
                'src/lib is React-free and must not import app, features, db, or components.',
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
          paths: [
            { name: 'react', message: 'src/db must not depend on React.' },
            { name: 'react-dom', message: 'src/db must not depend on React.' },
            { name: 'react-native', message: 'src/db must not depend on React.' },
            { name: 'expo-router', message: 'src/db must not depend on React.' },
          ],
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
          ],
        },
      ],
    },
  },
]);
