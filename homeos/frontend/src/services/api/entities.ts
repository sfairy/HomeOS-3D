/**
 * 实体、事件与服务调用 REST API 封装
 *
 * 职责：封装实体查询、事件流、服务调用、区域批量分配、HA 历史等接口。
 * 依赖：../api-client 提供的 apiGet / apiPost / apiDelete；@/types/entity-references 类型定义。
 * 端点范围：/entities、/entities/{id}、/entities/batch/*、/entities/areas/list、
 *           /events、/events/stats、/events/meta、/events/timeline、/events/reports/compare、
 *           /services/call、/ha/history、/ha/queue/retry、/system/entities/resync。
 */
import type { AxiosRequestConfig } from 'axios'
import { apiGet, apiPost, apiDelete } from '../api-client'
import type {
  EntityReferencesResponse,
  EntityReferenceUnlinkRequest,
  EntityReferenceUnlinkResult,
} from '@/types/entity-references'

/**
 * 获取实体列表。
 * 对应后端 endpoint：GET /entities
 * @returns 实体列表
 */
export function fetchEntities(params?: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiGet('/entities', { ...config, params: { ...config?.params, ...params } })
}

/**
 * 获取单个实体详情。
 * 对应后端 endpoint：GET /entities/{id}
 * @param id 实体标识
 * @param params 可选 refresh 强制刷新
 * @returns 实体详情
 */
export function fetchEntity(
  id: string,
  params?: { refresh?: string },
  config?: AxiosRequestConfig,
) {
  return apiGet(`/entities/${encodeURIComponent(id)}`, {
    ...config,
    params: { ...config?.params, ...params },
  })
}

/**
 * 批量获取实体状态（冷补全；缺失 ID 记入 missing，始终 200）。
 * 对应后端 endpoint：POST /entities/batch/get
 */
export function fetchEntitiesBatchGet(entityIds: string[], config?: AxiosRequestConfig) {
  return apiPost<{
    count: number
    entities: unknown[]
    missing: string[]
    forbidden: string[]
  }>('/entities/batch/get', { entity_ids: entityIds }, config)
}

/**
 * 查询引用该实体的功能配置（自动化/场景/绑定等）。
 * 对应后端 endpoint：GET /entities/{id}/references
 * @param id 实体标识
 * @returns 引用列表
 */
export function fetchEntityReferences(id: string, config?: AxiosRequestConfig) {
  return apiGet<EntityReferencesResponse>(
    `/entities/${encodeURIComponent(id)}/references`,
    config,
  )
}

/**
 * 从指定功能配置中移除对该实体的引用。
 * 对应后端 endpoint：POST /entities/{id}/references/unlink
 * @param id 实体标识
 * @param payload 待解绑的引用载荷
 * @returns 解绑结果
 */
export function unlinkEntityReference(
  id: string,
  payload: EntityReferenceUnlinkRequest,
  config?: AxiosRequestConfig,
) {
  return apiPost<EntityReferenceUnlinkResult>(
    `/entities/${encodeURIComponent(id)}/references/unlink`,
    payload,
    config,
  )
}

/**
 * 获取变更实体列表。
 * 对应后端 endpoint：GET /entities/changed
 * @returns 变更实体列表
 */
export function fetchEntitiesChanged(
  params?: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiGet('/entities/changed', { ...config, params: { ...config?.params, ...params } })
}

/**
 * 重新同步实体。
 * 对应后端 endpoint：POST /system/entities/resync
 * @returns 操作结果
 */
export function resyncEntities(config?: AxiosRequestConfig) {
  return apiPost('/system/entities/resync', {}, config)
}

/**
 * 获取事件列表。
 * 对应后端 endpoint：GET /events
 * @returns 事件列表
 */
export function fetchEvents(params?: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiGet('/events', { ...config, params: { ...config?.params, ...params } })
}

/**
 * 获取事件统计。
 * 对应后端 endpoint：GET /events/stats
 * @returns 统计数据
 */
export function fetchEventStats(params?: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiGet('/events/stats', { ...config, params: { ...config?.params, ...params } })
}

/**
 * 获取事件元数据。
 * 对应后端 endpoint：GET /events/meta
 * @returns 元数据
 */
export function fetchEventMeta(config?: AxiosRequestConfig) {
  return apiGet('/events/meta', config)
}

/**
 * 清空事件记录。
 * 对应后端 endpoint：DELETE /events
 * @returns 操作结果
 */
export function clearEvents(config?: AxiosRequestConfig) {
  return apiDelete('/events', config)
}





/**
 * 调用 HA 服务。
 * 对应后端 endpoint：POST /services/call
 * @param payload 包含 domain / service / entity_id 等
 * @returns 调用结果
 */
export function callService(
  payload: { domain: string; service: string; entity_id?: string; [key: string]: unknown },
  config?: AxiosRequestConfig,
) {
  return apiPost('/services/call', payload, config)
}

/**
 * 获取区域列表。
 * 对应后端 endpoint：GET /entities/areas/list
 * @returns 区域列表
 */
export function fetchAreasList<T = unknown>(config?: AxiosRequestConfig) {
  return apiGet<T>('/entities/areas/list', config)
}

/**
 * 批量分配实体所属区域。
 * 对应后端 endpoint：POST /entities/batch/area
 * @param payload 批量分配载荷
 * @returns 操作结果
 */
export function batchAssignEntityArea(
  payload: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiPost('/entities/batch/area', payload, config)
}

/** HA 历史数据点（后端已归一化为时间戳 + 数值） */
export interface HaHistoryPoint {
  timestamp: string
  value: number | string
}

/** HA 单实体历史查询结果（对齐 ``GET /ha/history`` 响应） */
export interface HaHistoryResult {
  entityId: string
  hours: number
  points: HaHistoryPoint[]
}

/**
 * 获取单个实体的 HA 历史数据。
 * 对应后端 endpoint：GET /ha/history
 * 服务端契约是**单实体**查询（`entityId` + `hours`），批量由调用方并发发起 ——
 * 服务端以并发信号量 + 30s 结果缓存承接，这是该端点被设计成的用法。
 * @param entityId 实体标识
 * @param hours 查询时长（小时，1~168）
 * @returns 该实体的历史点序列
 */
export function fetchHaHistory(
  entityId: string,
  hours: number,
  config?: AxiosRequestConfig,
) {
  return apiGet<HaHistoryResult>('/ha/history', {
    ...config,
    params: { ...config?.params, entityId, hours },
  })
}

/**
 * 重试已丢弃的 HA 命令（队列重投）。
 * 对应后端 endpoint：POST /ha/queue/retry
 * @returns 操作结果
 */
export function retryDroppedHaCommands(config?: AxiosRequestConfig) {
  return apiPost('/ha/queue/retry', {}, config)
}
