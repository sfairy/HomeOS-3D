// @ts-check
/**
 * 3D 舞台冷启动阶段表 + 稳态帧率采集。
 *
 * 数据来源是**应用自己的诊断日志**，不是本脚本臆造的探针
 * ----------------------------------------------------------
 * `?performance-diagnostics=1` 时，`studio/app/bridge/scene/load-timing.ts` 打
 * `[3D-load] {scope, phase, at}`，`studio/app/display/display-boot.ts` 打
 * `[display-load] {phase, at, warm}`。两者都是 `performance.now()` 口径，且**只在
 * 诊断开关打开时**付出代价（平时被 `if (!enabled) return` 短路），所以拿它们当基线
 * 不会把测量本身算进被测对象。
 *
 * 为什么不在外面套一层 PerformanceObserver：iframe 内部的 long task 在父页面的
 * observer 里看不到（独立 JS realm），只有应用自己的打点才能跨层对齐。
 *
 * 用法
 * ----
 * ```bash
 * node ops/perf/harness/bench_3d.mjs --url 'http://127.0.0.1:18801/display/2' --label before
 * node ops/perf/harness/bench_3d.mjs --url … --fps-seconds 8 --runs 2
 * ```
 * 没有浏览器时退出 3（跳过）；预算不达标退出 1。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { openBrowserPage } from './cdp.mjs'

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

/** 把 URL 补上诊断开关与一个时间戳参数（绕开 Service Worker / 页面缓存）。 */
function withDiagnostics(rawUrl) {
  const url = new URL(rawUrl)
  if (url.searchParams.get('performance-diagnostics') !== '1') {
    url.searchParams.set('performance-diagnostics', '1')
  }
  // 冷启动必须绕开缓存：warm 启动走完全不同的路径（`display-warm-start`），
  // 两者混在一张表里会得出"冷启动只有 400ms"的假结论。
  url.searchParams.set('_perf', String(Date.now()))
  return url.toString()
}

/**
 * 在页面里按 rAF 采样帧间隔。iframe 内的 rAF 与父页面共享同一个显示刷新节拍，
 * 因此在父页面采样能反映舞台是否在掉帧。
 */
const fpsProbeSource = (seconds) => `(() => {
  const samples = [];
  let last = performance.now();
  const deadline = last + ${Number(seconds)} * 1000;
  return new Promise((done) => {
    const tick = (now) => {
      samples.push(now - last);
      last = now;
      if (now < deadline) requestAnimationFrame(tick);
      else {
        // 丢掉前两帧：首帧包含调度抖动
        const frames = samples.slice(2);
        const total = frames.reduce((sum, value) => sum + value, 0);
        const sorted = frames.slice().sort((a, b) => a - b);
        const pick = (ratio) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] || 0;
        done({
          frames: frames.length,
          averageFps: total > 0 ? Number(((frames.length / total) * 1000).toFixed(1)) : 0,
          frameP95Ms: Number(pick(0.95).toFixed(2)),
          frameP99Ms: Number(pick(0.99).toFixed(2)),
          frameMaxMs: Number((sorted[sorted.length - 1] || 0).toFixed(2))
        });
      }
    };
    requestAnimationFrame(tick);
  });
})()`

/**
 * 阶段表 → 关键派生值。缺失写 `null` 而不是 0（0 会被误读成"瞬时完成"）。
 */
function derive(phases) {
  const at = (name) => (typeof phases[name] === 'number' ? phases[name] : null)
  return {
    stageMountedMs: at('stage-mounted'),
    sceneSettledMs: at('scene-settled'),
    lightCacheReadyMs: at('light-cache-ready'),
    firstFramePresentedMs: at('first-frame-presented'),
    iframeReadyMs: at('first-screen-ready'),
    documentReadyMs: at('document-ready'),
    bootMs: at('boot'),
  }
}

/** consoleAPICalled 的 args 是 RemoteObject 数组：字符串在 `value`，对象在 `description`。 */
function consoleText(params) {
  return (params.args || [])
    .map((arg) =>
      typeof arg.value === 'string'
        ? arg.value
        : (arg.preview?.properties || []).map((item) => item.value).join('') || arg.description || '',
    )
    .join(' ')
}

