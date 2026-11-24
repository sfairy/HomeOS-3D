/**
 * 浏览器自动化检查的公共 CDP 客户端。
 *
 * 为什么抽出来：视觉回归、可访问性扫描、端到端冒烟三条检查都要做同一件事 ——
 * 连一个已经开了 `--remote-debugging-port` 的 Chrome、开标签页、设视口、注入 Cookie、
 * 等两帧、截图。三份各自实现会在 `check:duplicates` 里如实出现，而且行为会漂移
 * （一处等一帧、一处等两帧，截图就开始不一致）。
 *
 * 这里只封装「与检查内容无关」的部分；每个检查自己的断言仍留在各自的脚本里。
 *
 * 前置：Chrome/Edge 以 `--remote-debugging-port=9222` 启动。地址可用
 * `HOMEOS_VISUAL_CDP` 覆盖（默认 `http://127.0.0.1:9222`）。
 *
 * ## 已知环境限制：单条 CDP 会话约 25–35 秒后会失去响应
 *
 * 实测（macOS + 无头 Edge 158）：用 `/json/new` 开出的标签页，即使停在 `about:blank`
 * 只发 `1+1`，也会在 25–35 秒后不再回包（`send` 只能靠超时结束）。换成有界面的浏览器
 * 或加上 `--disable-backgrounding-occluded-windows --disable-renderer-backgrounding
 * --disable-background-timer-throttling` 后恢复正常。
 *
 * 因此：
 * - 短检查（视觉 / a11y / e2e / vitals，单场景 ≤15s）可以直接跑；
 * - 长跑检查（soak）必须先做通道预检，把「传输断开」与「页面卡死」分开判，
 *   否则会得出完全相反的结论（见 `ops/checks/perf/soak.mjs` 的 `preflightChannel`）。
 */

export const CDP = process.env.HOMEOS_VISUAL_CDP || 'http://127.0.0.1:9222'

/** 两个前端在本地的默认地址；可用环境变量覆盖。 */
export const BASES = {
  homeos: process.env.HOMEOS_VISUAL_BASE_URL || 'http://127.0.0.1:8801',
  store: process.env.HOMEOS_STORE_BASE_URL || 'http://127.0.0.1:8802',
}

export class CdpSession {
  #socket
  #nextId = 1
  #pending = new Map()

  static async open(webSocketDebuggerUrl) {
    const session = new CdpSession()
    session.#socket = new WebSocket(webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      session.#socket.addEventListener('open', resolve, { once: true })
      session.#socket.addEventListener('error', reject, { once: true })
    })
    session.#socket.addEventListener('message', (event) => {
      const payload = JSON.parse(String(event.data))
      const pending = session.#pending.get(payload.id)
      if (!pending) return
      session.#pending.delete(payload.id)
      if (payload.error) pending.reject(new Error(payload.error.message))
      else pending.resolve(payload.result)
    })
    return session
  }

  send(method, params = {}, { timeoutMs = 30_000 } = {}) {
    const id = this.#nextId++
    return new Promise((resolve, reject) => {
      // 页面被关闭 / 渲染进程崩溃时 CDP 不会回包；没有超时就会永远挂住整条检查。
      const timer = setTimeout(() => {
        this.#pending.delete(id)
        reject(new Error(`CDP 超时：${method}（${timeoutMs}ms）`))
      }, timeoutMs)
      this.#pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        },
      })
      this.#socket.send(JSON.stringify({ id, method, params }))
    })
  }

  close() {
    this.#socket.close()
  }
}

/** CDP 端口是否可用；不可用时检查应打印「环境缺失」并以退出码 3 结束，而不是报回归。 */
export async function cdpAvailable(base = CDP) {
  try {
    const response = await fetch(`${base}/json/version`, { signal: AbortSignal.timeout(2500) })
    return response.ok
  } catch {
    return false
  }
}

/**
 * 把标签页强制置为 active 生命周期。
 *
 * 为什么需要：Chrome/Edge 会对「被遮挡 / 非前台」的标签页做 freeze（页面被挂起，定时器
 * 与渲染循环停摆）。用 ``/json/new`` 开出来的标签页在无头模式里经常被判成后台，
 * 于是长跑采样会在 30s 左右突然收不到任何回包 —— 看起来像「页面卡死」，其实是浏览器
 * 冻结了它。长时间检查（soak / 视觉 / Vitals）在每次采样前调一次即可。
 *
 * 更彻底的做法是给浏览器加启动参数（本仓库的脚本不改用户的浏览器进程）：
 *   --disable-backgrounding-occluded-windows --disable-renderer-backgrounding
 *   --disable-background-timer-throttling
 */
