/**
 * Vite 8 + Rolldown 构建配置文件
 */
import { defineConfig, createLogger, type UserConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import devNoCachePlugin from './vite-plugin-dev-no-cache.ts'
import embedProxyFallbackPlugin from './vite-plugin-embed-fallback.ts'
import rootAssetsPlugin from './vite-plugin-root-assets.ts'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const isProduction = process.env.NODE_ENV === 'production'
const analyzeBundle = process.env.ANALYZE === '1'
/** 开发代理目标：127.0.0.1 避免 Windows 下 localhost → IPv6 导致 ECONNREFUSED */
const backendDevTarget = 'http://127.0.0.1:8501'

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

export default defineConfig(async (): Promise<UserConfig> => {
  const plugins: UserConfig['plugins'] = [
    embedProxyFallbackPlugin(),
    rootAssetsPlugin(),
    devNoCachePlugin(),
    vue(),
    tailwindcss(),
  ]
  if (analyzeBundle) {
    const { visualizer } = await import('rollup-plugin-visualizer')
    plugins.push(
      visualizer({ filename: '../dist/frontend/bundle-stats.html', gzipSize: true, open: false }),
    )
  }

  return {
    customLogger,
    plugins,
    resolve: {
      extensions: ['.mjs', '.ts', '.tsx', '.mts', '.js', '.jsx', '.json'],
      alias: {
        vue: 'vue/dist/vue.esm-bundler.js',
        '@': resolve(__dirname, 'src'),
        '@homeos/shared': resolve(sharedRoot, 'src/index.ts'),
      },
      dedupe: ['@homeos/shared'],
    },
    server: {
      fs: {
        allow: [sharedRoot, resolve(__dirname, '..')],
      },
      host: true,
      port: 5173,
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
        clientPort: 5173,
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
        '/api': { target: backendDevTarget, changeOrigin: true, ...proxyErrorHandling },
        '/floorplans': { target: backendDevTarget, changeOrigin: true, ...proxyErrorHandling },
        '/backgrounds': { target: backendDevTarget, changeOrigin: true, ...proxyErrorHandling },
        '/icons': { target: backendDevTarget, changeOrigin: true, ...proxyErrorHandling },
        '/room_images': { target: backendDevTarget, changeOrigin: true, ...proxyErrorHandling },
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
        output: {
          entryFileNames: 'assets/js/[name]-[hash].js',
          chunkFileNames: 'assets/js/[name]-[hash].js',
        },
      },
    },
    build: {
      outDir: '../dist/frontend',
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
