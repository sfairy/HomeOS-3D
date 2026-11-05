// @ts-check
/**
 * 资源体积归因：把一次 `bench_frontend.json` 的采样拆成「谁占了多少字节」。
 *
 * 为什么单独成脚本而不并进 bench_frontend：字节归因是**离线**分析（结果文件里已经有
 * 每条资源的 `encodedBodySize` / `transferSize`），重跑一次浏览器既慢又引入新的抖动。
 * 排查"首页 690KB preload 里到底哪些是首屏必需"时，直接对同一份采样反复问更可靠。
 *
 * 用法
 * ----
 * ```bash
 * node ops/perf/harness/resource_inventory.mjs ops/perf/results/before/bench_frontend.json
 * node ops/perf/harness/resource_inventory.mjs <file> --top 30 --match '/static/assets/'
 * ```
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import process from 'node:process'

/** @returns {Record<string, string | boolean>} */
function parseArgs(argv) {
  /** @type {Record<string, string | boolean>} */
  const out = {}
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[index + 1]
    if (next === undefined || next.startsWith('--')) out[key] = true
    else {
      out[key] = next
      index += 1
    }
  }
  return out
}

function human(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function main() {
  const args = parseArgs(process.argv)
  const file = process.argv[2]
  if (!file) {
    console.error('用法：node ops/perf/harness/resource_inventory.mjs <bench_frontend.json> [--top N] [--match 前缀]')
    return 2
  }
  const payload = JSON.parse(readFileSync(resolve(file), 'utf8'))
  // 多轮采样时用第一轮的资源清单做归因：各轮资源集合相同，取中位数的清单没有意义
  const sample = payload.samples?.[0]
  if (!sample) {
    console.error('结果文件里没有 samples —— 先跑 bench_frontend.mjs')
    return 2
  }
  const match = typeof args.match === 'string' ? args.match : ''
  const rows = (sample.resources || []).filter((item) => !match || item.name.startsWith(match))
  const totalTransfer = rows.reduce((sum, item) => sum + item.transferSize, 0)
  const totalEncoded = rows.reduce((sum, item) => sum + item.encodedBodySize, 0)

  const byType = new Map()
  const byExt = new Map()
  for (const item of rows) {
    byType.set(item.initiatorType, (byType.get(item.initiatorType) || 0) + item.transferSize)
    const ext = extname(item.name.split('?')[0]) || '(none)'
    byExt.set(ext, (byExt.get(ext) || 0) + item.transferSize)
  }

  const top = Number(args.top || 20)
  console.log(`# ${payload.label} ${sample.lcpElement || ''}`.trim())
  console.log(`资源 ${rows.length} 条，transfer ${human(totalTransfer)}，encoded ${human(totalEncoded)}\n`)
  console.log('## 按发起方')
  for (const [key, value] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${key.padEnd(14)} ${human(value).padStart(10)}  ${((value / totalTransfer) * 100 || 0).toFixed(1)}%`)
  }
  console.log('\n## 按扩展名')
  for (const [key, value] of [...byExt.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${key.padEnd(14)} ${human(value).padStart(10)}  ${((value / totalTransfer) * 100 || 0).toFixed(1)}%`)
  }
  console.log(`\n## Top ${top}（transfer 降序）`)
  for (const item of rows.slice(0, top)) {
    console.log(
      `  ${String(item.transferSize).padStart(8)}B  ${String(item.encodedBodySize).padStart(8)}B  ${item.initiatorType.padEnd(10)} ${item.name}`,
    )
  }

  const outPath = file.replace(/\.json$/, '.inventory.json')
  writeFileSync(
    outPath,
    `${JSON.stringify({ label: payload.label, totalTransfer, totalEncoded, byType: Object.fromEntries(byType), byExtension: Object.fromEntries(byExt), rows }, null, 2)}\n`,
  )
  console.log(`\n已写入 ${outPath}`)
  return 0
}

process.exit(main())
