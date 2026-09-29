import { build } from 'esbuild'

await build({
  entryPoints: ['src/index.ts', 'src/migrate.ts', 'src/pg-worker.ts'],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  sourcemap: true
})
