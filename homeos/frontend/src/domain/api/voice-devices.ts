/**
 * 语音终端 API（配对授权 + 唤醒词）。
 *
 * 「语音终端」= 能自己发 HTTP 请求的设备（ESP32 / 自研网关 / 树莓派）。
 * 小米、天猫等成品音箱不在此列 —— 它们只会连厂商云，能把它们当播报喇叭用
 * （见「播报输出」），但没法让它们把语音发过来。
 *
 * 服务端把凭据只存哈希，所以这些接口**永远不会**回传配对码之外的东西：
 * `pairingCode` 只在生成那一次出现，`deviceCredential` / `accessToken` 只回给设备本身。
 * 管理端列表只含 `id` / `gatewayId` / `deviceId` / 权限与接收人。
 */
import type { AxiosRequestConfig } from 'axios'
import { apiDelete, apiGet, apiPost, apiPut } from '../../kernel/http/index'

/** 已配对的音箱（管理端视图，不含任何凭据）。 */
export interface VoiceDeviceGrant {
  id: string
  memberId: string
  memberName: string
  voiceGatewayId: string | null
  voiceDeviceId: string | null
  allowVoiceWakeWordAdd: boolean
  notifyMemberIds: string[]
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string | null
}

/** 生成配对码的返回：`pairingCode` 只出现这一次。 */
export interface VoicePairingCode {
  id: string
  pairingCode: string
  expiresAt: string
}

/** 唤醒词快照；`source=local` 表示网关未配置、读的是本机镜像。 */
export interface WakeWordSnapshot {
  words: string[]
  version: number
  source?: 'local' | 'gateway'
}

/** 成员摘要（`GET /auth/users`，仅管理员可调）。 */
export interface HouseholdMember {
  id: string
  username: string
  displayName?: string | null
  role?: string
  isActive?: boolean
}

/** 生成一次性配对码（10 分钟有效）。 */
export function createVoicePairing(memberId?: string, config?: AxiosRequestConfig) {
  return apiPost<VoicePairingCode>('/agent/voice-devices/pairing', memberId ? { memberId } : {}, config)
}

/**
 * 用配对码换设备凭证（设备侧调用；管理端只在「本机模拟配对」调试时用）。
 *
 * 返回的 `deviceCredential` **只出现这一次**：服务端只存它的 sha256，丢了就只能吊销重配。
 * 这个端点不需要登录 Cookie（设备凭证鉴权），所以在 CSRF 豁免表里。
 */
export function pairVoiceDevice(
  pairingCode: string,
  voiceGatewayId: string,
  voiceDeviceId: string,
  config?: AxiosRequestConfig,
) {
  return apiPost<{ deviceCredential: string; voiceGatewayId: string; voiceDeviceId: string }>(
    '/agent/voice-devices/pair',
    { pairingCode, voiceGatewayId, voiceDeviceId },
    config,
  )
}

/** 列出已配对的音箱。 */
export function fetchVoiceDevices(config?: AxiosRequestConfig) {
  return apiGet<VoiceDeviceGrant[]>('/agent/voice-devices', config)
}

/** 开关「允许这台音箱通过语音添加唤醒词」。 */
export function setVoiceWakeWordPermission(grantId: string, allowed: boolean, config?: AxiosRequestConfig) {
  return apiPut<{ allowVoiceWakeWordAdd: boolean }>(
    `/agent/voice-devices/${encodeURIComponent(grantId)}/wake-word-permission`,
    { allowVoiceWakeWordAdd: allowed },
    config,
  )
}

/** 设置「发到手机」未点名时的默认接收人。 */
export function setVoiceNotifyMembers(grantId: string, memberIds: string[], config?: AxiosRequestConfig) {
  return apiPut<{ notifyMemberIds: string[] }>(
    `/agent/voice-devices/${encodeURIComponent(grantId)}/notify-members`,
    { memberIds },
    config,
  )
}

/** 吊销一台音箱的授权（设备凭证与访问令牌立即失效）。 */
export function revokeVoiceDevice(grantId: string, config?: AxiosRequestConfig) {
  return apiDelete<{ ok: boolean }>(`/agent/voice-devices/${encodeURIComponent(grantId)}`, config)
}

/** 读唤醒词：网关可用则直读，未配置时返回本机镜像并带 `source=local`。 */
export function fetchWakeWords(config?: AxiosRequestConfig) {
  return apiGet<WakeWordSnapshot>('/agent/wake-words', config)
}

/**
 * 整表替换唤醒词（带版本 CAS）。
 *
 * `expectedVersion` 是上一次读到的版本：网关在保存期间被别的终端改过时，服务端返回 409，
 * 前端应提示「唤醒词已更新，请刷新后重试」而不是覆盖别人的修改。
 */
export function replaceWakeWords(words: string[], expectedVersion: number, config?: AxiosRequestConfig) {
  return apiPut<WakeWordSnapshot>('/agent/wake-words', { words, expectedVersion }, config)
}

/** 家庭成员（仅管理员）：给「默认推送接收人」选择器供数据。 */
export function fetchHouseholdMembers(config?: AxiosRequestConfig) {
  return apiGet<HouseholdMember[]>('/auth/users', config)
}
