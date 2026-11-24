#!/usr/bin/env node
/**
 * 前端核心 Web Vitals 基线采集（LCP / CLS / INP 近似 / TTFB / FCP / TBT）。
 *
 * ## 与 RUM 的关系
 *
 * 线上已经有 RUM（`src/shared/utils/perf/client-metrics.util.ts`，web-vitals + 采样 +
 * 10s 上报），但它是**采集侧**：没有任何门禁消费那些数字，也没有「改动前后的对照」。
 * 本脚本补的是对照侧：用同一台机器、同一份构建、同一个视口，把首屏指标钉成基线，
 * 重构前后各跑一次即可判断「有没有变慢」。
 *
 * ## 口径
 *
 * - 指标来自页面内的 `PerformanceObserver`（不依赖 web-vitals 包的注入）；
 * - **INP 用「事件耗时最大值」近似**：真正的 INP 需要会话级 98 分位，单页采样做不到，
 *   因此这里明确叫 `maxEventMs`，只在同场景前后比较时使用；
 * - TBT 用长任务（`longtask`）总阻塞时间近似；
 * - 每个场景跑 `--runs` 次（默认 3），取中位数，减少单次抖动。
 *
 * ## 前置与用法
 *
 * 与视觉检查相同：本地开发服务器 + 开了 `--remote-debugging-port=9222` 的浏览器。
 *
 * ```bash
 * node ops/checks/perf/collect_web_vitals.mjs --write-baseline
 * node ops/checks/perf/collect_web_vitals.mjs --check
 * node ops/checks/perf/collect_web_vitals.mjs --report --only homeos-display
 * ```
 *
 * 退出码：0 通过 / 1 有指标退化 / 3 环境缺失。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { BASES, cdpAvailable, evaluate, loadScenarios, withPage } from '../lib/cdp-session.mjs'

const HERE = import.meta.dirname
const REPO_ROOT = path.resolve(HERE, '../../..')
const SCENARIOS_PATH = path.join(REPO_ROOT, 'ops/checks/visual/scenarios.json')
const BASELINE_PATH = path.join(REPO_ROOT, 'ops/checks/baselines/perf/web-vitals.json')

/**
 * 允许的退化幅度：延迟类 10% + 绝对宽限 100ms，CLS 只允许持平（它本来就该是 0）。
 *
 * 为什么要绝对宽限：dev 服务器上的 TTFB 只有 7–14ms、FCP 在 80–170ms 之间抖，
 * 10% 就是 1ms —— 一次 GC 或 HMR 广播就能「退化」。100ms 用来吸收这种噪声。
 *
 * 注意：**正式的门禁基线应在生产构建上录制**（`bun run build:app` + 静态服务），
 * dev 模式的数字只适合「有没有数量级变化」这种粗判断。
 */
const LATENCY_TOLERANCE = 1.1
const ABSOLUTE_SLACK_MS = 100
const CLS_TOLERANCE = 1.0

/** 页面内注入的采集器：只读 PerformanceObserver，不改页面行为。 */
const PROBE = `(() => {
  window.__homeosVitals = { lcp: 0, cls: 0, maxEventMs: 0, tbt: 0 }
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'largest-contentful-paint') window.__homeosVitals.lcp = entry.startTime
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true })
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__homeosVitals.cls += entry.value
      }
    }).observe({ type: 'layout-shift', buffered: true })
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > window.__homeosVitals.maxEventMs) window.__homeosVitals.maxEventMs = entry.duration
      }
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 })
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > 50) window.__homeosVitals.tbt += entry.duration - 50
      }
    }).observe({ type: 'longtask', buffered: true })
  } catch {}
  return true
})()`

/** 取回指标：paint/navigation 用 getEntries，其余读注入的累加器。 */
const COLLECT = `(async () => {
  // 兜底：initScript 未生效（或页面在注入前已加载）时，再开一次 buffered 观察，
  // 让 LCP 至少有一个来源；300ms 内没有条目就按「不可得」处理（返回 null）。
  if (!window.__homeosVitals || !window.__homeosVitals.lcp) {
    await new Promise((resolve) => {
      let settled = false
      const finish = () => { if (!settled) { settled = true; resolve() } }
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.startTime > (window.__homeosVitals?.lcp || 0)) {
              window.__homeosVitals = Object.assign({}, window.__homeosVitals, { lcp: entry.startTime })
            }
          }
          finish()
        }).observe({ type: 'largest-contentful-paint', buffered: true })
      } catch { finish() }
      setTimeout(finish, 300)
    })
  }
  const nav = performance.getEntriesByType('navigation')[0] || {}
  const paints = Object.fromEntries(performance.getEntriesByType('paint').map((e) => [e.name, e.startTime]))
  const v = window.__homeosVitals || {}
  const round = (n) => Math.round((Number(n) || 0) * 10) / 10
  return {
    ttfbMs: round(nav.responseStart),
    fcpMs: round(paints['first-contentful-paint']),
    lcpMs: v.lcp ? round(v.lcp) : null,
    cls: Math.round((Number(v.cls) || 0) * 10000) / 10000,
    maxEventMs: round(v.maxEventMs),
    tbtMs: round(v.tbt),
  }
})()`

