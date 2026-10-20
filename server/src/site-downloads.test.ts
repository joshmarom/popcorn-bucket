import { describe, expect, it } from 'vitest'
import { mapGithubRelease } from './site-downloads'

describe('mapGithubRelease', () => {
  it('keeps installers and drops update metadata', () => {
    const mapped = mapGithubRelease({
      tag_name: 'v1.2.0',
      assets: [
        { name: 'latest-mac.yml', browser_download_url: 'https://example.test/yml', size: 10 },
        {
          name: 'popcorn-bucket-1.2.0.dmg.blockmap',
          browser_download_url: 'https://example.test/block',
          size: 20
        },
        {
          name: 'popcorn-bucket-1.2.0-setup.exe',
          browser_download_url: 'https://example.test/exe',
          size: 30
        },
        {
          name: 'popcorn-bucket-1.2.0.dmg',
          browser_download_url: 'https://example.test/dmg',
          size: 40
        },
        {
          name: 'popcorn-bucket-1.2.0.AppImage',
          browser_download_url: 'https://example.test/appimage',
          size: 50
        },
        {
          name: 'popcorn-bucket-1.2.0.deb',
          browser_download_url: 'https://example.test/deb',
          size: 60
        }
      ]
    })

    expect(mapped).toEqual({
      ok: true,
      version: '1.2.0',
      assets: [
        {
          os: 'mac',
          label: 'macOS',
          name: 'popcorn-bucket-1.2.0.dmg',
          url: 'https://example.test/dmg',
          size: 40
        },
        {
          os: 'windows',
          label: 'Windows',
          name: 'popcorn-bucket-1.2.0-setup.exe',
          url: 'https://example.test/exe',
          size: 30
        },
        {
          os: 'linux',
          label: 'Linux AppImage',
          name: 'popcorn-bucket-1.2.0.AppImage',
          url: 'https://example.test/appimage',
          size: 50
        },
        {
          os: 'linux',
          label: 'Linux (.deb)',
          name: 'popcorn-bucket-1.2.0.deb',
          url: 'https://example.test/deb',
          size: 60
        }
      ]
    })
  })

  it('reports a miss when GitHub returns no release', () => {
    expect(mapGithubRelease({})).toEqual({ ok: false, error: 'No release found.' })
  })
})
