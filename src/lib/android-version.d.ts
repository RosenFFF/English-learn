export class InvalidReleaseTagError extends Error {
  constructor(tag: string, reason: string);
}

/** major * 10000 + minor * 100 + patch. Minor and patch must each be 0-99. */
export function versionCodeFromTag(tag: string): number;

/** versionName for the same tag, without the leading v. */
export function versionNameFromTag(tag: string): string;

/**
 * Uses ANDROID_RELEASE_TAG when set. Otherwise uses v{package.json version}
 * so a local build still has a versionName and versionCode.
 */
export function resolveAndroidRelease(env?: { ANDROID_RELEASE_TAG?: string }): {
  version: string;
  versionCode: number;
};