export async function keepPageActive(session) {
  await session.send('Page.setWebLifecycleState', { state: 'active' }, { timeoutMs: 5_000 }).catch(() => undefined)
}

export async function openTab(url, { base = CDP } = {}) {
  const response = await fetch(`${base}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })
  if (!response.ok) throw new Error(`无法新建标签页：HTTP ${response.status}`)
  const target = await response.json()
  const session = await CdpSession.open(target.webSocketDebuggerUrl)
  await session.send('Page.enable')
  await session.send('Runtime.enable')
  await session.send('Network.enable').catch(() => undefined)
  return { session, targetId: target.id }
}

export async function closeTab(targetId, { base = CDP } = {}) {
  try {
    await fetch(`${base}/json/close/${targetId}`)
  } catch {
    /* 关闭失败不影响判定 */
  }
}

/** 把 `a=1; b=2` 形式的 Cookie 头逐条写进页面（域名取目标 URL 的主机）。 */
export async function applyCookie(session, url) {
  const cookie = process.env.HOMEOS_VISUAL_COOKIE
  if (!cookie) return
  const host = new URL(url).hostname
  for (const pair of cookie.split(';')) {
    const index = pair.indexOf('=')
    if (index <= 0) continue
    const name = pair.slice(0, index).trim()
    const value = pair.slice(index + 1).trim()
    await session.send('Network.setCookie', { name, value, domain: host, path: '/' })
  }
}

/** 等固定时长后再等两帧：字体/布局/3D 首帧通常在这一步之后稳定。 */
export async function waitForPaint(session, waitMs) {
  await new Promise((resolve) => setTimeout(resolve, waitMs))
  // rAF 在无头/后台标签页会被节流到 1fps 甚至完全停摆，裸等两帧会让整条检查挂到超时。
  // 这里用「两帧或 500ms，先到先算」：布局稳定通常在第一帧之后，500ms 足够兜住节流场景。
  await session.send('Runtime.evaluate', {
    expression: `new Promise((resolve) => {
      const timer = setTimeout(resolve, 500)
      requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(timer); resolve() }))
    })`,
    awaitPromise: true,
    timeoutMs: 5_000,
  })
}

/** 在页面里执行一段表达式并取回值（`awaitPromise` 默认开启）。 */
export async function evaluate(session, expression, { timeoutMs = 30_000 } = {}) {
  const { result } = await session.send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    { timeoutMs },
  )
  return result.value
}

/**
 * 开页面 → 设视口 → 注入 Cookie → 导航 → 等稳定 → 执行 `action`，最后关标签页。
 * `action` 拿到 `{ session, url }`，返回值原样透出。
 */
export async function withPage(scenario, action) {
  const base = BASES[scenario.base]
  if (!base) throw new Error(`未知 base：${scenario.base}`)
  const url = new URL(scenario.path, base).toString()
  const viewport = scenario.viewport ?? { width: 1600, height: 900, deviceScaleFactor: 1 }
  const { session, targetId } = await openTab(url)
  try {
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.deviceScaleFactor ?? 1,
      mobile: false,
    })
    await applyCookie(session, url)
    if (scenario.initScript) {
      // 在**导航前**注入：LCP / longtask 这类条目只有从文档开始就监听才拿得到。
      await session.send('Page.addScriptToEvaluateOnNewDocument', { source: scenario.initScript })
    }
    await session.send('Page.navigate', { url })
    await keepPageActive(session)
    await waitForPaint(session, scenario.waitMs ?? 2500)
    return await action({ session, url })
  } finally {
    await session.send('Emulation.clearDeviceMetricsOverride').catch(() => undefined)
    session.close()
    await closeTab(targetId)
  }
}

/** 读取 `ops/checks/visual/scenarios.json`（三条浏览器检查共用同一批检查点）。 */
export async function loadScenarios(scenariosPath) {
  const { readFileSync } = await import('node:fs')
  return JSON.parse(readFileSync(scenariosPath, 'utf8')).scenarios
}
