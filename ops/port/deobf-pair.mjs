/**
 * 把两个上游版本里同名 JS 产物成对反混淆到临时目录，便于人工对照移植。
 *
 *   node ops/port/deobf-pair.mjs [--old 0.8.5] [--new 0.8.6] [--out /tmp/086] frontend/modules/interaction3d/television-panel.js ...
 */
import fs from 'node:fs'
import path from 'node:path'
import { deobfuscate } from './lib/js-deobf.mjs'

const ROOT = path.resolve(import.meta.dirname, '../../源代码')

const argv = process.argv.slice(2)
const options = { '--old': '0.8.5', '--new': '0.8.6', '--out': '/tmp/086' }
const files = []
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] in options) options[argv[i]] = argv[++i]
  else files.push(argv[i])
}

for (const relative of files) {
  for (const version of [options['--old'], options['--new']]) {
    const source = path.join(ROOT, version, relative)
    if (!fs.existsSync(source)) continue
    const target = path.join(options['--out'], version, relative.replace(/\.js$/, '.pretty.js'))
    fs.mkdirSync(path.dirname(target), { recursive: true })
    const result = deobfuscate(fs.readFileSync(source, 'utf8'))
    const code = typeof result === 'string' ? result : result.code
    fs.writeFileSync(target, code)
    console.log(version, relative, '→', target, code.length)
  }
}
