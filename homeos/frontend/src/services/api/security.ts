/** 安防与安防面板 REST API 封装 */
import type { AxiosRequestConfig } from 'axios'
import { apiGet, apiPost } from './client'

/** 获取安防事件列表。 */
export function fetchSecurityEvents(config?: AxiosRequestConfig) {
  return apiGet('/security/events', config)
}

/** 校验安防事件配置。 */
export function validateSecurityEvents(config?: AxiosRequestConfig) {
  return apiGet('/security/events/validate', config)
}

/** 获取在家在场状态。 */
export function fetchPresenceHome(config?: AxiosRequestConfig) {
  return apiGet('/security/presence/home', config)
}

/** 获取在场汇总。 */
export function fetchPresenceSummary(config?: AxiosRequestConfig) {
  return apiGet('/security/presence/summary', config)
}

/** 执行危险演练。 */
export function runHazardDrill(kind: string, config?: AxiosRequestConfig) {
  return apiPost('/security/hazard/drill', { kind }, config)
}






/** 获取安防面板状态。 */
export function fetchSecurityPanelStatus(config?: AxiosRequestConfig) {
  return apiGet('/security-panel/status', config)
}

/** 布防安防面板。 */
export function armSecurityPanel(
  mode: string,
  zoneIds?: string[],
  force = false,
  config?: AxiosRequestConfig,
) {
  return apiPost('/security-panel/arm', { mode, zoneIds, force }, config)
}

/** 撤防安防面板。 */
export function disarmSecurityPanel(config?: AxiosRequestConfig) {
  return apiPost('/security-panel/disarm', {}, config)
}

/** 触发安防紧急报警。 */
export function triggerSecurityEmergency(config?: AxiosRequestConfig) {
  return apiPost('/security-panel/emergency', {}, config)
}

/** 更新安防面板防区配置。confirmClear=true 才允许清空全部防区。 */
export function updateSecurityPanelZones(
  zones: unknown[],
  confirmClear = false,
  config?: AxiosRequestConfig,
) {
  return apiPost('/security-panel/zones', { zones, confirmClear }, config)
}

/** 获取安防面板事件。 */
export function fetchSecurityPanelEvents(
  params?: Record<string, unknown>,
  config?: AxiosRequestConfig,
) {
  return apiGet('/security-panel/events', { ...config, params: { ...config?.params, ...params } })
}




