import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outdir = resolve(root, 'dist/cjs')

mkdirSync(outdir, { recursive: true })

const result = await Bun.build({
  entrypoints: [resolve(root, 'src/index.ts')],
  outdir,
  target: 'node',
  format: 'cjs',
  naming: 'index.js',
  sourcemap: 'none',
})

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}

writeFileSync(
  resolve(outdir, 'package.json'),
  `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`,
)
