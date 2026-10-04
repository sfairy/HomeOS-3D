import type { Plugin } from 'vite'

/**
 * 开发环境禁用 304 条件缓存
 *
 * Chrome 在 Vite HMR 频繁更新后，可能对 304 响应出现 ERR_CACHE_READ_FAILURE。
 * 剥离 If-None-Match / If-Modified-Since，强制每次返回 200 正文。
 */
export default function devNoCachePlugin(): Plugin {
  return {
    name: 'homeos-dev-no-cache',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.headers) {
          delete req.headers['if-none-match']
          delete req.headers['if-modified-since']
        }
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        res.setHeader('Pragma', 'no-cache')
        res.setHeader('Expires', '0')
        next()
      })
    },
  }
}
