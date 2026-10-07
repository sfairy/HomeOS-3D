/**
 * API 客户端 - Axios 实例配置
 *
 * 服务职责：统一封装 HomeOS 后端 REST API 的 HTTP 请求，覆盖认证、CSRF、重试、并发去重、
 *           会话刷新与全局错误路由；同时承载 401/403/5xx 的统一处理逻辑。
 * 关键依赖：
 * - axios：HTTP 客户端
 * - @/utils/bridge/store-bridge：注入 401 处理器、跳转登录、会话刷新等原生桥接回调
 * - @/utils/telemetry/trace.util：注入 X-Trace-Id 链路追踪
 * - @/utils/config/frontend-config：运行期 API 超时/重试配置
 * - @/utils/core/logger、@/utils/core/error-message：日志与错误分类
 * 端点：baseURL = /api/v1（REST）；CSRF 走 /setup/status 下发 cookie
 *
 * 认证方案：HttpOnly Cookie
 * - Token 由服务端设置到 HttpOnly Cookie 中
 * - 前端无需手动注入 Authorization 头
 * - Cookie 随请求自动发送，防止 XSS 窃取 Token
 *
 * 关键机制：
 * - CSRF：变更类请求自动注入 X-CSRF-Token；遇 403 CSRF_INVALID 时刷新 cookie 并重试一次
 * - 401 重试：登录/刷新/激活接口的 401 视为凭据错误直接拒绝；其余先无感刷新会话再重试一次
 * - 5xx/网络错误重试：幂等（GET 或显式 _idempotent）请求按指数退避 + 抖动重试
 * - GET 并发去重：相同 method/url/params 的 GET 共享 Promise，避免短时间重复请求
 * - 认证世代（authGeneration）：登录/登出/刷新后递增，用于丢弃过期请求的 401
 */
import axios, {
  AxiosHeaders,
  type AxiosError,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import {
  appNotify,
  runUnauthorizedHandler,
  runNavigateToLogin,
  runSessionRefresh,
} from '@/utils/bridge/store-bridge'
import { getPageTraceId } from '@/utils/telemetry/trace.util'
import { getFrontendConfig } from '@/utils/config/frontend-config'
import { logger } from '@/utils/core/logger'
import { isLicenseInactiveError } from '@/utils/core/error-message'
import { installFetchCsrf } from './api/csrf'

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
export function refreshCsrfToken(forceReset = false): Promise<void> {
  if (forceReset) clearCsrfCookie()
  if (!csrfRefreshPromise) {
    csrfRefreshPromise = apiClient
      .get('/setup/status', {
        skipAuthRedirect: true,
        _csrfBootstrap: true,
      } as RetryableAxiosRequestConfig)
      .then(() => undefined)
      .catch((err) => {
        logger.warn('[API 客户端] CSRF 令牌刷新失败', err)
        return undefined
      })
      .finally(() => {
        csrfRefreshPromise = null
      })
  }
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
  const cfg = getFrontendConfig()
  // axios 在进入拦截器前已把实例 defaults 合并进 config，因此 config.timeout 不会是 undefined。
  // 未显式传入 timeout 时其值等于实例默认超时，此时对齐到运行配置；显式传入的值（含等于旧默认值）则保留。
  if (config.timeout === apiClient.defaults.timeout) {
    config.timeout = cfg.apiTimeoutMs
  }
  // 同步实例默认超时，后续请求的默认值跟随运行配置，显式 timeout 会自然覆盖 defaults。
  apiClient.defaults.timeout = cfg.apiTimeoutMs
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
          '当前 document.cookie 含 csrf_token=' + (getCsrfToken() ? 'present' : 'absent'),
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

    if (error.response?.status === 401 && !config.skipAuthRedirect && !isHandling401) {
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
      const now = Date.now()
      if (!unauthorizedFailureWindowStartedAt || now - unauthorizedFailureWindowStartedAt > UNAUTHORIZED_FAILURE_WINDOW_MS) {
        unauthorizedFailureWindowStartedAt = now
        unauthorizedFailureCount = 0
      }
      unauthorizedFailureCount += 1
      if (unauthorizedFailureCount > UNAUTHORIZED_FAILURE_LIMIT) {
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

    if (
      error.response?.status === 403 &&
      isCsrfInvalidError(error) &&
      !config._csrfRetried &&
      !config._csrfBootstrap
    ) {
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
        const delay =
          getRetryDelayMs() * Math.pow(2, config._retryCount - 1) * (0.8 + Math.random() * 0.4)
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- AxiosResponse.data 的边界默认类型
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- AxiosResponse.data 的边界默认类型
export const apiPost = <T = any>(url: string, data?: unknown, config?: ApiRequestConfig) =>
  apiClient.post<T>(url, data, config)

/** 发起 PUT 请求；变更类方法默认不参与 5xx 重试，需要时显式声明 _idempotent。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- AxiosResponse.data 的边界默认类型
export const apiPut = <T = any>(url: string, data?: unknown, config?: ApiRequestConfig) =>
  apiClient.put<T>(url, data, config)

/** 发起 DELETE 请求；变更类方法默认不参与 5xx 重试，需要时显式声明 _idempotent。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- AxiosResponse.data 的边界默认类型
export const apiDelete = <T = any>(url: string, config?: ApiRequestConfig) =>
  apiClient.delete<T>(url, config)

// 为并入的 studio 遗留裸 fetch 兜底注入 CSRF 头（幂等，仅同源 /api/** 变更类请求）。
// 单 HTTP 栈：CSRF 逻辑全部收敛在本模块 + ./api/csrf，auth 视图不再持有 HTTP 细节。
installFetchCsrf()
