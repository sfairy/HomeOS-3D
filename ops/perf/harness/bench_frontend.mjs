// @ts-check
/**
 * 前端冷加载采集：LCP / FCP / CLS / Long Task / 传输字节 / 资源清单。
 *
 * 为什么用 PerformanceObserver 而不是 Lighthouse
 * ----------------------------------------------
 * - Lighthouse 需要联网装包，且它的分数是个加权产物，改一个字节也会抖动，无法用来判定
 *   "这次改动到底省了多少字节"；
 * - 这里只用浏览器原生 API：`encodedBodySize` / `transferSize` 是**确定性**的（同构建逐字节
 *   相同），CLS 在多次采样同向时才采信，LCP 自带 11%~20% 的漂移（见 docs/perf 的噪声纪律）。
 *
 * 用法
 * ----
 * ```bash
 * node ops/perf/harness/bench_frontend.mjs --url http://127.0.0.1:18801/ --label before
 * node ops/perf/harness/bench_frontend.mjs --url http://127.0.0.1:18802/store --label before \
 *      --throttle slow4g --cpu 4 --runs 3
 * ```
 * 结果写到 `ops/perf/results/<label>/bench_frontend.json`。没有浏览器时退出 3（跳过）。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { SKIP_EXIT_CODE, openBrowserPage } from './cdp.mjs'

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..')

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

/**
 * 观测器：必须注入到**每个新文档**执行前。导航之后再注入会漏掉首屏的 LCP 候选与
 * 早期 layout-shift —— 它们只在页面生命周期内累积，之后无法补读。
 */
const OBSERVER_SOURCE = `(() => {
  if (window.__perfState) return;
  const perf = { lcp: 0, lcpElement: '', fcp: 0, cls: 0, longTasks: [], shifts: [] };
  window.__perfState = perf;
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        perf.lcp = entry.startTime;
        const element = entry.element;
        perf.lcpElement = element ? (element.tagName || '').toLowerCase() + (element.id ? '#' + element.id : '') : '';
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (entry.name === 'first-contentful-paint') perf.fcp = entry.startTime;
    }).observe({ type: 'paint', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // 无用户输入的位移才算 CLS：有输入后的位移是交互反馈，不计入 Core Web Vitals
        if (!entry.hadRecentInput) {
          perf.cls += entry.value;
          perf.shifts.push({
            value: entry.value,
            at: Math.round(entry.startTime),
            sources: (entry.sources || []).map(
              (source) => (source.node && source.node.tagName || '?').toLowerCase() + (source.node && source.node.id ? '#' + source.node.id : '')
            )
          });
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        perf.longTasks.push({ start: Math.round(entry.startTime), duration: Math.round(entry.duration) });
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
})();`

const COLLECT_SOURCE = `(() => {
  const perf = window.__perfState || {};
  const navigation = performance.getEntriesByType('navigation')[0];
  const resources = performance.getEntriesByType('resource').map((entry) => ({
    // transferSize 为 0 的缓存命中也要留：否则「装了 SW 之后传输量看着像 0」会被误读成收益
    name: new URL(entry.name, location.href).pathname,
    initiatorType: entry.initiatorType,
    encodedBodySize: entry.encodedBodySize,
    transferSize: entry.transferSize,
    duration: Math.round(entry.duration)
  }));
  const longTasks = perf.longTasks || [];
  return {
    lcp: Math.round(perf.lcp || 0),
    lcpElement: perf.lcpElement || '',
    fcp: Math.round(perf.fcp || 0),
    cls: Number((perf.cls || 0).toFixed(4)),
    longTaskTotal: longTasks.reduce((sum, task) => sum + task.duration, 0),
    longTaskMax: longTasks.reduce((max, task) => Math.max(max, task.duration), 0),
    longTaskCount: longTasks.length,
    shifts: (perf.shifts || []).sort((a, b) => b.value - a.value).slice(0, 5),
    encodedBodyTotal: resources.reduce((sum, item) => sum + item.encodedBodySize, 0),
    transferTotal: resources.reduce((sum, item) => sum + item.transferSize, 0),
    resourceCount: resources.length,
    domNodes: document.querySelectorAll('*').length,
    documentBytes: navigation ? navigation.transferSize : null,
    resources: resources.sort((a, b) => b.transferSize - a.transferSize).slice(0, 40),
    // 首屏 modulepreload 是外壳 HTML 里的静态声明，单独统计便于体积预算比对
    modulepreload: Array.from(document.querySelectorAll('link[rel="modulepreload"]')).map((link) => link.href),
    stylesheets: Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((link) => link.href),
    // 开发服务器标记：Vite 未打包时每个模块都是一次请求，Slow4G 下 LCP 会比生产构建
    // 高一个数量级（实测 store：开发 19.0s / 生产 2.2s）。拿它去比生产预算只会得到假红。
    devServer: Boolean(
      document.querySelector('script[src^="/@vite/client"]') ||
        Array.from(document.querySelectorAll('script[type="module"][src]')).some((script) =>
          /^\\/src\\/.+\\.(ts|tsx|vue)$/.test(new URL(script.src, location.href).pathname)
        )
    )
  };
})()`

/** 缓存：同一进程内每轮都要重新注入，但 source 只算一次。 */
let observerInstalledFor = ''

