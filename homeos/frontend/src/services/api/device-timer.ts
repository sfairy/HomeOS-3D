/** 设备倒计时 API（服务端是唯一真源）。 */
import type { AxiosRequestConfig } from 'axios'
import { apiDelete, apiGet, apiPost } from './client'

export interface DeviceTimerItem {
  id: string
  entityId: string
  domain: string
  service: string
  fireAt: string
  remainingSeconds: number
}

export interface DeviceTimerCreateResult {
  id: string
  entityId: string
  service: string
  fireAt: string
  seconds: number
}

/** 列出全部倒计时（含服务端算好的剩余秒数）。 */
export function listDeviceTimers(config?: AxiosRequestConfig) {
  return apiGet<{ items: DeviceTimerItem[] }>('/services/timer', { dedupe: false, ...config })
}

/** 设置（或覆盖）某实体的倒计时。重复调用是覆盖而不是叠加。 */
export function setDeviceTimer(
  payload: { entityId: string; seconds: number; service?: string; data?: Record<string, unknown> },
  config?: AxiosRequestConfig,
) {
  return apiPost<DeviceTimerCreateResult>('/services/timer', payload, config)
}

/** 取消某实体的倒计时；不存在时返回 cancelled=false（不视为错误）。 */
export function cancelDeviceTimer(entityId: string, config?: AxiosRequestConfig) {
  return apiDelete<{ success: boolean; cancelled: boolean; entityId: string }>('/services/timer', {
    params: { entity_id: entityId },
    ...config,
  })
}
