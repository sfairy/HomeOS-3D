import type { AxiosRequestConfig } from 'axios'
import { apiGet, apiPost, apiDelete, apiPut } from '../../kernel/http/index'

/** 设备健康与固件更新 API。 */

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

/**
 * 设备画像 API（媒体 / 空调 / 热水器的 kind、别名、房间默认设备与人工确认审计）。
 *
 * 失败一律由 4xx 表达：调用方用 `getApiErrorMessage` 取后端文案，不再解析 `success` 字段。
 */

export type DeviceProfileDomain = 'media_player' | 'climate' | 'water_heater'

export interface DeviceProfile {
  entityId: string
  domain: string
  kind: string
  confidence: number
  confirmed: boolean
  source: string
  aliases: string[]
  evidence: string[]
  /** 设备是否在线（HA 里还在、状态不是 unavailable / unknown） */
  available: boolean
  /** 能否被管家自动选中：在线 + 已确认或置信达标 */
  usable: boolean
  state: string
  name: string
  areaId: string
  areaName: string
  /** 最近一次在 HA 快照里见到该实体的时刻（ISO） */
  lastSeenAt: string | null
  /** 最近一次重新分类的时刻（ISO） */
  lastClassifiedAt: string | null
}

export interface DeviceProfileDefault {
  id: string
  areaId: string
  kind: string
  entityId?: string | null
  maPlayerId?: string | null
  /** 落点当前是否仍有效（实体离线 / 缺失时为 false） */
  available: boolean
  /** 面板直接可显示的名称（实体友好名或播放器 id） */
  name: string
}

export interface DeviceProfileAudit {
  id: string
  entityId: string
  action: string
  fromKind: string
  toKind: string
  aliases: string[]
  actor: string
  createdAt: string | null
}

export interface ListDeviceProfilesParams {
  areaId?: string
  domain?: DeviceProfileDomain
  pending?: boolean
  q?: string
}

export function listDeviceProfiles(params: ListDeviceProfilesParams = {}, config?: AxiosRequestConfig) {
  const query: Record<string, string | boolean> = {}
  if (params.areaId) query.areaId = params.areaId
  if (params.domain) query.domain = params.domain
  if (params.pending) query.pending = true
  if (params.q) query.q = params.q
  return apiGet<{ items: DeviceProfile[] }>('/device-profiles', {
    params: Object.keys(query).length ? query : undefined,
    ...config,
  })
}

export function refreshDeviceProfiles(config?: AxiosRequestConfig) {
  return apiPost<{
    success: boolean
    created: number
    updated: number
    unchanged: number
    stale: number
    total: number
  }>('/device-profiles/refresh', undefined, config)
}

export function confirmDeviceProfile(entityId: string, kind: string, aliases?: string[], config?: AxiosRequestConfig) {
  return apiPut<{ success: boolean }>('/device-profiles/confirm', { entityId, kind, aliases }, config)
}

/**
 * 批量确认同一类型的多台设备（空调 6 台逐台点太慢）。
 *
 * 服务端逐台走与单台确认相同的校验与审计；失败的单台列在 `failed` 里，不阻断其余。
 */
export function confirmDeviceProfilesBatch(entityIds: string[], kind: string, config?: AxiosRequestConfig) {
  return apiPut<{
    success: boolean
    kind: string
    confirmed: string[]
    failed: Array<{ entityId: string; message: string }>
  }>('/device-profiles/confirm-batch', { entityIds, kind }, config)
}

/** 只改别名，不动类型与确认状态。 */
export function setDeviceProfileAliases(entityId: string, aliases: string[], config?: AxiosRequestConfig) {
  return apiPut<{ success: boolean; aliases: string[] }>('/device-profiles/aliases', { entityId, aliases }, config)
}

export function clearDeviceProfileConfirmation(entityId: string, keepAliases = true, config?: AxiosRequestConfig) {
  return apiDelete<{ success: boolean; kind?: string; aliases?: string[] }>('/device-profiles/confirmation', {
    params: { entityId, keepAliases },
    ...config,
  })
}

export function listDeviceProfileAudit(entityId?: string, limit = 20, config?: AxiosRequestConfig) {
  return apiGet<{ items: DeviceProfileAudit[] }>('/device-profiles/audit', {
    params: { ...(entityId ? { entityId } : {}), limit },
    ...config,
  })
}

export function listDeviceProfileDefaults(areaId?: string, config?: AxiosRequestConfig) {
  return apiGet<{ items: DeviceProfileDefault[] }>('/device-profiles/defaults', {
    params: areaId ? { areaId } : undefined,
    ...config,
  })
}

export function setDeviceProfileDefault(
  payload: { areaId: string; kind: string; entityId?: string; maPlayerId?: string },
  config?: AxiosRequestConfig,
) {
  return apiPut<{ success: boolean }>('/device-profiles/defaults', payload, config)
}

export function deleteDeviceProfileDefault(areaId: string, kind: string, config?: AxiosRequestConfig) {
  return apiDelete<{ success: boolean }>('/device-profiles/defaults', {
    params: { areaId, kind },
    ...config,
  })
}

export function openTvApp(entityId: string, app: string, config?: AxiosRequestConfig) {
  return apiPost<{
    success: boolean
    accepted?: boolean
    phase?: string
    reason?: string
    message?: string
    candidates?: string[]
  }>('/device-profiles/tv/open', { entityId, app }, config)
}

/** 设备倒计时 API（服务端是唯一真源）。 */

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
