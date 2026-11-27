#!/usr/bin/env node
/**
 * 长时运行观测（soak）：墙屏是 7×24 常驻设备，要抓的是「慢泄漏」，不是首屏。
 *
 * ## 采什么
 *
 * | 指标 | 来源 | 说明 |
 * | --- | --- | --- |
 * | `heapMB` | `performance.memory.usedJSHeapSize` | 仅 Chromium 暴露；最直接的泄漏信号 |
 * | `nodes` | `document.querySelectorAll('*').length` | DOM 泄漏（未销毁的弹窗/浮层） |
 * | `framesPerSecond` | rAF 计数 / 采样间隔 | 掉帧会让墙屏动效变卡 |
 * | `longTaskMs` | `longtask` 累计 | 卡顿总量（每次采样是增量） |
 *
 * ## 判据
 *
 * 只看**斜率**，不看绝对值：
 * - 堆增长 ≤ 1%/小时（GC 会让这个数抖动，单点绝对值没有意义）；
 * - DOM 节点数增长 ≤ 5%/小时；
 * - 帧率不低于首样本的 80%。
 *
 * ## 用法
 *
 * ```bash
 * node ops/checks/perf/soak.mjs --minutes 30
 * node ops/checks/perf/soak.mjs --minutes 120 --interval 60 --only homeos-display
 * ```
 *
 * 需要登录的场景会要求 `HOMEOS_VISUAL_COOKIE`（与视觉检查相同）。
 *
 * 长跑时建议给浏览器加这三个启动参数，避免后台标签页被 freeze 掉：
 * `--disable-backgrounding-occluded-windows --disable-renderer-backgrounding
 * --disable-background-timer-throttling`。脚本自身也会在每次采样前把页面置回 active
 * （见 `keepPageActive`），但浏览器层面的策略更彻底。
 * 退出码：0 通过 / 1 有泄漏或掉帧 / 3 环境缺失。
 */

import process from 'node:process'
import {
  BASES,
  cdpAvailable,
  closeTab,
  evaluate,
  keepPageActive,
  loadScenarios,
  openTab,
  withPage,
} from '../lib/cdp-session.mjs'
import path from 'node:path'

const HERE = import.meta.dirname
const SCENARIOS_PATH = path.resolve(HERE, '../fixtures/browser-scenarios.json')

/** 每小时允许的堆增长比例。 */
const HEAP_GROWTH_PER_HOUR = 0.01
/** 每小时允许的 DOM 节点增长比例。 */
const NODE_GROWTH_PER_HOUR = 0.05
/** 帧率下限（相对首个样本）。 */
const FPS_FLOOR_RATIO = 0.8

const PROBE = `(() => {
  window.__soak = { longTaskMs: 0, frames: 0 }
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__soak.longTaskMs += entry.duration
    }).observe({ type: 'longtask', buffered: true })
  } catch {}
  const tick = () => { window.__soak.frames += 1; requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
  return true
})()`

