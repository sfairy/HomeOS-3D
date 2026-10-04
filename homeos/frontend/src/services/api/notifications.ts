/**
 * 通知模块 REST API 封装
 *
 * 职责：封装通知查询、设置、规则 CRUD、已读标记、批量清理以及 WebPush 订阅等接口。
 * 依赖：../api-client 提供的 apiGet / apiPost / apiPut / apiDelete。
 * 端点范围：/notifications、/notifications/stats、/notifications/settings、/notifications/preferences、
 *           /notifications/{id}/read、/notifications/read-all、/notifications/clear、
 *           /notifications/rules[/{id}]、/notifications/rules/test、
 *           /channels/webpush/*（VAPID/订阅/测试）。
 */
import type { AxiosRequestConfig } from 'axios'
import { apiDelete, apiGet, apiPost, apiPut } from '../api-client'

/**
 * 获取通知列表。
 * 对应后端 endpoint：GET /notifications
 * @returns 通知列表
 */
export function fetchNotifications(params?: { limit?: number }, config?: AxiosRequestConfig) {
  return apiGet('/notifications', { ...config, params: { ...config?.params, ...params } })
}

/**
 * 获取通知统计。
 * 对应后端 endpoint：GET /notifications/stats
 * @returns 统计数据
 */
export function fetchNotificationStats(
  params?: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiGet('/notifications/stats', { ...config, params: { ...config?.params, ...params } })
}

/**
 * 获取通知设置。
 * 对应后端 endpoint：GET /notifications/settings
 * @returns 设置对象
 */
export function fetchNotificationSettings(config?: AxiosRequestConfig) {
  return apiGet('/notifications/settings', config)
}

/**
 * 更新通知设置。
 * 对应后端 endpoint：PUT /notifications/settings
 * @param payload 设置载荷
 * @returns 操作结果
 */
export function updateNotificationSettings(
  payload: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiPut('/notifications/settings', payload, config)
}


/**
 * 标记单条通知已读。
 * 对应后端 endpoint：POST /notifications/{id}/read
 * @param id 通知标识
 * @returns 操作结果
 */
export function markNotificationRead(id: string | number, config?: AxiosRequestConfig) {
  return apiPost(`/notifications/${id}/read`, undefined, config)
}

/**
 * 标记全部通知已读。
 * 对应后端 endpoint：POST /notifications/read-all
 * @returns 操作结果
 */
export function markAllNotificationsRead(config?: AxiosRequestConfig) {
  return apiPost('/notifications/read-all', undefined, config)
}

/**
 * 清空全部通知。
 * 对应后端 endpoint：POST /notifications/clear
 * @returns 操作结果
 */
export function clearNotifications(config?: AxiosRequestConfig) {
  return apiPost('/notifications/clear', undefined, config)
}

/**
 * 获取通知规则列表。
 * 对应后端 endpoint：GET /notifications/rules
 * @returns 规则列表
 */
export function fetchNotificationRules(config?: AxiosRequestConfig) {
  return apiGet('/notifications/rules', config)
}

/**
 * 创建通知规则。
 * 对应后端 endpoint：POST /notifications/rules
 * @param payload 规则配置
 * @returns 创建结果
 */
export function createNotificationRule(
  payload: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiPost('/notifications/rules', payload, config)
}

/**
 * 更新通知规则。
 * 对应后端 endpoint：PUT /notifications/rules/{id}
 * @param id 规则标识
 * @param payload 规则配置
 * @returns 操作结果
 */
export function updateNotificationRule(
  id: string,
  payload: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiPut(`/notifications/rules/${id}`, payload, config)
}

/**
 * 删除通知规则。
 * 对应后端 endpoint：DELETE /notifications/rules/{id}
 * @param id 规则标识
 * @returns 操作结果
 */
export function deleteNotificationRule(id: string, config?: AxiosRequestConfig) {
  return apiDelete(`/notifications/rules/${id}`, config)
}

/**
 * 测试通知规则。
 * 对应后端 endpoint：POST /notifications/rules/test
 * @param payload 规则配置
 * @returns 测试结果
 */
export function testNotificationRule(
  payload: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiPost('/notifications/rules/test', payload, config)
}

/**
 * 获取 WebPush VAPID 公钥（用于浏览器端订阅推送）。
 * 对应后端 endpoint：GET /channels/webpush/vapid-public-key
 * @returns 公钥对象（publicKey 可能为 null 表示未启用）
 */
export function fetchWebPushVapidPublicKey(config?: AxiosRequestConfig) {
  return apiGet<{ publicKey: string | null }>('/channels/webpush/vapid-public-key', config)
}

/**
 * 上报浏览器 WebPush 订阅信息。
 * 对应后端 endpoint：POST /channels/webpush/subscribe
 * @param payload.endpoint 推送端点；payload.keys 浏览器密钥对；payload.label 可选标签
 * @returns 操作结果
 */
export function subscribeWebPush(
  payload: {
    endpoint: string
    keys: { p256dh: string; auth: string }
    label?: string
  },
  config?: AxiosRequestConfig,
) {
  return apiPost('/channels/webpush/subscribe', payload, config)
}

/**
 * 取消 WebPush 订阅。
 * 对应后端 endpoint：DELETE /channels/webpush/subscribe
 * @param endpoint 推送端点
 * @returns 操作结果
 */
export function unsubscribeWebPush(endpoint: string, config?: AxiosRequestConfig) {
  return apiDelete('/channels/webpush/subscribe', {
    ...config,
    params: { ...config?.params, endpoint },
  })
}

/**
 * 列出服务端已登记的 WebPush 订阅。
 * 对应后端 endpoint：GET /channels/webpush/subscriptions
 * @returns 订阅列表
 */
export function fetchWebPushSubscriptions<T = { items?: unknown[] }>(
  config?: AxiosRequestConfig,
) {
  return apiGet<T>('/channels/webpush/subscriptions', config)
}

/**
 * 发送 WebPush 测试推送（可选指定 endpoint）。
 * 对应后端 endpoint：POST /channels/webpush/test
 * @param payload.endpoint 可选指定订阅端点
 * @returns 测试结果
 */
export function testWebPush(payload?: { endpoint?: string }, config?: AxiosRequestConfig) {
  return apiPost('/channels/webpush/test', payload ?? {}, config)
}
