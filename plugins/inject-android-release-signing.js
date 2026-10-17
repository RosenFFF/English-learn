const MARKER = 'Injected by plugins/withAndroidReleaseSigning.js';

const DEBUG_SIGNING_BLOCK = `        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }`;

const RELEASE_SIGNING_BLOCK = `        release {
            // ${MARKER}
            def keystorePath = System.getenv('ANDROID_KEYSTORE_FILE')
            def keyAlias = System.getenv('ANDROID_KEY_ALIAS')
            def storePassword = System.getenv('ANDROID_KEYSTORE_PASSWORD')
            def keyPassword = System.getenv('ANDROID_KEY_PASSWORD')
            if (keystorePath != null && keyAlias != null && storePassword != null && keyPassword != null) {
                storeFile file(keystorePath)
                storePassword storePassword
                keyAlias keyAlias
                keyPassword keyPassword
            }
        }`;

const RELEASE_BUILD_TYPE_SIGNING = `            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug`;

const RELEASE_BUILD_TYPE_SIGNING_REPLACEMENT = `            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.release`;

const TASK_GRAPH_GUARD = `
// ${MARKER} — debug builds do not require these variables.
gradle.taskGraph.whenReady { taskGraph ->
    def needsReleaseSigning = taskGraph.allTasks.any { task ->
        def name = task.name
        name.contains('Release') && (
            name.startsWith('assemble') ||
            name.startsWith('bundle') ||
            name.startsWith('package') ||
            name.startsWith('sign')
        )
    }
    if (!needsReleaseSigning) {
        return
    }
    def required = [
        'ANDROID_KEYSTORE_FILE',
        'ANDROID_KEY_ALIAS',
        'ANDROID_KEYSTORE_PASSWORD',
        'ANDROID_KEY_PASSWORD',
    ]
    def missing = required.findAll { !System.getenv(it) }
    if (!missing.isEmpty()) {
        throw new GradleException(
            'Missing Android release signing environment variables: ' + missing.join(', ') +
            '. Set ANDROID_KEYSTORE_FILE, ANDROID_KEY_ALIAS, ANDROID_KEYSTORE_PASSWORD, and ANDROID_KEY_PASSWORD before assembleRelease.'
        )
    }
}
`;

function injectAndroidReleaseSigning(contents) {
  if (contents.includes(MARKER)) {
    if (!contents.includes('signingConfig signingConfigs.release')) {
      throw new Error(
        'android/app/build.gradle contains a partial release signing injection. Delete android/ and run prebuild again.',
      );
    }
    return contents;
  }

  if (!contents.includes(DEBUG_SIGNING_BLOCK)) {
    throw new Error(
      'Could not find the Expo debug signingConfigs block in android/app/build.gradle. Update plugins/withAndroidReleaseSigning.js for this Expo SDK.',
    );
  }
  if (!contents.includes(RELEASE_BUILD_TYPE_SIGNING)) {
    throw new Error(
      'Could not find the Expo release buildType signingConfig in android/app/build.gradle. Update plugins/withAndroidReleaseSigning.js for this Expo SDK.',
    );
  }

  const withReleaseConfig = contents.replace(
    DEBUG_SIGNING_BLOCK,
    `${DEBUG_SIGNING_BLOCK}\n${RELEASE_SIGNING_BLOCK}`,
  );
  const withReleaseBuildType = withReleaseConfig.replace(
    RELEASE_BUILD_TYPE_SIGNING,
    RELEASE_BUILD_TYPE_SIGNING_REPLACEMENT,
  );

  if (withReleaseBuildType === contents) {
    throw new Error('Release signing injection did not change android/app/build.gradle.');
  }

  return `${withReleaseBuildType.trimEnd()}\n${TASK_GRAPH_GUARD}`;
}

module.exports = { injectAndroidReleaseSigning };
