/**
 * 认证与初始化 REST API 封装（homeos-3d 原生契约）
 *
 * 端点范围：GET /setup/status、POST /setup/admin、POST /auth/login、
 *           POST /auth/logout、GET /auth/me。
 * 依赖：../api-client 提供的 apiGet / apiPost；@/types/auth 类型定义。
 */
import type { AxiosRequestConfig } from 'axios'
import { apiGet, apiPost } from '../api-client'
import type { ApiRequestConfig } from '../api-client'
import type { AuthUserPayload } from '@/types/auth'

/** 系统初始化状态。对应后端 endpoint：GET /setup/status */
export function getSetupStatus(config?: ApiRequestConfig) {
  return apiGet<{ initialized: boolean }>('/setup/status', config)
}

/**
 * 首次初始化管理员账户。对应后端 endpoint：POST /setup/admin
 * @param username 管理员用户名
 * @param password 管理员密码
 * @param passwordConfirmation 二次输入的管理员密码
 * @returns 创建的管理员用户信息
 */
export function setupAdmin(
  username: string,
  password: string,
  passwordConfirmation: string,
  config?: AxiosRequestConfig,
) {
  return apiPost<AuthUserPayload>(
    '/setup/admin',
    { username, password, passwordConfirmation },
    config,
  )
}

/**
 * 用户名密码登录。对应后端 endpoint：POST /auth/login
 * @returns 登录用户信息
 */
export function login(username: string, password: string, config?: AxiosRequestConfig) {
  return apiPost<AuthUserPayload>('/auth/login', { username, password }, config)
}

/** 登出当前会话。对应后端 endpoint：POST /auth/logout */
export function logout(config?: AxiosRequestConfig) {
  return apiPost('/auth/logout', undefined, config)
}

/**
 * 查询当前登录身份。对应后端 endpoint：GET /auth/me
 *
 * 该请求同时触发服务端会话滑动续期（``lastSeenAt`` / ``expiresAt``），因此也是「会话保活」入口。
 */
export function getMe(config?: ApiRequestConfig) {
  return apiGet<AuthUserPayload>('/auth/me', config)
}
