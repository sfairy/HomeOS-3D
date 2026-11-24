#!/usr/bin/env node
/**
 * 视觉回归：固定视口截图 + 像素对比（自动化版本的「并排看」）。
 *
 * ## 与 `ops/scripts/studio-visual-parity.mjs` 的分工
 *
 * 那个脚本是**人工验收工具**：它把 0.8.7 参考实现与本地实现并排截图，等人看差异，
 * 不进 gate。本脚本解决的是另一个问题 —— 「重构之后，同一个页面还是不是同一张图」，
 * 因此它需要的是**基线**与**可判定的数字**：
 *
 * - `--write-baseline`：按 `scenarios.json` 逐页截图，连同 PNG 一起存进
 *   `ops/checks/baselines/visual/`，并写一份 manifest（尺寸 + sha256）；
 * - `--check`：重新截图，与基线逐像素比较，输出差异比例与最大通道差；
 *   超过该场景的 `maxDiffRatio` 即失败。
 *
 * 像素判定口径：通道差 > 12 记为「一个不同的像素」，容忍 PNG 编码与抗锯齿的
 * 1–2 级抖动；比例阈值按场景给（静态页 0，含动画/3D 的页面千分之一到千分之三）。
 *
 * ## 前置
 *
 * 1) 本地开发服务器已起（`bun run dev`），默认 base：
 *    - homeos: `HOMEOS_VISUAL_BASE_URL`，缺省 `http://127.0.0.1:8801`
 *    - store:  `HOMEOS_STORE_BASE_URL`，缺省 `http://127.0.0.1:8802`
 * 2) 一个开了调试端口的 Chrome：
 *    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *      --remote-debugging-port=9222 --user-data-dir=/tmp/homeos-visual --no-first-run
 * 3) 登录态：在 `HOMEOS_VISUAL_COOKIE` 里给一份 Cookie 头（页面需要登录才能看到真实内容）。
 *
 * ## 用法
 *
 * ```bash
 * node ops/checks/visual/capture.mjs --write-baseline
 * node ops/checks/visual/capture.mjs --check
 * node ops/checks/visual/capture.mjs --check --only homeos-display,homeos-devices
 * ```
 *
 * 退出码：0 通过 / 1 有差异 / 3 CDP 不可用（环境缺失，不当作回归） / 4 页面加载失败。
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { PNG } from 'pngjs'
import { BASES, cdpAvailable, loadScenarios, withPage } from '../lib/cdp-session.mjs'

const HERE = import.meta.dirname
const REPO_ROOT = path.resolve(HERE, '../../..')
const SCENARIOS_PATH = path.join(HERE, 'scenarios.json')
const BASELINE_DIR = path.join(REPO_ROOT, 'ops/checks/baselines/visual')
const MANIFEST_PATH = path.join(BASELINE_DIR, 'manifest.json')

/** 单通道差超过它才算「像素变了」；低于它属于编码/抗锯齿抖动。 */
const CHANNEL_TOLERANCE = 12

