/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testTimeout: 30000,
  moduleNameMapper: {
    '\\.css$': '<rootDir>/test/empty-module.js',
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/e2e/',
    '<rootDir>/dist/',
    '<rootDir>/android/',
    '<rootDir>/ios/',
    '<rootDir>/coverage/',
  ],
};
