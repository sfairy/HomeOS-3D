/**
 * Vite 8 + Rolldown 构建配置文件
 */
import { defineConfig, createLogger, type Plugin, type UserConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import devNoCachePlugin from './vite-plugin-dev-no-cache.ts'
import embedProxyFallbackPlugin from './vite-plugin-embed-fallback.ts'
import rootAssetsPlugin from './vite-plugin-root-assets.ts'
import { SPA_ENTRY, assertSpaShellPresent } from '../../ops/vite/build-helpers.js'
import {
  THREE_VENDOR,
  isRuntimeExternal,
  runtimeUrlExternalPlugin,
  runtimeVendorAssetPlugin,
  vendorResolvePlugin,
  writeClassicIifeBundles,
} from './vite-studio.ts'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

/**
 * 线上产物目录（后端 / 8801 直接伺服）。
 * 构建先写到旁路 ``frontend.building.<pid>``，closeBundle 末尾再覆盖进线上目录，避免
 * watch-build 清空窗口里 ``index.html`` / ``modules/runtime`` 失踪（stage.html 500、
 * 动态 import 404）。旁路目录带 pid：watch-build 与手工 ``vite build`` 并发时互不
 * ``emptyOutDir``，否则会出现「经典 IIFE 还在、public CSS 已被另一进程清掉」的假缺失。
 */
const finalOutDir = resolve(__dirname, '../../dist/homeos/frontend')
const outDir = `${finalOutDir}.building.${process.pid}`

function walkFiles(root: string): string[] {
  const out: string[] = []
  if (!fs.existsSync(root)) return out
  const stack = [root]
  while (stack.length) {
    const dir = stack.pop()!
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name)
      if (entry.isDirectory()) stack.push(full)
      else if (entry.isFile()) out.push(full)
    }
  }
  return out
}

function pruneStale(liveRoot: string, buildRoot: string): void {
  if (!fs.existsSync(liveRoot) || !fs.existsSync(buildRoot)) return
  const keep = new Set(
    walkFiles(buildRoot).map((f) => f.slice(buildRoot.length + 1).replace(/\\/g, '/')),
  )
  for (const file of walkFiles(liveRoot)) {
    const rel = file.slice(liveRoot.length + 1).replace(/\\/g, '/')
    if (!keep.has(rel)) fs.rmSync(file, { force: true })
  }
}

