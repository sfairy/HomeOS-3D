/** 通知模块 REST API 封装 */
import type { AxiosRequestConfig } from 'axios'
import { apiDelete, apiGet, apiPost, apiPut } from '../../kernel/http/index'

/** 获取通知列表。 */
export function fetchNotifications(params?: { limit?: number }, config?: AxiosRequestConfig) {
  return apiGet('/notifications', { ...config, params: { ...config?.params, ...params } })
}

/** 分页响应的载荷形状（``paged=1``）。 */
export interface NotificationPage<T = Record<string, unknown>> {
  items: T[]
  nextBefore: string | null
  hasMore: boolean
}

/**
 * 通知中心键集分页。
 *
 * 游标是服务端给的不透明串：前端只负责把上一页的 `nextBefore` 原样带回，
 * 不解析、不比较、不拼接。
 */
export function fetchNotificationsPage<T = Record<string, unknown>>(
  params?: { before?: string | null; after?: string | null; source?: string },
  config?: AxiosRequestConfig,
) {
  return apiGet<NotificationPage<T>>('/notifications', {
    ...config,
    params: {
      ...config?.params,
      paged: '1',
      ...(params?.before ? { before: params.before } : {}),
      ...(params?.after ? { after: params.after } : {}),
      ...(params?.source && params.source !== 'all' ? { source: params.source } : {}),
    },
  })
}

/** 获取通知统计。 */
export function fetchNotificationStats(params?: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiGet('/notifications/stats', { ...config, params: { ...config?.params, ...params } })
}

/** 获取通知设置。 */
export function fetchNotificationSettings(config?: AxiosRequestConfig) {
  return apiGet('/notifications/settings', config)
}

/** 更新通知设置。 */
export function updateNotificationSettings(payload: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiPut('/notifications/settings', payload, config)
}

/** 标记单条通知已读。 */
export function markNotificationRead(id: string | number, config?: AxiosRequestConfig) {
  return apiPost(`/notifications/${id}/read`, undefined, config)
}

/** 标记全部通知已读。 */
export function markAllNotificationsRead(config?: AxiosRequestConfig) {
  return apiPost('/notifications/read-all', undefined, config)
}

/** 删除单条通知（前端点 × 的落地动作）。 */
export function deleteNotification(id: string | number, config?: AxiosRequestConfig) {
  return apiDelete(`/notifications/${id}`, config)
}

/** 清空全部通知。 */
export function clearNotifications(config?: AxiosRequestConfig) {
  return apiPost('/notifications/clear', undefined, config)
}

/** 获取通知规则列表。 */
export function fetchNotificationRules(config?: AxiosRequestConfig) {
  return apiGet('/notifications/rules', config)
}

/** 创建通知规则。 */
export function createNotificationRule(payload: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiPost('/notifications/rules', payload, config)
}

/** 更新通知规则。 */
export function updateNotificationRule(id: string, payload: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiPut(`/notifications/rules/${id}`, payload, config)
}

/** 删除通知规则。 */
export function deleteNotificationRule(id: string, config?: AxiosRequestConfig) {
  return apiDelete(`/notifications/rules/${id}`, config)
}

/** 测试通知规则。 */
export function testNotificationRule(payload: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiPost('/notifications/rules/test', payload, config)
}

/** 获取 WebPush VAPID 公钥（用于浏览器端订阅推送）。 */
export function fetchWebPushVapidPublicKey(config?: AxiosRequestConfig) {
  return apiGet<{ publicKey: string | null }>('/channels/webpush/vapid-public-key', config)
}

/** 上报浏览器 WebPush 订阅信息。 */
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

/** 取消 WebPush 订阅。 */
export function unsubscribeWebPush(endpoint: string, config?: AxiosRequestConfig) {
  return apiDelete('/channels/webpush/subscribe', {
    ...config,
    params: { ...config?.params, endpoint },
  })
}

/** 列出服务端已登记的 WebPush 订阅。 */
export function fetchWebPushSubscriptions<T = { items?: unknown[] }>(config?: AxiosRequestConfig) {
  return apiGet<T>('/channels/webpush/subscriptions', config)
}

/** 发送 WebPush 测试推送（可选指定 endpoint）。 */
export function testWebPush<T = { sent?: number; delivered?: number; attempted?: number }>(
  payload?: { endpoint?: string },
  config?: AxiosRequestConfig,
) {
  return apiPost<T>('/channels/webpush/test', payload ?? {}, config)
}
