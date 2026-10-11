/**
 * Vite 8 + Rolldown 构建配置文件
 */
import { defineConfig, createLogger, type Plugin, type UserConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
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
 * 旧实现 ``rename(live→prev) + rename(building→live)`` 中间有空窗：``/assets`` mount
 * 找不到目录时请求会落到 SPA 外壳（text/html），浏览器对 ``shared-*.js`` 报 Strict MIME。
 * 这里改为：先覆盖拷贝（``index.html`` 最后），再修剪旧 hash 文件，全程根路径常在。
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
    for (const bucket of ['assets', 'static'] as const) {
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
const isProduction = process.env.NODE_ENV === 'production'
const analyzeBundle = process.env.ANALYZE === '1'
/** 开发代理目标：127.0.0.1 避免 Windows 下 localhost → IPv6 导致 ECONNREFUSED */
const backendDevTarget = 'http://127.0.0.1:8801'

/** 开发代理/WebSocket 断连时的可忽略错误码（重连、刷新、后端重启均属正常） */
const BENIGN_PROXY_ERROR_CODES = new Set(['ECONNABORTED', 'ECONNRESET', 'ECONNREFUSED'])

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
  const now = Date.now()
  if (now - lastBenignProxyLogAt < 15_000) return
  lastBenignProxyLogAt = now
  const code = (err as NodeJS.ErrnoException | undefined)?.code
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
          const hasAssets =
            fs.existsSync(resolve(outDir, 'assets')) &&
            fs.readdirSync(resolve(outDir, 'assets')).length > 0
          // 有 assets 却没有外壳 = 产物不完整（真·空构建不在这里报错）；报错内容由共用助手
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

export default defineConfig(async (): Promise<UserConfig> => {
  const plugins: UserConfig['plugins'] = [
    embedProxyFallbackPlugin(),
    rootAssetsPlugin(),
    devNoCachePlugin(),
    // 3D Studio 外置契约：three → /static/vendor 绝对 URL；/api/** 运行时资源原样保留。
    vendorResolvePlugin(),
    runtimeUrlExternalPlugin(),
    runtimeVendorAssetPlugin(),
    vue(),
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
          entryFileNames: 'assets/js/[name]-[hash].js',
          chunkFileNames: 'assets/js/[name]-[hash].js',
        },
      },
    },
    build: {
      outDir,
      // 只清空旁路 ``frontend.building``；线上 ``frontend/`` 在 closeBundle 原子替换前保持可伺服。
      emptyOutDir: true,
      assetsDir: 'assets',
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
         * 过滤不需要预加载的依赖：这些是「体积大、由模块图自行按序拉取即可」的
         * chunk（views / shell / settings / widgets / 重型图表与播放器库），
         * 让浏览器在入口 <script> 之前就抢带宽预加载反而挤占关键路径。
         *
         * 注意：交替组里的前缀**不要**带尾随 `-`（正则外层已经有一个 `-`），
         * 写成 `widgets-|settings-` 会让这两项永远匹配不上、静默失效
         * （表现为 settings-* chunk 仍被 preload 进 index.html）。
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
          deps.filter(
            (dep) =>
              !/\/(charts|weather|popups|builders|hls|rolldown-runtime|widgets|settings|security-view|views-main|views-mobile|shell)-/.test(
                dep,
              ),
          ),
      },
      rolldownOptions: {
        // 3D Studio 运行时资源外置：three / /static/vendor/** / /api/** 不进 bundle。
        external: isRuntimeExternal,
        checks: {
          pluginTimings: false,
        },
        output: {
          entryFileNames: 'assets/js/[name]-[hash].js',
          chunkFileNames: (chunk) =>
            `assets/js/${sanitizeChunkBaseName(chunk.name)}-[hash].js`,
          assetFileNames: ({ name }) => {
            const safe = sanitizeChunkBaseName(name)
            if (/\.css$/.test(name ?? '')) {
              return `assets/css/${safe}-[hash][extname]`
            }
            return `assets/${safe}-[hash][extname]`
          },
          minify: isProduction,
          /**
           * 按域合并懒加载面板 / 共享小模块，避免数百个 <1–5KB 碎 chunk。
           * 路径分隔用 [\\/] 以兼容 Windows。
           * entriesAware 兜底组会拼出 A~B~C 名，经 sanitizeChunkBaseName 收成 shared-*.
           *
           * 不变量：每组 test 必须至少匹配到一个真实模块，且 alternation 的每条分支都要有
           * 对应文件 —— 域名重构搬走文件后遗留的悬空匹配由 scripts/check-vite-chunk-groups.mjs
           * 拦截（历史漂移：views-auth / views-mobile / builders / widgets-energy / 天气 renderer）。
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
                // 认证页 P6-1 起位于 `views/auth/`（Login / Register / License / LicenseRecovery）。
                name: 'views-auth',
                test: /src[\\/]views[\\/]auth[\\/]/,
                priority: 26,
              },
              {
                // 只列现存视图：Life / LinkageHub / Activation 已随域名重构下线，留在名单里就是
                // 永远匹配不到的悬空分支。EmbedView / SettingsView 刻意不并组（各自是独立入口）。
                name: 'views-main',
                test: /src[\\/]views[\\/](DeviceDetailView|DevicesView|EarthquakeHistoryView|EventsView|ModeTriggerLogsView|NotificationsView|SecurityView)\.vue/,
                priority: 25,
              },
              {
                name: 'shell',
                test: /src[\\/]layouts[\\/]shell-overlays\.ts/,
                priority: 24,
              },
              {
                name: 'weather',
                // 曾含 `utils[\\/]weather[\\/]webgl-weather-renderer` —— 该文件不存在（悬空匹配），已删。
                // 天气纯函数现位于 `shared/weather/utils/`，由 WeatherBackground / 粒子 Worker 拉入；
                // 这里**刻意不整域并组**，避免把天气模块塞进即便关闭天气效果也要加载的 chunk。
                test: /src[\\/](layouts[\\/]WeatherBackground|workers[\\/]weather-particle)/,
                priority: 24,
              },
              {
                name: 'popups',
                test: /src[\\/]components[\\/]entities[\\/].*Popup/,
                priority: 22,
              },
              {
                name: 'settings-connect',
                test: /src[\\/]features[\\/]settings[\\/]connect[\\/]/,
                priority: 18,
              },
              {
                name: 'settings-home',
                test: /src[\\/]features[\\/]settings[\\/]home[\\/]/,
                priority: 18,
              },
              {
                name: 'settings-display',
                test: /src[\\/]features[\\/]settings[\\/]display[\\/]/,
                priority: 18,
              },
              {
                name: 'settings-automate',
                test: /src[\\/]features[\\/]settings[\\/]automate[\\/]/,
                priority: 18,
              },
              {
                name: 'settings-interact',
                test: /src[\\/]features[\\/]settings[\\/]interact[\\/]/,
                priority: 18,
              },
              {
                name: 'settings-system',
                test: /src[\\/]features[\\/]settings[\\/]system[\\/]/,
                priority: 18,
              },
              {
                name: 'settings-shared',
                test: /src[\\/]features[\\/]settings[\\/](shared|composables)[\\/]/,
                priority: 17,
              },
              {
                name: 'security-view',
                test: /src[\\/]features[\\/]security[\\/]/,
                priority: 16,
              },
              {
                name: 'widgets-climate',
                test: /src[\\/]components[\\/]widgets[\\/]climate[\\/]/,
                priority: 14,
              },
              {
                // `widgets-energy` / `widgets-orchestrator` 两组已删：能源与编排器组件随域名重构
                // 搬离 `components/widgets/`（能源内核在 `shared/energy/`、编排器组件已下线），
                // 留下的是永远匹配不到的悬空组。
                name: 'widgets-security',
                test: /src[\\/]components[\\/]widgets[\\/]security[\\/]/,
                priority: 14,
              },
              {
                name: 'widgets-media',
                test: /src[\\/]components[\\/]widgets[\\/](media|weather)[\\/]/,
                priority: 14,
              },
              {
                // 原为 `(device|system)`：`widgets/device/` 只剩没人 import 的死样式（已删），
                // 有模块的只有 system，故组名随实况改为 widgets-system。
                name: 'widgets-system',
                test: /src[\\/]components[\\/]widgets[\\/]system[\\/]/,
                priority: 14,
              },
              {
                name: 'shared-app',
                // `src/utils/` 已在 P2 清零（全部下沉 `shared/<域>/utils`），只剩 composables。
                test: /src[\\/]composables[\\/]/,
                minShareCount: 2,
                priority: 8,
              },
              {
                name: 'vendor-misc',
                test: /node_modules/,
                minSize: 20_000,
                priority: 5,
              },
              {
                name: 'shared',
                entriesAware: true,
                entriesAwareMergeThreshold: 48_000,
                priority: 1,
              },
            ],
          },
        },
      },
    },
  }
})
