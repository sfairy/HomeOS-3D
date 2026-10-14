/** 实体、事件与服务调用 REST API 封装 */
import type { AxiosRequestConfig } from 'axios'
import { apiGet, apiPost, apiDelete } from './client'
import type {
  EntityReferencesResponse,
  EntityReferenceUnlinkRequest,
  EntityReferenceUnlinkResult,
} from '@/shared/types/entity-references'

/** 获取实体列表。 */
export function fetchEntities(params?: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiGet('/entities', { ...config, params: { ...config?.params, ...params } })
}

/** 获取单个实体详情。 */
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

/** 批量获取实体状态（冷补全；缺失 ID 记入 missing，始终 200）。 */
export function fetchEntitiesBatchGet(entityIds: string[], config?: AxiosRequestConfig) {
  return apiPost<{
    count: number
    entities: unknown[]
    missing: string[]
    forbidden: string[]
  }>('/entities/batch/get', { entity_ids: entityIds }, config)
}

/** 查询引用该实体的功能配置（自动化/场景/绑定等）。 */
export function fetchEntityReferences(id: string, config?: AxiosRequestConfig) {
  return apiGet<EntityReferencesResponse>(
    `/entities/${encodeURIComponent(id)}/references`,
    config,
  )
}

/** 从指定功能配置中移除对该实体的引用。 */
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

/** 获取变更实体列表。 */
export function fetchEntitiesChanged(
  params?: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiGet('/entities/changed', { ...config, params: { ...config?.params, ...params } })
}

/** 重新同步实体。 */
export function resyncEntities(config?: AxiosRequestConfig) {
  return apiPost('/system/entities/resync', {}, config)
}

/** 获取事件列表。 */
export function fetchEvents(params?: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiGet('/events', { ...config, params: { ...config?.params, ...params } })
}

/** 获取事件统计。 */
export function fetchEventStats(params?: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiGet('/events/stats', { ...config, params: { ...config?.params, ...params } })
}

/** 获取事件元数据。 */
export function fetchEventMeta(config?: AxiosRequestConfig) {
  return apiGet('/events/meta', config)
}

/** 清空事件记录；`complete=false` 表示后端触到批数上限、仍有残留，需要再清一次。 */
export function clearEvents(config?: AxiosRequestConfig) {
  return apiDelete<{ deleted: number; complete: boolean }>('/events', config)
}





/** 调用 HA 服务。 */
export function callService(
  payload: { domain: string; service: string; entity_id?: string; [key: string]: unknown },
  config?: AxiosRequestConfig,
) {
  return apiPost('/services/call', payload, config)
}

/** 获取区域列表。 */
export function fetchAreasList<T = unknown>(config?: AxiosRequestConfig) {
  return apiGet<T>('/entities/areas/list', config)
}

/** 批量分配实体所属区域。 */
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

/** 获取单个实体的 HA 历史数据。 */
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

/** 重试已丢弃的 HA 命令（队列重投）。 */
export function retryDroppedHaCommands(config?: AxiosRequestConfig) {
  return apiPost('/ha/queue/retry', {}, config)
}
