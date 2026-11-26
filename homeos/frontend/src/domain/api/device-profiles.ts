/**
 * 设备画像 API（媒体 / 空调 / 热水器的 kind、别名、房间默认设备与人工确认审计）。
 *
 * 失败一律由 4xx 表达：调用方用 `getApiErrorMessage` 取后端文案，不再解析 `success` 字段。
 */
import type { AxiosRequestConfig } from 'axios'
import { apiDelete, apiGet, apiPost, apiPut } from '../../kernel/http/client'

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
