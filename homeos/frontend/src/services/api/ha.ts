/** HA 连接 / WebRTC 信令 API */
import type { AxiosRequestConfig } from 'axios'
import { apiDelete, apiGet, apiPost, apiPut } from './client'

/** HA 连接状态（与后端 `connection_payload` 对齐）。 */
export type HaConnectionStatus = {
  /** 是否已保存过连接记录 */
  configured: boolean
  /** 是否保存了访问令牌（令牌本身不下发） */
  hasToken: boolean
  /** 连接器当前是否已连接 */
  connected: boolean
  /** 局域网 / 首选地址 */
  baseUrl: string
  /** 外网地址，未配置为 null */
  externalBaseUrl: string | null
  /** 当前实际使用的端点侧（internal / external），未连接时为 null */
  activeEndpoint: string | null
  /** 当前实际使用的地址（跟随 failover；未连接时回落到 baseUrl） */
  activeBaseUrl: string
  name: string
  verifyTls: boolean
  externalVerifyTls: boolean
  /** HA 版本号 */
  version: string | null
  lastConnectedAt: string | null
  /** 最近一次连接错误（已本地化，可直接展示） */
  lastError: string | null
}

/** 保存连接的请求体（与后端 `HAConnectionInput` 对齐）。 */
export type HaConnectionInput = {
  baseUrl: string
  externalBaseUrl?: string | null
  /** 留空表示复用已保存的令牌 */
  accessToken?: string | null
  verifyTls?: boolean
  externalVerifyTls?: boolean
  name?: string
  /** 地址变更后复用旧令牌需要显式确认（后端返回 HA_URL_CHANGED_TOKEN_REUSE 时重发 true） */
  reuseTokenForNewUrl?: boolean
}

/** 单侧地址的探测结果。 */
type HaProbeResult = {
  kind: string
  label: string
  baseUrl: string
  ok: boolean
  /** 失败原因（ok=false 时存在） */
  error?: string
  version?: string
  locationName?: string
}

/** 保存连接 / 探测连接的响应。 */
type HaConnectionTestResult = HaConnectionStatus & {
  test?: { version?: string | null; locationName?: string | null }
  endpoints?: HaProbeResult[]
  /** POST /ha/test 额外返回：可达端点与版本 */
  ok?: boolean
}

/** 读取 HA 连接记录。对应后端 endpoint：GET /ha/connection */
export function getHaConnection(config?: AxiosRequestConfig) {
  return apiGet<HaConnectionStatus>('/ha/connection', config)
}

/** 保存 HA 连接（后端会先探测可达性，再落库并重启连接器）。 */
export function saveHaConnection(payload: HaConnectionInput, config?: AxiosRequestConfig) {
  return apiPut<HaConnectionTestResult>('/ha/connection', payload, config)
}

/** 删除 HA 连接记录。对应后端 endpoint：DELETE /ha/connection */
export function deleteHaConnection(config?: AxiosRequestConfig) {
  return apiDelete('/ha/connection', config)
}

/** 探测 HA 地址可达性（不落库）。 */
export function testHaConnection(payload: HaConnectionInput, config?: AxiosRequestConfig) {
  return apiPost<HaConnectionTestResult>('/ha/test', payload, config)
}

/** 发送 WebRTC ICE Candidate（HA 摄像头/WebRTC 信令）。 */
export function sendWebRtcCandidate(payload: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiPost('/ha/webrtc/candidate', payload, config)
}

/** 关闭 HA WebRTC 会话。 */
export function closeWebRtcSession(payload: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiPost('/ha/webrtc/close', payload, config)
}
