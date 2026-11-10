#!/usr/bin/env node
/**
 * 反复进出某个 SPA 路由，看引导宿主卸载后是否留下监听器 / DOM / 堆 / WebGL 画布。
 *
 * 每轮：应用内切到 --enter → 等 --settle-ms → 切回 --away → 等 --settle-ms → 强制 GC → 采样。
 * 第一轮含冷启动分配（模块常驻、缓存首填），基线取第一轮结束时的样本；
 * 输出末轮相对基线的增量与逐轮斜率。
 *
 * 用法：node ops/perf/harness/route_cycle.mjs --label <label> [--enter /3d-studio] [--away /devices]
 *       [--cycles 20] [--settle-ms 4000]
 * 前置：与 bench_3d 相同（env.json 指向的实例在跑）。HOMEOS_PERF_HEADED=1：有界面运行。
 */
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { slopePerMinute } from './stage-probes.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const PERF_ROOT = process.env.HOMEOS_PERF_ROOT || '/tmp/homeos-perf'
const args = process.argv.slice(2)
const argValue = (name, fallback) => {
  const index = args.indexOf(name)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}
const label = argValue('--label', 'before')
const enterPath = argValue('--enter', '/3d-studio')
const awayPath = argValue('--away', '/devices')
const cycles = Number(argValue('--cycles', '20'))
const settleMs = Number(argValue('--settle-ms', '4000'))
const env = JSON.parse(readFileSync(join(PERF_ROOT, 'env', label, 'env.json'), 'utf8'))
const homeosBase = process.env.HOMEOS_PERF_BASE_URL || `http://127.0.0.1:${env.homeos.port}`
const outDir = join(PERF_ROOT, 'results', label)
mkdirSync(outDir, { recursive: true })

async function spaNavigate(page, path) {
  await page.evaluate((target) => {
    history.pushState({}, '', target)
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }))
  }, path)
}

const browser = await chromium.launch({
  channel: 'msedge',
  headless: process.env.HOMEOS_PERF_HEADED !== '1',
  args: ['--enable-precise-memory-info', '--disable-background-timer-throttling'],
})
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
await context.addCookies([{ name: 'auth_token', value: env.homeos.token, url: homeosBase }])
const page = await context.newPage()
const cdp = await context.newCDPSession(page)
await cdp.send('Performance.enable')
await cdp.send('HeapProfiler.enable')
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 300)))

async function sample(cycle) {
  await cdp.send('HeapProfiler.collectGarbage')
  const metrics = Object.fromEntries(
    (await cdp.send('Performance.getMetrics')).metrics.map((metric) => [metric.name, metric.value]),
  )
  const canvases = await page.evaluate(() => document.querySelectorAll('canvas').length)
  return {
    cycle,
    minute: Number(((Date.now() - startedAt) / 60000).toFixed(3)),
    heapMB: Number((metrics.JSHeapUsedSize / 1048576).toFixed(2)),
    nodes: metrics.Nodes,
    listeners: metrics.JSEventListeners,
    documents: metrics.Documents,
    frames: metrics.Frames,
    canvases,
  }
}

const result = { label, generatedAt: new Date().toISOString(), enterPath, awayPath, cycles, settleMs, samples: [] }
const startedAt = Date.now()
try {
  await page.goto(`${homeosBase}${awayPath}`, { waitUntil: 'load', timeout: 90000 })
  await page.waitForTimeout(settleMs)
  result.samples.push(await sample(0))
  for (let cycle = 1; cycle <= cycles; cycle += 1) {
    await spaNavigate(page, enterPath)
    await page.waitForTimeout(settleMs)
    await spaNavigate(page, awayPath)
    await page.waitForTimeout(settleMs)
    const point = await sample(cycle)
    result.samples.push(point)
    console.log(JSON.stringify(point))
  }
} catch (error) {
  result.error = String(error).slice(0, 2000)
} finally {
  await context.close()
  await browser.close()
}

const baseline = result.samples.find((point) => point.cycle === 1)
const last = result.samples[result.samples.length - 1]
const steady = result.samples.filter((point) => point.cycle >= 1)
const slope = (key) => {
  const value = slopePerMinute(steady.map((point) => ({ minute: point.cycle, value: point[key] })))
  return value == null ? null : Number(value.toFixed(4))
}
result.summary = {
  cycles: steady.length,
  deltaFromCycle1:
    baseline && last
      ? Object.fromEntries(
          ['heapMB', 'nodes', 'listeners', 'documents', 'frames', 'canvases'].map((key) => [
            key,
            Number((last[key] - baseline[key]).toFixed(2)),
          ]),
        )
      : null,
  perCycleSlope: { heapMB: slope('heapMB'), nodes: slope('nodes'), listeners: slope('listeners') },
  pageErrors: pageErrors.slice(-20),
  error: result.error ?? null,
}
const slug = enterPath.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root'
const outputPath = join(outDir, `route-cycle-${slug}.json`)
writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n')
console.log(`[${label}] 路由往返结果：${outputPath}`)
console.log(JSON.stringify(result.summary, null, 2))
