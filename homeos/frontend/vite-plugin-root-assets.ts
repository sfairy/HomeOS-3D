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
 * - `/static/**`：经典 IIFE 与 Vite 哈希 chunk（`static/assets/<name>-<hash>`）都落在这里；
 *   dev 下 Vite 只伺服 `/src`、`/@fs`、`node_modules/.vite` 这类模块路径，**不提供**这些
 *   构建产物；而 3D 舞台页是后端下发的构建产物 index.html
 *   （`/api/v1/modules/interaction3d/stage.html`），它引用的正是这些哈希 chunk —— 缺兜底
 *   就落进 SPA 回退拿到 `text/html`，脚本加载报 404/ERR_ABORTED。
 */
const DEV_BUILD_OUTPUT_PREFIXES = ['/static/'] as const

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

/**
 * `public/static/**` 里**确实存在**的同一路径：dev 下直接读盘下发，不再交给 Vite。
 *
 * 为什么不能 `next()` 让 Vite 自己伺服：Vite 8 在启动时把 public 目录**拍平成一份路径集合**
 * （`publicFiles`，见 `src/node/publicDir.ts`），之后只靠文件监听把新增/删除同步进去。
 * 这份集合一旦落后于磁盘（进程跑久了监听丢事件；新建文件落在启动之后也会如此），
 * 已在 public 里的文件就会被判成「不存在」：`servePublicMiddleware` 直接放行，
 * 请求落进 SPA 回退拿到 `index.html`（`text/html`），`<script>`/`<link>` 加载随之报
 * `net::ERR_ABORTED 404`。表现为「文件明明在，dev 端口就是 404」，只有重启 Vite 才好。
 *
 * 所以这里对 public 命中的 `/static/**` 一律直读磁盘（与根 `assets/` 同一策略，兼顾热替换），
 * 让 dev 端口的 `/static/**` 不依赖 Vite 内部那份可能过期的清单。
 */
function resolvePublicStaticFile(urlPath: string): string | null {
  const prefix = DEV_BUILD_OUTPUT_PREFIXES.find((item) => urlPath.startsWith(item))
  if (!prefix) return null
  const rel = decodeURIComponent(urlPath.slice(prefix.length))
  if (!rel || rel.includes('..') || rel.includes('\0') || path.isAbsolute(rel)) return null
  const file = path.join(PUBLIC_DIR, prefix.slice(1), rel)
  return fs.existsSync(file) && fs.statSync(file).isFile() ? file : null
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
 * 只在 `public/` 里**没有**该路径时才回退 dist（public 命中的请求已在
 * `resolvePublicStaticFile` 里直读磁盘，不会走到这里），因此 `public/**`（含 vendor 图标等可热替换
 * 资源）不会被 dist 的旧副本盖掉；也没有把这些前缀反代给后端 ——
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
  const file = path.join(DIST_ROOT, bucket, rel)
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return { status: 'serve', file }
  return MISSING_BUILD_OUTPUT_SUFFIXES.has(path.extname(rel).toLowerCase())
    ? { status: 'missing' }
    : null
}

/** 单段 `Range: bytes=…` 解析；非单段 / 越界一律返回 null（按整文件下发）。 */
function parseByteRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | null {
  if (!header || size <= 0) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const [, rawStart = '', rawEnd = ''] = match
  let start: number
  let end: number
  if (rawStart === '') {
    // `bytes=-N`：末尾 N 字节。
    if (rawEnd === '') return null
    const suffix = Number(rawEnd)
    if (!Number.isFinite(suffix) || suffix <= 0) return null
    start = Math.max(size - suffix, 0)
    end = size - 1
  } else {
    start = Number(rawStart)
    end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1)
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  }
  if (start > end || start >= size) return null
  return { start, end }
}

/** 直读磁盘响应；未命中按扩展名给 404，避免脚本请求落进 SPA 回退拿到 HTML。 */
function serveDiskFile(
  req: {
    method?: string | undefined
    headers?: Record<string, string | string[] | undefined> | undefined
  },
  res: ServerResponse,
  file: string,
): void {
  const ext = path.extname(file).toLowerCase()
  const stat = fs.existsSync(file) ? fs.statSync(file) : null
  const found = stat?.isFile() === true
  res.setHeader(
    'Content-Type',
    MIME[ext] || (found ? 'application/octet-stream' : 'text/plain; charset=utf-8'),
  )
  if (!found || !stat) {
    res.statusCode = 404
    res.end('Not Found')
    return
  }
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Accept-Ranges', 'bytes')
  const rawRange = req.headers?.range
  const range = parseByteRange(Array.isArray(rawRange) ? rawRange[0] : rawRange, stat.size)
  if (range) {
    // 与大文件（GLB / 贴图）原有行为对齐：支持断点续传与媒体拖动。
    res.statusCode = 206
    res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${stat.size}`)
    res.setHeader('Content-Length', String(range.end - range.start + 1))
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    fs.createReadStream(file, range).pipe(res)
    return
  }
  res.setHeader('Content-Length', String(stat.size))
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  fs.createReadStream(file).pipe(res)
}

/**
 * 开发态补齐三类「生产由后端伺服、dev 由 Vite 伺服」的静态文件：
 *   1. 仓库根 `assets/logo`、`assets/sounds`（生产由 ServeStatic + Docker 挂载卷托管，不写入 dist）；
 *   2. `public/static/**` 里存在的文件（直读磁盘，不依赖 Vite 启动时拍平的 public 清单）；
 *   3. 只存在于构建产物 `dist/homeos/frontend/static/**` 的 `/static/**`
 *      —— 含经典 IIFE 与哈希 chunk（`static/assets/<name>-<hash>.js|css`，3D 舞台页要用）。
 */
export default function rootAssetsPlugin(): Plugin {
  return {
    name: 'homeos-root-assets',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next()
        const urlPath = (req.url || '').split('?')[0] || ''
        const rootAsset = resolveRootAssetsFile(urlPath)
        if (rootAsset) return serveDiskFile(req, res, rootAsset)
        const publicFile = resolvePublicStaticFile(urlPath)
        if (publicFile) return serveDiskFile(req, res, publicFile)
        const distFallback = resolveDevBuildOutputFallback(urlPath)
        if (distFallback?.status === 'serve') return serveDiskFile(req, res, distFallback.file)
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
