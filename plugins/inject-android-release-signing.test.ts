import { readFileSync } from 'fs';
import path from 'path';

import { injectAndroidReleaseSigning } from './inject-android-release-signing';

const fixture = readFileSync(
  path.join(process.cwd(), 'plugins/__fixtures__/expo-app-build.gradle'),
  'utf8',
);

describe('injectAndroidReleaseSigning', () => {
  it('points release builds at env-based signing and leaves debug signing in place', () => {
    const result = injectAndroidReleaseSigning(fixture);

    expect(result).toContain("storeFile file('debug.keystore')");
    expect(result).toContain('signingConfig signingConfigs.debug');
    expect(result).toContain('signingConfig signingConfigs.release');
    expect(result).toContain("System.getenv('ANDROID_KEYSTORE_FILE')");
    expect(result).toContain("System.getenv('ANDROID_KEY_ALIAS')");
    expect(result).toContain("System.getenv('ANDROID_KEYSTORE_PASSWORD')");
    expect(result).toContain("System.getenv('ANDROID_KEY_PASSWORD')");
    expect(result).toContain('Missing Android release signing environment variables');
    expect(result).not.toContain(
      `see https://reactnative.dev/docs/signed-apk-android.\n            signingConfig signingConfigs.debug`,
    );
    expect(injectAndroidReleaseSigning(result)).toBe(result);
  });

  it('fails with a clear message when the Expo template block is missing', () => {
    expect(() => injectAndroidReleaseSigning('android {}\n')).toThrow(
      /Could not find the Expo debug signingConfigs block/,
    );
  });
});