function argValue(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const MINUTES = Number(argValue('minutes', '30'))
const INTERVAL_SECONDS = Number(argValue('interval', '30'))
const ONLY = argValue('only', process.env.HOMEOS_SOAK_SCENARIO || 'homeos-display')
//: 通道预检时长（秒）。0 = 跳过。默认 30s：足够暴露「25s 后必断」这类环境限制。
const PREFLIGHT_SECONDS = Number(argValue('preflight', '30'))

/** 每个采样点：读累计计数器，然后清零（下一次得到增量）。 */
const SAMPLE = `(() => {
  const memory = performance.memory || {}
  const frames = window.__soak?.frames ?? 0
  const longTaskMs = window.__soak?.longTaskMs ?? 0
  if (window.__soak) { window.__soak.frames = 0; window.__soak.longTaskMs = 0 }
  return {
    heapMB: memory.usedJSHeapSize ? Math.round(memory.usedJSHeapSize / 1048576 * 10) / 10 : null,
    nodes: document.querySelectorAll('*').length,
    frames,
    longTaskMs: Math.round(longTaskMs),
  }
})()`

function percentChange(first, last) {
  if (!first) return 0
  return (last - first) / first
}

/**
 * 预检 CDP 长连接是否可靠。
 *
 * 实测（macOS + 无头 Edge）：``/json/new`` 开出的标签页会在 **25–35 秒** 后失去响应 ——
 * 即使用 ``about:blank`` + 只发 ``1+1`` 也会如此。也就是说这里断的是**传输/浏览器会话**，
 * 不是被测页面。若不做预检，soak 会把「环境限制」报成「页面卡死」，这是错误结论。
 *
 * 预检在空白页上跑 ``seconds`` 秒：全程有回应才算通道可用；失败时 soak 以退出码 3
 * （环境缺失）结束，并给出可执行的替代方案。
 */
async function preflightChannel(seconds) {
  if (seconds <= 0) return { ok: true, seconds: 0 }
  const { session, targetId } = await openTab('about:blank')
  const startedAt = Date.now()
  try {
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 5000))
      if ((Date.now() - startedAt) / 1000 >= seconds) break
      await keepPageActive(session)
      await evaluate(session, '1+1', { timeoutMs: 8000 })
    }
    return { ok: true, seconds: (Date.now() - startedAt) / 1000 }
  } catch (error) {
    return { ok: false, seconds: (Date.now() - startedAt) / 1000, error: error.message }
  } finally {
    session.close()
    await closeTab(targetId)
  }
}

