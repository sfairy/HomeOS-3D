/**
 * Vite 构建辅助：代理错误处理与 chunk 命名清洗。
 *
 * 从 vite.config.ts 抽出，便于单测与在商店侧复用同口径。
 */

/** 开发代理目标：127.0.0.1 避免 Windows 下 localhost → IPv6 导致 ECONNREFUSED */
export const BACKEND_DEV_TARGET = 'http://127.0.0.1:8801'

/** 后端未就绪提示文案。 */
export const BACKEND_UNAVAILABLE_HINT = '后端暂未就绪，请先运行 bun run dev:backend，稍后刷新'

/** 开发代理/WebSocket 断连时的可忽略错误码（重连、刷新、后端重启均属正常） */
const BENIGN_PROXY_ERROR_CODES = new Set(['ECONNABORTED', 'ECONNRESET', 'ECONNREFUSED'])

export function isBenignProxyError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | undefined)?.code
  return !!code && BENIGN_PROXY_ERROR_CODES.has(code)
}

/** 后端未就绪时返回 503 JSON，避免浏览器看到含糊的 500 Internal Server Error */
export function respondBackendUnavailable(res: unknown): void {
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
export function logBenignProxyOnce(err: unknown): void {
  const now = Date.now()
  if (now - lastBenignProxyLogAt < 15_000) return
  lastBenignProxyLogAt = now
  const code = (err as NodeJS.ErrnoException | undefined)?.code
  console.warn(`[vite] ${BACKEND_UNAVAILABLE_HINT}${code ? `（${code}）` : ''}`)
}

/**
 * HTTP/WS 代理共享：抑制良性断连日志，并对 HTTP 返回可读的 503。
 *
 * 用于 vite server.proxy[*].configure；不在此处绑定 target/changeOrigin。
 */
export const proxyErrorHandling = {
  configure: (proxy: { on: (event: string, ...args: unknown[]) => void }) => {
    proxy.on('error', (err: unknown, _req: unknown, res: unknown) => {
      if (isBenignProxyError(err)) {
        logBenignProxyOnce(err)
        respondBackendUnavailable(res)
        return
      }
      console.warn('[vite proxy error]', (err as { message?: string } | null)?.message || err)
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

/** Rolldown entriesAware 会拼出 app-merge~A~B~C 超长名，统一收成 shared */
export function sanitizeChunkBaseName(name?: string): string {
  if (!name) return 'chunk'
  const base = name.replace(/\.[^.]+$/, '')
  if (base.includes('~') || base.startsWith('app-merge') || base.startsWith('shared~')) {
    return 'shared'
  }
  return base
}
