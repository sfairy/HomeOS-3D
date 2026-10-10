/**
 * @module core/error-message
 * @description 统一提取与本地化后端 / Axios 错误消息的工具。
 *
 * 职责：
 *  - 识别后端不可达错误（502/503/504/网络错误/超时）；
 *  - 从 AxiosLikeError 响应体中提取后端业务文案；
 *  - 将常见英文 HTTP/网络/Nest 异常文案本地化为简体中文用户提示。
 *
 * 依赖：@homeos/shared/errors（HTTP 文案与关键词正则的共享映射表）。
 * 本文件仅保留 Axios 错误的输入解析层与前端特有逻辑
 * （动态限流等待提示、后端不可达提示、中文会话失效文案归一等）。
 */
import { HTTP_MESSAGE_PATTERNS, HTTP_MESSAGE_TEXTS } from '@homeos/shared'
/** Axios 风格错误的最小结构（无需引入 axios 类型） */
type AxiosLikeError = {
  response?: {
    data?: { message?: string | string[]; traceId?: string; apiErrorCode?: string }
    status?: number
    headers?: Record<string, unknown>
  }
  code?: string
  message?: string
}

function readRetryAfterSeconds(headers?: Record<string, unknown>): number | null {
  if (!headers) return null
  const raw =
    headers['retry-after'] ??
    headers['Retry-After'] ??
    headers['retry-after-default'] ??
    headers['Retry-After-default']
  const n = Number(Array.isArray(raw) ? raw[0] : raw)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.ceil(n)
}

/** 限流提示：尽量带上等待时间（无 Retry-After 时回退到共享默认文案） */
function formatRateLimitMessage(retryAfterSec?: number | null): string {
  if (retryAfterSec != null && retryAfterSec > 0) {
    if (retryAfterSec < 60) return `操作过于频繁，请约 ${retryAfterSec} 秒后再试`
    const mins = Math.max(1, Math.ceil(retryAfterSec / 60))
    return `操作过于频繁，请约 ${mins} 分钟后再试`
  }
  return HTTP_MESSAGE_TEXTS.rateLimited
}

/**
 * 判断错误是否属于「后端不可达」。
 * 涵盖 502/503/504、网络错误（ERR_NETWORK）、连接中断（ECONNABORTED）、
 * 以及 message 含 network error / timeout 的场景。
 * @param error 任意错误对象
 * @returns 是否后端不可达
 */
export function isBackendUnreachableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as AxiosLikeError
  const status = e.response?.status
  if (status === 502 || status === 503 || status === 504) return true
  // Vite 开发代理在后端挂掉时历史上会回落成空 500；有明确业务 message 的 500 不当作不可达
  if (status === 500) {
    const msg = flattenApiMessage(e.response?.data?.message)
    if (
      !msg ||
      /internal server error|无法连接后端|无法连接服务器|无法连接 HomeOS|后端暂未就绪|服务暂时不可用/i.test(
        msg,
      )
    ) {
      return true
    }
  }
  if (e.code === 'ERR_NETWORK' || e.code === 'ECONNABORTED') return true
  if (typeof e.message === 'string') {
    if (/network error/i.test(e.message)) return true
    if (/timeout/i.test(e.message)) return true
  }
  return false
}

/** 后端不可达时给出面向用户的提示（开发环境附带启动命令） */
export function getBackendUnreachableHint(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    return '后端暂未就绪，请先运行 bun run dev:backend，稍后刷新'
  }
  return '服务暂时不可用，请稍后刷新重试'
}

function backendUnreachableHint(): string {
  return getBackendUnreachableHint()
}

/** 展平 Nest ValidationPipe 等返回的 string | string[] | { message } */
function flattenApiMessage(raw: unknown): string {
  if (Array.isArray(raw)) {
    return raw.map((x) => flattenApiMessage(x)).filter(Boolean).join('；')
  }
  if (typeof raw === 'string') return raw.trim()
  if (raw && typeof raw === 'object' && 'message' in raw) {
    return flattenApiMessage((raw as { message: unknown }).message)
  }
  if (raw == null) return ''
  return String(raw).trim()
}

/** 商业授权未激活导致的 401（勿当登录过期处理）
 *
 * 主判据是门禁下发的结构化 ``apiErrorCode``；再用信封文案兜底一层：
 * 一旦 ``apiErrorCode`` 被代理 / 包装层丢掉，只认结构化码就会把「未激活」
 * 误判成「登录过期」，走进刷新会话 → 重试 → 再 401 的循环。
 */
export function isLicenseInactiveError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as AxiosLikeError
  if (e.response?.status !== 401) return false
  if (e.response?.data?.apiErrorCode === 'LICENSE_INACTIVE') return true
  const text = flattenApiMessage(e.response?.data?.message)
  return text.includes('LICENSE_INACTIVE') || text.includes('未激活')
}

/**
 * 判断错误是否为 401 未授权（会话失效 / 未登录）。
 * 登录表单凭据错误也会是 401，调用方若需区分请结合请求 URL。
 */
export function isUnauthorizedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  return (error as AxiosLikeError).response?.status === 401
}

/**
 * 从任意错误中提取面向用户的可读消息。
 * 优先级：后端业务文案 > 后端不可达提示 > 本地化后的 message > 未知错误。
 * @param error 任意错误
 * @returns 本地化后的错误消息字符串
 */