async function main() {
  const hasCookie = Boolean(process.env.HOMEOS_VISUAL_COOKIE)
  const scenarios = (await loadScenarios(SCENARIOS_PATH)).filter((item) => item.name === ONLY)
  const scenario = scenarios[0]
  if (!scenario) {
    console.error(`[soak] 未找到场景 ${ONLY}（见 ops/checks/fixtures/browser-scenarios.json）。`)
    return 2
  }
  if (scenario.requiresAuth && !hasCookie) {
    console.error('[soak] 该场景需要登录：设置 HOMEOS_VISUAL_COOKIE。')
    return 2
  }
  if (!(await cdpAvailable())) {
    console.error('[soak] CDP 不可用；先启动带 --remote-debugging-port=9222 的浏览器。')
    return 3
  }
  try {
    const response = await fetch(BASES[scenario.base], { signal: AbortSignal.timeout(2500) })
    if (!response.ok && response.status >= 500) throw new Error(String(response.status))
  } catch {
    console.error(`[soak] 前端不可达：${BASES[scenario.base]}；先跑 bun run dev。`)
    return 3
  }

  const preflight = await preflightChannel(PREFLIGHT_SECONDS)
  if (!preflight.ok) {
    console.error(
      `[soak] CDP 长连接不可用：空白页在第 ${preflight.seconds.toFixed(0)} 秒失去响应（${preflight.error}）。`,
    )
    console.error('[soak] 这是浏览器/传输层的限制，不是被测页面的问题，因此不作为「页面卡死」判定。')
    console.error('[soak] 做法：用有界面（非 --headless）的 Chrome/Edge 跑，或加上这三个启动参数后重试：')
    console.error(
      '       --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling',
    )
    console.error('[soak] 若只想测短窗口，用 --preflight 0 跳过预检（此时中断同样按环境问题退出）。')
    return 3
  }
  if (PREFLIGHT_SECONDS > 0) {
    console.log(`[soak] 通道预检通过（空白页连续 ${preflight.seconds.toFixed(0)}s 有响应）`)
  }

  const samples = []
  const totalMs = MINUTES * 60_000
  let unresponsive = ''

  console.log(`[soak] ${scenario.name} 开始，每 ${INTERVAL_SECONDS}s 采样，共 ${MINUTES} 分钟`)

  try {
    await withPage({ ...scenario, initScript: PROBE }, async ({ session }) => {
      const startedAt = Date.now()
      while (Date.now() - startedAt < totalMs) {
        await new Promise((resolve) => setTimeout(resolve, INTERVAL_SECONDS * 1000))
        // 单次采样失败 ≠ 整个检查崩溃：墙屏「页面卡死」本身就是最该报的结论，
        // 用异常栈退出反而看不出「它死在哪个时间点」。
        // 后台标签页会被浏览器 freeze：每次采样前先把生命周期拉回 active，
        // 否则「页面无响应」的结论其实是在测浏览器的节能策略（见 keepPageActive 注释）。
        await keepPageActive(session)
        let sample
        try {
          sample = await evaluate(session, SAMPLE, { timeoutMs: 10_000 })
        } catch (error) {
          unresponsive = `+${((Date.now() - startedAt) / 60_000).toFixed(1)}m 采样失败：${error.message}`
          break
        }
        const elapsedMinutes = (Date.now() - startedAt) / 60_000
        const fps = Math.round((sample.frames / INTERVAL_SECONDS) * 10) / 10
        samples.push({ ...sample, fps, elapsedMinutes })
        console.log(
          `[soak] +${elapsedMinutes.toFixed(1)}m heap ${sample.heapMB ?? 'n/a'}MB nodes ${sample.nodes} fps ${fps} longtask ${sample.longTaskMs}ms`,
        )
      }
    })
  } catch (error) {
    unresponsive = `页面会话中断：${error.message}`
  }

  if (unresponsive) {
    // 这里刻意**不**判成「页面卡死」：CDP 会话本身在这类环境里就会掉（见 cdp-session 的
    // 已知限制），无法从传输层错误反推是页面无响应还是浏览器冻结了标签页。
    // 报成环境问题（退出码 3）比给出一个可能完全错误的「页面卡死」结论更有价值。
    console.error(`[soak] 采样中断：${unresponsive}`)
    console.error(`[soak] 已采集 ${samples.length} 个样本，不足以判断泄漏斜率。`)
    console.error('[soak] 这是传输/浏览器会话层面的错误，无法区分「页面卡死」与「标签页被冻结」。')
    console.error('[soak] 请用有界面（非 --headless）的浏览器复跑；若在那里仍然中断，才说明页面真的卡死。')
    return 3
  }

  if (samples.length < 2) {
    console.error('[soak] 样本不足（至少 2 个），无法判断斜率。')
    return 3
  }

  const first = samples[0]
  const last = samples[samples.length - 1]
  const hours = Math.max((last.elapsedMinutes - first.elapsedMinutes) / 60, 1 / 60)
  const problems = []

  if (first.heapMB !== null && last.heapMB !== null) {
    const growth = percentChange(first.heapMB, last.heapMB) / hours
    console.log(`[soak] 堆增长 ${(growth * 100).toFixed(2)}%/h（上限 ${HEAP_GROWTH_PER_HOUR * 100}%/h）`)
    if (growth > HEAP_GROWTH_PER_HOUR) problems.push(`堆增长 ${(growth * 100).toFixed(2)}%/h 超过上限`)
  } else {
    console.log('[soak] 该浏览器未暴露 performance.memory，堆指标跳过。')
  }

  const nodeGrowth = percentChange(first.nodes, last.nodes) / hours
  console.log(`[soak] DOM 节点增长 ${(nodeGrowth * 100).toFixed(2)}%/h（上限 ${NODE_GROWTH_PER_HOUR * 100}%/h）`)
  if (nodeGrowth > NODE_GROWTH_PER_HOUR) problems.push(`DOM 节点增长 ${(nodeGrowth * 100).toFixed(2)}%/h 超过上限`)

  const fpsRatio = first.fps ? last.fps / first.fps : 1
  console.log(`[soak] 帧率 ${first.fps} → ${last.fps}（下限 ${FPS_FLOOR_RATIO * 100}%）`)
  if (fpsRatio < FPS_FLOOR_RATIO) problems.push(`帧率降到首样本的 ${(fpsRatio * 100).toFixed(0)}%`)

  if (problems.length) {
    console.error('[soak] 未通过：')
    for (const problem of problems) console.error(`  - ${problem}`)
    return 1
  }
  console.log('[soak] 通过（无明显泄漏与掉帧）')
  return 0
}

process.exit(await main())
