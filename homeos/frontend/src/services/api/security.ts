/**
 * 安防与安防面板 REST API 封装
 *
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