function argValue(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const WRITE_BASELINE = process.argv.includes('--write-baseline')
const ONLY = (argValue('only', '') || '').split(',').filter(Boolean)

async function captureScenario(scenario) {
  return withPage(scenario, async ({ session }) => {
    const { data } = await session.send('Page.captureScreenshot', { format: 'png' })
    return Buffer.from(data, 'base64')
  })
}

async function serverReachable(scenario) {
  const base = BASES[scenario.base]
  try {
    const response = await fetch(base, { signal: AbortSignal.timeout(2500) })
    return response.status < 500
  } catch {
    return false
  }
}

// ---------------------------------------------------------------- 像素比较

function diffPng(actualBuffer, baselineBuffer) {
  const actual = PNG.sync.read(actualBuffer)
  const baseline = PNG.sync.read(baselineBuffer)
  if (actual.width !== baseline.width || actual.height !== baseline.height) {
    return { sizeMismatch: true, ratio: 1, maxDelta: 255, different: Infinity }
  }
  const total = actual.width * actual.height
  let different = 0
  let maxDelta = 0
  const a = actual.data
  const b = baseline.data
  for (let index = 0; index < a.length; index += 4) {
    const dr = Math.abs(a[index] - b[index])
    const dg = Math.abs(a[index + 1] - b[index + 1])
    const db = Math.abs(a[index + 2] - b[index + 2])
    const da = Math.abs(a[index + 3] - b[index + 3])
    const delta = Math.max(dr, dg, db, da)
    if (delta > maxDelta) maxDelta = delta
    if (delta > CHANNEL_TOLERANCE) different += 1
  }
  return { sizeMismatch: false, ratio: different / total, maxDelta, different }
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex').slice(0, 16)
}

// ---------------------------------------------------------------- 主流程

async function main() {
  const all = await loadScenarios(SCENARIOS_PATH)
  const selected = all.filter((item) => ONLY.length === 0 || ONLY.includes(item.name))
  const hasCookie = Boolean(process.env.HOMEOS_VISUAL_COOKIE)
  const scenarios = selected.filter((item) => !item.requiresAuth || hasCookie)
  const skipped = selected.length - scenarios.length
  if (skipped > 0) {
    console.log(`[visual] 跳过 ${skipped} 个需要登录的场景（未设置 HOMEOS_VISUAL_COOKIE）。`)
  }
  if (scenarios.length === 0) {
    console.error('没有可执行的场景（检查 --only 或设置 HOMEOS_VISUAL_COOKIE）。')
    return 2
  }

  if (!(await cdpAvailable())) {
    console.error('[visual] CDP 不可用；先启动带 --remote-debugging-port=9222 的 Chrome。')
    return 3
  }

  if (!(await serverReachable(scenarios[0]))) {
    console.error(`[visual] 前端不可达：${BASES[scenarios[0].base]}`)
    console.error('[visual] 先跑 `bun run dev`，或用 HOMEOS_VISUAL_BASE_URL / HOMEOS_STORE_BASE_URL 指定地址。')
    return 3
  }

  const manifest = WRITE_BASELINE
    ? {}
    : (() => {
        try {
          return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
        } catch {
          return {}
        }
      })()

  if (WRITE_BASELINE) mkdirSync(BASELINE_DIR, { recursive: true })

  const failures = []
  for (const scenario of scenarios) {
    let shot
    try {
      shot = await captureScenario(scenario)
    } catch (firstError) {
      // 无头浏览器在连续开关标签页后偶发「渲染进程无响应」，一次重试足以区分
      // 「环境抖动」与「真的截图失败」——后者两次都会失败。
      console.warn(`[visual] ${scenario.name} 首次截图失败（${firstError.message}），重试一次`)
      try {
        shot = await captureScenario(scenario)
      } catch (secondError) {
        console.error(`[visual] ${scenario.name} 截图失败：${secondError.message}`)
        failures.push({ name: scenario.name, reason: 'capture-failed', detail: secondError.message })
        continue
      }
    }
    const fileName = `${scenario.name}.png`
    const filePath = path.join(BASELINE_DIR, fileName)
    const png = PNG.sync.read(shot)

    if (WRITE_BASELINE) {
      writeFileSync(filePath, shot)
      manifest[scenario.name] = {
        file: fileName,
        sha256: sha256(shot),
        width: png.width,
        height: png.height,
        maxDiffRatio: scenario.maxDiffRatio ?? 0.001,
        path: scenario.path,
        base: scenario.base,
      }
      console.log(`[visual] 已录制 ${scenario.name}（${png.width}x${png.height}）`)
      continue
    }

    const expected = manifest[scenario.name]
    if (!expected || !existsSync(filePath)) {
      console.error(`[visual] ${scenario.name} 缺少基线；先跑 --write-baseline。`)
      failures.push({ name: scenario.name, reason: 'missing-baseline' })
      continue
    }
    const diff = diffPng(shot, readFileSync(filePath))
    const allowed = expected.maxDiffRatio ?? 0.001
    if (diff.sizeMismatch) {
      console.error(
        `[visual] ${scenario.name} 尺寸变化：${png.width}x${png.height}（基线 ${expected.width}x${expected.height}）`,
      )
      failures.push({ name: scenario.name, reason: 'size-mismatch' })
      continue
    }
    const verdict = diff.ratio > allowed ? 'FAIL' : 'ok'
    console.log(
      `[visual] ${scenario.name} ${verdict} 差异 ${(diff.ratio * 100).toFixed(4)}%（上限 ${(allowed * 100).toFixed(4)}%）最大通道差 ${diff.maxDelta}`,
    )
    if (verdict === 'FAIL') {
      // 把失败截图留下，便于人工定位；基线不动。
      mkdirSync(path.join(BASELINE_DIR, 'actual'), { recursive: true })
      writeFileSync(path.join(BASELINE_DIR, 'actual', fileName), shot)
      failures.push({ name: scenario.name, reason: 'pixel-diff', ratio: diff.ratio })
    }
  }

  if (WRITE_BASELINE) {
    writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    console.log(`[visual] manifest 已写入 ${path.relative(REPO_ROOT, MANIFEST_PATH)}`)
    return 0
  }

  if (failures.length) {
    console.error(`[visual] ${failures.length} 个场景未通过：`)
    for (const failure of failures) console.error(`  - ${failure.name}（${failure.reason}）`)
    console.error('[visual] 失败截图在 ops/checks/baselines/visual/actual/；确认是有意改动后重跑 --write-baseline。')
    return failures.some((failure) => failure.reason === 'capture-failed') ? 4 : 1
  }
  console.log(`[visual] 全部 ${scenarios.length} 个场景通过`)
  return 0
}

process.exit(await main())
