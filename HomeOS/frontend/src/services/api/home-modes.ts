/**
 * 家居模式 REST API 封装
 *
 * 所属模块：前端服务层（services/api/）
 * 职责：封装家居模式 CRUD、激活/停用、触发日志、预设安装等接口。
 * 依赖：../api-client 提供的 apiGet / apiPost / apiPut / apiDelete。
 * 端点范围：/modes、/modes/active、/modes/context、/modes/trigger-logs、/modes/execution-history、
 *           /modes/templates、/modes/presets[/{presetId}/install]、/modes/{id}/activate、
 *           /modes/deactivate、/modes/seed、/modes/{id}/duplicate、/modes/reorder。
 */
import type { AxiosRequestConfig } from 'axios'
import { apiDelete, apiGet, apiPost, apiPut } from '../api-client'

/**
 * 获取全部家居模式。
 * 对应后端 endpoint：GET /modes
 * @returns 模式列表
 */
export function fetchHomeModes(config?: AxiosRequestConfig) {
  return apiGet('/modes', config)
}

/**
 * 获取当前激活的家居模式。
 * 对应后端 endpoint：GET /modes/active
 * @returns 激活模式信息
 */
export function fetchActiveHomeMode(config?: AxiosRequestConfig) {
  return apiGet('/modes/active', config)
}

/**
 * 获取家居模式上下文。
 * 对应后端 endpoint：GET /modes/context
 * @returns 模式上下文
 */
export function fetchHomeModeContext(config?: AxiosRequestConfig) {
  return apiGet('/modes/context', config)
}

/**
 * 获取模式触发日志。
 * 对应后端 endpoint：GET /modes/trigger-logs
 * @returns 触发日志列表
 */
export function fetchHomeModeTriggerLogs(
  params?: { page?: number; limit?: number; source?: string; result?: 'ok' | 'fail' | '' },
  config?: AxiosRequestConfig,
) {
  return apiGet('/modes/trigger-logs', { ...config, params: { ...config?.params, ...params } })
}

/**
 * 获取模式执行历史。
 * 对应后端 endpoint：GET /modes/execution-history
 * @returns 执行历史列表
 */
export function fetchHomeModeExecutionHistory(config?: AxiosRequestConfig) {
  return apiGet('/modes/execution-history', config)
}

/**
 * 获取模式模板列表。
 * 对应后端 endpoint：GET /modes/templates
 * @returns 模板列表
 */
export function fetchHomeModeTemplates(config?: AxiosRequestConfig) {
  return apiGet('/modes/templates', config)
}

/**
 * 获取模式预设列表。
 * 对应后端 endpoint：GET /modes/presets
 * @returns 预设列表
 */
export function fetchHomeModePresets(config?: AxiosRequestConfig) {
  return apiGet('/modes/presets', config)
}

/**
 * 安装指定模式预设。
 * 对应后端 endpoint：POST /modes/presets/{presetId}/install
 * @param presetId 预设标识
 * @param payload 可选安装参数
 * @returns 安装结果
 */
export function installHomeModePreset(
  presetId: string,
  payload?: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiPost(`/modes/presets/${presetId}/install`, payload ?? {}, config)
}

/**
 * 激活指定家居模式。
 * 对应后端 endpoint：POST /modes/{id}/activate
 * @param id 模式标识
 * @returns 操作结果
 */
export function activateHomeMode(id: string, config?: AxiosRequestConfig) {
  return apiPost(`/modes/${id}/activate`, undefined, config)
}

/**
 * 停用当前家居模式。
 * 对应后端 endpoint：POST /modes/deactivate
 * @returns 操作结果
 */
export function deactivateHomeMode(config?: AxiosRequestConfig) {
  return apiPost('/modes/deactivate', undefined, config)
}

/**
 * 播种默认家居模式。
 * 对应后端 endpoint：POST /modes/seed
 * @returns 操作结果
 */
export function seedHomeModes(config?: AxiosRequestConfig) {
  return apiPost('/modes/seed', undefined, config)
}

/**
 * 复制指定家居模式。
 * 对应后端 endpoint：POST /modes/{id}/duplicate
 * @param id 模式标识
 * @returns 复制后的新模式
 */
export function duplicateHomeMode(id: string, config?: AxiosRequestConfig) {
  return apiPost(`/modes/${id}/duplicate`, undefined, config)
}

/**
 * 重排家居模式顺序。
 * 对应后端 endpoint：POST /modes/reorder
 * @param items 包含 id 与 sortOrder 的数组
 * @returns 操作结果
 */
export function reorderHomeModes(
  items: Array<{ id: string; sortOrder: number }>,
  config?: AxiosRequestConfig,
) {
  return apiPost('/modes/reorder', { items }, config)
}

/**
 * 创建家居模式。
 * 对应后端 endpoint：POST /modes
 * @param body 模式配置
 * @returns 创建结果
 */
export function createHomeMode(body: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiPost('/modes', body, config)
}

/**
 * 更新家居模式。
 * 对应后端 endpoint：PUT /modes/{id}
 * @param id 模式标识
 * @param body 模式配置
 * @returns 更新结果
 */
export function updateHomeMode(
  id: string,
  body: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiPut(`/modes/${id}`, body, config)
}

/**
 * 删除家居模式。
 * 对应后端 endpoint：DELETE /modes/{id}
 * @param id 模式标识
 * @returns 操作结果
 */
export function deleteHomeMode(id: string, config?: AxiosRequestConfig) {
  return apiDelete(`/modes/${id}`, config)
}
