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
import publishOutDirPlugin, { outDir } from './vite-plugin-publish-outdir.ts'
import publicStaticManifestPlugin from './vite-plugin-public-static-manifest.ts'
import {
  BACKEND_DEV_TARGET,
  isBenignProxyError,
  logBenignProxyOnce,
  proxyErrorHandling,
  sanitizeChunkBaseName,
} from './vite-build-utils.ts'
import {
  THREE_VENDOR,
  classicIifePlugin,
  isRuntimeExternal,
  runtimeUrlExternalPlugin,
  runtimeVendorAssetPlugin,
  vendorResolvePlugin,
} from './vite-studio.ts'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const isProduction = process.env.NODE_ENV === 'production'
const analyzeBundle = process.env.ANALYZE === '1'

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

const sharedRoot = resolve(__dirname, '../packages/shared')

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
        // 3D Studio 源码别名（源自原 homeos-3d/frontend 的 @app / @runtime）。
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
        '/health': { target: BACKEND_DEV_TARGET, changeOrigin: true, ...proxyErrorHandling },
        // 内嵌反代既走 HTTP（资源/登录）又走 WS（实时通道），须开启 ws；置于 /api 之前以优先匹配
        '/api/v1/embed-proxy': {
          target: BACKEND_DEV_TARGET,
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
          target: BACKEND_DEV_TARGET,
          ws: true,
          ...proxyErrorHandling,
        },
        // 故意不开 changeOrigin：同源写入守卫（backend/src/security/request_origin.py）在未配置
        // APP_BASE_URL 时以 Origin↔Host 比较判定同源。改写 Host 会让浏览器 Origin
        // （http://localhost:8805）与后端看到的 Host（http://127.0.0.1:8801）不一致，
        // 导致所有受守卫的写请求（如 interaction3d 渲染缓存 PUT）被 403。
        // 保留浏览器原 Host 后两侧一致，守卫按设计放行。
        '/api': { target: BACKEND_DEV_TARGET, ...proxyErrorHandling },
        '/backgrounds': { target: BACKEND_DEV_TARGET, changeOrigin: true, ...proxyErrorHandling },
        '/icons': { target: BACKEND_DEV_TARGET, changeOrigin: true, ...proxyErrorHandling },
        '/engine.io': {
          target: BACKEND_DEV_TARGET,
          changeOrigin: true,
          ws: true,
          ...proxyErrorHandling,
        },
        '/socket.io': {
          target: BACKEND_DEV_TARGET,
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