async function main() {
  const args = parseArgs(process.argv)
  const url = String(args.url || 'http://127.0.0.1:18801/')
  const label = String(args.label || 'latest')
  const runs = Number(args.runs || 1)
  const settleMs = Number(args.settle || 2500)
  const throttle = String(args.throttle || 'none')
  // 登录态：受保护路由（例如商店的账号页 / 主应用的 /display）没有它只会量到登录页。
  const cookie = String(args.cookie || '')
  const cpuRate = Number(args.cpu || 1)
  const outPath = args.out
    ? resolve(String(args.out))
    : resolve(REPO_ROOT, 'ops', 'perf', 'results', label, 'bench_frontend.json')

  const samples = []
  /** @type {{browser: {close: () => void}, session: any} | null} */
  let live = null
  try {
    for (let index = 0; index < runs; index += 1) {
      // 每轮一个全新 profile 页面：上一轮的服务端/浏览器缓存会让第二轮"变快"，那不是冷启动
      live?.session.close()
      live?.browser.close()
      live = await openBrowserPage({ viewport: { width: 1440, height: 900 }, cookie, url })
      const { session } = live
      await session.send('Page.addScriptToEvaluateOnNewDocument', { source: OBSERVER_SOURCE })
      observerInstalledFor = url
      if (throttle === 'slow4g') {
        // 与 docs/perf 的历史口径一致：1.6 Mbps 下行 / 750 kbps 上行 / 150ms RTT
        await session.send('Network.emulateNetworkConditions', {
          offline: false,
          latency: 150,
          downloadThroughput: Math.round((1.6 * 1024 * 1024) / 8),
          uploadThroughput: Math.round((750 * 1024) / 8),
        })
      }
      if (cpuRate > 1) await session.send('Emulation.setCPUThrottlingRate', { rate: cpuRate })

      const started = Date.now()
      await session.navigate(url, 60_000)
      // 等首屏稳定：LCP 只在出现更大元素时才更新，太早读取会拿到过小的候选
      await new Promise((done) => setTimeout(done, settleMs))
      const collected = await session.evaluate(COLLECT_SOURCE)
      samples.push({ run: index + 1, wallMs: Date.now() - started, ...collected })
      if (cpuRate > 1) await session.send('Emulation.setCPUThrottlingRate', { rate: 1 })
    }
  } finally {
    live?.session.close()
    live?.browser.close()
  }
  if (!samples.length) throw new Error(`采集失败（${observerInstalledFor || url}）`)

  // 多轮采样取中位数：单轮 LCP 自身漂移可达 20%，中位数比"最后一轮"更能代表稳态
  const median = (values) => {
    const sorted = values.slice().sort((a, b) => a - b)
    if (!sorted.length) return 0
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
  }
  const summary = {
    lcp: median(samples.map((item) => item.lcp)),
    fcp: median(samples.map((item) => item.fcp)),
    cls: Number(median(samples.map((item) => Math.round(item.cls * 10000))) / 10000),
    longTaskTotal: median(samples.map((item) => item.longTaskTotal)),
    longTaskMax: median(samples.map((item) => item.longTaskMax)),
    encodedBodyTotal: median(samples.map((item) => item.encodedBodyTotal)),
    transferTotal: median(samples.map((item) => item.transferTotal)),
    resourceCount: median(samples.map((item) => item.resourceCount)),
  }

  // 「什么都没画」不等于「首屏极快」：没有任何 paint 条目时 LCP/FCP 都是 0，
  // 直接写进结果就会得到「0ms / 上限 2600ms PASS」这种最危险的假绿。
  // 记录器自己先说清楚，下游 check_perf_budget 才知道这是环境问题（跳过）而不是成绩。
  const unpainted = samples.every((item) => !(item.fcp > 0) && !(item.lcp > 0))
  // 开发服务器上来：Vite 未打包，模块请求数差两个数量级，毫秒指标与生产预算不可比。
  const devServer = samples.every((item) => item.devServer === true)
  const allowDev = args['allow-dev'] === true
  let skipReason = null
  if (unpainted) skipReason = '页面未渲染：没有任何 paint 条目（LCP/FCP=0），应用可能未挂载'
  else if (devServer && !allowDev) {
    skipReason = 'Vite 开发服务器（模块未打包）：毫秒指标不可与生产构建预算比较，改用后端端口的生产构建'
  }

  const payload = {
    label,
    url,
    browser: live?.browser ? 'system' : 'unknown',
    measured_at: new Date().toISOString(),
    config: { runs, settleMs, throttle, cpuRate, devServer },
    summary,
    skip_reason: skipReason,
    samples,
  }
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`)
  console.log(
    `${label} ${new URL(url).pathname}  LCP ${summary.lcp}ms  FCP ${summary.fcp}ms  CLS ${summary.cls}  ` +
      `LongTask ${summary.longTaskTotal}ms(max ${summary.longTaskMax})  ` +
      `encoded ${summary.encodedBodyTotal}B  transfer ${summary.transferTotal}B`,
  )
  console.log(`已写入 ${outPath}`)
  if (skipReason) {
    console.error(`跳过：${skipReason}`)
    process.exitCode = SKIP_EXIT_CODE
  }
}

main().catch((error) => {
  if (error?.message?.includes('找不到可用的浏览器')) process.exit(SKIP_EXIT_CODE)
  console.error(error)
  process.exit(1)
})