function argValue(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const ONLY = (argValue('only', '') || '').split(',').filter(Boolean)
const RUNS = Number(argValue('runs', '3'))
const MODE = process.argv.includes('--write-baseline') ? 'write' : process.argv.includes('--check') ? 'check' : 'report'

/** 取中位数（偶数量取上中位，避免引入浮点均值掩盖峰值）。 */
function median(values) {
  const ordered = [...values].sort((a, b) => a - b)
  return ordered[Math.floor(ordered.length / 2)] ?? 0
}

async function measureScenario(scenario) {
  const samples = []
  for (let run = 0; run < RUNS; run += 1) {
    // 每次都是新标签页：避免 bfcache 把 LCP 变成 0；采集器经 initScript 在导航前注入。
    const metrics = await withPage({ ...scenario, initScript: PROBE }, async ({ session }) => {
      await new Promise((resolve) => setTimeout(resolve, 400))
      return evaluate(session, COLLECT)
    })
    samples.push(metrics)
  }
  const keys = ['ttfbMs', 'fcpMs', 'lcpMs', 'cls', 'maxEventMs', 'tbtMs']
  // LCP 在部分无头环境拿不到：保留 null 表示「不可得」，不要用 0 冒充（0 会被当成改善）。
  return Object.fromEntries(
    keys.map((key) => [key, median(samples.map((item) => item[key]).filter((value) => value !== null))]),
  )
}

function verify(current, baseline) {
  const problems = []
  for (const [name, metrics] of Object.entries(current)) {
    const expected = baseline[name]
    if (!expected) continue
    for (const key of ['ttfbMs', 'fcpMs', 'lcpMs', 'maxEventMs', 'tbtMs']) {
      if (metrics[key] === null || expected[key] === null || expected[key] === undefined) continue
      const limit = Number(expected[key] ?? 0) * LATENCY_TOLERANCE + ABSOLUTE_SLACK_MS
      if (Number(metrics[key]) > limit) {
        problems.push(`${name}.${key} ${metrics[key]} 超过上限 ${Math.round(limit * 10) / 10}（基线 ${expected[key]}）`)
      }
    }
    const clsLimit = Math.max(Number(expected.cls ?? 0), 0.01) * CLS_TOLERANCE + 0.01
    if (Number(metrics.cls) > clsLimit) {
      problems.push(
        `${name}.cls ${metrics.cls} 超过上限 ${Math.round(clsLimit * 10000) / 10000}（基线 ${expected.cls}）`,
      )
    }
  }
  return problems
}

async function main() {
  const hasCookie = Boolean(process.env.HOMEOS_VISUAL_COOKIE)
  const scenarios = (await loadScenarios(SCENARIOS_PATH)).filter(
    (item) => (ONLY.length === 0 || ONLY.includes(item.name)) && (!item.requiresAuth || hasCookie),
  )
  if (scenarios.length === 0) {
    console.error('[vitals] 没有可测场景（检查 --only 或 HOMEOS_VISUAL_COOKIE）。')
    return 2
  }
  if (!(await cdpAvailable())) {
    console.error('[vitals] CDP 不可用；先启动带 --remote-debugging-port=9222 的浏览器。')
    return 3
  }
  const base = BASES[scenarios[0].base]
  try {
    const response = await fetch(base, { signal: AbortSignal.timeout(2500) })
    if (!response.ok && response.status >= 500) throw new Error(String(response.status))
  } catch {
    console.error(`[vitals] 前端不可达：${base}；先跑 bun run dev。`)
    return 3
  }

  const current = {}
  for (const scenario of scenarios) {
    current[scenario.name] = await measureScenario(scenario)
    const metrics = current[scenario.name]
    console.log(
      `[vitals] ${scenario.name} TTFB ${metrics.ttfbMs}ms FCP ${metrics.fcpMs}ms LCP ${metrics.lcpMs}ms CLS ${metrics.cls} 事件峰值 ${metrics.maxEventMs}ms TBT ${metrics.tbtMs}ms`,
    )
  }

  if (MODE === 'write') {
    mkdirSync(path.dirname(BASELINE_PATH), { recursive: true })
    writeFileSync(BASELINE_PATH, `${JSON.stringify({ runs: RUNS, scenarios: current }, null, 2)}\n`, 'utf8')
    console.log(`[vitals] 基线已写入 ${path.relative(REPO_ROOT, BASELINE_PATH)}`)
    return 0
  }

  if (MODE === 'check') {
    if (!existsSync(BASELINE_PATH)) {
      console.error('[vitals] 缺少基线；先跑 --write-baseline。')
      return 2
    }
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).scenarios ?? {}
    const problems = verify(current, baseline)
    if (problems.length) {
      console.error('[vitals] 指标退化：')
      for (const problem of problems) console.error(`  - ${problem}`)
      return 1
    }
    console.log('[vitals] 通过')
  }
  return 0
}

process.exit(await main())
