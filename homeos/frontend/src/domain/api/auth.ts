/** 认证与初始化 REST API 封装（单用户注册登录口径） */
import type { AxiosRequestConfig } from 'axios'
import { apiGet, apiPost } from '../../kernel/http/client'
import type { ApiRequestConfig } from '../../kernel/http/client'
import type { AuthUserPayload } from '@/kernel/types/auth'

/** 系统初始化状态。对应后端 endpoint：GET /setup/status */
export function getSetupStatus(config?: ApiRequestConfig) {
  return apiGet<{ initialized: boolean }>('/setup/status', config)
}

/** 发送注册邮箱验证码（由商店服务器代发）的响应。对应 endpoint：POST /auth/verification */
export interface VerificationResult {
  email: string
  delivered: boolean
  resendAfter?: number | null
}

/** 请求验证码的用途：首装注册 / 找回本机密码（服务端再映射成商店侧用途）。 */
export type VerificationPurpose = 'register' | 'reset'

/** 请求邮箱验证码。对应后端 endpoint：POST /auth/verification */
export function sendVerificationCode(
  email: string,
  purpose: VerificationPurpose = 'register',
  config?: AxiosRequestConfig,
) {
  return apiPost<VerificationResult>('/auth/verification', { email, purpose }, config)
}

/** 注册请求体。 */
export interface RegisterPayload {
  username: string
  email: string
  code: string
  password: string
  passwordConfirmation: string
}

/** 单用户注册（账号 + 邮箱 + 密码 + 验证码），成功后由服务端直接建立登录会话。 */
export function register(payload: RegisterPayload, config?: AxiosRequestConfig) {
  return apiPost<AuthUserPayload>('/auth/register', payload, config)
}

/** 账号（用户名或注册邮箱）+ 密码登录。对应后端 endpoint：POST /auth/login */
export function login(username: string, password: string, config?: AxiosRequestConfig) {
  return apiPost<AuthUserPayload>('/auth/login', { username, password }, config)
}

/** 登出当前会话。对应后端 endpoint：POST /auth/logout */
export function logout(config?: AxiosRequestConfig) {
  return apiPost('/auth/logout', undefined, config)
}

/** 找回本机密码请求体（邮箱验证码证明邮箱归属）。 */
export interface PasswordResetPayload {
  email: string
  code: string
  password: string
  passwordConfirmation: string
}

/** 用注册邮箱验证码重置本机密码；成功后不发会话，需要重新登录。 */
export function resetPassword(payload: PasswordResetPayload, config?: AxiosRequestConfig) {
  return apiPost<{ reset: boolean }>('/auth/password/reset', payload, config)
}

/** 修改本机密码请求体（需已登录）。 */
export interface PasswordChangePayload {
  currentPassword: string
  newPassword: string
  newPasswordConfirmation: string
}

/** 已登录状态修改密码；成功后服务端会轮换会话 Cookie。 */
export function changePassword(payload: PasswordChangePayload, config?: AxiosRequestConfig) {
  return apiPost<AuthUserPayload>('/auth/password/change', payload, config)
}

/** 查询当前登录身份。对应后端 endpoint：GET /auth/me */
export function getMe(config?: ApiRequestConfig) {
  return apiGet<AuthUserPayload>('/auth/me', config)
}

/** 短票据响应：`expiresIn` 为秒。 */
export interface MediaTicketResult {
  success: boolean
  ticket: string
  expiresIn: number
}

/** 申请 60 秒短票据（`<img>` / MJPEG / SSE 用 `?ticket=` 鉴权）。 */
export function getMediaTicket(config?: ApiRequestConfig) {
  return apiGet<MediaTicketResult>('/auth/ticket', { dedupe: false, ...config })
}

/** 进程内票据缓存：提前 10s 续签，避免每个媒体 URL 都打一次接口。 */
let cachedTicket: { value: string; expiresAt: number } | null = null

/**
 * 给媒体 URL 追加 `ticket` 查询参数。
 *
 * 只在「无法依赖 Cookie」的场景调用（跨源嵌入、WebView 的 img/EventSource）；
 * 同源页面直接用相对 URL 即可，Cookie 会自动携带。
 */
export async function withMediaTicket(url: string): Promise<string> {
  const now = Date.now()
  if (!cachedTicket || cachedTicket.expiresAt - 10_000 <= now) {
    const response = await getMediaTicket()
    const payload = response.data
    cachedTicket = {
      value: payload.ticket,
      expiresAt: now + Math.max(1, payload.expiresIn) * 1000,
    }
  }
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}ticket=${encodeURIComponent(cachedTicket.value)}`
}

/** 清空票据缓存（登出时调用，避免把旧会话的票据带给新会话）。 */
export function clearMediaTicketCache(): void {
  cachedTicket = null
}
