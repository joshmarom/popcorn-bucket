import './env'
import { setServerSecret } from './secrets'

const [command, key] = process.argv.slice(2)
if (command !== 'set' || !key) {
  console.error('usage: node dist/secrets.js set <key>')
  console.error('the value is read from POPCORN_SECRET_VALUE')
  process.exit(1)
}

const value = process.env.POPCORN_SECRET_VALUE ?? ''
if (!value) {
  console.error('POPCORN_SECRET_VALUE is not set')
  process.exit(1)
}

setServerSecret(key, value)
console.log(`saved ${key}`)
