const { withAppBuildGradle } = require('expo/config-plugins');
const { injectAndroidReleaseSigning } = require('./inject-android-release-signing');

/** @type {import('expo/config-plugins').ConfigPlugin} */
const withAndroidReleaseSigning = (config) =>
  withAppBuildGradle(config, (gradle) => {
    if (gradle.modResults.language !== 'groovy') {
      throw new Error(
        `Android release signing expects Groovy app/build.gradle, received ${gradle.modResults.language}.`,
      );
    }
    gradle.modResults.contents = injectAndroidReleaseSigning(gradle.modResults.contents);
    return gradle;
  });

module.exports = withAndroidReleaseSigning;
