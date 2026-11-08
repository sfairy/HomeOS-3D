/**
 * 把 0.8.4 / 0.8.5 里同名 JS 产物成对反混淆到 /tmp/085，便于人工对照移植。
 *
 *   node ops/port/deobf-pair.mjs frontend/modules/interaction3d/television-panel.js ...
 */
import fs from 'node:fs'
import path from 'node:path'
import { deobfuscate } from './lib/js-deobf.mjs'

const ROOT = path.resolve(import.meta.dirname, '../../源代码')
const OUT = '/tmp/085'

for (const relative of process.argv.slice(2)) {
  for (const version of ['0.8.4', '0.8.5']) {
    const source = path.join(ROOT, version, relative)
    if (!fs.existsSync(source)) continue
    const target = path.join(OUT, version, relative.replace(/\.js$/, '.pretty.js'))
    fs.mkdirSync(path.dirname(target), { recursive: true })
    const code = deobfuscate(fs.readFileSync(source, 'utf8'))
    fs.writeFileSync(target, code)
    console.log(version, relative, '→', target, code.length)
  }
}
