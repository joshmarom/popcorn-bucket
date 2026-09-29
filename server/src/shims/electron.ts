/** Stand-in for Electron when the catalog modules run inside the API process. */
export const app = {
  isPackaged: true,
  getPath(name: string): string {
    if (name === 'userData' || name === 'downloads') {
      return process.env.POPCORN_DATA_DIR || '/tmp/popcorn-api'
    }
    return process.env.POPCORN_DATA_DIR || '/tmp/popcorn-api'
  },
  getVersion(): string {
    return 'server'
  },
  getLocaleCountryCode(): string {
    return process.env.POPCORN_COUNTRY ?? ''
  },
  getAppPath(): string {
    return process.cwd()
  }
}

export const safeStorage = {
  isEncryptionAvailable(): boolean {
    return false
  },
  encryptString(value: string): Buffer {
    return Buffer.from(value)
  },
  decryptString(value: Buffer): string {
    return Buffer.from(value).toString('utf8')
  }
}
