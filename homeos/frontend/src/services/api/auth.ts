/** 认证与初始化 REST API 封装（单用户注册登录口径） */
import type { AxiosRequestConfig } from 'axios'
import { apiGet, apiPost } from './client'
import type { ApiRequestConfig } from './client'
import type { AuthUserPayload } from '@/shared/types/auth'

/** 系统初始化状态。对应后端 endpoint：GET /setup/status */
export function getSetupStatus(config?: ApiRequestConfig) {
  return apiGet<{ initialized: boolean }>('/setup/status', config)
}

/** 发送注册邮箱验证码（由商店服务器代发）的响应。对应 endpoint：POST /auth/verification */
export interface VerificationResult {
  email: string
  delivered: boolean
  resendAfter?: number | null
  deliveryMode?: string | null
}

/** 请求注册邮箱验证码。对应后端 endpoint：POST /auth/verification */
export function sendVerificationCode(email: string, config?: AxiosRequestConfig) {
  return apiPost<VerificationResult>('/auth/verification', { email }, config)
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

/** 查询当前登录身份。对应后端 endpoint：GET /auth/me */
export function getMe(config?: ApiRequestConfig) {
  return apiGet<AuthUserPayload>('/auth/me', config)
}
