/** 用水安全 API（主水阀状态与一键关阀）。 */
import type { AxiosRequestConfig } from 'axios'
import { apiGet, apiPost } from '../../kernel/http/index'

export interface WaterFlowItem {
  entityId: string
  name: string
  lpm: number
}

export interface WaterStatus {
  valveEntityId: string
  valveState: string | null
  flows: WaterFlowItem[]
  /** 今日累计用水（m³）；未接入水表时为 null。 */
  todayCubicMeters?: number | null
}

/** 主水阀与实时用水概况。 */
export function getWaterStatus(config?: AxiosRequestConfig) {
  return apiGet<WaterStatus>('/security/water/status', { dedupe: false, ...config })
}

/** 关闭主水阀（用户确认后执行，服务端会写审计事件）。 */
export function closeWaterValve(config?: AxiosRequestConfig) {
  return apiPost<{ success: boolean; entityId: string; service: string }>('/security/water/close-valve', {}, config)
}

/** 重新打开主水阀。 */
export function openWaterValve(config?: AxiosRequestConfig) {
  return apiPost<{ success: boolean; entityId: string; service: string }>('/security/water/open-valve', {}, config)
}
