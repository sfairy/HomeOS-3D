// @ts-check
/**
 * 极简 CDP 驱动：起一个系统浏览器 + 用原生 WebSocket 说话。
 *
 * 为什么不用 Playwright
 * --------------------
 * 这个仓库的 `node_modules/playwright` 是个没有 `package.json` 依赖声明的残留（`playwright-core`
 * 都不在），而把它正式加进 devDependencies 又会给每个贡献者拉一次 ~150MB 的浏览器下载 ——
 * 只为跑两条性能脚本。历史基线本来就是在**系统 Edge** 的无头模式下采的（见
 * docs/perf/2026-11-01 §1.1），所以这里直接沿用它：只依赖系统已装浏览器 + Node 内置 WebSocket。
 *
 * 没有浏览器时**退出码 3**（门禁约定为「环境不具备，跳过」），不靜默 PASS。
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

const CANDIDATES = [
  process.env.HOMEOS_BROWSER || '',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/usr/bin/microsoft-edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
]

/** @returns {string | null} */
export function findBrowser() {
  for (const candidate of CANDIDATES) {
    if (candidate && existsSync(candidate)) return candidate
  }
  return null
}

/**
 * 启动浏览器并等它打印 DevTools 端点。
 * `--remote-debugging-port=0` 让内核自己挑端口，避免并发跑两条脚本期端口冲突。
 */
export async function launchBrowser(options = {}) {
  const binary = options.binary || findBrowser()
  if (!binary) {
    console.error('找不到可用的浏览器：设置 HOMEOS_BROWSER=/path/to/chrome 或安装 Chromium。')
    process.exit(3)
  }
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'homeos-perf-'))
  const args = [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-dev-shm-usage',
    // 采样期间不能让内核把后台页降频 / 让定时器节流：否则 FPS 反映的是调度策略
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    // 无头模式默认没有 GPU；SwiftShader 让 WebGL2 仍然可用（3D 舞台必须有上下文）
    '--enable-unsafe-swiftshader',
    '--window-size=1440,900',
    ...(options.args || []),
    'about:blank',
  ]

  const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  const stderrChunks = []
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('等待 DevTools 端点超时（10s）')), 10_000)
    const onData = (chunk) => {
      const text = String(chunk)
      stderrChunks.push(text)
      const match = text.match(/DevTools listening on (ws:\/\/\S+)/)
      if (match) {
        clearTimeout(timer)
        resolve(match[1])
      }
    }
    child.stderr?.on('data', onData)
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      // code === null 表示被信号杀掉（不是自己退出）。最常见的原因是运行环境不允许
      // 拉起子浏览器进程（沙箱 / 权限策略），此时 stderr 是空的，只说「提前退出（null）」
      // 会把人引向「CDP 脚本坏了」这条假线索。
      const hint =
        code === null
          ? '\n  退出码为 null = 进程被信号终止。若在受限环境（沙箱 / 无 GUI 会话）里运行，' +
            '浏览器可能被直接杀掉：换到普通终端重跑，或设 HOMEOS_BROWSER 指向可用浏览器。'
          : ''
      reject(new Error(`浏览器提前退出（${code}）：${stderrChunks.join('').slice(-400)}${hint}`))
    })
  })

  return {
    /** @type {string | null} */
    webSocketDebuggerUrl: endpoint,
    binary,
    close() {
      try {
        child.kill('SIGKILL')
      } catch {
        /* 已经退出 */
      }
      try {
        rmSync(userDataDir, { recursive: true, force: true })
      } catch {
        /* 临时目录清理是 best-effort */
      }
    },
  }
}

/** CDP 会话：一个连接上可以挂多个 target（这里只用一个）。 */
export class CdpSession {
  /** @param {WebSocket} socket */
  constructor(socket) {
    this.socket = socket
    this.nextId = 1
    /** @type {Map<number, {resolve: (value: any) => void, reject: (error: Error) => void}>} */
    this.pending = new Map()
    /** @type {((event: {method: string, params: any, sessionId?: string}) => void)[]} */
    this.listeners = []
    this.sessionId = ''
  }

