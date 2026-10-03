/**
 * 认证与用户管理 REST API 封装
 *
 * 所属模块：前端服务层（services/api/）
 * 职责：封装登录/登出、MFA、用户管理、访客令牌、登录审计等接口。
 * 依赖：../api-client 提供的 apiGet / apiPost / apiPatch / apiPut / apiDelete；@/types/auth 类型定义。
 * 端点范围：/auth/status、/auth/login、/auth/logout、/auth/refresh、/auth/setup、
 *           /auth/profile、/auth/preferences、/auth/guest-token、/auth/guest-exchange、
 *           /auth/guest-login、/auth/users、/auth/mfa/*、/auth/login-audit。
 */
import type { AxiosRequestConfig } from 'axios'
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '../api-client'
import type { AuthUserPayload, LoginResult } from '@/types/auth'

/**
 * 获取当前认证会话状态。
 * 对应后端 endpoint：GET /auth/status
 * @returns 当前用户信息载荷
 */
export function getAuthStatus(config?: AxiosRequestConfig) {
  return apiGet<AuthUserPayload>('/auth/status', config)
}

/**
 * 用户名密码登录。
 * 对应后端 endpoint：POST /auth/login
 * @param username 用户名
 * @param password 密码
 * @returns 登录结果（含用户信息）
 */
export function login(username: string, password: string, config?: AxiosRequestConfig) {
  return apiPost<LoginResult>('/auth/login', { username, password }, config)
}

/**
 * 验证 MFA 二步验证码。
 * 对应后端 endpoint：POST /auth/mfa/verify
 * @param username 用户名
 * @param password 密码
 * @param code MFA 验证码
 * @returns 验证成功后的用户信息
 */
export function verifyMfa(
  username: string,
  password: string,
  code: string,
  config?: AxiosRequestConfig,
) {
  return apiPost<AuthUserPayload>('/auth/mfa/verify', { username, password, code }, config)
}

/**
 * 登出当前会话。
 * 对应后端 endpoint：POST /auth/logout
 * @returns 操作结果
 */
export function logout(config?: AxiosRequestConfig) {
  return apiPost('/auth/logout', undefined, config)
}

/**
 * 刷新会话令牌。
 * 对应后端 endpoint：POST /auth/refresh
 * @returns 刷新后的用户信息
 */
export function refreshSession(config?: AxiosRequestConfig) {
  return apiPost<AuthUserPayload>('/auth/refresh', undefined, config)
}

/**
 * 首次初始化管理员账户。
 * 对应后端 endpoint：POST /auth/setup
 * @param username 管理员用户名
 * @param password 管理员密码
 * @returns 创建的管理员用户信息
 */
export function setupAuth(username: string, password: string, config?: AxiosRequestConfig) {
  return apiPost<AuthUserPayload>('/auth/setup', { username, password }, config)
}

/**
 * 更新当前用户资料。
 * 对应后端 endpoint：PATCH /auth/profile
 * @param data 待更新字段
 * @returns 操作结果
 */
export function updateAuthProfile(data: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiPatch('/auth/profile', data, config)
}

/**
 * 获取当前用户偏好设置。
 * 对应后端 endpoint：GET /auth/preferences
 * @returns 偏好设置对象
 */
export function fetchAuthPreferences(config?: AxiosRequestConfig) {
  return apiGet('/auth/preferences', config)
}

/**
 * 更新当前用户偏好设置。
 * 对应后端 endpoint：PUT /auth/preferences
 * @param payload 偏好设置载荷
 * @returns 操作结果
 */
export function updateAuthPreferences(
  payload: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiPut('/auth/preferences', payload, config)
}

/**
 * 创建访客访问令牌。
 * 对应后端 endpoint：POST /auth/guest-token
 * @param payload 包含 validHours 有效时长与可选 restrictions 限制
 * @returns 访客令牌信息
 */
export function createGuestToken(
  payload: { validHours: number; restrictions?: unknown },
  config?: AxiosRequestConfig,
) {
  return apiPost('/auth/guest-token', payload, config)
}

/**
 * 将访客码换取令牌。
 * 对应后端 endpoint：POST /auth/guest-exchange
 * @param code 访客码
 * @returns 交换结果
 */
export function exchangeGuestCode(code: string, config?: AxiosRequestConfig) {
  return apiPost('/auth/guest-exchange', { code }, config)
}

/**
 * 使用访客令牌登录。
 * 对应后端 endpoint：POST /auth/guest-login
 * @param token 访客令牌
 * @returns 登录结果
 */
export function guestLogin(token: string, config?: AxiosRequestConfig) {
  return apiPost('/auth/guest-login', { token }, config)
}

/**
 * 获取全部用户列表。
 * 对应后端 endpoint：GET /auth/users
 * @returns 用户列表
 */
export function fetchAuthUsers(config?: AxiosRequestConfig) {
  return apiGet('/auth/users', config)
}

/**
 * 创建新用户。
 * 对应后端 endpoint：POST /auth/users
 * @param payload 用户信息
 * @returns 创建结果
 */
export function createAuthUser(payload: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiPost('/auth/users', payload, config)
}

/**
 * 更新指定用户。
 * 对应后端 endpoint：PATCH /auth/users/{id}
 * @param id 用户标识
 * @param payload 待更新字段
 * @returns 操作结果
 */
export function updateAuthUser(
  id: string,
  payload: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiPatch(`/auth/users/${id}`, payload, config)
}

/**
 * 删除指定用户。
 * 对应后端 endpoint：DELETE /auth/users/{id}
 * @param id 用户标识
 * @returns 操作结果
 */
export function deleteAuthUser(id: string, config?: AxiosRequestConfig) {
  return apiDelete(`/auth/users/${id}`, config)
}

/**
 * 查询当前用户 MFA 状态。
 * 对应后端 endpoint：GET /auth/mfa/status
 * @returns MFA 状态信息
 */
export function getMfaStatus<T = unknown>(config?: AxiosRequestConfig) {
  return apiGet<T>('/auth/mfa/status', config)
}

/**
 * 发起 MFA 设置流程。
 * 对应后端 endpoint：POST /auth/mfa/setup
 * @returns 包含密钥与二维码的设置信息
 */
export function setupMfa<T = unknown>(config?: AxiosRequestConfig) {
  return apiPost<T>('/auth/mfa/setup', undefined, config)
}

/**
 * 确认 MFA 设置并启用。
 * 对应后端 endpoint：POST /auth/mfa/confirm
 * @param code 验证码
 * @returns 操作结果
 */
export function confirmMfa(code: string, config?: AxiosRequestConfig) {
  return apiPost('/auth/mfa/confirm', { code }, config)
}

/**
 * 关闭 MFA。
 * 对应后端 endpoint：POST /auth/mfa/disable
 * @param code 验证码
 * @returns 操作结果
 */
export function disableMfa(code: string, config?: AxiosRequestConfig) {
  return apiPost('/auth/mfa/disable', { code }, config)
}

/**
 * 查询登录审计日志。
 * 对应后端 endpoint：GET /auth/login-audit
 * @returns 审计日志列表
 */
export function fetchLoginAudit(
  params?: { limit?: number; page?: number },
  config?: AxiosRequestConfig,
) {
  return apiGet('/auth/login-audit', { ...config, params: { ...config?.params, ...params } })
}
