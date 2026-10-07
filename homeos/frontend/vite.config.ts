/**
 * Vite 8 + Rolldown 构建配置文件
 */
import { defineConfig, createLogger, type Plugin, type UserConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import devNoCachePlugin from './vite-plugin-dev-no-cache.ts'
import embedProxyFallbackPlugin from './vite-plugin-embed-fallback.ts'
import rootAssetsPlugin from './vite-plugin-root-assets.ts'
import {
  THREE_VENDOR,
  classicIifePlugin,
  isRuntimeExternal,
  runtimeUrlExternalPlugin,
  runtimeVendorAssetPlugin,
  vendorResolvePlugin,
} from './vite-studio.ts'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

/**
 * 线上产物目录（后端 / 8801 直接伺服）。
 * 构建先写到旁路 ``frontend.building``，closeBundle 末尾再原子替换，避免 watch-build
 * 清空窗口里 ``index.html`` / ``modules/runtime`` 失踪（stage.html 500、动态 import 404）。
 */
const finalOutDir = resolve(__dirname, '../../dist/homeos/frontend')
const outDir = `${finalOutDir}.building`

/**
 * 把旁路 ``frontend.building`` 发布进线上 ``frontend/``，且**不删掉线上根目录**。
 *
 * 旧实现 ``rename(live→prev) + rename(building→live)`` 中间有空窗：``/assets`` mount
 * 找不到目录时请求会落到 SPA 外壳（text/html），浏览器对 ``shared-*.js`` 报 Strict MIME。
 * 这里改为：先覆盖拷贝（``index.html`` 最后），再修剪旧 hash 文件，全程根路径常在。
 */
function publishOutDirPlugin(): Plugin {
  const walkFiles = (root: string): string[] => {
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

  const pruneStale = (liveRoot: string, buildRoot: string) => {
    if (!fs.existsSync(liveRoot) || !fs.existsSync(buildRoot)) return
    const keep = new Set(
      walkFiles(buildRoot).map((f) => f.slice(buildRoot.length + 1).replace(/\\/g, '/')),
    )
    for (const file of walkFiles(liveRoot)) {
      const rel = file.slice(liveRoot.length + 1).replace(/\\/g, '/')
      if (!keep.has(rel)) fs.rmSync(file, { force: true })
    }
  }

  return {
    name: 'homeos-publish-outdir',
    apply: 'build',
    closeBundle() {
      if (!fs.existsSync(outDir)) return
      fs.mkdirSync(finalOutDir, { recursive: true })
      const entries = fs.readdirSync(outDir).filter((name) => name !== 'modules')
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
      fs.rmSync(outDir, { recursive: true, force: true })
    },
  }
}

/** SPA 唯一入口。 */
const SPA_ENTRY = 'index.html'

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

const sharedRoot = resolve(__dirname, '../packages/shared')

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
 * 生成 `/static` 匿名白名单（`dist/homeos/frontend/public-static.json`）。
 *
 * 后端用它判定「未登录也必须能加载」的静态资源：白名单**之外**的 `/static/**` 一律要求
 * 已登录会话（见 backend/src/studio_shell.py）。种子清单是 `public-static.seed.json`。
 *
 * 必须排在所有产物写入插件之后：它要按「产物是否真的存在」筛种子条目，而
 * `classicIifePlugin` 的 closeBundle 才写入 `/static/logging/client-log.js` 这类 IIFE 包。
 * closeBundle 按插件数组顺序串行执行，所以本插件必须放在数组最后一位。
 */
function publicStaticManifestPlugin(): Plugin {
  return {
    name: 'homeos-public-static-manifest',
    apply: 'build',
    closeBundle() {
      updatePublicStaticManifest()
    },
  }
}

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
      discovered.add(match[1].replace(/\?v=[^"']+$/i, ''))
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
        '常见原因：vite-studio.ts / vite.config.ts 的入口指向了不存在的源文件 —— ' +
        '这不会让构建报错，只会不产出该产物。请补齐源文件或移除引用。',
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
    // 构建产物写完后再落经典 IIFE（closeBundle 按数组顺序串行）。
    classicIifePlugin(),
    // 匿名白名单按「产物是否真的存在」筛种子条目，必须在 IIFE 写完后、发布前。
    publicStaticManifestPlugin(),
    // 最后：旁路目录覆盖发布到线上 dist（保留 modules/runtime，根目录不消失）。
    publishOutDirPlugin(),
  ]
  if (analyzeBundle) {
    const { visualizer } = await import('rollup-plugin-visualizer')
    plugins.push(
      visualizer({ filename: resolve(outDir, 'bundle-stats.html'), gzipSize: true, open: false }),
    )
  }

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
      alias: {
        vue: 'vue/dist/vue.esm-bundler.js',
        '@': resolve(__dirname, 'src'),
        '@homeos/shared': resolve(sharedRoot, 'src/index.ts'),
        // 3D Studio 源码别名（原 homeos-3d/frontend 的 @app / @runtime）。
        '@app': resolve(__dirname, 'src/studio/app'),
        '@runtime': resolve(__dirname, 'src/studio/runtime'),
        three: THREE_VENDOR,
      },
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
          './src/utils/registry/widget-registry.ts',
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
        // 故意不开 changeOrigin：同源写入守卫（backend/src/security/request_origin.py）在未配置
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
                name: 'views-auth',
                test: /src[\\/]views[\\/](Login|Setup|Guest)View\.vue/,
                priority: 26,
              },
              {
                name: 'views-main',
                test: /src[\\/]views[\\/](Life|Security|Devices|DeviceDetail|Events|Notifications|LinkageHub|Activation|ModeTriggerLogs|EarthquakeHistory)View\.vue/,
                priority: 25,
              },
              {
                name: 'views-mobile',
                test: /src[\\/]views[\\/]Mobile[^/\\]+View\.vue/,
                priority: 25,
              },
              {
                name: 'shell',
                test: /src[\\/](layouts[\\/]shell-overlays|views[\\/]dashboard-chrome)\.ts/,
                priority: 24,
              },
              {
                name: 'weather',
                test: /src[\\/](layouts[\\/]WeatherBackground|utils[\\/]weather[\\/]webgl-weather-renderer|workers[\\/]weather-particle)/,
                priority: 24,
              },
              {
                name: 'popups',
                test: /src[\\/]components[\\/]entities[\\/].*Popup/,
                priority: 22,
              },
              {
                name: 'builders',
                test: /src[\\/]components[\\/]dashboard[\\/].*(Builder|builder)/,
                priority: 22,
              },
              {
                name: 'settings-connect',
                test: /src[\\/]views[\\/]settings[\\/]connect[\\/]/,
                priority: 18,
              },
              {
                name: 'settings-home',
                test: /src[\\/]views[\\/]settings[\\/]home[\\/]/,
                priority: 18,
              },
              {
                name: 'settings-display',
                test: /src[\\/]views[\\/]settings[\\/]display[\\/]/,
                priority: 18,
              },
              {
                name: 'settings-automate',
                test: /src[\\/]views[\\/]settings[\\/]automate[\\/]/,
                priority: 18,
              },
              {
                name: 'settings-interact',
                test: /src[\\/]views[\\/]settings[\\/]interact[\\/]/,
                priority: 18,
              },
              {
                name: 'settings-system',
                test: /src[\\/]views[\\/]settings[\\/]system[\\/]/,
                priority: 18,
              },
              {
                name: 'settings-shared',
                test: /src[\\/]views[\\/]settings[\\/](shared|utils)[\\/]/,
                priority: 17,
              },
              {
                name: 'security-view',
                test: /src[\\/]views[\\/]security[\\/]/,
                priority: 16,
              },
              {
                name: 'widgets-climate',
                test: /src[\\/]components[\\/]widgets[\\/]climate[\\/]/,
                priority: 14,
              },
              {
                name: 'widgets-energy',
                test: /src[\\/]components[\\/]widgets[\\/]energy[\\/]/,
                priority: 14,
              },
              {
                name: 'widgets-security',
                test: /src[\\/]components[\\/]widgets[\\/](security|care)[\\/]/,
                priority: 14,
              },
              {
                name: 'widgets-orchestrator',
                test: /src[\\/]components[\\/]widgets[\\/]orchestrator[\\/]/,
                priority: 14,
              },
              {
                name: 'widgets-media',
                test: /src[\\/]components[\\/]widgets[\\/](media|weather)[\\/]/,
                priority: 14,
              },
              {
                name: 'widgets-device',
                test: /src[\\/]components[\\/]widgets[\\/](device|system)[\\/]/,
                priority: 14,
              },
              {
                name: 'shared-app',
                test: /src[\\/](utils|composables)[\\/]/,
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
