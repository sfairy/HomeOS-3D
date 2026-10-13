#!/usr/bin/env node
/**
 * 并发跑一串只读门禁，并按清单顺序打印输出。
 *
 * 为什么需要它：`check:deps` 链是一条 14 步的 `&&` 链，串行时关键路径 = 各步之和。
 * 实测（frontend，含 3 个注入式自检 `_import_refs_selftest` / `_host_bindings_selftest` /
 * `_deps_bag_lazy_selftest`）：总计约 6s，自检占大头，而全部门禁本身
 * 只有 0.05~0.7s/步。这些步骤**只读源码、互不依赖**（自检都是先造临时树再跑真脚本），
 * 所以并行没有正确性代价，只是把关键路径从「之和」压到「最大值 + 尾巴」。
 *
 * 与之对比，「共享一次遍历」在数据上不成立：整棵 `homeos/frontend/src`（1234 个文件）
 * 单次遍历约 9ms、全量读取约 23ms —— 全链重复十几遍也就 0.3s 量级，且各步跑在不同
 * 进程里，进程内缓存共享不到（`scan.mjs` 的 walk 缓存只对同进程内的重复遍历有效）。
 *
 * 与 `&&` 链的语义差异（有意为之）：
 *   - 不再「第一步失败就停」：所有步骤都会跑完，一次拿到全部问题；
 *   - 退出码 = 有任一步非 0 则 1（门禁强度不变，不会因为并行而放松）；
 *   - 输出按清单顺序整段打印（不交错），失败步骤在结尾再汇总一次。
 *
 * 用法：
 *   node ops/lib/run-chain.mjs [--concurrency N] [--cwd DIR] <manifest.mjs>
 *
 * 清单（默认导出一个数组；步骤里的相对路径按**调用者 cwd**解析，可用 `--cwd` 覆盖）::
 *
 *   export default [
 *     { name: '分层依赖方向（main app）', cmd: ['node', 'scripts/check-frontend-deps.mjs'] },
 *     { name: '需要换目录的一步', cmd: ['node', 'x.mjs'], cwd: 'scripts' },
 *   ]
 *
 * 单步仍可单独跑（`node scripts/check-frontend-deps.mjs`）—— 自检就是这么调它的。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const argv = process.argv.slice(2)
const flagIndex = argv.indexOf('--concurrency')
const flagValue = flagIndex === -1 ? undefined : argv[flagIndex + 1]
const cwdIndex = argv.indexOf('--cwd')
const cwdValue = cwdIndex === -1 ? undefined : argv[cwdIndex + 1]
const manifestArg = argv.at(-1)

function usage(message) {
  console.error(
    `${message}\n用法：node ops/lib/run-chain.mjs [--concurrency N] [--cwd DIR] <manifest.mjs>`,
  )
  process.exit(2)
}

if (!manifestArg || manifestArg.startsWith('--')) usage('缺少清单文件参数')
const manifestFile = path.resolve(manifestArg)
if (!fs.existsSync(manifestFile)) usage(`清单文件不存在：${manifestFile}`)

const cpus = os.availableParallelism?.() ?? os.cpus().length
const concurrency = Math.max(1, Number.parseInt(flagValue ?? '', 10) || Math.min(4, cpus))

/**
 * 步骤的工作目录：默认**调用者的 cwd**（与原先的 `&&` 链一致 ——
 * `bun run --cwd homeos/frontend check:deps` 下就是包目录），可用 `--cwd` 显式覆盖。
 * 不按清单文件所在目录解析：清单住在 `scripts/`，而步骤里写的是 `scripts/x.mjs`。
 */
const baseCwd = cwdValue ? path.resolve(cwdValue) : process.cwd()

const mod = await import(pathToFileURL(manifestFile).href)
const steps = mod.default ?? mod.steps
if (!Array.isArray(steps) || steps.length === 0) usage(`清单里没有步骤：${manifestFile}`)
for (const [i, step] of steps.entries()) {
  if (!step?.name || !Array.isArray(step.cmd) || step.cmd.length === 0) {
    usage(`第 ${i + 1} 步缺少 name 或 cmd（cmd 必须是数组，如 ['node', 'scripts/x.mjs']）`)
  }
}

/** 跑一步并抓完整输出；不继承 stdio，避免并发时输出交错。 */
function spawnCapture(cmd, cwd) {
  return new Promise((resolve) => {
    const child = spawn(cmd[0], cmd.slice(1), { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      out += chunk
    })
    child.stderr.on('data', (chunk) => {
      out += chunk
    })
    child.on('error', (error) => resolve({ code: 1, out: `${out}${error.message}\n` }))
    child.on('close', (code, signal) => resolve({ code: code ?? (signal ? 1 : 0), out }))
  })
}

const pad = (n) => String(n).padStart(String(steps.length).length, '0')
const results = new Array(steps.length).fill(null)

function printStep(index) {
  const r = results[index]
  const label = `${pad(index + 1)}/${steps.length} ${r.name}`
  process.stdout.write(`▶ ${label}${r.code === 0 ? '' : `  ← exit ${r.code}`}\n`)
  if (r.out.trim()) process.stdout.write(r.out.endsWith('\n') ? r.out : `${r.out}\n`)
  process.stdout.write(`${r.code === 0 ? '✓' : '✗'} ${label} · ${r.ms} ms\n\n`)
}

let printed = 0
function flushInOrder() {
  while (printed < steps.length && results[printed]) printStep(printed++)
}

const startedAt = Date.now()
console.log(`══ 门禁链 ${steps.length} 步 · 并发 ${concurrency}（CPU ${cpus}）══\n`)

async function runStep(index) {
  const step = steps[index]
  const cwd = step.cwd ? path.resolve(baseCwd, step.cwd) : baseCwd
  const began = Date.now()
  const { code, out } = await spawnCapture(step.cmd, cwd)
  results[index] = { name: step.name, code, out, ms: Date.now() - began }
  flushInOrder()
}

// 有界并发：cursor 只被同步自增，故不会重复派发。
let cursor = 0
await Promise.all(
  Array.from({ length: Math.min(concurrency, steps.length) }, async () => {
    while (cursor < steps.length) await runStep(cursor++)
  }),
)
flushInOrder()

const failed = results.filter((r) => r.code !== 0)
const totalMs = Date.now() - startedAt
console.log(`══ ${steps.length - failed.length}/${steps.length} 步通过 · ${(totalMs / 1000).toFixed(1)}s ══`)
if (failed.length) {
  console.error(`\n✗ 门禁链失败 ${failed.length} 步：`)
  for (const r of failed) {
    console.error(`  - ${r.name}（exit ${r.code}）`)
    if (process.env.GITHUB_ACTIONS === 'true') console.error(`::error::门禁失败：${r.name}`)
  }
  process.exit(1)
}
