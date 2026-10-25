/** 家居模式 REST API 封装 */
import type { AxiosRequestConfig } from 'axios'
import { apiDelete, apiGet, apiPost, apiPut } from './client'

/** 获取全部家居模式。 */
export function fetchHomeModes(config?: AxiosRequestConfig) {
  return apiGet('/modes', config)
}

/** 获取当前激活的家居模式。 */
export function fetchActiveHomeMode(config?: AxiosRequestConfig) {
  return apiGet('/modes/active', config)
}

/** 获取家居模式上下文。 */
export function fetchHomeModeContext(config?: AxiosRequestConfig) {
  return apiGet('/modes/context', config)
}

/** 获取模式触发日志。 */
export function fetchHomeModeTriggerLogs(
  params?: { page?: number; limit?: number; source?: string; result?: 'ok' | 'fail' | '' },
  config?: AxiosRequestConfig,
) {
  return apiGet('/modes/trigger-logs', { ...config, params: { ...config?.params, ...params } })
}

/** 获取模式执行历史。 */
export function fetchHomeModeExecutionHistory(config?: AxiosRequestConfig) {
  return apiGet('/modes/execution-history', config)
}

/** 获取模式模板列表。 */
export function fetchHomeModeTemplates(config?: AxiosRequestConfig) {
  return apiGet('/modes/templates', config)
}

/** 获取模式预设列表。 */
export function fetchHomeModePresets(config?: AxiosRequestConfig) {
  return apiGet('/modes/presets', config)
}

/** 安装指定模式预设。 */
export function installHomeModePreset(
  presetId: string,
  payload?: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiPost(`/modes/presets/${presetId}/install`, payload ?? {}, config)
}

/** 激活指定家居模式。 */
export function activateHomeMode(id: string, config?: AxiosRequestConfig) {
  return apiPost(`/modes/${id}/activate`, undefined, config)
}

/** 停用家居模式；传入 id 时只停用该模式（多互斥组场景）。 */
export function deactivateHomeMode(modeId?: string, config?: AxiosRequestConfig) {
  return apiPost('/modes/deactivate', undefined, {
    ...config,
    params: { ...config?.params, ...(modeId ? { modeId } : {}) },
  })
}

/** 播种默认家居模式。 */
export function seedHomeModes(config?: AxiosRequestConfig) {
  return apiPost('/modes/seed', undefined, config)
}

/** 复制指定家居模式。 */
export function duplicateHomeMode(id: string, config?: AxiosRequestConfig) {
  return apiPost(`/modes/${id}/duplicate`, undefined, config)
}

/** 重排家居模式顺序。 */
export function reorderHomeModes(
  items: Array<{ id: string; sortOrder: number }>,
  config?: AxiosRequestConfig,
) {
  return apiPost('/modes/reorder', { items }, config)
}

/** 创建家居模式。 */
export function createHomeMode(body: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiPost('/modes', body, config)
}

/** 更新家居模式。 */
export function updateHomeMode(
  id: string,
  body: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiPut(`/modes/${id}`, body, config)
}

/** 删除家居模式。 */
export function deleteHomeMode(id: string, config?: AxiosRequestConfig) {
  return apiDelete(`/modes/${id}`, config)
}
