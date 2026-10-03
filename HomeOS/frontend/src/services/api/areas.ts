/**
 * 房间（Area）CRUD REST API 封装
 *
 * 所属模块：前端服务层（services/api/）
 * 职责：维护 HomeOS 自身的房间列表及其绑定的实体，支持创建、更新、排序、删除与从 HA 导入。
 * 依赖：../api-client 提供的 apiGet / apiPost / apiPut / apiDelete。
 * 端点：/areas、/areas/{id}、/areas/{id}/entities、/areas/sort、/areas/import-from-ha。
 *       与 HA 区域列表（`fetchAreasList` → /entities/areas/list）区分，前者是 DB 自管区域，后者是 HA 镜像。
 */
import type { AxiosRequestConfig } from 'axios'
import { apiDelete, apiGet, apiPost, apiPut } from '../api-client'

/** 房间行（DB Area + 实体绑定） */
export interface AreaRow {
  id: string
  name: string
  icon?: string | null
  backgroundUrl?: string | null
  haAreaId?: string | null
  sortOrder?: number
  entities?: Array<{ id?: string; entityId: string; sortOrder?: number }>
}

/**
 * 获取全部房间（含绑定实体）。
 * 对应后端 endpoint：GET /areas
 * @returns 房间行数组
 */
export function fetchDbAreas<T = AreaRow[]>(config?: AxiosRequestConfig) {
  return apiGet<T>('/areas', config)
}

/**
 * 创建房间。
 * 对应后端 endpoint：POST /areas
 * @param payload 房间信息（name 必填，可携带 icon、backgroundUrl、haAreaId、entityIds）
 * @returns 操作结果
 */
export function createDbArea(
  payload: {
    name: string
    icon?: string
    backgroundUrl?: string | null
    haAreaId?: string | null
    entityIds?: string[]
  },
  config?: AxiosRequestConfig,
) {
  return apiPost('/areas', payload, config)
}

/**
 * 更新房间基本信息。
 * 对应后端 endpoint：PUT /areas/{id}
 * @param id 房间标识
 * @param payload 待更新字段（name/icon/backgroundUrl/haAreaId）
 * @returns 操作结果
 */
export function updateDbArea(
  id: string,
  payload: {
    name?: string
    icon?: string
    backgroundUrl?: string | null
    haAreaId?: string | null
  },
  config?: AxiosRequestConfig,
) {
  return apiPut(`/areas/${encodeURIComponent(id)}`, payload, config)
}

/**
 * 全量更新房间绑定的实体列表。
 * 对应后端 endpoint：PUT /areas/{id}/entities
 * @param id 房间标识
 * @param entityIds 实体 ID 数组（覆盖式更新）
 * @returns 操作结果
 */
export function updateDbAreaEntities(
  id: string,
  entityIds: string[],
  config?: AxiosRequestConfig,
) {
  return apiPut(`/areas/${encodeURIComponent(id)}/entities`, { entityIds }, config)
}

/**
 * 删除房间。
 * 对应后端 endpoint：DELETE /areas/{id}
 * @param id 房间标识
 * @returns 操作结果
 */
export function deleteDbArea(id: string, config?: AxiosRequestConfig) {
  return apiDelete(`/areas/${encodeURIComponent(id)}`, config)
}

/**
 * 批量更新房间排序。
 * 对应后端 endpoint：PUT /areas/sort
 * @param ids 按目标顺序排列的房间 ID 数组
 * @returns 操作结果
 */
export function sortDbAreas(ids: string[], config?: AxiosRequestConfig) {
  return apiPut('/areas/sort', { ids }, config)
}

/**
 * 从 Home Assistant 区域列表导入房间。
 * 对应后端 endpoint：POST /areas/import-from-ha
 * @param payload.seedEntities 是否同时为导入房间补种实体绑定
 * @returns 创建、关联与合计数量统计
 */
export function importAreasFromHa(
  payload?: { seedEntities?: boolean },
  config?: AxiosRequestConfig,
) {
  return apiPost<{ created: number; linked: number; total: number }>(
    '/areas/import-from-ha',
    payload ?? {},
    config,
  )
}