/** 清掉崩溃残留的旁路目录 / 发布锁（超过 30 分钟）；不动其他仍在跑的 pid 旁路。 */
function cleanStaleStagingDirs(): void {
  const parent = resolve(finalOutDir, '..')
  const liveName = finalOutDir.slice(parent.length + 1).replace(/\\/g, '/')
  const stagingPrefix = `${liveName}.building`
  const maxAgeMs = 30 * 60 * 1000
  const now = Date.now()
  if (!fs.existsSync(parent)) return
  for (const name of fs.readdirSync(parent)) {
    const isStaging = name === stagingPrefix || name.startsWith(`${stagingPrefix}.`)
    const isLock =
      name === `${liveName}.publish.lock` || name === `${liveName}.build.lock`
    if (!isStaging && !isLock) continue
    if (name === `${stagingPrefix}.${process.pid}`) continue
    const full = resolve(parent, name)
    try {
      const age = now - fs.statSync(full).mtimeMs
      if (age < maxAgeMs) continue
      fs.rmSync(full, { recursive: true, force: true })
    } catch {
      /* 仍被占用则跳过 */
    }
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * 锁文件的父目录可能还不存在：``dist/`` 被 gitignore，干净检出（CI、全新 clone）里没有
 * ``dist/homeos/``，此时 ``openSync(lock, 'wx')`` 抛的是 **ENOENT** 而不是 **EEXIST**，
 * 两个锁函数都把它当「意外错误」重新抛出，构建直接失败。
 *
 * 这个坑只在干净检出上出现（本地通常已有历史 ``dist/`` 兜着），所以是「本地绿、CI 红」：
 * 2026-10-10 的 Docker #14 就栽在这里，且因为 ``dist/`` 是首次构建，四个架构全挂。
 */
function ensureLockParent(lockPath: string): void {
  fs.mkdirSync(dirname(lockPath), { recursive: true })
}

/** 跨进程互斥：`wx` 创建锁文件，持有期间执行 fn（或 await 异步 fn）。 */
async function withFileLock(lockPath: string, fn: () => void | Promise<void>): Promise<void> {
  const deadline = Date.now() + 180_000
  ensureLockParent(lockPath)
  while (true) {
    try {
      const fd = fs.openSync(lockPath, 'wx')
      try {
        await fn()
      } finally {
        fs.closeSync(fd)
        try {
          fs.unlinkSync(lockPath)
        } catch {
          /* ignore */
        }
      }
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'EEXIST') throw err
      if (Date.now() > deadline) {
        throw new Error(`等待锁超时：${lockPath}（可能有崩溃残留，删掉后重试）`)
      }
      await sleep(50)
    }
  }
}

/**
 * 整次主应用构建互斥（watch-build 与手工 ``vite build`` 不能重叠）。
 * 旁路目录虽已按 pid 隔离，Rolldown 多环境 / 工具链仍可能踩到同一 live 树；
 * 重叠时最常见症状就是 closeBundle 里只剩经典 IIFE、public CSS 全丢。
 */
const buildLockPath = `${finalOutDir}.build.lock`

/**
 * 跨进程发布锁：覆盖进线上 ``frontend/`` + ``pruneStale`` 必须互斥，否则会出现
 * EEXIST / 「A 的 prune 删掉 B 刚拷进去的 CSS」。
 */
const publishLockPath = `${finalOutDir}.publish.lock`

/**
 * 把旁路 ``frontend.building.<pid>`` 发布进线上 ``frontend/``，且**不删掉线上根目录**。
 *
 * 不能先 rename 掉线上根目录再换入：空窗期 ``/static`` mount 找不到目录，请求会落到 SPA
 * 外壳（text/html），浏览器对 ``shared-*.js`` 报 Strict MIME。做法是先覆盖拷贝
 * （``index.html`` 最后），再修剪旧 hash 文件，全程根路径常在。
 */
async function publishStagingToLive(): Promise<void> {
  if (!fs.existsSync(outDir)) return
  await withFileLock(publishLockPath, () => {
    fs.mkdirSync(finalOutDir, { recursive: true })
    // 发布时排除两类目录：
    //   - ``modules``：运行期模块由 vite.runtime.config.ts 独立写入，不归本构建管；
    //   - ``.vite``：``manifest: true`` 会让 Vite 产出 ``outDir/.vite/manifest.json``，
    //     线上无任何消费方（后端白名单读 ``public-static.json`` 与 runtime ``manifest.json``），
    //     属构建缓存，不应进 dist。
    const entries = fs.readdirSync(outDir).filter(
      (name) => name !== 'modules' && name !== '.vite',
    )
    // 先资源后外壳：避免新 index 已上线却仍缺新 hash chunk。
    const ordered = [
      ...entries.filter((name) => name !== 'index.html'),
      ...entries.filter((name) => name === 'index.html'),
    ]
    for (const name of ordered) {
      const from = resolve(outDir, name)
      const to = resolve(finalOutDir, name)
      fs.cpSync(from, to, { recursive: true, force: true })
    }
    for (const bucket of ['static'] as const) {
      pruneStale(resolve(finalOutDir, bucket), resolve(outDir, bucket))
    }
    // 根层残留清理：删掉本次未发布的顶层条目（旧 ``.vite/``、调试用 ``__fridge_*.html``、
    // 已删除的入口等），但保留运行期模块目录 ``modules``。原先只剪 assets/static 两层，
    // 于是根目录的脏文件会随每次增量发布一直留着。
    const publishedTop = new Set(ordered)
    for (const dirent of fs.readdirSync(finalOutDir, { withFileTypes: true })) {
      if (dirent.name === 'modules' || publishedTop.has(dirent.name)) continue
      fs.rmSync(resolve(finalOutDir, dirent.name), { recursive: true, force: true })
    }
    fs.rmSync(outDir, { recursive: true, force: true })
  })
}

/** Vite 已在 renderStart 拷过 public；收尾前再镜像一次，抵消并发/半残旁路。 */
function mirrorPublicDirIntoStaging(): void {
  const publicDir = resolve(__dirname, 'public')
  if (!fs.existsSync(publicDir)) return
  fs.cpSync(publicDir, outDir, { recursive: true, force: true })
}

/** SPA 唯一入口（`SPA_ENTRY` 与商店共用，见 ops/vite/build-helpers.ts）。 */

/**
 * 构建期资源版本清单：`resource-version.json`（16 位小写十六进制内容哈希）。
 *
 * 为什么需要它：Vite 打出来的 chunk 自带内容哈希，URL 变了内容才变，缓存天然安全。
 * 但还有一批**稳定 URL** —— `core/stage.css`、各路由首屏样式表、`static/*.css`、外壳
 * 引用的经典脚本 —— 它们的 URL 不随内容变化。后端把这些 URL 拼进 HTML 时只能靠
 * `ETag` 回源协商，一旦中间层（Service Worker / 共享缓存 / 代理）拿旧响应顶回来，
 * 就会出现「新外壳 + 旧资源」混跑（症状是页面白屏或交互脚本半残）。
 *
 * 机制：本函数算出唯一的 revision，然后
 *   1. 写 `resource-version.json` —— 后端 `platform/core/frontend_resources.py` 读它，
 *      给拼出来的 URL 补 `?v=<revision>`；
 *   2. 给外壳 HTML 里**非哈希**的 `/static/**` 引用补同一个 `?v=`（与后端拼的完全一致，
 *      同一份文件全站只有一个 URL）；
 *   3. 把 `sw.js` 的缓存名换成 `…-<revision>`：升级后旧壳缓存整体作废。
 *
 * 哈希口径：路径 + 文本类文件内容（js/css/html/json）+ 其它文件的尺寸。GLB 之类的二进制
 * 只取尺寸 —— 它们有 60MB+，逐字节哈希会把构建尾巴拖长，而这类文件换内容几乎必然换尺寸。
 */
const RESOURCE_VERSION_FILE = 'resource-version.json'
/** 构建输入里按**内容**参与哈希的扩展名（稳定 URL 的 CSS/JS 尺寸不变也要换 revision）。 */
const RESOURCE_VERSION_TEXT_EXTENSIONS = /\.(?:js|css|html|json)$/
/** 不参与哈希、也不参与改写的产物（本函数自己写的、体积分析报告、Vite 内部清单）。 */
const RESOURCE_VERSION_SKIP = new Set([RESOURCE_VERSION_FILE, 'bundle-stats.html'])
/** `sw.js` 里被替换的版本占位符。开发态原样保留，命名退化为固定值、不影响功能。 */
const RESOURCE_VERSION_TOKEN = '__HOMEOS_RESOURCE_REVISION__'

function computeResourceRevision(): string {
  const hash = crypto.createHash('sha256')
  const relatives = walkFiles(outDir)
    .map((file) => file.slice(outDir.length + 1).replace(/\\/g, '/'))
    .filter((rel) => !RESOURCE_VERSION_SKIP.has(rel) && !rel.startsWith('.vite/'))
    .sort()
  for (const rel of relatives) {
    hash.update(rel)
    hash.update('\0')
    if (RESOURCE_VERSION_TEXT_EXTENSIONS.test(rel)) {
      hash.update(fs.readFileSync(resolve(outDir, rel)))
    } else {
      hash.update(String(fs.statSync(resolve(outDir, rel)).size))
    }
    hash.update('\n')
  }
  return hash.digest('hex').slice(0, 16)
}

/**
 * 给外壳 HTML 里的稳定 URL 补 `?v=`。
 *
 * 只改**非哈希**引用：`/static/assets/**`（Vite chunk，名里自带内容哈希）与
 * `/static/vendor/**`（路径里带库版本）保持原样 —— 给它们再叠一层 `?v=` 只会让同一个
 * 文件出现两个 URL，正是上游 0.8.1 缓存混用的成因。
 */
function stampShellResourceUrls(html: string, revision: string): string {
  return html.replace(
    /(src|href)=(["'])(\/static\/[^"'?]+)(\?[^"']*)?(["'])/g,
    (match: string, attr: string, open: string, path: string, _query: string, close: string) => {
      if (path.startsWith('/static/assets/') || path.startsWith('/static/vendor/')) return match
      return `${attr}=${open}${path}?v=${revision}${close}`
    },
  )
}

function writeResourceVersion(): void {
  const revision = computeResourceRevision()
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(
    resolve(outDir, RESOURCE_VERSION_FILE),
    `${JSON.stringify({ revision, note: '构建期内容哈希：后端据此给稳定 URL 补 ?v=，SW 缓存名随之变化。' }, null, 2)}\n`,
    'utf8',
  )
  const htmlPath = resolve(outDir, SPA_ENTRY)
  if (fs.existsSync(htmlPath)) {
    const html = fs.readFileSync(htmlPath, 'utf8')
    const stamped = stampShellResourceUrls(html, revision)
    if (stamped !== html) fs.writeFileSync(htmlPath, stamped, 'utf8')
  }
  const swPath = resolve(outDir, 'sw.js')
  if (fs.existsSync(swPath)) {
    const source = fs.readFileSync(swPath, 'utf8')
    // 缺占位符就别「静默跳过」：缓存名会退化成固定值，升级后旧壳缓存不会作废 ——
    // 这正是本机制要消灭的病，所以让构建直接失败，而不是把问题留到线上。
    if (!source.includes(RESOURCE_VERSION_TOKEN)) {
      throw new Error(
        `sw.js 缺少资源版本占位符 ${RESOURCE_VERSION_TOKEN}：SW 缓存名将退化为固定值，升级后会混用旧缓存`,
      )
    }
    fs.writeFileSync(swPath, source.split(RESOURCE_VERSION_TOKEN).join(revision), 'utf8')
  }
}

const isProduction = process.env.NODE_ENV === 'production'
/** 开发代理目标：127.0.0.1 避免 Windows 下 localhost → IPv6 导致 ECONNREFUSED */
const backendDevTarget = 'http://127.0.0.1:8801'

/**
 * 开发代理/WebSocket 断连时的可忽略错误码（重连、刷新、后端重启均属正常）。
 *
 * ``EPIPE`` 与上面几个同源，只是触发点更靠后：对端先关（浏览器刷新页面、或 uvicorn
 * ``--reload`` 重启后端），而代理手里还有一帧没写完，写就抛 ``write EPIPE``（栈顶是
 * ``Socket.ondata`` → ``Writable.write``）。它不代表代码有问题——紧随其后就是
 * ``ECONNRESET`` 与重连成功，所以和 ECONNRESET 归一类，不打完整栈。
 */
const BENIGN_PROXY_ERROR_CODES = new Set(['ECONNABORTED', 'ECONNRESET', 'ECONNREFUSED', 'EPIPE'])

function isBenignProxyError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | undefined)?.code
  return !!code && BENIGN_PROXY_ERROR_CODES.has(code)
}

const BACKEND_UNAVAILABLE_HINT =
  '后端暂未就绪，请先运行 bun run dev:backend，稍后刷新'

/** 后端未就绪时返回 503 JSON，避免浏览器看到含糊的 500 Internal Server Error */
function respondBackendUnavailable(res: unknown): void {
  const r = res as {
    headersSent?: boolean
    writeHead?: (code: number, headers: Record<string, string>) => void
    end?: (body: string) => void
  } | null
  if (!r || r.headersSent || typeof r.writeHead !== 'function' || typeof r.end !== 'function') return
  try {
    r.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' })
    r.end(
      JSON.stringify({
        statusCode: 503,
        message: BACKEND_UNAVAILABLE_HINT,
      }),
    )
  } catch {
    /* 响应可能已关闭 */
  }
}

/** 良性代理失败节流日志，避免启动竞态时刷屏 */
let lastBenignProxyLogAt = 0
function logBenignProxyOnce(err: unknown): void {
  const code = (err as NodeJS.ErrnoException | undefined)?.code
  // EPIPE 说明对端是「先关掉」的一方（页面刷新 / 后端重启），后端本身可能活得好好的，
  // 打「请先运行 bun run dev:backend」只会把人往错方向带，干脆静默。
  if (code === 'EPIPE') return
  const now = Date.now()
  if (now - lastBenignProxyLogAt < 15_000) return
  lastBenignProxyLogAt = now
  console.warn(`[vite] ${BACKEND_UNAVAILABLE_HINT}${code ? `（${code}）` : ''}`)
}

/** HTTP/WS 代理共享：抑制良性断连日志，并对 HTTP 返回可读的 503 */
const proxyErrorHandling = {
  configure: (proxy: any) => {
    proxy.on('error', (err: any, _req: unknown, res: unknown) => {
      if (isBenignProxyError(err)) {
        logBenignProxyOnce(err)
        respondBackendUnavailable(res)
        return
      }
      console.warn('[vite proxy error]', err?.message || err)
      respondBackendUnavailable(res)
    })
    proxy.on('proxyReqWs', (_proxyReq: unknown, _req: unknown, socket: NodeJS.EventEmitter) => {
      socket.on('error', (err: NodeJS.ErrnoException) => {
        if (isBenignProxyError(err)) return
        console.warn('[vite ws proxy socket error]', err?.message || err)
      })
    })
  },
}

const sharedRoot = resolve(__dirname, '../../packages/shared')

/** Rolldown entriesAware 会拼出 app-merge~A~B~C 超长名，统一收成 shared */
function sanitizeChunkBaseName(name?: string): string {
  if (!name) return 'chunk'
  const base = name.replace(/\.[^.]+$/, '')
  if (base.includes('~') || base.startsWith('app-merge') || base.startsWith('shared~')) {
    return 'shared'
  }
  return base
}

const baseLogger = createLogger()
const customLogger = {
  ...baseLogger,
  warn(msg: string, options?: Parameters<typeof baseLogger.warn>[1]) {
    if (String(msg).includes('PLUGIN_TIMINGS')) return
    baseLogger.warn(msg, options)
  },
  info(msg: string, options?: Parameters<typeof baseLogger.info>[1]) {
    if (String(msg).includes('PLUGIN_TIMINGS')) return
    baseLogger.info(msg, options)
  },
  error(msg: string, options?: Parameters<typeof baseLogger.error>[1]) {
    const text = String(msg)
    const err = (options as { error?: unknown } | undefined)?.error
    // 配置变更触发重启时，进行中的 transform/HTML 请求会抛此错，随后会打印 server restarted
    if (
      text.includes('Request is outdated') ||
      text.includes('The server is being restarted or closed')
    ) {
      return
    }
    const benignHttpProxy =
      text.includes('http proxy error') &&
      (isBenignProxyError(err) || /ECONNREFUSED|ECONNRESET|ECONNABORTED/.test(text))
    const benignWsProxy =
      (text.includes('ws proxy error') || text.includes('ws proxy socket error')) &&
      isBenignProxyError(err)
    if (benignHttpProxy || benignWsProxy) {
      if (benignHttpProxy) logBenignProxyOnce(err ?? text)
      return
    }
    baseLogger.error(msg, options)
  },
}

/**
 * 构建收尾（必须在同一 ``closeBundle`` 内严格串行）：
 *   1. 经典 IIFE → `/static/**.js`
 *   2. 按产物实存生成匿名白名单 `public-static.json`
 *   3. 旁路目录覆盖发布到线上 `dist/homeos/frontend`
 *
 * 拆成多个插件时，Rolldown/Vite 可能并行跑各自的 closeBundle；再叠加 watch-build
 * 与手工构建共用固定旁路名时的 emptyOutDir，就会出现「只缺 appearance / auth/scene
 * CSS」这种假阴性（IIFE 被本进程重写，public 拷贝被另一进程清掉）。
 */
function isClientBuildEnvironment(pluginCtx: { environment?: { name?: string } }): boolean {
  // Vite 8 多环境：worker 子构建也会跑 apply:'build' 的插件。收尾 / 锁只跟 client。
  const name = pluginCtx.environment?.name
  return !name || name === 'client'
}

function pidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function releaseBuildLock(fd: number | null): null {
  if (fd === null) return null
  try {
    fs.closeSync(fd)
  } catch {
    /* ignore */
  }
  try {
    fs.unlinkSync(buildLockPath)
  } catch {
    /* ignore */
  }
  return null
}

/** 同步拿锁：Rolldown 若未 await 异步 buildStart，异步锁会失效。 */
function acquireBuildLockSync(): number {
  const deadline = Date.now() + 180_000
  ensureLockParent(buildLockPath)
  while (true) {
    try {
      const fd = fs.openSync(buildLockPath, 'wx')
      try {
        fs.writeSync(fd, `${process.pid}\n`)
      } catch {
        /* 锁文件有 fd 即可 */
      }
      return fd
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
      try {
        const holder = Number(fs.readFileSync(buildLockPath, 'utf8').trim())
        if (!pidAlive(holder)) fs.unlinkSync(buildLockPath)
      } catch {
        /* 读/删失败则继续等 */
      }
      if (Date.now() > deadline) {
        throw new Error(`等待构建锁超时：${buildLockPath}（删掉残留锁后重试）`)
      }
      try {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
      } catch {
        // SharedArrayBuffer/Atomics 不可用时退化为空转片刻
        const end = Date.now() + 50
        while (Date.now() < end) {
          /* spin */
        }
      }
    }
  }
}

function finalizeBuildPlugin(): Plugin {
  let buildLockFd: number | null = null
  let finalized = false

  async function tryFinalize(): Promise<void> {
    if (finalized) return
    const indexPath = resolve(outDir, SPA_ENTRY)
    if (!fs.existsSync(indexPath)) return
    finalized = true
    mirrorPublicDirIntoStaging()
    await writeClassicIifeBundles(outDir)
    updatePublicStaticManifest()
    // 资源版本必须在白名单之后：`public-static.json` 也要参与哈希，revision 才是「整个
    // 产物」的指纹。它写进 staging，随后随 publish 一起上线。
    writeResourceVersion()
    await publishStagingToLive()
  }

  return {
    name: 'homeos-finalize-build',
    apply: 'build',
    buildStart() {
      if (!isClientBuildEnvironment(this)) return
      cleanStaleStagingDirs()
      finalized = false
      buildLockFd = acquireBuildLockSync()
    },
    buildEnd(error) {
      // 未产出时可能不会走 writeBundle；失败路径释放锁。
      if (error && isClientBuildEnvironment(this) && !finalized) {
        buildLockFd = releaseBuildLock(buildLockFd)
      }
    },
    // index.html 可能在 writeBundle 之后才由 html 插件落盘，故两处都试。
    async writeBundle() {
      if (!isClientBuildEnvironment(this)) return
      try {
        await tryFinalize()
      } finally {
        if (finalized) buildLockFd = releaseBuildLock(buildLockFd)
      }
    },
    async closeBundle() {
      if (!isClientBuildEnvironment(this)) return
      try {
        await tryFinalize()
        if (!finalized) {
          const assetsDir = resolve(outDir, 'static', 'assets')
          const hasAssets =
            fs.existsSync(assetsDir) && fs.readdirSync(assetsDir).length > 0
          // 有产物却没有外壳 = 产物不完整（真·空构建不在这里报错）；报错内容由共用助手
          // 统一给出 outDir 实际清单 —— 缺外壳时第一个要回答的就是「目录里到底有没有东西」。
          if (hasAssets) {
            assertSpaShellPresent(outDir, '产物不完整；请重跑 bun run build:app。')
          }
        }
      } finally {
        buildLockFd = releaseBuildLock(buildLockFd)
      }
    },
  }
}

/** 外置运行时库目录：内容随构建产物一起发布，且被构建产物以根绝对 URL 引用。
 *
 * 用**目录**而不是单文件登记：three 的 addon 之间还有内部 import
 * （``three.module.min.js`` → ``three.core.min.js``），只补一半等于没补。
 * 新增外置库（并在 ``vite-studio.ts`` 里产出绝对 URL）时把目录加进这里。
 */
const ANONYMOUS_VENDOR_DIRS = ['static/vendor/three'] as const

/**
 * 生成 `/static` 匿名白名单（`dist/homeos/frontend/public-static.json`）。
 *
 * 后端用它判定「未登录也必须能加载」的静态资源：白名单**之外**的 `/static/**` 一律要求
 * 已登录会话（见 backend/src/bootstrap/studio_shell.py）。种子清单是 `public-static.seed.json`。
 */
function updatePublicStaticManifest(): void {
  const seedPath = resolve(__dirname, 'public-static.seed.json')
  const manifestPath = resolve(outDir, 'public-static.json')
  const seed = fs.existsSync(seedPath) ? seedPath : manifestPath
  if (!fs.existsSync(seed)) return
  let payload: {
    _comment?: unknown
    files: Array<string | { path: string; why?: string }>
    alwaysRevalidate?: Array<string | { path: string; why?: string }>
  }
  try {
    payload = JSON.parse(fs.readFileSync(seed, 'utf8'))
  } catch {
    return
  }
  const discovered = new Set<string>()
  // SPA 入口是未登录唯一会下发的 HTML：它引用的 `/static/**`（入口 chunk、其
  // modulepreload 依赖、外壳样式、经典启动脚本）就是未登录也必须可加载的全集。
  // 认证后视图是懒加载 chunk，不出现在这里，因此继续受登录门禁保护。
  const htmlPath = resolve(outDir, SPA_ENTRY)
  if (fs.existsSync(htmlPath)) {
    const html = fs.readFileSync(htmlPath, 'utf8')
    for (const match of html.matchAll(/(?:src|href)=["'](\/static\/[^"']+)["']/g)) {
      discovered.add(match[1])
    }
  }
  for (const stable of [
    '/static/logging/client-log.js',
    '/static/display/display-boot.js',
    '/static/display/display-startup.js',
    '/static/auth/scene/scene-depth.js',
    // 认证页样式表由 App.vue 在运行时插入 <head>，不在 SPA 入口里，需显式登记。
    '/static/auth/scene/fonts.css',
    '/static/auth/scene/page.css',
    '/static/auth/scene/scene.css',
    '/static/auth/scene/panel.css',
    '/static/appearance.css',
  ]) {
    discovered.add(stable)
  }
  const kept: Array<{ path: string; why: string }> = []
  const seen = new Set<string>()
  const pruned: string[] = []
  for (const item of payload.files || []) {
    const p = typeof item === 'string' ? item : item.path
    if (!p?.startsWith('/static/')) continue
    if (seen.has(p)) continue
    // 种子清单记的是逻辑路径，而产物可能带内容哈希或按域归入子目录，因此按产物
    // 实际存在与否筛一遍，只保留真正落盘的路径。
    // 注意：被剪掉的条目**不占用 seen** —— 否则「种子缺条目 → 剪掉 → 又被 HTML
    // 发现」的同一路径会被 seen 挡在补回分支之外，最终静默 401（见下方 discovered 循环）。
    if (!fs.existsSync(resolve(outDir, p.replace(/^\//, '')))) {
      pruned.push(p)
      continue
    }
    seen.add(p)
    kept.push({ path: p, why: typeof item === 'object' && item.why ? item.why : '' })
  }
  // index.html 与登记清单引用的静态资源是**硬要求**：产物缺失就是每个页面稳定 404
  // （静态处理回 JSON 错误信封，浏览器还会再报一次「MIME 类型不可执行」）。
  // 这类缺口不能只 warn —— 曾经 ``auth/scene/scene-depth.ts`` 在应用树合并时随
  // ``app/auth/**`` 一并丢失，``vite-studio.ts`` 的入口指向不存在的文件却**不报错、
  // 只是不产出**，白名单照样登记，于是登录页首帧前 404、``hos-touch`` 手持档全失效。
  const missing: string[] = []
  for (const p of [...discovered].sort()) {
    if (!fs.existsSync(resolve(outDir, p.replace(/^\//, '')))) {
      missing.push(p)
      continue
    }
    if (seen.has(p)) continue
    seen.add(p)
    kept.push({ path: p, why: 'SPA 入口引用的匿名静态资源，必须匿名可加载。' })
  }
  if (missing.length > 0) {
    throw new Error(
      `以下匿名静态资源被 index.html 或登记清单引用，但构建产物里不存在（线上会稳定 404）：\n  ${missing.join('\n  ')}\n` +
        '常见原因：① 源文件缺失（vite 入口指向不存在的文件时不会报错、只是不产出）；' +
        '② 并发构建清空了旁路 dist（应已由 frontend.building.<pid> 隔离）。请补齐源文件或重跑构建。',
    )
  }
  // 哈希构建产物（``static/assets/**``）整体匿名可加载。
  //
  // 这些 chunk 原来放在根级 ``/assets/**``，根本不过登录门禁；搬进 ``/static/`` 之后，
  // 若只登记 index.html 直接引用的那几个，展示页（``/display/**``、``/homeos/**``）
  // 与 ``/3d-studio``、``/guest`` 的懒加载 chunk 会被 ``ProtectAssetsMiddleware``
  // 判成「白名单之外的 /static 资源」一律 401 —— 外壳能下发、页面却白屏。
  //
  // 按现实产物逐个登记（不改成后端的前缀豁免）：保持「白名单之外一律受保护」的默认语义，
  // 各项目真实加载了哪些文件仍然可审计。目录里也包含 public 的 icons / manifest，
  // 它们要么已被种子清单登记、要么已被 index.html 发现，``seen`` 会去重。
  const buildOutputRoot = resolve(outDir, 'static/assets')
  for (const file of walkFiles(buildOutputRoot)) {
    const urlPath = `/${file.slice(outDir.length + 1).replace(/\\/g, '/')}`
    if (seen.has(urlPath)) continue
    seen.add(urlPath)
    kept.push({ path: urlPath, why: '构建产物哈希 chunk，未登录的公开页也要加载。' })
  }
  // 外置运行时库（``/static/vendor/**``）与上面的哈希 chunk 是同一类东西：构建产物的
  // 一部分，只是没有内容哈希。studio chunk 用**根绝对 URL** 静态 import 它们
  // （见 vite-studio.ts：three 的 addon 全部走 ``/static/vendor/three/<版本>/``），
  // 因此漏登记的症状和漏登记的哈希 chunk 一模一样 —— 只是更难认：
  //
  //   GET /static/vendor/three/0.186.1/OrbitControls.js  401（或门禁变体回 404）
  //   ☠ Failed to fetch dynamically imported module: shared-xxxx.js
  //
  // 浏览器只会指到那个 lazy chunk，而真正缺的是它的静态依赖；StudioView 直接进
  // ErrorBoundary，整页白屏。``three.core.min.js`` 是 ``three.module.min.js`` 的内部
  // import，也必须一起登记，否则补了一半仍然失败。
  for (const vendorDir of ANONYMOUS_VENDOR_DIRS) {
    const root = resolve(outDir, vendorDir)
    for (const file of walkFiles(root)) {
      const urlPath = `/${file.slice(outDir.length + 1).replace(/\\/g, '/')}`
      if (seen.has(urlPath)) continue
      seen.add(urlPath)
      kept.push({ path: urlPath, why: '外置运行时库，构建产物的一部分，匿名页也要加载。' })
    }
  }
  payload.files = kept
  // 记录被筛掉的种子条目，方便核对「是不是真有资源漏了」而不是被静默吞掉。
  ;(payload as Record<string, unknown>)._prunedStaleSeed = pruned.sort()
  if (pruned.length > 0) {
    console.warn(
      `[homeos] 匿名白名单筛掉 ${pruned.length} 条不存在的种子条目：\n  ${pruned.join('\n  ')}`,
    )
  }
  const revalidate = new Set<string>()
  for (const p of discovered) {
    if (p.endsWith('.js') || p.endsWith('.css')) revalidate.add(p)
  }
  payload.alwaysRevalidate = [...revalidate].sort().map((p) => ({
    path: p,
    why: '入口页构建产物，内容变化即换 URL/必须回源。',
  }))
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(manifestPath, JSON.stringify(payload, null, 2) + '\n', 'utf8')
}

export default defineConfig(async ({ mode }): Promise<UserConfig> => {
  // 体积分析开关：`ANALYZE=1`（POSIX 风格 env）或 `--mode analyze`（跨平台，脚本用这个）。
  // 原先只有 env 一条路，而脚本写成 `set ANALYZE=1&& vite build`（Windows 语法）：
  // 在 macOS / Linux 上 `set` 只是打印变量，**分析插件根本没启用**，产物里没有
  // bundle-stats.html，却也不报错 —— 一条静默空转的入口，故补上 --mode 这条。
  const analyzeBundle = process.env.ANALYZE === '1' || mode === 'analyze'
  const plugins: UserConfig['plugins'] = [
    embedProxyFallbackPlugin(),
    rootAssetsPlugin(),
    devNoCachePlugin(),
    // 3D Studio 外置契约：three → /static/vendor 绝对 URL；/api/** 运行时资源原样保留。
    vendorResolvePlugin(),
    runtimeUrlExternalPlugin(),
    runtimeVendorAssetPlugin(),
    // `includeAbsolute: false` 是必须的，不是洁癖。
    //
    // `@vitejs/plugin-vue` 默认把模板里的**根绝对 URL** 也当成资源引用
    // （dev 下 `includeAbsolute: !!config.base`，base 恒为 `/` → true；build 下无条件 true），
    // 于是 `<img src="/static/assets/icons/*.svg">` 被编译成
    // `import _imports_0 from "/static/assets/icons/*.svg?import"`。
    // build 里它最终还能落回 URL 字符串，但 dev 下这条 import 是一个**真实的模块请求**：
    // 它先被 `rootAssetsPlugin` 的 `/static/**` 中间件按磁盘文件直读（`image/svg+xml`），
    // 浏览器随即报 `Failed to load module script: Expected a JavaScript-or-Wasm module
    // script but the server responded with a MIME type of "image/svg+xml"`。
    // 这些路径本来就该原样保留（public 下的稳定 URL），不参与模块图。
    vue({ template: { transformAssetUrls: { includeAbsolute: false } } }),
    tailwindcss(),
  ]
  if (analyzeBundle) {
    const { visualizer } = await import('rollup-plugin-visualizer')
    // 必须在 finalize 之前写入旁路目录，否则 publish 后 staging 已删。
    plugins.push(
      visualizer({ filename: resolve(outDir, 'bundle-stats.html'), gzipSize: true, open: false }),
    )
  }
  // 最后：IIFE → 匿名白名单 → 发布到线上 dist（同一 closeBundle 内串行）。
  plugins.push(finalizeBuildPlugin())

  return {
    // 显式固定 root。Vite 的 root 默认取 cwd（不是配置文件所在目录），而 `ops/dev.mjs`
    // 是以 cwd=<repo>/homeos 拉起本配置的，于是站点根会变成 `homeos/` → `/`（index.html 在
    // `frontend/` 下）与 `/src/**` 全部 404，横幅与 README 印的 8805 根地址打不开。
    // 构建路径（`bun run --cwd frontend build`）的 cwd 本就是本目录，故这里是等值固定。
    // 授权商店在 homeos-store/frontend/vite.config.ts 里同样显式指定了 root。
    root: __dirname,
    // 预打包缓存落在工作区根，避免默认 node_modules/.vite 在 frontend 下再长出 node_modules。
    cacheDir: resolve(__dirname, '../../node_modules/.vite/homeos-dashboard'),
    /**
     * 预打包清单：`echarts/*` 的子入口**只出现在运行期动态 import 里**
     * （`components/widgets/widget-registry.ts` → `HomeClimateChartWidget.vue` →
     * `components/widgets/climate/home-climate-chart/useHomeClimateChart.ts` →
     * `import('@/shared/utils/chart/echarts')`），启动期的依赖扫描发现不了它们。
     *
     * 不显式列出的后果：首页仪表盘第一次真正要画图表时才「发现」这 4 个依赖，Vite 当场重新
     * 预打包并重启服务。这一两秒窗口里该动态 import 报
     * `Failed to fetch dynamically imported module`、在途的 `/api/v1/**` 全变
     * `TypeError: Failed to fetch`，而这两类错误恰好命中前端的自愈重载
     * （`public/static/boot-guard.js` 与 `shared/utils/core/lazy-component.ts`）→ 每次刷新后的
     * 页面都能正常渲染、接着又失败 → **整页刷新被反复触发（实测 1.3s 一次，持续数分钟）**。
     *
     * 列进来之后它们在服务启动时就打包好，`_metadata.json` 里也不再出现「运行期新增依赖」。
     */
    optimizeDeps: {
      include: ['echarts/core', 'echarts/charts', 'echarts/components', 'echarts/renderers'],
    },
    customLogger,
    plugins,
    resolve: {
      extensions: ['.mjs', '.ts', '.tsx', '.mts', '.js', '.jsx', '.json'],
      alias: [
        { find: 'vue', replacement: 'vue/dist/vue.esm-bundler.js' },
        { find: '@', replacement: resolve(__dirname, 'src') },
        // 必须「精确匹配」：字符串 find 在 Vite 里是**前缀匹配**（`find` 或 `find + '/'` 都算命中），
        // 写成 `'@homeos/shared': <abs>/src/index.ts` 会把 `@homeos/shared/components/*.vue`、
        // `.../scene/*`、`.../utils/*` 这些子路径也吞掉，改写成 `<abs>/src/index.ts/components/...`
        // 后静默解析失败（症状是 store/主应用的 HTML 产物整份不落盘、只在 closeBundle 报「SPA 入口缺失」）。
        // 子路径一律交给共享包自己的 `exports` 映射；两条路径都指向源码，不依赖共享包先 build。
        { find: /^@homeos\/shared$/, replacement: resolve(sharedRoot, 'src/index.ts') },
        // 3D Studio 源码别名。
        { find: '@app', replacement: resolve(__dirname, 'src/studio/app') },
        { find: '@runtime', replacement: resolve(__dirname, 'src/studio/runtime') },
        // 只把 `controls.css` 这一条 `@import` 指到磁盘，**不要**通配整个 `/static/**`。
        //
        // 起因：`controls.css` 实体在 `public/` 里（`bridge.css` 以 URL 逐字伺服时按
        // `/static/...` 引用它）。dev 下 `runtime.css` / `stage.css` 的
        // `@import "/static/modules/interaction3d/controls.css"` 走的是**模块解析器**，
        // 会被当成「相对 root 的 /static/...」→ `frontend/static/...` 不存在，`@tailwindcss/vite`
        // 在 transform 阶段 resolve @import 时直接抛
        // `Can't resolve '/static/modules/interaction3d/controls.css'`，令 import 这两个 CSS 的
        // dev 页面整片样式 500。
        //
        // 为什么不能写成 `/^\/static\/(?!vendor\/)/` 通配：Vue 模板里的
        // `<img src="/static/assets/icons/*.svg">` 会被编译成一条真实的模块 import，通配别名会把它
        // 解析到 `public/` 里的磁盘文件，于是 dep scan 把它改写成
        // `/public/static/assets/icons/*.svg?import`（Vite 对「从 public 目录 import」的告警 + 多一跳），
        // 而它本来只该原样保留 `/static/...` 这个 URL。`/static/vendor/**` 同理属于外置契约
        // （three 以根绝对 URL 加载，见 vite-studio.ts），任何通配都会把它拉进 bundle。
        //
        // 字符串 find 在 Vite 里是「`find` 或 `find + '/'`」前缀匹配，路径本身足够独特，不会误伤。
        {
          find: '/static/modules/interaction3d/controls.css',
          replacement: resolve(__dirname, 'public/static/modules/interaction3d/controls.css'),
        },
        { find: 'three', replacement: THREE_VENDOR },
      ],
      dedupe: ['@homeos/shared'],
    },
    server: {
      fs: {
        allow: [sharedRoot, resolve(__dirname, '..')],
      },
      host: true,
      // 必须与 ops/dev.mjs 的 VITE_3D_PORT / README 的 HMR 地址一致：dev.mjs 不传 --port，
      // 完全以这里为准，而它的端口预检与启动横幅印的是 8805（授权商店为 8806）。
      port: 8805,
      strictPort: true,
      warmup: {
        clientFiles: [
          './src/components/widgets/widget-registry.ts',
          './src/components/widgets/**/*.vue',
        ],
      },
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0',
      },
      hmr: {
        clientPort: 8805,
        timeout: 60_000,
      },
      watch: {
        usePolling: process.platform === 'win32',
        interval: 800,
      },
      proxy: {
        '/health': { target: backendDevTarget, changeOrigin: true, ...proxyErrorHandling },
        // 内嵌反代既走 HTTP（资源/登录）又走 WS（实时通道），须开启 ws；置于 /api 之前以优先匹配
        '/api/v1/embed-proxy': {
          target: backendDevTarget,
          changeOrigin: true,
          ws: true,
          ...proxyErrorHandling,
        },
        // 3D 运行时实时通道（/api/v1/ws/runtime）须开启 ws，否则升级请求会被代理直接关闭
        // （前端表现为 "WebSocket is closed before the connection is established"）。
        // 与 /api/v1/embed-proxy 同理：置于 /api 之前以优先匹配。
        // 但绝不能开 changeOrigin：websocket_origin_allowed() 同样按 Origin↔Host 判定同源，
        // 改写 Host 会让后端看到 127.0.0.1:8801 而浏览器 Origin 是 http://localhost:8805，
        // 握手在 accept 之前就被 4403「页面来源未获允许」拒绝，前端只能无限重连。
        '/api/v1/ws': {
          target: backendDevTarget,
          ws: true,
          ...proxyErrorHandling,
        },
        // 故意不开 changeOrigin：同源写入守卫（backend/src/platform/security/request_origin.py）在未配置
        // APP_BASE_URL 时以 Origin↔Host 比较判定同源。改写 Host 会让浏览器 Origin
        // （http://localhost:8805）与后端看到的 Host（http://127.0.0.1:8801）不一致，
        // 导致所有受守卫的写请求（如 interaction3d 渲染缓存 PUT）被 403。
        // 保留浏览器原 Host 后两侧一致，守卫按设计放行。
        '/api': { target: backendDevTarget, ...proxyErrorHandling },
        '/backgrounds': { target: backendDevTarget, changeOrigin: true, ...proxyErrorHandling },
        '/icons': { target: backendDevTarget, changeOrigin: true, ...proxyErrorHandling },
        '/engine.io': {
          target: backendDevTarget,
          changeOrigin: true,
          ws: true,
          ...proxyErrorHandling,
        },
        '/socket.io': {
          target: backendDevTarget,
          changeOrigin: true,
          ws: true,
          ...proxyErrorHandling,
        },
      },
    },
    worker: {
      format: 'es',
      rollupOptions: {
        // Worker 子构建是独立的 rollup 调用，不继承主构建的 external，必须再声明一次。
        external: isRuntimeExternal,
        output: {
          entryFileNames: 'static/assets/[name]-[hash].js',
          chunkFileNames: 'static/assets/[name]-[hash].js',
        },
      },
    },
    build: {
      outDir,
      // 只清空旁路 ``frontend.building``；线上 ``frontend/`` 在 closeBundle 原子替换前保持可伺服。
      emptyOutDir: true,
      /**
       * 哈希产物落在 ``static/assets/``（与商店同构）：
       *   - ``static/`` 是后端的挂载根（``/static``），``assets/`` 是它下面的产物层；
       *   - 旧布局把 chunk 放在根级 ``assets/``、另挂一个 ``/assets``，与商店不一致，
       *     后端还多一份挂载点与 dev 兜底要维护；
       *   - 不分子目录：js / css 同层，与商店 ``assets/<name>-<hash>`` 一致；
       *   - ``static/assets/icons`` / ``static/assets/manifest`` 是 public 里的随包素材，
       *     与本层共存在同一父目录但互不覆盖（chunk 名字带内容哈希）。
       * 注意 ``assetsDir`` 只对未显式给出 ``assetFileNames`` 的产物生效（Worker 已经
       * 在 ``worker.rollupOptions`` 里另写模板），这里仍保持一致，避免只看这一行误判。
       */
      assetsDir: 'static/assets',
      manifest: true,
      sourcemap: false,
      /**
       * Vite 8 defaults to lightningcss minify, which rejects Vue `:deep()` /
       * `:slotted()` / `:global()` before plugin-vue can rewrite them
       * (rolldown-vite#573). esbuild minify avoids that noise and also preserves
       * unprefixed backdrop-filter that lightningcss may drop.
       */
      cssMinify: 'esbuild',
      chunkSizeWarningLimit: 1200,
      modulePreload: {
        /**
         * 过滤不需要预加载的依赖：只留下「体积大、且只被懒路由引用」的重型库 chunk，
         * 让浏览器在入口 <script> 之前抢带宽预加载它们反而挤占关键路径。
         *
         * 这里只列**当前真实存在**的 chunk 名。chunk 组去域化之后（见 codeSplitting 注释）
         * 已不存在 popups / widgets-* / settings-* / views-main / shell / security-view 等
         * 命名 chunk，继续把它们写在正则里就是永远匹配不到的悬空分支 —— 正是这份配置
         * 历史上被 scripts/check-vite-chunk-groups.mjs（该脚本已不存在）拦截的那类漂移。
         *
         * `rolldown-runtime` 必须排除：它只有 716B，且是入口依赖图里最深的一层叶子
         * （index → vendor-core → rolldown-runtime），Vite 会把入口 <script> 排在所有
         * <link rel=modulepreload> 之前（见 vite:build-html 的 assetTags 拼装顺序），
         * 因此它的预加载必然与模块图的真实请求同时发出、抢不到任何提前量。
         * 该预加载被浏览器判为「未被使用」（SW 托管的页面还会被归因为 cross-world
         * service worker resource mismatch），在 DevTools 里刷两条噪音警告。
         * 移除后模块图仍会正常静态拉取它，懒加载 chunk 也会经 __vite__mapDeps 按需取。
         */
        resolveDependencies: (_filename, deps) =>
          deps.filter((dep) => !/\/(charts|hls|rolldown-runtime)-/.test(dep)),
      },
      rolldownOptions: {
        // 3D Studio 运行时资源外置：three / /static/vendor/** / /api/** 不进 bundle。
        external: isRuntimeExternal,
        checks: {
          pluginTimings: false,
        },
        output: {
          entryFileNames: 'static/assets/[name]-[hash].js',
          chunkFileNames: (chunk) =>
            `static/assets/${sanitizeChunkBaseName(chunk.name)}-[hash].js`,
          // 扁平一层（不建 js/ css/ 子目录），与商店 `assets/<name>-<hash>` 同构：
          // 同名的 js 与 css 靠扩展名区分，hash 由内容决定，不会互相覆盖。
          assetFileNames: ({ name }) =>
            `static/assets/${sanitizeChunkBaseName(name)}-[hash][extname]`,
          minify: isProduction,
          /**
           * 分包策略：**只给第三方库与 entriesAware 兜底组建命名 chunk**，业务域不再并组。
           * 路径分隔用 [\\/] 以兼容 Windows。
           *
           * 为什么删掉业务域命名组（views-main / settings-* / widgets-* / popups / shell /
           * security-view / shared-app）：rolldown 的 codeSplitting 组会把「命中 test 的模块
           * 连同它独占的整条子图」并成同一个 chunk。这些域里总有模块被 boot 期静态图引用
           * （store / layout / router），于是整个合并结果被入口静态 import，首屏被迫下载
           * 整个域（含只属于懒路由的那部分）。实测（build:app 同一次采样，snapshot 对比）：
           *   原配置（含域组）        entry js 1851.8KB / 11 chunk，entry css 1237.7KB
           *   再给 studio 分层        entry js 2212.2KB（studio-renderer 组把 499KB 拖进首屏）
           *   仅删 views-main        entry js 1715.2KB
           *   删全部业务域组（现状）    entry js  723.2KB /  9 chunk，entry css  192.3KB
           * 结论：域命名组在本项目是**负优化**，首屏 js+css 从 3089.5KB 降到 915.5KB。
           * 代价：懒路由的 CSS 不再由 index.html 预加载，改为导航时经 __vite__mapDeps 拉取。
           *
           * 保留的组只有三类：
           *  1) 第三方库（vendor-vue / vendor-core / lucide / charts / hls）：不会被某个
           *     业务域子图拖成巨型 chunk；
           *  2) shared-registry：把「模块顶层就会被别的模块调用的纯常量/纯函数」隔离成无环叶子 chunk；
           *  3) entriesAware 兜底组 shared：合并跨入口共享的小模块（阈值 48KB），避免碎 chunk。
           * minSize 20_000 继续兜住 1–5KB 碎 chunk：实测 chunk 数 45 → 65，无碎片化问题。
           *
           * 不变量：每组 test 必须至少匹配到一个真实模块（历史漂移：views-auth 等）。
           * 注意 scripts/check-vite-chunk-groups.mjs 在仓库里并不存在，该不变量目前只能人工
           * 核对（本次改动已用脚本逐组验证命中数），改 groups 时请自行复查。
           */
          codeSplitting: {
            minSize: 20_000,
            groups: [
              {
                name: 'vendor-vue',
                test: /node_modules[\\/](vue|vue-router|pinia|@vue)/,
                priority: 40,
              },
              {
                name: 'vendor-core',
                test: /node_modules[\\/](axios|socket\.io-client|socket\.io-msgpack-parser|@vueuse|comlink)/,
                priority: 35,
              },
              { name: 'lucide', test: /node_modules[\\/]@lucide[\\/]vue/, priority: 30 },
              { name: 'charts', test: /node_modules[\\/]echarts/, priority: 28 },
              { name: 'hls', test: /node_modules[\\/]hls\.js/, priority: 28 },
              {
                // 认证页位于 `views/auth/`（Login / Register / License / LicenseRecovery）。
                name: 'views-auth',
                test: /src[\\/]views[\\/]auth[\\/]/,
                priority: 26,
              },
              {
                name: 'vendor-misc',
                test: /node_modules/,
                minSize: 20_000,
                priority: 5,
              },
              {
                // 必须独立成组：registry 下的纯工具（典型：settings-route.util.ts 的
                // SETTINGS_ROUTES）会被业务模块**在模块顶层直接调用**，例如
                // features/settings/composables/system/system-config-sidebar.internals.ts
                // 的 DELEGATED_PANEL_LINKS。若它们和调用方落在共享 chunk 的环里
                // （entriesAware 兜底组曾产生 9 个 shared-* 互环），ESM 跨 chunk 环内被
                // import 的 const 在初始化前是 undefined，读取 `.voice` 会抛
                // TypeError: Cannot read properties of undefined (reading 'voice')，
                // 导致 stage/设置页整体黑屏。隔离成叶子 chunk 后环不再包含它。
                //
                // 内嵌页的图标/主题色注册表同理，而且它们的**消费方写在模块顶层**：
                // shared/utils/ui/main-layout-nav.util.ts 的 TAB_ACCENTS.media 直接取
                // EMBED_TAB_ACCENTS[0]、mainLayoutIconMap 直接展开 embedIconMap。这两个
                // 常量若和消费方一起落进 entriesAware 的 shared 环，初始化前读到的是
                // undefined：下标访问抛 `TypeError: Cannot read properties of undefined
                // (reading '0')`（顶栏/侧边整块不渲染），对象展开则**静默**丢掉全部内嵌
                // 图标别名。它们自身只依赖 @lucide/vue，放进本叶子 chunk 即可彻底断开。
                // 改此组后请核对构建产物：index.html preload 应出现 shared-registry-*.js。
                name: 'shared-registry',
                test: /src[\\/]shared[\\/]utils[\\/](?:registry[\\/]|layout[\\/]embed-(?:icons|nav-theme)\.util\.ts)/,
                priority: 2,
              },
              {
                // entriesAware 兜底组：把「被多个入口共享」的模块合进 shared-* chunk。
                // 这个阈值是**首屏 preload 与懒加载边界的悬崖开关**，不是体积微调。
                //
                // 背景：视图归位后，`features/device/*.vue` 的页面直接 import 子件
                // （不再经过域 barrel），跨入口共享集合的粒度随之变细。48_000 时这些
                // 模块被合进 46 个 shared-* chunk，且全部落进首屏预载闭包 —— 实测
                // 首屏 preload 717,912B → 1,983,179B、首屏 CSS 303,106B → 1,119,243B
                // （静态分析显示这些 chunk 里含 settings/security/earthquake 的页面
                // 模块，即首屏把半个应用拉了下来）；CI 的 bundle budget 因此变红。
                //
                // 实测（同一份源码只改本值）：
                // | 阈值 | 首屏 preload | 首屏 CSS | JS chunk | /devices 是否连带下载详情页 |
                // | 48k  | 1,983,179    | 1,119,243| 69       | 否 |
                // | 30k  |   720,454    |   303,106| 92       | 是（详情 chunk 82,092B） |
                // | 28k  |   720,832    |   303,106| 96       | 否 |
                // | 20k  |   721,057    |   303,106| 140      | 否 |
                // 28_000 是「预算通过 + 两页懒加载边界不被 shared 合并打穿」同时成立的最大
                // 阈值（30_000 起边界失效），JS chunk 数比 48_000 多 27 个、仍为两位数。
                //
                // 改这个值必须重跑：`bun ops/checks/check_bundle_budget.mjs` 与
                // `bun ops/checks/check_chunk_init_order.mjs --strict`，并抽查
                // devices 路由的 chunk 是否又 import 了 DeviceDetailPage 所在的 chunk。
                name: 'shared',
                entriesAware: true,
                entriesAwareMergeThreshold: 28_000,
                priority: 1,
              },
            ],
          },
        },
      },
    },
  }
})
