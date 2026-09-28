/**
 * Release features switch on from the environment, so local builds need no credentials:
 *
 * - PB_UPDATE_URL: base URL where `latest*.yml` and installers are uploaded; enables auto-update.
 * - macOS signing: a Developer ID Application certificate in the keychain, or CSC_LINK +
 *   CSC_KEY_PASSWORD. Without one, builds are ad-hoc signed.
 * - macOS notarization: APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID (or
 *   APPLE_API_KEY + APPLE_API_KEY_ID + APPLE_API_ISSUER).
 * - Windows signing: WIN_CSC_LINK + WIN_CSC_KEY_PASSWORD.
 */
const updateUrl = process.env.PB_UPDATE_URL?.trim()
const canNotarize = Boolean(
  (process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID) ||
  (process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER)
)

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.popcorn-bucket.app',
  productName: 'Popcorn Bucket',
  directories: { buildResources: 'build' },
  files: [
    '!**/.vscode/*',
    '!src/*',
    '!electron.vite.config.{js,ts,mjs,cjs}',
    '!electron-builder.cjs',
    '!vitest.config.ts',
    '!{.eslintcache,eslint.config.mjs,.prettierignore,.prettierrc.yaml,dev-app-update.yml,CHANGELOG.md,README.md}',
    '!{.env,.env.*,.npmrc,pnpm-lock.yaml}',
    '!{tsconfig.json,tsconfig.node.json,tsconfig.web.json}'
  ],
  asarUnpack: ['resources/**'],
  win: { executableName: 'PopcornBucket' },
  nsis: {
    artifactName: '${name}-${version}-setup.${ext}',
    shortcutName: '${productName}',
    uninstallDisplayName: '${productName}',
    createDesktopShortcut: 'always'
  },
  mac: {
    minimumSystemVersion: '13.0',
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    hardenedRuntime: true,
    extendInfo: {
      NSDownloadsFolderUsageDescription: 'Popcorn Bucket saves movies to your Downloads folder.'
    },
    notarize: canNotarize
  },
  dmg: { artifactName: '${name}-${version}.${ext}' },
  linux: {
    target: ['AppImage', 'snap', 'deb'],
    maintainer: 'Josh Marom',
    category: 'AudioVideo'
  },
  appImage: { artifactName: '${name}-${version}.${ext}' },
  npmRebuild: false,
  publish: updateUrl ? [{ provider: 'generic', url: updateUrl }] : null
}
