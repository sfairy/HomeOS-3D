/**
 * HA 连接 / WebRTC 信令 API
 *
 * 职责：封装 HA 连接测试与 HA 摄像头 WebRTC 信令端点（从已删除的联动引擎 API 中移出）。
 * 依赖：../api-client 提供的 apiPost。
 * 端点范围：/ha/test-connection、/ha/webrtc/candidate、/ha/webrtc/close
 */
import type { AxiosRequestConfig } from 'axios'
import { apiPost } from '../api-client'

/**
 * 测试 HA 连接。
 * 对应后端 endpoint：POST /ha/test-connection
 * @param payload 包含 url / token 等
 * @returns 测试结果
 */
export function testHaConnection(payload: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiPost('/ha/test-connection', payload, config)
}

/**
 * 发送 WebRTC ICE Candidate（HA 摄像头/WebRTC 信令）。
 * 对应后端 endpoint：POST /ha/webrtc/candidate
 * @param payload 信令载荷
 * @returns 操作结果
 */
export function sendWebRtcCandidate(payload: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiPost('/ha/webrtc/candidate', payload, config)
}

/**
 * 关闭 HA WebRTC 会话。
 * 对应后端 endpoint：POST /ha/webrtc/close
 * @param payload 会话标识
 * @returns 操作结果
 */
export function closeWebRtcSession(payload: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiPost('/ha/webrtc/close', payload, config)
}
