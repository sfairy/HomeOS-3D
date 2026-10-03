/**
 * 安防与安防面板 REST API 封装
 *
 * 所属模块：前端服务层（services/api/）
 * 职责：封装安防事件、在场检测、异常检测、Frigate 摄像头、安防面板布防与离家模拟等接口。
 * 依赖：../api-client 提供的 apiGet / apiPost。
 * 端点范围：/security/events、/security/presence/*、/security/hazard/drill、/security/anomaly/*、
 *           /security/frigate/*、/security-panel/*（含 away-sim/*）。
 */
import type { AxiosRequestConfig } from 'axios'
import { apiGet, apiPost } from '../api-client'

/**
 * 获取安防事件列表。
 * 对应后端 endpoint：GET /security/events
 * @returns 事件列表
 */
export function fetchSecurityEvents(config?: AxiosRequestConfig) {
  return apiGet('/security/events', config)
}

/**
 * 校验安防事件配置。
 * 对应后端 endpoint：GET /security/events/validate
 * @returns 校验结果
 */
export function validateSecurityEvents(config?: AxiosRequestConfig) {
  return apiGet('/security/events/validate', config)
}

/**
 * 获取在家在场状态。
 * 对应后端 endpoint：GET /security/presence/home
 * @returns 在场状态
 */
export function fetchPresenceHome(config?: AxiosRequestConfig) {
  return apiGet('/security/presence/home', config)
}

/**
 * 获取在场汇总。
 * 对应后端 endpoint：GET /security/presence/summary
 * @returns 汇总信息
 */
export function fetchPresenceSummary(config?: AxiosRequestConfig) {
  return apiGet('/security/presence/summary', config)
}

/**
 * 执行危险演练。
 * 对应后端 endpoint：POST /security/hazard/drill
 * @param kind 演练类型
 * @returns 演练结果
 */
export function runHazardDrill(kind: string, config?: AxiosRequestConfig) {
  return apiPost('/security/hazard/drill', { kind }, config)
}

/**
 * 获取异常检测状态。
 * 对应后端 endpoint：GET /security/anomaly/status
 * @returns 异常状态
 */
export function fetchAnomalyStatus(config?: AxiosRequestConfig) {
  return apiGet('/security/anomaly/status', config)
}

/**
 * 获取异常检测基线。
 * 对应后端 endpoint：GET /security/anomaly/baselines
 * @returns 基线数据
 */
export function fetchAnomalyBaselines(config?: AxiosRequestConfig) {
  return apiGet('/security/anomaly/baselines', config)
}

/**
 * 确认异常事件。
 * 对应后端 endpoint：POST /security/anomaly/ack
 * @param ids 异常事件标识列表
 * @returns 操作结果
 */
export function ackAnomalyEvents(ids: string[], config?: AxiosRequestConfig) {
  return apiPost('/security/anomaly/ack', { ids }, config)
}

/**
 * 获取 Frigate 摄像头事件。
 * 对应后端 endpoint：GET /security/frigate/events
 * @returns 事件列表
 */
export function fetchFrigateEvents(config?: AxiosRequestConfig) {
  return apiGet('/security/frigate/events', config)
}

/**
 * 确认 Frigate 事件。
 * 对应后端 endpoint：POST /security/frigate/ack
 * @param ids 事件标识列表
 * @returns 操作结果
 */
export function ackFrigateEvents(ids: string[], config?: AxiosRequestConfig) {
  return apiPost('/security/frigate/ack', { ids }, config)
}

/**
 * 获取安防面板状态。
 * 对应后端 endpoint：GET /security-panel/status
 * @returns 面板状态
 */
export function fetchSecurityPanelStatus(config?: AxiosRequestConfig) {
  return apiGet('/security-panel/status', config)
}

/**
 * 布防安防面板。
 * 对应后端 endpoint：POST /security-panel/arm
 * @param mode 布防模式
 * @param zoneIds 可选防区列表
 * @returns 操作结果
 */
export function armSecurityPanel(mode: string, zoneIds?: string[], config?: AxiosRequestConfig) {
  return apiPost('/security-panel/arm', { mode, zoneIds }, config)
}

/**
 * 撤防安防面板。
 * 对应后端 endpoint：POST /security-panel/disarm
 */
export function disarmSecurityPanel(config?: AxiosRequestConfig) {
  return apiPost('/security-panel/disarm', {}, config)
}

/**
 * 触发安防紧急报警。
 * 对应后端 endpoint：POST /security-panel/emergency
 * @returns 操作结果
 */
export function triggerSecurityEmergency(config?: AxiosRequestConfig) {
  return apiPost('/security-panel/emergency', {}, config)
}

/**
 * 更新安防面板防区配置。
 * 对应后端 endpoint：POST /security-panel/zones
 * @param zones 防区配置列表
 * @returns 操作结果
 */
export function updateSecurityPanelZones(zones: unknown[], config?: AxiosRequestConfig) {
  return apiPost('/security-panel/zones', { zones }, config)
}

/**
 * 获取安防面板事件。
 * 对应后端 endpoint：GET /security-panel/events
 * @returns 事件列表
 */
export function fetchSecurityPanelEvents(
  params?: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiGet('/security-panel/events', { ...config, params: { ...config?.params, ...params } })
}

/**
 * 获取离家模拟模式。
 * 对应后端 endpoint：GET /security-panel/away-sim/pattern
 * @returns 模拟模式
 */
export function fetchAwaySimPattern(config?: AxiosRequestConfig) {
  return apiGet('/security-panel/away-sim/pattern', config)
}

/**
 * 获取离家模拟状态。
 * 对应后端 endpoint：GET /security-panel/away-sim/status
 * @returns 状态信息
 */
export function fetchAwaySimStatus(config?: AxiosRequestConfig) {
  return apiGet('/security-panel/away-sim/status', config)
}

/**
 * 启用离家模拟。
 * 对应后端 endpoint：POST /security-panel/away-sim/enable
 * @param payload 启用参数
 * @returns 操作结果
 */
export function enableAwaySim(payload: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiPost('/security-panel/away-sim/enable', payload, config)
}

/**
 * 关闭离家模拟。
 * 对应后端 endpoint：POST /security-panel/away-sim/disable
 * @returns 操作结果
 */
export function disableAwaySim(config?: AxiosRequestConfig) {
  return apiPost('/security-panel/away-sim/disable', undefined, config)
}
