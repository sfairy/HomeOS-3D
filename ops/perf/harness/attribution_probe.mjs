#!/usr/bin/env node
/**
 * 一次性归因探针（2026-11-01 双项目性能分析，报告见
 * docs/perf/2026-11-01-dual-project-performance.md）。
 *
 * 只读测量，不进产品构建，也不参与门禁：
 * - WebGL2 同步探测在首屏关键路径上的真实耗时（A/B 用同构建对比）
 * - CLS 的 layout-shift 来源节点（bench_frontend 只累加数值，看不到是谁移的）
 * - LCP 候选序列与 elementTiming
 * - store-home 在 Slow 4G + 4x CPU 下的样式链时序（data-styles-ready vs LCP）
 *
 * 结果写 $HOMEOS_PERF_ROOT/results/<label>/probe.json，不参与门禁。
 */
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const PERF_ROOT = process.env.HOMEOS_PERF_ROOT || '/tmp/homeos-perf'

const args = process.argv.slice(2)
const argValue = (name) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : ''
}
const label = argValue('--label') || 'before-1101'
const env = JSON.parse(readFileSync(join(PERF_ROOT, 'env', label, 'env.json'), 'utf8'))
const homeosBase = `http://127.0.0.1:${env.homeos.port}`
const storeBase = `http://127.0.0.1:${env.store.port}`
const outDir = join(PERF_ROOT, 'results', label)
mkdirSync(outDir, { recursive: true })

const initScript = `
(() => {
  const state = window.__probe = { shifts: [], lcp: [], marks: {} };
  const describe = (element) => {
    if (!element || !element.tagName) return "";
    const parts = [element.tagName.toLowerCase()];
    if (element.id) parts.push("#" + element.id);
    const classes = String(element.className || "").split(/\\s+/).filter(Boolean).slice(0, 3);
    if (classes.length) parts.push("." + classes.join("."));
    return parts.join("");
  };
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput) continue;
        state.shifts.push({
          start: Number(entry.startTime.toFixed(1)),
          value: Number(entry.value.toFixed(5)),
          sources: (entry.sources || []).map((source) => ({
            node: describe(source.node),
            previousRect: source.previousRect,
            currentRect: source.currentRect,
          })),
        });
      }
    }).observe({ type: "layout-shift", buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        state.lcp.push({
          start: Number(entry.startTime.toFixed(1)),
          size: entry.size,
          element: describe(entry.element),
          url: entry.url || "",
        });
      }
    }).observe({ type: "largest-contentful-paint", buffered: true });
  } catch {}
  // 样式链揭幕时刻：store 外壳用 html[data-styles-ready] 标记。
  try {
    const observer = new MutationObserver(() => {
      if (document.documentElement.hasAttribute("data-styles-ready") && !state.marks.stylesReady) {
        state.marks.stylesReady = Number(performance.now().toFixed(1));
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-styles-ready"] });
  } catch {}
})();
`

async function launch() {
  return chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--enable-precise-memory-info', '--disable-background-timer-throttling'],
  })
}

async function openHome(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    colorScheme: 'light',
  })
  await context.addCookies([{ name: 'auth_token', value: env.homeos.token, url: homeosBase }])
  const page = await context.newPage()
  await page.addInitScript(initScript)
  await page.goto(homeosBase + '/', { waitUntil: 'load', timeout: 60000 })
  await page.waitForTimeout(7000)
  const data = await page.evaluate(() => window.__probe)
  await context.close()
  return data
}

async function probeWebglCost(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await page.goto(homeosBase + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 })
  // 重复 5 次取中位数：单次 getContext 可能命中驱动缓存，首帧那次才是真实成本。
  const samples = await page.evaluate(() => {
    const runs = []
    for (let i = 0; i < 5; i += 1) {
      const canvas = document.createElement('canvas')
      const started = performance.now()
      const gl = canvas.getContext('webgl2')
      const elapsed = performance.now() - started
      const lose = gl && gl.getExtension('WEBGL_lose_context')
      if (lose) lose.loseContext()
      runs.push(Number(elapsed.toFixed(3)))
      canvas.remove()
    }
    // 无 WEBGL_lose_context 的对照：不主动释放时连续创建的成本
    const keep = []
    for (let i = 0; i < 3; i += 1) {
      const canvas = document.createElement('canvas')
      const started = performance.now()
      canvas.getContext('webgl2')
      keep.push(Number((performance.now() - started).toFixed(3)))
    }
    return { withRelease: runs, withoutRelease: keep }
  })
  await context.close()
  return samples
}

async function probeStoreSlow(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    colorScheme: 'light',
  })
  const page = await context.newPage()
  await page.addInitScript(initScript)
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  const started = Date.now()
  await page.goto(storeBase + '/', { waitUntil: 'load', timeout: 120000 })
  await page.waitForTimeout(4000)
  const data = await page.evaluate(() => window.__probe)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  await context.close()
  return { ...data, wallMs: Date.now() - started }
}

async function probeStoreNormal(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    colorScheme: 'light',
  })
  const page = await context.newPage()
  await page.addInitScript(initScript)
  await page.goto(storeBase + '/', { waitUntil: 'load', timeout: 60000 })
  await page.waitForTimeout(3000)
  const data = await page.evaluate(() => window.__probe)
  await context.close()
  return data
}

const browser = await launch()
const result = { label, generatedAt: new Date().toISOString() }
try {
  result.webglProbe = await probeWebglCost(browser)
} catch (error) {
  result.webglProbeError = String(error).slice(0, 800)
}
try {
  result.home = await openHome(browser)
} catch (error) {
  result.homeError = String(error).slice(0, 800)
}
try {
  result.storeNormal = await probeStoreNormal(browser)
} catch (error) {
  result.storeNormalError = String(error).slice(0, 800)
}
try {
  result.storeSlow4g = await probeStoreSlow(browser)
} catch (error) {
  result.storeSlow4gError = String(error).slice(0, 800)
}
await browser.close()
writeFileSync(join(outDir, 'probe.json'), JSON.stringify(result, null, 1))
console.log(JSON.stringify(result, null, 1).slice(0, 6000))
