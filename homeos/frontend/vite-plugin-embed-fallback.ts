import type { Plugin } from 'vite'
import { resolveEmbedProxyFallbackRedirect } from '../packages/shared/src/embed/fallback-core.util.ts'

/**
 * 开发环境：内嵌反代页「逃逸子资源」兜底（与后端 spaFallbackMiddleware 等价）。
 *
 * 生产模式下前端 SPA 由后端伺服，逃逸的内嵌资源由后端 spaFallbackMiddleware 接住；
 * dev 模式下前端由 Vite 伺服，逃逸请求会落到 Vite SPA 回退并返回 index.html（text/html），
 * 导致内嵌站模块 chunk 触发严格 MIME 校验失败而白屏。
 */
export default function embedProxyFallbackPlugin(): Plugin {
  return {
    name: 'homeos-embed-proxy-fallback',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || ''
        if (
          url.startsWith('/api/') ||
          url.startsWith('/@') ||
          url.startsWith('/src/') ||
          url.startsWith('/node_modules/')
        ) {
          return next()
        }

        const pathOnly = url.split('?')[0] || '/'
        const fallback = resolveEmbedProxyFallbackRedirect({
          method: req.method,
          path: pathOnly,
          originalUrl: url,
          headers: req.headers as Record<string, string | string[] | undefined>,
        })
        if (!fallback) return next()

        res.statusCode = 307
        res.setHeader('Location', fallback.targetUrl)
        res.end()
      })
    },
  }
}
