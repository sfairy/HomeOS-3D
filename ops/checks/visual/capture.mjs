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
 * ## 实测（2026-11-26，Edge 158 / macOS）
 *
 * 无头 swiftshader 能稳定录/校 6 个页面；`/`（首页折线图）与 `/3d-studio`（WebGL）
 * 会让合成器不再交付新帧，`Runtime.evaluate` / `Page.captureScreenshot` 双双等到
 * 30s 超时，随后整个浏览器进程退出。这两个页面用**有头** Edge（真实 GPU）+ 显式
 * `clip` 录制。
 *
 * 复现性（同一构建连拍两次）：`/devices` 0.00%–0.18%、`/login` 1.19%、
 * `/3d-studio` 0.73% 可复现，阈值按实测留 2–3 倍余量；`/register` 7.1%、
 * `/events` 16.3%、`/settings/display` 5.5%、商城首页 3.1%、首页 55.7% 不可复现，
 * 已用 `volatile` 标注并跳过判定 —— 漂移来自活数据与动画，不是样式回归。
 *
 * 一条 CDP 连接约 30s 后失效，所以**每个场景单独起一次浏览器**：
 *
 * ```bash
 * EDGE="/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
 * "$EDGE" --remote-debugging-port=9222 --user-data-dir=/tmp/hv --no-first-run \
 *   --window-position=2400,2400 --window-size=1620,1020 about:blank & EP=$!
 * sleep 5
 * HOMEOS_VISUAL_COOKIE="auth_token=<token>" node ops/checks/visual/capture.mjs --check --only homeos-devices
 * kill $EP; wait $EP 2>/dev/null
 * ```
 *
 * 登录态怎么拿：本机开发库里给 `sessions` 插一条 `id_hash = sha256(token)` 的记录
 * （`userId` 取 `users.id`），把同一个 `token` 作为 `auth_token` Cookie 传进来。
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
import { diffPng } from '../lib/pixel-diff.mjs'

const HERE = import.meta.dirname
const REPO_ROOT = path.resolve(HERE, '../../..')
const SCENARIOS_PATH = path.join(HERE, 'scenarios.json')
const BASELINE_DIR = path.join(REPO_ROOT, 'ops/checks/baselines/visual')
const MANIFEST_PATH = path.join(BASELINE_DIR, 'manifest.json')

function argValue(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const WRITE_BASELINE = process.argv.includes('--write-baseline')
const ONLY = (argValue('only', '') || '').split(',').filter(Boolean)

async function captureScenario(scenario) {
  const viewport = scenario.viewport ?? { width: 1600, height: 900, deviceScaleFactor: 1 }
  // 显式给 `clip`：无头模式裁到视口，有头模式则裁到真实窗口表面（实测 2448x1620）。
  // 不固定的话，同一份基线在两台机器/两种模式下尺寸就不同，无法逐像素比较。
  const clip = { x: 0, y: 0, width: viewport.width, height: viewport.height, scale: 1 }
  const surfaceRead = { format: 'png', fromSurface: false, captureBeyondViewport: false, clip }
  return withPage(scenario, async ({ session }) => {
    // `surfaceRead` 场景（WebGL、持续动画）：合成器可能永远不交付"可截"的新帧，
    // 默认路径只能等到超时，期间 CDP 通道会被占死。直接读前台帧更快也更稳。
    if (scenario.surfaceRead) {
      const { data } = await session.send('Page.captureScreenshot', surfaceRead)
      return Buffer.from(data, 'base64')
    }
    try {
      const { data } = await session.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
        clip,
      })
      return Buffer.from(data, 'base64')
    } catch {
      const { data } = await session.send('Page.captureScreenshot', surfaceRead)
      return Buffer.from(data, 'base64')
    }
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

  // 无论录制还是校验都先读旧 manifest：无头浏览器跑不完全量场景是常态，
  // `--write-baseline --only x` 若从空对象起步，会把本轮没跑到的场景整条抹掉，
  // 下一次 `--check` 就全变成 missing-baseline。
  const manifest = (() => {
    try {
      return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
    } catch {
      return {}
    }
  })()

  if (WRITE_BASELINE) mkdirSync(BASELINE_DIR, { recursive: true })

  const failures = []
  const volatile = []
  for (const scenario of scenarios) {
    // `volatile`：页面本身含活数据（实时事件、设备状态、时钟）或持续动画，
    // 同一份代码连拍两次都会不同。实测漂移见 scenarios.json 的 `volatile` 说明。
    // 这类场景只做人工快照（--write-baseline），不进判定，避免把「数据变了」
    // 误报成「样式回归」；判定口径 = 剩余场景必须全过。
    if (!WRITE_BASELINE && scenario.volatile) {
      volatile.push(scenario.name)
      console.log(`[visual] ${scenario.name} SKIP 不稳定场景（${scenario.volatile}）`)
      continue
    }
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
    // 阈值以 scenarios.json 为准：基线文件里存的是录制当天的值，改了预算却忘了重录
    // 会让新阈值静默失效。manifest 只作为缺省兜底。
    const allowed = scenario.maxDiffRatio ?? expected.maxDiffRatio ?? 0.001
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
  const judged = scenarios.length - volatile.length
  console.log(
    `[visual] ${judged} 个可判定场景通过${volatile.length ? `；${volatile.length} 个不稳定场景跳过（${volatile.join('、')}）` : ''}`,
  )
  return 0
}

process.exit(await main())
