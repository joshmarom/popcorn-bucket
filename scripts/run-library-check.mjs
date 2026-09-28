import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// The runner is plain JavaScript so Node can start it before Electron does.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function main() {
  mkdirSync(join(root, 'out'), { recursive: true })
  const outfile = join(root, 'out', 'library-check.cjs')
  await build({
    entryPoints: [join(root, 'src/main/library/library-check.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    external: ['better-sqlite3', 'electron'],
    plugins: [
      {
        name: 'shared-alias',
        setup(esbuild) {
          esbuild.onResolve({ filter: /^@shared\// }, (args) => ({
            path: join(root, 'src/shared', `${args.path.slice('@shared/'.length)}.ts`)
          }))
        }
      }
    ]
  })
  const result = spawnSync(join(root, 'node_modules/.bin/electron'), [outfile], {
    stdio: 'inherit',
    cwd: root
  })
  process.exit(result.status === null ? 1 : result.status)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
