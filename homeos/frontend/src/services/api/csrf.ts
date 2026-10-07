/**
 * CSRF 与裸 fetch 辅助（单一 HTTP 栈）。
 *
 * homeos 后端启用了 CSRF 双提交校验（`backend/src/security/csrf.py`）：变更类请求必须
 * 携带 `X-CSRF-Token` 头，值与 `csrf_token` Cookie 一致。axios（`api-client`）在请求
 * 拦截器里自动注入；但并入的 studio 遗留代码仍大量使用**裸 `fetch`**，无法走拦截器，
 * 因此这里提供两件事：
 *
 * 1. `withCsrf` / `csrfToken`：调用方在裸 fetch 时手动合并 CSRF 头；
 * 2. `installFetchCsrf`：对同源 `/api/**` 的变更类裸 fetch 兜底注入（幂等），
 *    作为「漏改调用点」的最后一道防线，由 `api-client` 在模块求值时安装。
 *
 * 豁免端点（`/auth/login|setup|logout` 等）额外带头也无副作用。
 *
 * @module services/api/csrf
 */

/** 从浏览器 Cookie 中读取 csrf_token；SSR / 无 document 时返回空串。 */
export function csrfToken(): string {
  if (typeof document === 'undefined') return ''
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** 把 HeadersInit 归一化成普通对象（兼容 Headers 实例 / 元组数组 / 普通对象）。 */
function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  const merged: Record<string, string> = {}
  if (!headers) return merged
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    headers.forEach((value, key) => {
      merged[key] = value
    })
  } else if (Array.isArray(headers)) {
    for (const [key, value] of headers) merged[key] = value
  } else {
    Object.assign(merged, headers)
  }
  return merged
}

/**
 * 把 CSRF 头合并进 `headers`（仅变更类请求；已有同名头或 Cookie 缺失时保持原样）。
 * @param headers 原始请求头（HeadersInit，可选）
 * @param method HTTP 方法，缺省按 `POST` 处理
 */
export function withCsrf(headers?: HeadersInit, method = 'POST'): Record<string, string> {
  const merged = normalizeHeaders(headers)
  if (SAFE_METHODS.has(method.toUpperCase())) return merged
  const hasHeader = Object.keys(merged).some((key) => key.toLowerCase() === 'x-csrf-token')
  if (hasHeader) return merged
  const token = csrfToken()
  if (token) merged['X-CSRF-Token'] = token
  return merged
}

const API_PREFIX = '/api/'

let installed = false

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (typeof URL !== 'undefined' && input instanceof URL) return input.href
  return (input as Request).url
}

function isSameOriginApi(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.href)
    return parsed.origin === window.location.origin && parsed.pathname.startsWith(API_PREFIX)
  } catch {
    return false
  }
}

/**
 * 安装全局 fetch CSRF 注入（幂等）。
 *
 * 仅处理同源 `/api/**` 的非安全方法；已带 `X-CSRF-Token` 或 Cookie 缺失时保持原样；
 * 兼容 `fetch(Request)` 与 `fetch(url, init)` 两种调用形态。
 */
export function installFetchCsrf(): void {
  if (installed || typeof window === 'undefined' || typeof window.fetch !== 'function') return
  installed = true
  const originalFetch = window.fetch.bind(window)

  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = resolveUrl(input)
    const method = (
      init?.method || (typeof input !== 'string' && !(input instanceof URL) ? input.method : 'GET')
    ).toUpperCase()
    if (SAFE_METHODS.has(method) || !isSameOriginApi(url)) {
      return originalFetch(input as RequestInfo, init)
    }
    const token = csrfToken()
    if (!token) return originalFetch(input as RequestInfo, init)

    if (typeof input !== 'string' && !(input instanceof URL)) {
      const headers = new Headers(input.headers)
      if (headers.has('X-CSRF-Token')) return originalFetch(input as RequestInfo, init)
      headers.set('X-CSRF-Token', token)
      return originalFetch(new Request(input, { headers }), init)
    }
    const headers = new Headers(init?.headers)
    if (headers.has('X-CSRF-Token')) return originalFetch(input as RequestInfo, init)
    headers.set('X-CSRF-Token', token)
    return originalFetch(input as RequestInfo, { ...init, headers })
  }
}
