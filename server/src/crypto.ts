import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGO = 'aes-256-gcm'

export function masterKey(): Buffer {
  const raw = process.env.SECRETS_MASTER_KEY?.trim()
  if (!raw) throw new Error('SECRETS_MASTER_KEY is not set')
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('SECRETS_MASTER_KEY must be 32 bytes of base64')
  return key
}

/** iv (12) + auth tag (16) + ciphertext. */
export function encryptSecret(plain: string): Buffer {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, masterKey(), iv)
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body])
}

export function decryptSecret(payload: Buffer): string {
  const iv = payload.subarray(0, 12)
  const tag = payload.subarray(12, 28)
  const body = payload.subarray(28)
  const decipher = createDecipheriv(ALGO, masterKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
}
