import { describe, expect, it } from 'vitest'
// Only the pure gradle transform is under test; the expo plugin wiring around it is
// proven by the release build.
import { enableApkV1Signing } from '../../plugins/android-apk-v1-signature.js'

// The shape expo prebuild writes: release signs with the debug keystore, so the debug
// signingConfig is the one whose scheme flags decide what the published APK carries.
const templateBuildGradle = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.debug
        }
    }
}
`

describe('android APK v1 signature plugin', () => {
  it('turns on both signature schemes inside the debug signingConfig', () => {
    const patched = enableApkV1Signing(templateBuildGradle)

    expect(patched).toContain("            keyPassword 'android'\n            enableV1Signing true")
    expect(patched).toContain('            enableV2Signing true\n        }')
  })

  it('is a no-op on an already patched build.gradle', () => {
    const once = enableApkV1Signing(templateBuildGradle)

    expect(enableApkV1Signing(once)).toBe(once)
  })

  it('fails loudly when the template no longer has the anchor line', () => {
    expect(() => enableApkV1Signing('android {\n}\n')).toThrow(
      /expected one debug signingConfig keyPassword line, found 0/
    )
  })
})
