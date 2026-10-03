/**
 * 地震预警模块 REST API 封装
 *
 * 所属模块：前端服务层（services/api/）
 * 职责：封装地震预警连接状态、HA 坐标配置、历史事件、全球地震查询等接口。
 * 依赖：../api-client 提供的 apiGet / apiPost / apiDelete。
 * 端点范围：/earthquake/status、/earthquake/ha-config、/earthquake/latest、/earthquake/history、
 *           /earthquake/history/simulation、/earthquake/test、/earthquake/dismiss、/earthquake/global。
 */
import type { AxiosRequestConfig } from 'axios'
import { apiDelete, apiGet, apiPost } from '../api-client'

/** 地震预警模块状态载荷 */
export interface EarthquakeStatusPayload {
  connected?: boolean
  wolfx?: {
    clusterConnected?: boolean
    connected?: boolean
    state?: string
    lastActivityAt?: number
    connectedAt?: number
  }
  leader?: Record<string, unknown>
  activeEventId?: string | null
  homeCoordinates?: { latitude?: number | string; longitude?: number | string } | null
  enabled?: boolean
  /** 后端给出的空状态原因（未启用 / 非 Leader 等） */
  hint?: string | null
  thresholds?: {
    minMagnitude?: number
    maxDistance?: number
    minLocalIntensity?: number
  }
  sources?: Array<{
    id: string
    label: string
    active: boolean
    lastPollAt: number | null
    lastSuccessAt: number | null
    lastError: string | null
  }>
  recentFilters?: Array<{
    at: number
    source: string
    reason: string
    eventId?: string
  }>
}

/** HA 地震坐标配置响应 */
export interface EarthquakeHaConfigResponse {
  success: boolean
  message?: string
  data?: { latitude?: number; longitude?: number }
}

/**
 * 获取地震预警模块运行状态。
 * 对应后端 endpoint：GET /earthquake/status
 * @returns 连接状态、阈值与家庭坐标
 */
export async function fetchEarthquakeStatus(): Promise<EarthquakeStatusPayload> {
  const res = await apiGet('/earthquake/status')
  return (res.data?.data ?? res.data) as EarthquakeStatusPayload
}

/**
 * 获取 Home Assistant 地震坐标配置。
 * 对应后端 endpoint：GET /earthquake/ha-config
 * @returns HA 坐标配置响应
 */
export async function fetchEarthquakeHaConfig(): Promise<EarthquakeHaConfigResponse> {
  const res = await apiGet('/earthquake/ha-config')
  return res.data as EarthquakeHaConfigResponse
}

/**
 * 获取最新地震事件。
 * 对应后端 endpoint：GET /earthquake/latest
 * @returns 最新事件数据
 */
export async function fetchEarthquakeLatest(config?: AxiosRequestConfig) {
  return apiGet('/earthquake/latest', config)
}

/**
 * 获取地震历史事件列表。
 * 对应后端 endpoint：GET /earthquake/history
 * @returns 历史事件列表
 */
export async function fetchEarthquakeHistory(config?: AxiosRequestConfig) {
  return apiGet('/earthquake/history', config)
}

/**
 * 删除模拟演练本地预警记录。
 * 对应后端 endpoint：DELETE /earthquake/history/simulation
 * @param eventId 指定演练事件；省略则清除全部演练
 */
export async function deleteEarthquakeSimulationHistory(eventId?: string) {
  return apiDelete('/earthquake/history/simulation', {
    params: eventId ? { eventId } : undefined,
  })
}

/**
 * 触发地震预警测试。
 * 对应后端 endpoint：POST /earthquake/test
 * @returns 测试结果
 */
export async function triggerEarthquakeTest(): Promise<{ success?: boolean; message?: string }> {
  const res = await apiPost('/earthquake/test')
  return res.data
}

/**
 * 忽略指定地震告警。
 * 对应后端 endpoint：POST /earthquake/dismiss
 * @param eventId 事件标识
 * @returns 操作结果
 */
export async function dismissEarthquakeAlert(eventId: string) {
  const res = await apiPost('/earthquake/dismiss', { eventId })
  return res.data
}

/**
 * 查询全球地震事件。
 * 对应后端 endpoint：GET /earthquake/global
 * @returns 全球地震列表
 */
export async function fetchGlobalEarthquakes(
  params?: {
    source?: string
    period?: string
    minMag?: number
    limit?: number
  },
  config?: AxiosRequestConfig,
) {
  const res = await apiGet('/earthquake/global', {
    ...config,
    params: { ...config?.params, ...params },
  })
  return res.data
}
