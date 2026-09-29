import { resolve } from 'node:path'
import { build } from 'esbuild'

await build({
  entryPoints: [
    'src/index.ts',
    'src/migrate.ts',
    'src/pg-worker.ts',
    'src/secrets-cli.ts',
    'src/refresh.ts'
  ],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  sourcemap: true,
  alias: {
    electron: resolve('src/shims/electron.ts'),
    'better-sqlite3': resolve('src/shims/better-sqlite3.ts'),
    '@shared': resolve('../src/shared')
  }
})
