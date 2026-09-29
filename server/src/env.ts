import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

process.env.POPCORN_SERVER = '1'
if (!process.env.POPCORN_DATA_DIR) {
  process.env.POPCORN_DATA_DIR = join(homedir(), '.cache', 'popcorn-api')
}
mkdirSync(process.env.POPCORN_DATA_DIR, { recursive: true })

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not set`)
  return value
}
