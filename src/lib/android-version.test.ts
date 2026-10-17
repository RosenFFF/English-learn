import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import { resolveAndroidRelease, versionCodeFromTag, versionNameFromTag } from './android-version';

const script = path.join(process.cwd(), 'src/lib/android-version.js');

function runCli(tag: string, githubEnv?: string) {
  const env = { ...process.env };
  if (githubEnv === undefined) {
    delete env.GITHUB_ENV;
  } else {
    env.GITHUB_ENV = githubEnv;
  }
  return spawnSync(process.execPath, [script, tag], {
    encoding: 'utf8',
    env,
  });
}

describe('android version from a release tag', () => {
  it('encodes v0.2.3 as versionCode 203 and versionName 0.2.3', () => {
    expect(versionCodeFromTag('v0.2.3')).toBe(203);
    expect(versionNameFromTag('v0.2.3')).toBe('0.2.3');
  });

  it('uses major * 10000 + minor * 100 + patch', () => {
    expect(versionCodeFromTag('v0.1.0')).toBe(100);
    expect(versionCodeFromTag('v1.2.3')).toBe(10203);
    expect(versionCodeFromTag('v0.99.99')).toBe(9999);
    expect(versionCodeFromTag('v10.0.1')).toBe(100001);
  });

  it('rejects minor or patch above 99', () => {
    expect(() => versionCodeFromTag('v0.100.0')).toThrow(/minor is 100/);
    expect(() => versionCodeFromTag('v0.100.0')).toThrow(/0-99/);
    expect(() => versionCodeFromTag('v0.2.100')).toThrow(/patch is 100/);
    expect(() => versionCodeFromTag('v1.100.100')).toThrow(/minor is 100 and patch is 100/);
  });

  it('rejects malformed tags', () => {
    for (const tag of ['', '0.2.3', 'v0.2', 'v0.2.3.4', 'v0.2.3-beta', 'V0.2.3', 'v0.02.3']) {
      expect(() => versionCodeFromTag(tag)).toThrow(/does not match vMAJOR\.MINOR\.PATCH/);
    }
  });

  it('rejects a versionCode above the Play Store limit', () => {
    expect(() => versionCodeFromTag('v210000.0.1')).toThrow(/above 2100000000/);
  });

  it('falls back to package.json for a local build', () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'),
    ) as {
      version: string;
    };

    expect(resolveAndroidRelease({})).toEqual({
      version: packageJson.version,
      versionCode: versionCodeFromTag(`v${packageJson.version}`),
    });
    expect(resolveAndroidRelease({ ANDROID_RELEASE_TAG: 'v0.2.3' })).toEqual({
      version: '0.2.3',
      versionCode: 203,
    });
  });

  it('fails the release entry point when minor or patch exceeds 99', () => {
    const result = runCli('v0.100.1');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('::error::');
    expect(result.stderr).toContain('minor is 100');
    expect(result.stderr).toContain('0-99');
  });

  it('writes the validated tag for the release workflow', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'android-version-'));
    const githubEnv = path.join(directory, 'github-env');
    const result = runCli('v0.2.3', githubEnv);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('versionName=0.2.3 versionCode=203');
    expect(readFileSync(githubEnv, 'utf8')).toBe('ANDROID_RELEASE_TAG=v0.2.3\n');
  });
});
