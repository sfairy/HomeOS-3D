import { readFileSync } from 'node:fs'
import { deobfuscate, residualDecoderCalls } from './lib/js-deobf.mjs'

const source = readFileSync(process.argv[2], 'utf8')
const result = deobfuscate(source, { stats: true })
process.stdout.write(result.code)
if (result.stats.failed) {
  console.error('failed:', result.stats.failed, residualDecoderCalls(result.code).slice(0, 5))
}