  static async connect(url) {
    const socket = new WebSocket(url)
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true })
      socket.addEventListener('error', () => reject(new Error('CDP 连接失败')), { once: true })
    })
    return new CdpSession(/** @type {any} */ (socket))
  }

  /** 注册事件监听（返回取消函数）。 */
  on(handler) {
    this.listeners.push(handler)
    return () => {
      this.listeners = this.listeners.filter((item) => item !== handler)
    }
  }

  /** @param {string} method @param {Record<string, any>} [params] */
  send(method, params = {}) {
    const id = this.nextId++
    const payload = { id, method, params, ...(this.sessionId ? { sessionId: this.sessionId } : {}) }
    const promise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
    })
    // 消息分发：响应 resolve 对应 id，事件广播给监听者
    if (!this._hooked) {
      this._hooked = true
      this.socket.addEventListener('message', (event) => {
        let message
        try {
          message = JSON.parse(/** @type {any} */ (event).data)
        } catch {
          return
        }
        if (typeof message.id === 'number') {
          const entry = this.pending.get(message.id)
          if (!entry) return
          this.pending.delete(message.id)
          if (message.error) entry.reject(new Error(`${method}: ${message.error.message || 'CDP 错误'}`))
          else entry.resolve(message.result)
          return
        }
        for (const listener of this.listeners) listener(message)
      })
    }
    this.socket.send(JSON.stringify(payload))
    return promise
  }

  /** 打开一个新页面并 attach（flatten 模式：命令直接带 sessionId）。 */
  async openPage() {
    const created = await this.send('Target.createTarget', { url: 'about:blank' })
    const attached = await this.send('Target.attachToTarget', {
      targetId: created.targetId,
      flatten: true,
    })
    this.sessionId = attached.sessionId
    return created.targetId
  }

  /** @param {string} expression @param {boolean} [awaitPromise] */
  async evaluate(expression, awaitPromise = false) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true,
    })
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || '页面内求值失败')
    }
    return result.result?.value
  }

  /** 导航并等 load（超时后返回 false，由调用方决定是否继续）。 */
  async navigate(url, timeoutMs = 90_000) {
    const loaded = new Promise((resolve) => {
      const finish = (value) => {
        // 必须清掉超时器：留着它会把 Node 的事件循环钉到 timeout 结束，
        // 让"3 秒跑完"的采集在进程层面变成"90 秒"。
        clearTimeout(timer)
        off()
        resolve(value)
      }
      const off = this.on((event) => {
        if (event.method === 'Page.loadEventFired' && (!event.sessionId || event.sessionId === this.sessionId)) {
          finish(true)
        }
      })
      const timer = setTimeout(() => finish(false), timeoutMs)
    })
    await this.send('Page.navigate', { url })
    return loaded
  }

  close() {
    try {
      this.socket.close()
    } catch {
      /* ignore */
    }
  }
}

/**
 * 起浏览器 + 建一个已开好 CDP 域的新页面，是两条 bench 脚本的共同前置。
 * @param {{viewport?: {width: number, height: number}, cookie?: string, url?: string}} [options]
 */
export async function openBrowserPage(options = {}) {
  const browser = await launchBrowser(options)
  const session = await CdpSession.connect(/** @type {string} */ (browser.webSocketDebuggerUrl))
  await session.openPage()
  await session.send('Page.enable')
  await session.send('Runtime.enable')
  await session.send('Network.enable')
  // 登录态注入：`/display`、`/api/v1/projects` 这类路由在未登录时只会被重定向或 401，
  // 不注入 Cookie 就没有任何办法量到它们（3D 相位表因此长期只能采到 null）。
  // 必须在 navigate 之前设，否则第一跳已经落到 /login 了。
  if (options.cookie) {
    await applyCookies(session, options.cookie, options.url)
  }
  const viewport = options.viewport || { width: 1440, height: 900 }
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: false,
  })
  return { browser, session }
}

/**
 * 把 `a=1; b=2` 形式的 Cookie 头逐条塞进浏览器。
 *
 * 用 `Network.setCookie` 而不是改写请求头：页面内的 `fetch` / `import()` / Service Worker
 * 都会重新构造请求，只有落到浏览器的 cookie jar 才对这些请求同样生效。
 * @param {import('./cdp.mjs').CdpSession} session
 * @param {string} cookieHeader
 * @param {string} [targetUrl]
 */
async function applyCookies(session, cookieHeader, targetUrl) {
  const origin = new URL(targetUrl || 'http://127.0.0.1').origin
  for (const pair of cookieHeader.split(';')) {
    const token = pair.trim()
    if (!token) continue
    const index = token.indexOf('=')
    if (index <= 0) continue
    const name = token.slice(0, index).trim()
    const value = token.slice(index + 1).trim()
    if (!name) continue
    await session.send('Network.setCookie', { name, value, url: origin })
  }
}

/** 与调用方约定的"环境不具备"退出码。 */
export const SKIP_EXIT_CODE = 3
