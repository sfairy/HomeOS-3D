/**
 * 商业授权 REST API
 *
 * 所属模块：前端服务层（services/api/）
 * 职责：查询许可证激活状态并提交激活令牌。
 * 依赖：../api-client 提供的 apiGet / apiPost。
 * 端点：GET /license/status、POST /license/activate。
 */
import { apiGet, apiPost } from '../api-client'

/** 许可证状态响应：标识当前设备是否已激活、是否需要激活，以及硬件指纹与到期时间。 */
export type LicenseStatus = {
  isActivated: boolean
  licenseRequired: boolean
  hwid: string
  key: string | null
  /** 到期时间戳 ms；null=永久；未激活时为 null */
  expiresAt?: number | null
  /** 验签公钥指纹，须与 HomeOS-Activate /health 一致 */
  publicKeyFingerprint?: string
}

/**
 * 获取当前许可证激活状态。
 * 对应后端 endpoint：GET /license/status
 * @returns 许可证状态对象（含 hwid、到期时间、公钥指纹等）
 */
export function getLicenseStatus() {
  return apiGet<LicenseStatus>('/license/status')
}

/**
 * 提交许可证令牌完成激活。
 * 对应后端 endpoint：POST /license/activate
 * @param token 许可证激活令牌
 * @returns 激活结果（success / message / 解析后的 key 与 expiresAt）
 */
export function activateLicense(token: string) {
  return apiPost<{
    success: boolean
    message: string
    key?: string | null
    expiresAt?: number | null
  }>('/license/activate', { token })
}