export function extractErrorMessage(error: unknown): string {
  if (!error) return '未知错误'
  if (typeof error === 'string') return localizeAxiosishMessage(error)
  if (typeof error === 'object') {
    const e = error as AxiosLikeError
    const data = e.response?.data
    const apiMsg = flattenApiMessage(data?.message)
    const status = e.response?.status
    const retryAfter = readRetryAfterSeconds(e.response?.headers)

    // 429：优先用带等待时间的提示（覆盖后端笼统中文/英文）
    if (
      status === 429 ||
      /throttler|too many requests|操作过于频繁/i.test(apiMsg)
    ) {
      return formatRateLimitMessage(retryAfter)
    }

    // 业务文案优先（含 503 服务暂不可用等）；Vite 代理空/笼统 500 除外
    const proxyishEmpty500 =
      status === 500 && (!apiMsg || /^(internal server error|服务器内部错误)$/i.test(apiMsg))
    if (apiMsg && !proxyishEmpty500) {
      return localizeAxiosishMessage(apiMsg, status)
    }
    if (isBackendUnreachableError(e)) return backendUnreachableHint()
    if (e.message) return localizeAxiosishMessage(String(e.message), status)
  }
  return '未知错误'
}

/**
 * 将 Axios 风格的英文错误消息本地化为简体中文。
 * 已含中文的消息原样返回；按 HTTP 状态码与关键词匹配对应中文文案。
 * @param message 原始消息
 * @param status HTTP 状态码（可选，用于精确匹配）
 * @returns 本地化后的消息
 */
function localizeAxiosishMessage(message: string, status?: number): string {
  let m = message.trim()
  if (!m) return '未知错误'
  m = m.replace(/^[A-Za-z][A-Za-z0-9]*Exception:\s*/i, '').trim() || m
  // 会话失效类文案统一为可行动提示（保留密码错误等具体业务中文）
  if (
    /^(未登录或登录已过期|会话已失效|会话已失效，请重新登录)$/.test(m) ||
    (status === 401 && /会话已失效|登录已过期|未登录或登录已过期/.test(m) && !/密码|用户名|验证码|凭证/.test(m))
  ) {
    return HTTP_MESSAGE_TEXTS.tokenExpired
  }
  // 历史/代理侧冗长「无法连接后端…」文案统一为短提示
  if (/无法连接后端|无法连接 HomeOS 后端|无法连接服务器/.test(m)) {
    return backendUnreachableHint()
  }
  if (/[\u4e00-\u9fff]/.test(m)) return m
  const statusMatch = m.match(/status code\s+(\d+)/i)
  const code = status ?? (statusMatch ? Number(statusMatch[1]) : undefined)
  // 仅映射「笼统」英文状态名；带细节的校验/业务英文文案保留原文（中文业务文案已在上方返回）
  if (HTTP_MESSAGE_PATTERNS.badRequest.test(m)) return HTTP_MESSAGE_TEXTS.badRequest
  // unauthorized 关键词（前端口径与 tokenExpired 一致；后端为「未登录或登录已过期」，故不进共享表）
  if (/^unauthorized$/i.test(m)) {
    return HTTP_MESSAGE_TEXTS.tokenExpired
  }
  if (HTTP_MESSAGE_PATTERNS.forbidden.test(m) || HTTP_MESSAGE_PATTERNS.forbiddenResource.test(m)) {
    return HTTP_MESSAGE_TEXTS.forbidden
  }
  if (code === 401) return HTTP_MESSAGE_TEXTS.tokenExpired
  if (code === 403) return HTTP_MESSAGE_TEXTS.forbidden
  if (code === 404 || HTTP_MESSAGE_PATTERNS.notFound.test(m)) return HTTP_MESSAGE_TEXTS.notFound
  if (code === 408 || HTTP_MESSAGE_PATTERNS.timeout.test(m)) return HTTP_MESSAGE_TEXTS.timeout
  if (code === 409 || HTTP_MESSAGE_PATTERNS.conflict.test(m)) return HTTP_MESSAGE_TEXTS.conflict
  if (code === 429 || HTTP_MESSAGE_PATTERNS.throttler.test(m)) {
    return formatRateLimitMessage(null)
  }
  if (code === 400) {
    // 有具体校验细节时保留（多为 class-validator 英文），仅空/笼统时回退
    return m || HTTP_MESSAGE_TEXTS.badRequest
  }
  if (code === 500 || HTTP_MESSAGE_PATTERNS.internalServerError.test(m)) {
    return HTTP_MESSAGE_TEXTS.internalServerError
  }
  if (code === 502 || code === 503 || code === 504) return backendUnreachableHint()
  if (/network error/i.test(m)) return backendUnreachableHint()
  if (HTTP_MESSAGE_PATTERNS.csrf.test(m)) return HTTP_MESSAGE_TEXTS.csrf
  if (HTTP_MESSAGE_PATTERNS.tokenExpired.test(m)) {
    return HTTP_MESSAGE_TEXTS.tokenExpired
  }
  if (/request failed/i.test(m) && code) return `请求失败（${code}）`
  if (/request failed/i.test(m)) return '请求失败'
  return m
}

/**
 * axios 错误消息 + 回退文案（composable 返回值常用）。
 * @param error 任意错误
 * @param fallback extractErrorMessage 无有效文案时的回退，默认「操作失败」
 * @returns 面向用户的错误消息
 */
export function getApiErrorMessage(error: unknown, fallback?: string): string {
  const fb = fallback ?? '操作失败'
  const msg = extractErrorMessage(error)
  return msg && msg !== '未知错误' ? msg : fb
}
