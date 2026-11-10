#!/usr/bin/env node
/**
 * 3D 展示页长时浸泡（墙面平板 7×24 口径）。
 *
 * 每轮：连续拖拽 → 静置 → 应用内切到设备页 → 切回展示页（SPA 路由，组件真的卸载 / 重挂）。
 * 每轮采样一次 JS 堆、DOM 节点、事件监听器数、显存估算（stage-probes 的分配跟踪），
 * 最后用最小二乘斜率判断是否持续增长；静置窗口的页面帧数即 idleFramesPerSec。
 *
 * 用法：node ops/perf/harness/soak_3d.mjs --label <label> [--minutes 60] [--drag-ms 5000] [--idle-ms 20000]
 * 前置：与 bench_3d 相同（run_baseline.sh 已起好隔离实例，或 env.json 指向的实例在跑）。
 * HOMEOS_PERF_HEADED=1：有界面运行（headless 软件 WebGL 下长跑可能被浏览器回收进程）。
 */
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dragStageCanvas, drainStageProbe, slopePerMinute, stageProbeScript, summarizeFrames } from './stage-probes.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const PERF_ROOT = process.env.HOMEOS_PERF_ROOT || '/tmp/homeos-perf'
const args = process.argv.slice(2)
const argValue = (name, fallback) => {
  const index = args.indexOf(name)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}
const label = argValue('--label', 'before')
const minutes = Number(argValue('--minutes', '60'))
const dragMs = Number(argValue('--drag-ms', '5000'))
const idleMs = Number(argValue('--idle-ms', '20000'))
const awayPath = argValue('--away-path', '/devices')
const env = JSON.parse(readFileSync(join(PERF_ROOT, 'env', label, 'env.json'), 'utf8'))
const homeosBase = process.env.HOMEOS_PERF_BASE_URL || `http://127.0.0.1:${env.homeos.port}`
const displayPath = `/display/${encodeURIComponent(env.homeos.projectId)}`
const outDir = join(PERF_ROOT, 'results', label)
mkdirSync(outDir, { recursive: true })

async function findStageFrame(page, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const frame = page
      .frames()
      .find((candidate) => candidate.url().includes('/api/v1/modules/interaction3d/stage.html'))
    if (frame) {
      const ready = await frame
        .evaluate(() => !!window.__homeosStageProbe && document.querySelectorAll('canvas').length > 0)
        .catch(() => false)
      if (ready) return frame
    }
    await page.waitForTimeout(250)
  }
  return null
}

async function spaNavigate(page, path) {
  await page.evaluate((target) => {
    history.pushState({}, '', target)
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }))
  }, path)
}

const browser = await chromium.launch({
  channel: 'msedge',
  headless: process.env.HOMEOS_PERF_HEADED !== '1',
  args: [
    '--enable-precise-memory-info',
    '--disable-background-timer-throttling',
    ...String(process.env.HOMEOS_PERF_BROWSER_ARGS || '')
      .split(/\s+/)
      .filter(Boolean),
  ],
})
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
await context.addCookies([{ name: 'auth_token', value: env.homeos.token, url: homeosBase }])
await context.addInitScript(stageProbeScript({ trackMemory: true, maxFrames: 4000 }))
const page = await context.newPage()
const cdp = await context.newCDPSession(page)
await cdp.send('Performance.enable')
const consoleErrors = []
page.on('pageerror', (error) => consoleErrors.push(String(error).slice(0, 300)))

const result = { label, generatedAt: new Date().toISOString(), minutes, dragMs, idleMs, awayPath, cycles: [] }
const startedAt = Date.now()
try {
  await page.goto(`${homeosBase}${displayPath}`, { waitUntil: 'load', timeout: 90000 })
  let frame = await findStageFrame(page)
  if (!frame) throw new Error('展示页没有找到 3D stage iframe')
  await page.waitForTimeout(5000)
  while (Date.now() - startedAt < minutes * 60000) {
    await drainStageProbe(frame)
    const drag = await dragStageCanvas(frame, dragMs)
    const afterDrag = await drainStageProbe(frame)
    await page.waitForTimeout(idleMs)
    const afterIdle = await drainStageProbe(frame)
    const metrics = Object.fromEntries(
      (await cdp.send('Performance.getMetrics')).metrics.map((metric) => [metric.name, metric.value]),
    )
    result.cycles.push({
      minute: Number(((Date.now() - startedAt) / 60000).toFixed(2)),
      heapMB: Number((metrics.JSHeapUsedSize / 1048576).toFixed(2)),
      nodes: metrics.Nodes,
      listeners: metrics.JSEventListeners,
      documents: metrics.Documents,
      frames: metrics.Frames,
      gpuMB: afterIdle?.gpuBytes == null ? null : Number((afterIdle.gpuBytes / 1048576).toFixed(2)),
      idleFramesPerSec: afterIdle ? Number((afterIdle.frames.length / (idleMs / 1000)).toFixed(2)) : null,
      drag: drag.applied ? summarizeFrames(afterDrag?.frames || [], { from: drag.startedAt, to: drag.endedAt }) : null,
    })
    console.log(JSON.stringify(result.cycles[result.cycles.length - 1]))
    await spaNavigate(page, awayPath)
    await page.waitForTimeout(5000)
    await spaNavigate(page, displayPath)
    frame = await findStageFrame(page)
    if (!frame) throw new Error('切回展示页后没有找到 3D stage iframe')
    await page.waitForTimeout(5000)
  }
} catch (error) {
  result.error = String(error).slice(0, 2000)
} finally {
  await context.close()
  await browser.close()
}

// 第一轮含冷启动分配，斜率从第二轮起算。
const steady = result.cycles.slice(1)
const slope = (key) => {
  const points = steady
    .filter((cycle) => cycle[key] != null)
    .map((cycle) => ({ minute: cycle.minute, value: cycle[key] }))
  const value = slopePerMinute(points)
  return value == null ? null : Number(value.toFixed(4))
}
result.summary = {
  cycles: result.cycles.length,
  heapSlopeMBPerMin: slope('heapMB'),
  gpuSlopeMBPerMin: slope('gpuMB'),
  nodesSlopePerMin: slope('nodes'),
  listenersSlopePerMin: slope('listeners'),
  heapGrowthMB: steady.length > 1 ? Number((steady[steady.length - 1].heapMB - steady[0].heapMB).toFixed(2)) : null,
  maxIdleFramesPerSec: Math.max(0, ...result.cycles.map((cycle) => cycle.idleFramesPerSec ?? 0)),
  worstDragP95Ms: Math.max(0, ...result.cycles.map((cycle) => cycle.drag?.intervalP95Ms ?? 0)),
  consoleErrors: consoleErrors.slice(-20),
  error: result.error ?? null,
}
const outputPath = join(outDir, 'soak-3d.json')
writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n')
console.log(`[${label}] 浸泡结果：${outputPath}`)
console.log(JSON.stringify(result.summary, null, 2))
