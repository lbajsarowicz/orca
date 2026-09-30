const { withAppBuildGradle } = require('expo/config-plugins')

// Why: AGP derives `enableV1Signing` from minSdk and turns it off at >= 24, which is what
// Expo sets. Stock Android 7+ verifies the v2 block and does not care, but OEM installers,
// file managers and sideload helpers that only read the v1 JAR signature reject a v2-only
// APK as INSTALL_PARSE_FAILED_NO_CERTIFICATES — the "APK has no certificate" reports.
// Release builds fall back to `signingConfigs.debug`, so that is the block that opts back in.
const SIGNING_FLAGS = ['enableV1Signing true', 'enableV2Signing true']

// The last line of the template's debug signingConfig block. Matching it (rather than the
// block) keeps the edit anchored to one known line, so an upstream template change fails
// loudly here instead of silently shipping a v1-less APK again.
const KEY_PASSWORD_LINE = /^([ \t]*)keyPassword 'android'$/gm

/** The app build.gradle with v1 signing turned back on for the debug-keystore config. */
function enableApkV1Signing(buildGradle) {
  if (SIGNING_FLAGS.every((flag) => buildGradle.includes(flag))) {
    return buildGradle
  }

  const matches = [...buildGradle.matchAll(KEY_PASSWORD_LINE)]
  if (matches.length !== 1) {
    throw new Error(
      `android-apk-v1-signature: expected one debug signingConfig keyPassword line, found ${matches.length}`
    )
  }

  const [line, indent] = matches[0]
  const added = SIGNING_FLAGS.map((flag) => `\n${indent}${flag}`).join('')
  return buildGradle.replace(line, `${line}${added}`)
}

module.exports = function withAndroidApkV1Signature(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error(
        `android-apk-v1-signature: expected a groovy build.gradle, got ${cfg.modResults.language}`
      )
    }
    cfg.modResults.contents = enableApkV1Signing(cfg.modResults.contents)
    return cfg
  })
}

module.exports.enableApkV1Signing = enableApkV1Signing