async function main() {
  const args = parseArgs(process.argv)
  const url = String(args.url || 'http://127.0.0.1:18801/')
  const label = String(args.label || 'latest')
  const runs = Number(args.runs || 1)
  const fpsSeconds = Number(args['fps-seconds'] || 6)
  const settleMs = Number(args.settle || 4000)
  // 展示页默认要登录；不给登录态时只会落回 /login，相位表全是 null。
  const cookie = String(args.cookie || '')
  const minFps = Number(args['min-fps'] || 50)
  const maxIframeReady = Number(args['max-iframe-ready'] || 3200)
  const outPath = args.out
    ? resolve(String(args.out))
    : resolve(REPO_ROOT, 'ops', 'perf', 'results', label, 'bench_3d.json')

  const samples = []
  for (let index = 0; index < runs; index += 1) {
    const { browser, session } = await openBrowserPage({
      viewport: { width: 1440, height: 900 },
      cookie,
      url,
    })
    /** @type {Record<string, number>} */
    const phases = {}
    const off = session.on((event) => {
      if (event.method !== 'Runtime.consoleAPICalled' || event.sessionId !== session.sessionId) return
      const text = consoleText(event.params)
      if (!text.includes('[3D-load]') && !text.includes('[display-load]')) return
      // console.info('[3D-load]', JSON.stringify({...})) 会拼成 "[3D-load] {"phase":…}"
      const start = text.indexOf('{')
      if (start < 0) return
      try {
        const parsed = JSON.parse(text.slice(start))
        if (typeof parsed.phase !== 'string' || typeof parsed.at !== 'number') return
        // 同名相位只记第一次：重建 / 重进房间会再次打点，后者不是冷启动
        if (!(parsed.phase in phases)) phases[parsed.phase] = parsed.at
      } catch {
        /* 非 JSON 的诊断输出（console.warn 的对象）直接忽略 */
      }
    })
    try {
      await session.navigate(withDiagnostics(url), 90_000)
      await new Promise((done) => setTimeout(done, settleMs))
      // 落地路由：展示页要登录时会被重定向到 /login，此时一条 [display-load] 都收不到。
      // 区分「被登录墙挡住」（环境问题，跳过）与「是展示页但没打点」（回归，失败）靠它。
      const landedPath = String((await session.evaluate('location.pathname')) || '')
      const fps = await session.evaluate(fpsProbeSource(fpsSeconds), true)
      samples.push({ run: index + 1, landedPath, phases, ...derive(phases), fps })
    } finally {
      off()
      session.close()
      browser.close()
    }
  }

  const median = (values) => {
    const numeric = values.filter((value) => typeof value === 'number').sort((a, b) => a - b)
    if (!numeric.length) return null
    const mid = Math.floor(numeric.length / 2)
    return numeric.length % 2 ? numeric[mid] : Math.round((numeric[mid - 1] + numeric[mid]) / 2)
  }
  const summary = {
    stageMountedMs: median(samples.map((item) => item.stageMountedMs)),
    sceneSettledMs: median(samples.map((item) => item.sceneSettledMs)),
    lightCacheReadyMs: median(samples.map((item) => item.lightCacheReadyMs)),
    firstFramePresentedMs: median(samples.map((item) => item.firstFramePresentedMs)),
    iframeReadyMs: median(samples.map((item) => item.iframeReadyMs)),
    averageFps: median(samples.map((item) => item.fps?.averageFps)),
    frameP95Ms: median(samples.map((item) => item.fps?.frameP95Ms)),
  }
  // 「一个相位都没采到」不等于「预算通过」。以前这里只 warn 一条就照常退出 0，
  // 结果是 perf-budget 里声明的 iframeReady 预算从未真正参与判定（假 PASS）。
  // 现在按原因分档：登录墙 → 跳过（3）；是展示页却没有打点 → 失败（1）。
  const capturedPhase = samples.some((item) => Object.keys(item.phases).length > 0)
  const onAuthWall = samples.every((item) => /(^|\/)login(\/|$)/.test(String(item.landedPath || '')))
  const skipReason = capturedPhase
    ? null
    : onAuthWall
      ? '登录墙：展示页重定向到 /login，未采到 [display-load]'
      : '展示页未产出 [display-load] 打点'
  // 预算只在"拿到数据"时判定：缺相位说明该页面没有 3D 舞台，不能判成 PASS
  const checks = [
    { name: 'iframeReadyMs', value: summary.iframeReadyMs, limit: maxIframeReady, op: '<=' },
    { name: 'averageFps', value: summary.averageFps, limit: minFps, op: '>=' },
  ].filter((check) => typeof check.value === 'number')
  // 采到了其它相位却没有 first-screen-ready：舞台起了但没走完首屏，这是回归而不是缺数据。
  if (capturedPhase && summary.iframeReadyMs === null) {
    checks.push({ name: 'iframeReadyMs', value: Number.POSITIVE_INFINITY, limit: maxIframeReady, op: '<=' })
  }
  const failures = checks.filter((check) =>
    check.op === '<=' ? Number(check.value) > check.limit : Number(check.value) < check.limit,
  )

  const payload = {
    label,
    url,
    measured_at: new Date().toISOString(),
    config: { runs, settleMs, fpsSeconds },
    summary,
    skip_reason: skipReason,
    budget: { minFps, maxIframeReady },
    failures,
    samples,
  }
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`)
  console.log(
    `stageMounted ${summary.stageMountedMs}ms  lightCache ${summary.lightCacheReadyMs}ms  ` +
      `iframeReady ${summary.iframeReadyMs}ms  fps ${summary.averageFps}  p95帧 ${summary.frameP95Ms}ms`,
  )
  console.log(`已写入 ${outPath}`)
  if (skipReason) {
    console.error(
      onAuthWall
        ? `跳过：${skipReason}。给展示页配好登录态（--url 带 cookie 或先登录同一浏览器）后再跑。`
        : `失败：${skipReason}。诊断开关或 [display-load] 打点可能已失效。`,
    )
    process.exitCode = onAuthWall ? 3 : 1
    return
  }
  if (failures.length) {
    console.error(
      `预算未通过：${failures.map((item) => `${item.name}=${item.value}${item.op}${item.limit}`).join(', ')}`,
    )
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
