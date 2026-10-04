import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

/** 仓库根 assets/（与后端 ServeStatic 同源；dev 直读磁盘便于热替换） */
const ROOT_ASSETS = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../assets')

const MIME: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
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
 * 开发态从仓库根 `assets/logo`、`assets/sounds` 提供静态文件。
 * 生产由 Nest ServeStatic + Docker 挂载卷托管（不写入 dist）。
 */
export default function rootAssetsPlugin(): Plugin {
  return {
    name: 'homeos-root-assets',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const urlPath = (req.url || '').split('?')[0] || ''
        const file = resolveRootAssetsFile(urlPath)
        if (!file) return next()
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
          const ext = path.extname(file).toLowerCase()
          res.statusCode = 404
          res.setHeader('Content-Type', MIME[ext] || 'text/plain; charset=utf-8')
          res.end('Not Found')
          return
        }
        const ext = path.extname(file).toLowerCase()
        res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream')
        res.setHeader('Cache-Control', 'no-store')
        fs.createReadStream(file).pipe(res)
      })
    },
  }
}
