import fs from 'node:fs'
import type { ServerResponse } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

const HERE = fileURLToPath(new URL('.', import.meta.url))

/** 仓库根 assets/（与后端 ServeStatic 同源；dev 直读磁盘便于热替换） */
const ROOT_ASSETS = path.resolve(HERE, '../assets')

/** Vite publicDir：dev 下 `/static/**` 的首选来源（与生产 dist 无关）。 */
const PUBLIC_DIR = path.resolve(HERE, 'public')

/** 前端产物根 `dist/homeos/frontend/`，与 vite.config.ts 的 outDir 同源。 */
const DIST_ROOT = path.resolve(HERE, '../../dist/homeos/frontend')

/**
 * 「只由构建产物提供、dev 下 Vite 不会伺服」的路径前缀。
 *
 * - `/static/**`：`classicIifePlugin` 只把经典 IIFE 包写进 dist，`public/` 里没有；
 * - `/assets/**`：Vite 的产物目录（`assets/js|css/<name>-<hash>`）。dev 下 Vite 只伺服
 *   `/src`、`/@fs`、`node_modules/.vite` 这类模块路径，**不提供 `/assets/**`**；而 3D 舞台页
 *   是后端下发的构建产物 index.html（`/api/v1/modules/interaction3d/stage.html`），它引用的
 *   正是这些哈希 chunk —— 缺兜底就落进 SPA 回退拿到 `text/html`，脚本加载报 404/ERR_ABORTED。
 */
const DEV_BUILD_OUTPUT_PREFIXES = ['/static/', '/assets/'] as const

/**
 * 缺失即判 404（而非放行给 SPA 回退）的扩展名。
 *
 * 只收「被当成脚本 / 样式 / 数据加载」的类型：它们拿到 HTML 一定失败，且失败信息具有误导性。
 * 图片、字体等缺失时浏览器本来就会安静降级，无需额外处理。
 */
const MISSING_BUILD_OUTPUT_SUFFIXES = new Set([
  '.js',
  '.mjs',
  '.css',
  '.json',
  '.map',
  '.wasm',
  '.webmanifest',
])

const MIME: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  // 以下类型只可能来自构建产物（见 resolveDevStaticFallback）：缺了会被当成未知文件，
  // 在浏览器里表现为 404，或落进 Vite 的 SPA 回退拿到 text/html。
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
}

/** 与生产一致的可替换资源前缀：/logo/*、/sounds/* */
function resolveRootAssetsFile(urlPath: string): string | null {
  for (const prefix of ['/logo/', '/sounds/'] as const) {
    if (!urlPath.startsWith(prefix)) continue
    const rel = decodeURIComponent(urlPath.slice(prefix.length))
    if (!rel || rel.includes('..') || path.isAbsolute(rel)) return null
    const dir = prefix === '/logo/' ? 'logo' : 'sounds'
    return path.join(ROOT_ASSETS, dir, rel)
  }
  return null
}

/** 构建产物请求的解析结果：命中文件、确认缺失（应回 404）、或与构建产物无关。 */
type BuildOutputResolution =
  | { status: 'serve'; file: string }
  | { status: 'missing' }
  | null

/**
 * 只由构建产物提供的 `/static/**`、`/assets/**` 在 dev 下的兜底。
 *
 * 3D 舞台页由后端下发 dist 里的 index.html，因此它引用的哈希 chunk 与 IIFE 脚本都必须能在
 * dev 端口上取到；缺一则：上报器装不上、手持/平板档样式失效、舞台页整页脚本加载失败。
 *
 * 只在 `public/` 里**没有**该路径时才回退 dist，因此 `public/**`（含 vendor 图标等可热替换
 * 资源）仍由 Vite 自己伺服，不会被 dist 的旧副本盖掉；也没有把这些前缀反代给后端 ——
 * 那会连带把 public 资源也换成构建副本。
 *
 * 命中不到的**脚本 / 样式**请求返回 `missing` 而不是放行：这两个前缀下不存在 SPA 路由，
 * 放行只会落进 SPA 回退拿到 `text/html`，让「文件不存在」伪装成 MIME 错误 / ERR_ABORTED，
 * 排查成本极高（构建产物换 hash 后尤其容易撞上）。
 */
function resolveDevBuildOutputFallback(urlPath: string): BuildOutputResolution {
  const prefix = DEV_BUILD_OUTPUT_PREFIXES.find((item) => urlPath.startsWith(item))
  if (!prefix) return null
  const rel = decodeURIComponent(urlPath.slice(prefix.length))
  if (!rel || rel.includes('..') || rel.includes('\0') || path.isAbsolute(rel)) return null
  const bucket = prefix.slice(1)
  if (fs.existsSync(path.join(PUBLIC_DIR, bucket, rel))) return null
  const file = path.join(DIST_ROOT, bucket, rel)
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return { status: 'serve', file }
  return MISSING_BUILD_OUTPUT_SUFFIXES.has(path.extname(rel).toLowerCase())
    ? { status: 'missing' }
    : null
}

/** 直读磁盘响应；未命中按扩展名给 404，避免脚本请求落进 SPA 回退拿到 HTML。 */
function serveDiskFile(res: ServerResponse, file: string): void {
  const ext = path.extname(file).toLowerCase()
  const found = fs.existsSync(file) && fs.statSync(file).isFile()
  res.setHeader(
    'Content-Type',
    MIME[ext] || (found ? 'application/octet-stream' : 'text/plain; charset=utf-8'),
  )
  if (!found) {
    res.statusCode = 404
    res.end('Not Found')
    return
  }
  res.setHeader('Cache-Control', 'no-store')
  fs.createReadStream(file).pipe(res)
}

/**
 * 开发态补齐三类「生产由后端伺服、dev 由 Vite 伺服」的静态文件：
 *   1. 仓库根 `assets/logo`、`assets/sounds`（生产由 ServeStatic + Docker 挂载卷托管，不写入 dist）；
 *   2. 只存在于构建产物 `dist/homeos/frontend/static/**` 的 `/static/**`；
 *   3. 只存在于构建产物 `dist/homeos/frontend/assets/**` 的 `/assets/**`（3D 舞台页的哈希 chunk）。
 */
export default function rootAssetsPlugin(): Plugin {
  return {
    name: 'homeos-root-assets',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const urlPath = (req.url || '').split('?')[0] || ''
        const rootAsset = resolveRootAssetsFile(urlPath)
        if (rootAsset) return serveDiskFile(res, rootAsset)
        const distFallback = resolveDevBuildOutputFallback(urlPath)
        if (distFallback?.status === 'serve') return serveDiskFile(res, distFallback.file)
        if (distFallback?.status === 'missing') {
          res.statusCode = 404
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.end('Not Found')
          return
        }
        return next()
      })
    },
  }
}
