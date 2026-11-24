/** 设备健康与固件更新 API。 */
import type { AxiosRequestConfig } from 'axios'
import { apiGet, apiPost } from './client'

export interface DeviceHealthSample {
  entityId: string
  name: string
  domain?: string
  state?: string
}

/** 离线实体的按域分解（数量降序）。 */
export interface DeviceHealthDomainCount {
  domain: string
  count: number
}

export interface DeviceHealthSummary {
  offline: { count: number; samples: DeviceHealthSample[]; byDomain?: DeviceHealthDomainCount[] }
  firmwareUpdates: { count: number; samples: DeviceHealthSample[] }
  /** 参与统计的实体总数：面板用它做离线率的分母。 */
  totalEntities?: number
  generatedAt?: string
}

/** 离线设备 + 可用固件更新摘要。 */
export function getDeviceHealthSummary(config?: AxiosRequestConfig) {
  return apiGet<DeviceHealthSummary>('/system/device-health/summary', { dedupe: false, ...config })
}

/**
 * 安装固件更新（逐个实体）。
 *
 * 服务端只接受 ``update.*`` 且当前确实有可用更新的实体；失败时把 HA 的错误原样抛出，
 * 不做美化 —— 「更新失败」的原因（设备离线 / 正在更新 / 不支持）对用户很重要。
 */
export function installFirmwareUpdate(entityId: string, config?: AxiosRequestConfig) {
  return apiPost<{ success: boolean; entityId: string; result: unknown }>(
    '/system/devices/firmware-update',
    { entityId },
    config,
  )
}
