const fs = require('fs');

/** Play Store rejects versionCode values above this. */
const MAX_VERSION_CODE = 2100000000;

const RELEASE_TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

class InvalidReleaseTagError extends Error {
  /**
   * @param {string} tag
   * @param {string} reason
   */
  constructor(tag, reason) {
    super(
      `Release tag "${tag}" is invalid: ${reason} Use vMAJOR.MINOR.PATCH (for example v0.2.3). Minor and patch must each be 0-99. versionCode is major * 10000 + minor * 100 + patch.`,
    );
    this.name = 'InvalidReleaseTagError';
  }
}

/**
 * @param {string} tag
 * @returns {{ major: number, minor: number, patch: number }}
 */
function parseReleaseTag(tag) {
  const match = RELEASE_TAG.exec(tag);
  if (!match) {
    throw new InvalidReleaseTagError(tag, 'it does not match vMAJOR.MINOR.PATCH.');
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  const outOfRange = [];
  if (minor > 99) {
    outOfRange.push(`minor is ${minor}`);
  }
  if (patch > 99) {
    outOfRange.push(`patch is ${patch}`);
  }
  if (outOfRange.length > 0) {
    throw new InvalidReleaseTagError(tag, `${outOfRange.join(' and ')}, which is outside 0-99.`);
  }

  return { major, minor, patch };
}

/**
 * @param {string} tag
 * @returns {number}
 */
function versionCodeFromTag(tag) {
  const { major, minor, patch } = parseReleaseTag(tag);
  const versionCode = major * 10000 + minor * 100 + patch;
  if (!Number.isSafeInteger(versionCode) || versionCode > MAX_VERSION_CODE) {
    throw new InvalidReleaseTagError(
      tag,
      `versionCode ${versionCode} is above ${MAX_VERSION_CODE}.`,
    );
  }
  return versionCode;
}

/**
 * @param {string} tag
 * @returns {string}
 */
function versionNameFromTag(tag) {
  const { major, minor, patch } = parseReleaseTag(tag);
  return `${major}.${minor}.${patch}`;
}

/**
 * Release builds set ANDROID_RELEASE_TAG. Local builds use package.json.
 * @param {{ ANDROID_RELEASE_TAG?: string }} [env]
 * @returns {{ version: string, versionCode: number }}
 */
function resolveAndroidRelease(env = process.env) {
  const fromEnv = env.ANDROID_RELEASE_TAG;
  const tag = typeof fromEnv === 'string' && fromEnv.length > 0 ? fromEnv : defaultReleaseTag();
  return {
    version: versionNameFromTag(tag),
    versionCode: versionCodeFromTag(tag),
  };
}

function defaultReleaseTag() {
  const version = require('../../package.json').version;
  return `v${version}`;
}

function main() {
  const tag = process.argv[2];
  try {
    if (typeof tag !== 'string' || tag.length === 0) {
      throw new InvalidReleaseTagError(tag ?? '', 'no tag was provided.');
    }
    const version = versionNameFromTag(tag);
    const versionCode = versionCodeFromTag(tag);
    if (process.env.GITHUB_ENV) {
      fs.appendFileSync(process.env.GITHUB_ENV, `ANDROID_RELEASE_TAG=${tag}\n`);
    }
    process.stdout.write(`versionName=${version} versionCode=${versionCode}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`::error::${message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  InvalidReleaseTagError,
  resolveAndroidRelease,
  versionCodeFromTag,
  versionNameFromTag,
};
