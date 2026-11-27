import axios, { AxiosHeaders, type AxiosError, type AxiosRequestConfig, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { appNotify, runUnauthorizedHandler, runNavigateToLogin, runSessionRefresh } from '@/kernel/utils/bridge/store-bridge'
import { getPageTraceId } from '@/kernel/utils/telemetry/trace.util'
import { getFrontendConfig } from '@/kernel/config/frontend-config'
import { logger, isLicenseInactiveError, isNavigationLockedAfterRestore } from '@/kernel/utils/core'
import { type RuntimeLogEntry, type RuntimeLogLevel, type RuntimeLogQueryResult } from '@homeos/shared'

/**
 * API 客户端 - Axios 实例配置
 * 统一封装 HomeOS 后端 REST API 的 HTTP 请求，覆盖认证、CSRF、重试、并发去重、
 * 会话刷新与全局错误路由；同时承载 401/403/5xx 的统一处理逻辑。
 */

/**
 * 内部 Axios 请求配置扩展：携带重试计数、CSRF/认证重试标记、认证世代与幂等标记。
 * 这些字段仅在请求/响应拦截器内部流转，不对外暴露。
 */
interface RetryableAxiosRequestConfig extends InternalAxiosRequestConfig {
  /** 5xx/网络错误已重试次数，用于限制指数退避重试轮次 */
  _retryCount?: number
  /** 背景任务（如电量上报）遇 401 时不触发全局登出/跳转 */
  skipAuthRedirect?: boolean
  /** 内部：拉取 CSRF Cookie，不再触发 bootstrap */
  _csrfBootstrap?: boolean
  /** 内部：CSRF 403 后已重试一次 */
  _csrfRetried?: boolean
  /** 内部：401 会话刷新后已重试一次 */
  _authRetried?: boolean
  /** 发起请求时的认证世代；登录/登出后递增，用于忽略过期请求的 401 */
  _authGeneration?: number
  /** 显式标记幂等：POST/PUT/PATCH/DELETE 默认不重试，置 true 后才允许 5xx/网络错误重试 */
  _idempotent?: boolean
}

/** 登录成功 / 登出后递增，避免登录前发出的 401 清掉新会话 */
let authGeneration = 0

/** 认证状态变更时调用（login / setup / logout / guest） */
export function bumpAuthGeneration(): void {
  authGeneration += 1
}

/**
 * 当前认证世代。
 *
 * 给「发起时记一次、回来时再比一次」的调用方用（例如 `auth.store` 的登录态探针）：
 * 世代变了就说明这期间发生过登录 / 登出 / 会话失效，那个迟到的结论必须丢弃。
 * 拦截器内部对 401 也有同样的判断（`_authGeneration`），但它只决定「要不要踢回登录页」，
 * 管不到调用方自己的状态。
 */
export function getAuthGeneration(): number {
  return authGeneration
}

/** 对外暴露的请求配置类型：在标准 AxiosRequestConfig 之上允许跳过 401 重定向、声明幂等、关闭 GET 去重。 */
export type ApiRequestConfig = AxiosRequestConfig &
  Pick<RetryableAxiosRequestConfig, 'skipAuthRedirect' | '_idempotent'> & {
    /** 设为 false 关闭 GET 并发去重（用于需要每次独立发起的场景） */
    dedupe?: boolean
  }

/**
 * 默认 Axios 实例：所有 HomeOS REST API 请求均经由此实例发出。
 * - baseURL=/api/v1：与后端路由版本对齐
 * - withCredentials=true：携带 HttpOnly Cookie 进行认证
 * - timeout=15000：初始默认超时，进入请求拦截器后会按 frontend-config 覆盖
 */
const apiClient = axios.create({
  baseURL: '/api/v1',
  timeout: 15000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

/** 从浏览器 Cookie 中读取 csrf_token，供变更类请求注入 X-CSRF-Token 头。SSR 环境无 document 时返回空串。 */
function getCsrfToken(): string {
  if (typeof document === 'undefined') return ''
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

/** 移除浏览器 csrf_token Cookie，保证后端 ensureCsrfCookie 会重新下发新值 */
function clearCsrfCookie(): void {
  if (typeof document === 'undefined') return
  // 与后端 setCsrfCookie 的 path/属性保持一致，确保能删掉同名条目
  const expires = 'expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  document.cookie = `csrf_token=; ${expires}; SameSite=Lax`
  try {
    // secure 情况下可能需要不带 SameSite 的兜底删除
    document.cookie = `csrf_token=; ${expires}; path=/`
  } catch {
    /* noop */
  }
}

/** HTTP 变更类方法集合：用于判断请求是否需要 CSRF 头以及是否默认禁止 5xx/网络错误重试。 */
const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete'])

/** 读取 csrf_token Cookie 并写入 X-CSRF-Token 请求头；Cookie 缺失时不写入。 */
function applyCsrfHeader(headers: AxiosHeaders): void {
  const csrf = getCsrfToken()
  if (csrf) headers.set('X-CSRF-Token', csrf)
}

/** 判断响应错误是否由 CSRF 校验失败引起（apiErrorCode=CSRF_INVALID 或消息含 CSRF 关键字）。 */
function isCsrfInvalidError(error: AxiosError): boolean {
  const data = error.response?.data as Record<string, unknown> | undefined
  if (data?.apiErrorCode === 'CSRF_INVALID') return true
  const message = String(data?.message ?? '')
  return message.includes('CSRF')
}

/** 进行中的 CSRF 刷新 Promise：保证并发请求共享同一次 /setup/status，避免重复 set-cookie。 */
let csrfRefreshPromise: Promise<void> | null = null

/**
 * GET /setup/status 在缺少 csrf_token 时下发 Cookie（登录后或页面恢复会话时可能尚未写入）。
 * 暴露为全局可复用入口：router 里的系统初始化 / refreshSession 也必须走这同一个 Promise，
 * 避免跟首次突变请求的 bootstrap 并发触发两次 set-cookie，造成 header 与 cookie 不一致的 403。
 */
function beginCsrfRefresh(): Promise<void> {
  const tracked = apiClient
    .get('/setup/status', {
      skipAuthRedirect: true,
      _csrfBootstrap: true,
    } as RetryableAxiosRequestConfig)
    .then(() => undefined)
    .catch((refreshError) => {
      logger.warn('[API 客户端] CSRF 令牌刷新失败', refreshError)
      return undefined
    })
    .finally(() => {
      if (csrfRefreshPromise === tracked) csrfRefreshPromise = null
    })
  return tracked
}

function refreshCsrfToken(forceReset = false): Promise<void> {
  if (forceReset) {
    // 必须先清 cookie 再发新请求；但不能复用清 cookie 之前发出的在途 Promise ——
    // 那次 GET 可能带着旧 cookie 被后端判定“已有效”而不下发新 Set-Cookie，
    // 客户端清空后就永久少了 CSRF 头。这里等旧请求落定后再强制发一次。
    clearCsrfCookie()
    const previous = csrfRefreshPromise
    const tracked = (previous ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => beginCsrfRefresh())
      .finally(() => {
        if (csrfRefreshPromise === tracked) csrfRefreshPromise = null
      })
    csrfRefreshPromise = tracked
    return tracked
  }
  if (!csrfRefreshPromise) csrfRefreshPromise = beginCsrfRefresh()
  return csrfRefreshPromise
}

/**
 * 请求拦截器：在请求发出前完成运行期超时同步、CSRF 头注入与 X-Trace-Id 注入。
 * 关键逻辑：
 * - 变更类方法（POST/PUT/PATCH/DELETE）若 csrf_token 缺失，先等待 refreshCsrfToken 完成；
 * - 注入认证世代 _authGeneration，供响应拦截器判断 401 是否属于过期会话；
 * - 注入 X-Trace-Id 用于后端链路追踪。
 */
apiClient.interceptors.request.use(async (config) => {
  const frontendConfig = getFrontendConfig()
  // axios 在进入拦截器前已把实例 defaults 合并进 config，因此 config.timeout 不会是 undefined。
  // 未显式传入 timeout 时其值等于实例默认超时，此时对齐到运行配置；显式传入的值则保留。
  if (config.timeout === apiClient.defaults.timeout) {
    config.timeout = frontendConfig.apiTimeoutMs
  }
  // 同步实例默认超时，后续请求的默认值跟随运行配置，显式 timeout 会自然覆盖 defaults。
  apiClient.defaults.timeout = frontendConfig.apiTimeoutMs
  const method = (config.method || 'get').toLowerCase()
  const headers = AxiosHeaders.from(config.headers)
  const retryCfg = config as RetryableAxiosRequestConfig
  retryCfg._authGeneration = authGeneration
  if (MUTATING_METHODS.has(method) && !retryCfg._csrfBootstrap) {
    if (!getCsrfToken()) {
      await refreshCsrfToken()
    }
    // await 之后再读一次 Cookie：并发 /setup/status 可能刚写入 csrf_token
    applyCsrfHeader(headers)

    // 强制断言：变更请求必须带 CSRF header。若仍然缺失，给出明确警告，
    // 避免被后端返回的 403 错误污染排查信号（到底是 header 缺失还是值不匹配）。
    if (!headers.get('X-CSRF-Token')) {
      logger.warn(
        '[API 客户端] CSRF 请求头仍然缺失,可能是 refreshCsrfToken 未下发 cookie,' +
          '当前 document.cookie 含 csrf_token=' +
          (getCsrfToken() ? 'present' : 'absent'),
      )
    }
  }
  headers.set('X-Trace-Id', getPageTraceId())
  config.headers = headers
  return config
})

/** 401 全局处理进行中标记：避免并发 401 触发多次跳转登录/登出回调。 */
let isHandling401 = false
let unauthorizedFailureCount = 0
let lastUnauthorizedToastAt = 0
const UNAUTHORIZED_FAILURE_LIMIT = 3
const UNAUTHORIZED_TOAST_COOLDOWN_MS = 15_000
const UNAUTHORIZED_FAILURE_WINDOW_MS = 30_000
let unauthorizedFailureWindowStartedAt = 0

/**
 * 判断错误是否可重试：仅 5xx / 网络错误 / 超时；非幂等的变更类方法默认不重试，
 * 除非显式声明 _idempotent，避免服务端已执行但响应丢失时触发第二次副作用。
 */
function isRetryableError(error: AxiosError, config?: RetryableAxiosRequestConfig): boolean {
  const status = error.response?.status
  const isNetworkOr5xx =
    (status !== undefined && status >= 500 && status < 600) ||
    error.code === 'ECONNABORTED' ||
    error.code === 'ERR_NETWORK' ||
    !!error.message?.includes('timeout') ||
    !!error.message?.includes('Network Error')
  if (!isNetworkOr5xx) return false
  // 非幂等方法默认不重试，避免服务端已执行但响应丢失时触发第二次副作用
  const method = (config?.method || 'get').toLowerCase()
  if (MUTATING_METHODS.has(method) && !config?._idempotent) {
    return false
  }
  return true
}

/** 重试基础退避间隔（毫秒），默认 1000，可被运行配置覆盖。 */
const getRetryDelayMs = () => getFrontendConfig().apiRetryDelayMs ?? 1000
/** 重试最大次数，来自运行配置 frontend-config。 */
const getRetryMax = () => getFrontendConfig().apiRetryMax

/**
 * 连续 401 熔断计数：返回 ``true`` 表示本次 401 应进入「熔断」提示分支。
 *
 * 只统计**时间窗内**的连续失败；窗口外的第一条 401 重新计数。
 */
function shouldTripUnauthorizedCircuit(): boolean {
  const now = Date.now()
  const windowExpired =
    !unauthorizedFailureWindowStartedAt || now - unauthorizedFailureWindowStartedAt > UNAUTHORIZED_FAILURE_WINDOW_MS
  if (windowExpired) {
    unauthorizedFailureWindowStartedAt = now
    unauthorizedFailureCount = 0
  }
  unauthorizedFailureCount += 1
  return unauthorizedFailureCount > UNAUTHORIZED_FAILURE_LIMIT
}

/**
 * 401 是否不走刷新 / 登出 / 跳转流程：调用方显式声明，或处于全量恢复后的跳转窗口
 * （会话本就已清空，别弹「登录已过期」、别抢在恢复流程之前跳激活页）。
 */
function skipsAuthRedirect(config: RetryableAxiosRequestConfig): boolean {
  return Boolean(config.skipAuthRedirect) || isNavigationLockedAfterRestore()
}

/**
 * 响应拦截器：处理 401 会话过期、403 CSRF 失效与 5xx/网络错误重试。
 * 错误处理顺序：
 * 1) 401：登录/刷新/激活/许可证接口直接拒绝；其余先会话刷新重试一次，再触发全局登出/跳转登录；
 * 2) 403 CSRF_INVALID：刷新 cookie 并重试一次；
 * 3) 5xx/网络错误（仅幂等请求）：按指数退避 + 抖动重试，最多 getRetryMax 次。
 */
apiClient.interceptors.response.use(
  (response) => {
    unauthorizedFailureCount = 0
    unauthorizedFailureWindowStartedAt = 0
    return response
  },
  async (error: AxiosError) => {
    const config = error.config as RetryableAxiosRequestConfig | undefined
    if (!config) return Promise.reject(error)

    if (error.response?.status === 401 && !skipsAuthRedirect(config) && !isHandling401) {
      const url = String(config.url || '')
      // 登录/初始化本身的 401 只表示凭据错误，不能清会话
      if (
        url.includes('/auth/login') ||
        url.includes('/auth/setup') ||
        url.includes('/auth/mfa/') ||
        url.includes('/auth/refresh') ||
        url.includes('/license/')
      ) {
        return Promise.reject(error)
      }
      // 未激活：跳转激活页，勿当登录过期去刷 token / 登出
      if (isLicenseInactiveError(error)) {
        // 真实路径历史路由：直接整页跳转 `/activate`（原 hash 写法在新架构下会失效）
        if (typeof window !== 'undefined' && !String(window.location.pathname).includes('activate')) {
          window.location.assign('/activate')
        }
        return Promise.reject(error)
      }
      // 登录成功后，丢弃登录前发出的过期 401，避免刚登入就被踢回登录页
      if (config._authGeneration !== undefined && config._authGeneration !== authGeneration) {
        return Promise.reject(error)
      }
      // 连续 401 熔断，避免凭据轮换时刷新/登出循环刷屏。
      if (shouldTripUnauthorizedCircuit()) {
        // 熔断只管**提示频率**，不能把登出也一起熔断：此前这里直接 return，于是凭据轮换 /
        // 后端重启后界面仍显示已登录、所有请求持续 401，既不跳登录页也不清本地用户态，
        // 用户只能手动刷新页面。
        if (!isHandling401) {
          isHandling401 = true
          runUnauthorizedHandler()
          runNavigateToLogin()
          setTimeout(() => {
            isHandling401 = false
          }, 1000)
        }
        const now = Date.now()
        if (now - lastUnauthorizedToastAt >= UNAUTHORIZED_TOAST_COOLDOWN_MS) {
          lastUnauthorizedToastAt = now
          appNotify('登录状态已失效，请重新登录', 'warning', UNAUTHORIZED_TOAST_COOLDOWN_MS)
        }
        return Promise.reject(error)
      }
      // 先无感刷新会话并重试一次（原生壳友好）
      if (!config._authRetried) {
        config._authRetried = true
        const refreshed = await runSessionRefresh()
        if (refreshed) {
          bumpAuthGeneration()
          config._authGeneration = authGeneration
          return apiClient(config)
        }
      }
      isHandling401 = true
      runUnauthorizedHandler()
      runNavigateToLogin()
      setTimeout(() => {
        isHandling401 = false
      }, 1000)
      return Promise.reject(error)
    }

    if (error.response?.status === 403 && isCsrfInvalidError(error) && !config._csrfRetried && !config._csrfBootstrap) {
      config._csrfRetried = true
      // forceReset=true 会先删除浏览器旧 csrf_token，强制后端 ensureCsrfCookie 重新下发新 token，
      // 避免并发 /setup/status 产生过多次 set-cookie 覆盖后 cookie 与 header 对不上。
      await refreshCsrfToken(true)
      const headers = AxiosHeaders.from(config.headers)
      applyCsrfHeader(headers)
      config.headers = headers
      return apiClient(config)
    }

    if (isRetryableError(error, config)) {
      config._retryCount = config._retryCount ?? 0
      if (config._retryCount < getRetryMax()) {
        config._retryCount += 1
        const delay = getRetryDelayMs() * Math.pow(2, config._retryCount - 1) * (0.8 + Math.random() * 0.4)
        await new Promise((r) => setTimeout(r, delay))
        return apiClient(config)
      }
    }

    return Promise.reject(error)
  },
)

export default apiClient

/** 进行中的 GET 请求缓存：key = method:url:params，相同请求共享 Promise 避免重复发起 */
const inflightGets = new Map<string, Promise<unknown>>()

/* API helpers keep a loose default generic so untyped call sites stay assignable;
 * prefer passing an explicit T at call sites when tightening response shapes. */

/**
 * 发起 GET 请求，默认开启并发去重：相同 method/url/params 的 GET 共享 Promise。
 * @param url 请求路径，相对 baseURL
 * @param config 请求配置；dedupe=false 可关闭去重
 * @returns Axios 响应；去重时返回与其它调用共享的 Promise
 */
// biome-ignore lint/suspicious/noExplicitAny: AxiosResponse.data 的边界默认类型
export const apiGet = <T = any>(url: string, config?: ApiRequestConfig) => {
  const params = config?.params
  const key = `get:${authGeneration}:${url}:${params == null ? '' : JSON.stringify(params)}`
  if (config?.dedupe !== false) {
    const existing = inflightGets.get(key)
    if (existing) return existing as Promise<AxiosResponse<T>>
  }
  const p = apiClient.get<T>(url, config).finally(() => {
    if (inflightGets.get(key) === p) inflightGets.delete(key)
  })
  inflightGets.set(key, p)
  return p
}

/** 发起 POST 请求；变更类方法默认不参与 5xx 重试，需要时显式声明 _idempotent。 */
// biome-ignore lint/suspicious/noExplicitAny: AxiosResponse.data 的边界默认类型
export const apiPost = <T = any>(url: string, data?: unknown, config?: ApiRequestConfig) =>
  apiClient.post<T>(url, data, config)

/** 发起 PUT 请求；变更类方法默认不参与 5xx 重试，需要时显式声明 _idempotent。 */
// biome-ignore lint/suspicious/noExplicitAny: AxiosResponse.data 的边界默认类型
export const apiPut = <T = any>(url: string, data?: unknown, config?: ApiRequestConfig) =>
  apiClient.put<T>(url, data, config)

/** 发起 DELETE 请求；变更类方法默认不参与 5xx 重试，需要时显式声明 _idempotent。 */
// biome-ignore lint/suspicious/noExplicitAny: AxiosResponse.data 的边界默认类型
export const apiDelete = <T = any>(url: string, config?: ApiRequestConfig) => apiClient.delete<T>(url, config)

// 为 studio 的裸 fetch 兜底注入 CSRF 头（幂等，仅同源 /api/** 变更类请求）。
// 单 HTTP 栈：CSRF 逻辑全部收敛在本模块 + ./api/csrf，auth 视图不再持有 HTTP 细节。
installFetchCsrf()

/**
 * CSRF 与裸 fetch 辅助（单一 HTTP 栈）。
 *
 * homeos 后端启用了 CSRF 双提交校验（`backend/src/platform/security/csrf.py`）：变更类请求必须
 * 携带 `X-CSRF-Token` 头，值与 `csrf_token` Cookie 一致。axios（`api-client`）在请求
 * 拦截器里自动注入；但 studio 代码仍大量使用**裸 `fetch`**，无法走拦截器，
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
function csrfToken(): string {
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

/** 系统运维、环境、语音、备份等 REST API 封装（/system/*、/environment/*、/ha/webrtc/*）。 */

/** 获取系统配置（完整）。 */
export function fetchSystemConfig(config?: AxiosRequestConfig) {
  return apiGet('/system/config', config)
}

/** 更新系统配置。 */
export function updateSystemConfig(body: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiPut('/system/config', body, config)
}

/** 获取未登录可见的公开系统配置。 */
export function fetchPublicSystemConfig<T = unknown>(config?: AxiosRequestConfig) {
  return apiGet<T>('/system/config/public', config)
}

/** 导出系统配置为可下载内容。 */
export function exportSystemConfig(config?: AxiosRequestConfig) {
  return apiGet('/system/config/export', config)
}

/** 导入系统配置。 */
export function importSystemConfig(body: unknown, config?: AxiosRequestConfig) {
  return apiPost('/system/config/import', body, config)
}

/** 重置指定分区或全部系统配置。 */
export function resetSystemConfig(section?: string, config?: AxiosRequestConfig) {
  return apiPost('/system/config/reset', section ? { section } : {}, config)
}

/** 获取配置健康检查（缺失/失效项）。 */
export function fetchConfigHealth(config?: AxiosRequestConfig) {
  return apiGet('/system/config/health', config)
}

/** 获取配置变更审计记录。 */
export function fetchConfigAudit(config?: AxiosRequestConfig) {
  return apiGet('/system/config-audit', config)
}

/** 获取系统健康总览。 */
export function fetchSystemHealth(config?: AxiosRequestConfig) {
  return apiGet('/system/health', config)
}

/** 获取系统诊断信息（资源/依赖/版本等）。 */
export function fetchSystemDiagnostics(config?: AxiosRequestConfig) {
  return apiGet('/system/diagnostics', config)
}

/** 系统后台任务快照：名称/描述/间隔/启用/运行次数/最近/下次执行/最近错误。 */
export type SystemJobSnapshot = {
  name: string
  description: string
  intervalMs?: number
  enabled: boolean
  runs: number
  lastRunAt: string | null
  lastDurationMs: number | null
  lastError: string | null
  nextRunAt: string | null
}

/** 获取后台任务调度快照。 */
export function fetchSystemJobs(config?: AxiosRequestConfig) {
  return apiGet<{ success: boolean; data: SystemJobSnapshot[] }>('/system/jobs', config)
}

/** 运行日志契约由 @homeos/shared/observability 统一维护（与后端环形缓冲对齐） */
export type { RuntimeLogEntry, RuntimeLogLevel }

/** 运行日志查询响应（与 @homeos/shared RuntimeLogQueryResult 对齐）。 */
export type RuntimeLogsResponse = RuntimeLogQueryResult

/** 分页查询运行日志，支持级别、关键字、上下文过滤与增量游标 afterId。 */
export function fetchRuntimeLogs(
  params?: {
    limit?: number
    level?: string
    q?: string
    context?: string
    afterId?: number
  },
  config?: AxiosRequestConfig,
) {
  return apiGet<RuntimeLogsResponse>('/system/runtime-logs', {
    ...config,
    params: { ...config?.params, ...params },
  })
}

/** 打开运行日志 SSE 推流连接（Cookie 鉴权；EventSource 无法带自定义头）。 */
export function openRuntimeLogsStream(params?: { level?: string; q?: string; context?: string; afterId?: number }) {
  const qs = new URLSearchParams()
  if (params?.level) qs.set('level', params.level)
  if (params?.q) qs.set('q', params.q)
  if (params?.context) qs.set('context', params.context)
  if (params?.afterId != null && params.afterId > 0) qs.set('afterId', String(params.afterId))
  const query = qs.toString()
  const url = `/api/v1/system/runtime-logs/stream${query ? `?${query}` : ''}`
  return new EventSource(url, { withCredentials: true })
}

/** 清空运行日志环形缓冲。 */
export function clearRuntimeLogs(config?: AxiosRequestConfig) {
  return apiDelete<{ cleared: number }>('/system/runtime-logs', config)
}

/** 标记向导完成并设置学习期天数。 */
export function completeSetupWizard(payload: { learningPeriodDays?: number }, config?: AxiosRequestConfig) {
  return apiPost('/system/setup-wizard/complete', payload, config)
}

/** 忽略向导清单（不再展示）。 */
export function dismissSetupChecklist(config?: AxiosRequestConfig) {
  return apiPost('/system/setup-wizard/checklist/dismiss', undefined, config)
}

/** 获取向导清单条目。 */
export function fetchSetupChecklist<T = unknown>(config?: AxiosRequestConfig) {
  return apiGet<T>('/system/setup-wizard/checklist', config)
}

/** 降低向导安防敏感度（用户反馈触发）。 */
export function reduceSetupSecuritySensitivity(
  payload?: { recordFeedback?: boolean; source?: string },
  config?: AxiosRequestConfig,
) {
  return apiPost('/system/setup-wizard/reduce-sensitivity', payload ?? {}, config)
}

/** 创建一次性服务器备份文件。 */
export function createServerBackup(config?: AxiosRequestConfig) {
  return apiPost('/system/backup/files/create', undefined, config)
}

/** 定时自动备份状态（开关 / 保留天数 / 上次与下次执行） */
export function fetchAutoBackupStatus(config?: AxiosRequestConfig) {
  return apiGet('/system/backup/auto/status', config)
}

/** 获取服务器备份文件列表。 */
export function fetchServerBackupFiles(config?: AxiosRequestConfig) {
  return apiGet('/system/backup/files', config)
}

/** 下载指定备份文件内容。 */
export function downloadServerBackupFile(name: string, config?: AxiosRequestConfig) {
  return apiGet('/system/backup/files/download', {
    ...config,
    responseType: 'blob',
    params: { ...config?.params, name },
  })
}

/** 删除指定备份文件。 */
export function deleteServerBackupFile(name: string, config?: AxiosRequestConfig) {
  return apiDelete('/system/backup/files', {
    ...config,
    params: { ...config?.params, name },
  })
}

/**
 * 还原指定全量备份文件（含数据库）。
 *
 * 需 `confirm=true` **且**提供当前管理员密码：这条接口会用备份包整体覆盖数据库
 * （含账号与授权），仅凭登录态不足以执行。
 */
export function restoreServerBackupFile(
  body: { name: string; confirm: boolean; adminPassword: string },
  config?: AxiosRequestConfig,
) {
  return apiPost(
    '/system/backup/files/restore',
    { name: body.name, confirm: body.confirm === true, adminPassword: body.adminPassword },
    config,
  )
}

/** 获取语音模块元信息（语言/引擎/能力）。 */
export function fetchVoiceMeta(config?: AxiosRequestConfig) {
  return apiGet('/system/voice/meta', config)
}

/** 获取语音预设列表。 */
export function fetchVoicePresets(config?: AxiosRequestConfig) {
  return apiGet('/system/voice/presets', config)
}

/** 获取 STT 健康状态 / 可用 provider / 自动探测实体。 */
export function fetchVoiceSttStatus(config?: AxiosRequestConfig) {
  return apiGet('/system/voice/stt-status', config)
}

/** 调用 HA Assistant conversation.process 进行文本对话测试。 */
export function processVoiceConversation(text: string, config?: AxiosRequestConfig) {
  return apiPost('/system/voice/conversation', { text }, config)
}

/** 语音转文字（STT）。 */
export function transcribeVoice(payload: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiPost('/system/voice/transcribe', payload, config)
}

/** 执行文本语音指令（意图解析 + 调用）。 */
export function executeVoiceCommand(text: string, config?: AxiosRequestConfig) {
  return apiPost('/system/voice/execute', { text }, config)
}

/** 文字转语音（TTS）合成与播报。 */
export function speakVoice(payload: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiPost('/system/voice/speak', payload, config)
}

/** 获取客户端电源状态（接入/电池/在离线）。 */
export function fetchClientPowerStatus<T = unknown>(config?: AxiosRequestConfig) {
  return apiGet<T>('/system/client-power/status', config)
}

/** 客户端上报电源状态（背景任务，跳过 401 跳转由调用方控制）。 */
export function reportClientPower(payload: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiPost('/system/client-power/report', payload, config)
}

/** 忽略客户端电源待处理事项。 */
export function dismissClientPowerPending(payload: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiPost('/system/client-power/pending/dismiss', payload, config)
}

/** 忽略客户端离线待处理事项。 */
export function dismissClientPowerOffline(payload: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiPost('/system/client-power/pending/dismiss-offline', payload, config)
}

/** 获取指定实体的 Advisor 用量明细。 */
export function fetchAdvisorUsage(entityId: string, params?: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiGet(`/system/advisor/usage/${encodeURIComponent(entityId)}`, {
    ...config,
    params: { ...config?.params, ...params },
  })
}

/** 获取 Advisor 用量汇总。 */
export function fetchAdvisorUsageSummary(params?: { days?: number }, config?: AxiosRequestConfig) {
  return apiGet('/system/advisor/usage/summary', {
    ...config,
    params: { ...config?.params, ...params },
  })
}

/** 获取被遗忘设备/实体列表（长期未触发）。 */
export function fetchAdvisorForgotten(config?: AxiosRequestConfig) {
  return apiGet('/system/advisor/forgotten', config)
}

/** 获取实体绑定缺口（未绑定到布局/区域的实体）。 */
export function fetchBindingsGaps(config?: AxiosRequestConfig) {
  return apiGet('/system/bindings/gaps', config)
}

/** 获取向导状态（是否已完成、当前阶段等）。 */
export function fetchSetupWizardStatus<T = unknown>(config?: AxiosRequestConfig) {
  return apiGet<T>('/system/setup-wizard/status', config)
}

/** 校验向导所选实体是否满足接入条件。 */
export function validateSetupWizardEntities(entityIds: string[], config?: AxiosRequestConfig) {
  return apiPost('/system/setup-wizard/validate-entities', { entityIds }, config)
}

/** 同时为多个目标合成并播报 TTS。 */
export function speakVoiceMultiple(payload: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiPost('/system/voice/speak-multiple', payload, config)
}

/** 僵尸绑定来源类型（与后端 ZombieBindingSource 对齐） */
type ZombieBindingSource = 'layoutWidget' | 'room' | 'stats' | 'haConfig' | 'alertRule'

/** 单条僵尸绑定 */
export type ZombieBindingItem = {
  source: ZombieBindingSource
  entityId: string
  /** 展示用实体名；缺省时前端回退为 object_id */
  entityName?: string
  refId: string
  location: string
}

/**
 * 本次扫描状态。
 *
 * `skipped` 表示 HA 尚未同步、根本没有检查；`partial` 表示只对照了状态库，
 * 结果可能不完整。两者都不能当成「没有僵尸」。
 */
export type ZombieScanInfo = {
  status: 'ok' | 'skipped' | 'partial'
  reason?: string
  haSynced: boolean
  storeCount: number
  registryCount: number
  registryAvailable: boolean
  aliveCount: number
  scanned: Partial<Record<ZombieBindingSource, number>>
}

/** GET /system/devices 响应 */
export type DevicesOverviewResponse = {
  zombieBindings: ZombieBindingItem[]
  scan?: ZombieScanInfo
}

/** 批量解绑结果 */
export type ZombieUnbindResponse = {
  processed: number
  unbound: number
  skipped: number
  failed: number
  results: Array<{
    source: ZombieBindingSource
    entityId: string
    refId: string
    status: 'unbound' | 'skipped' | 'failed'
    message?: string
  }>
}

/** 设备管理总览：僵尸绑定列表 */
export function fetchDevicesOverview(config?: AxiosRequestConfig) {
  return apiGet<DevicesOverviewResponse>('/system/devices', config)
}

/** 批量解绑僵尸绑定（幂等，返回处理统计） */
export function unbindZombieBindings(items: ZombieBindingItem[], config?: AxiosRequestConfig) {
  return apiPost<ZombieUnbindResponse>('/system/devices/unbind', { items }, config)
}

// 数据保留（E9：设置面板「数据保留」）

/** 单表保留策略项（对应后端 RetentionTablePolicy） */
type RetentionPolicyItem = {
  key: string
  table: string
  label: string
  retentionDays: number
}

/** 最近一次清理统计（对应后端 RetentionCleanupStats） */
type RetentionLastCleanup = {
  at: string
  retentionDays: number
  total: number
  deleted: Record<string, number>
  elapsedMs: number
}

/** GET /system/config/retention 响应 */
export type RetentionConfigResponse = {
  policies: RetentionPolicyItem[]
  lastCleanup: RetentionLastCleanup | null
  estimatedRows: Record<string, number>
}

/** 获取各表保留策略与最近一次清理统计 */
export function fetchRetentionConfig(config?: AxiosRequestConfig) {
  return apiGet<RetentionConfigResponse>('/system/config/retention', config)
}

/** 更新各表保留天数（部分更新，未提供的表保持原值） */
export function updateRetentionConfig(body: { retention: Record<string, number> }, config?: AxiosRequestConfig) {
  return apiPut<RetentionConfigResponse>('/system/config/retention', body, config)
}

// 跨端网络与远程访问（供原生端同步与登录下发读取）

/** GET /system/network-info 响应（与后端 NetworkInfo 对齐） */
export type SystemNetworkInfo = {
  /** 后端监听端口 */
  port: number
  /** 前端访问端口（生产由后端托管 SPA，走后端回退链推导） */
  frontendPort: number
  /** 后端端口（与 port 同源） */
  backendPort: number
  /** 本机内网 IP */
  localIp: string
  /** 内网访问地址 */
  internalUrl: string
  /** 远程访问地址（layout.externalUrl） */
  externalUrl: string
  /** 公网 IPv4；探针失败为 null */
  publicIpv4: string | null
  /** 公网 IPv6；探针失败为 null */
  publicIpv6: string | null
  /** 本机原生 IPv6（公网探针失败时的回退展示） */
  localIpv6: string | null
  /** 采集时间戳（ISO 8601） */
  timestamp: string
}

/** 获取跨端网络与远程访问信息（内网地址 / 公网 IPv4·IPv6 / 端口回退）。 */
export function fetchSystemNetworkInfo(config?: AxiosRequestConfig) {
  return apiGet<SystemNetworkInfo>('/system/network-info', config)
}
