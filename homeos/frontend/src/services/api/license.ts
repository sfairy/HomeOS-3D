/**
 * 商业授权 REST API
 *
 * 职责：查询联网租约授权状态、用「购买邮箱 + 激活码」激活、显式重试续租 / 恢复。
 * 依赖：../api-client 提供的 apiGet / apiPost。
 * 端点：GET /license/status、POST /license/activate、POST /license/retry。
 */
import { apiGet, apiPost } from '../api-client'

/** 授权状态机（与后端 LicenseStatus 对齐）。 */
type LicenseState =
  | 'UNACTIVATED'
  | 'ACTIVE'
  | 'CONNECTION_WARNING'
  | 'STARTUP_VALIDATION_REQUIRED'
  | 'LEASE_EXPIRED'
  | 'RECOVERY_RETRY'
  | 'RECOVERY_REQUIRED'
  | 'REMOTE_REJECTED'
  | 'REVOKED'
  | 'INVALID'
  | 'INSTANCE_CHANGED'
  | 'INSTANCE_MISMATCH'
  | 'CLOCK_ROLLBACK'
  | 'DEACTIVATED'

/** 授权商品条目（来自签名租约）。 */
type LicenseProduct = {
  name: string
  type: string
  expiresAt: string | null
}

/** 授权状态响应（与后端 LicenseStatus 对齐）。 */
export type LicenseStatus = {
  required: boolean
  allowed: boolean
  editorAllowed: boolean
  status: LicenseState | string
  statusLabel: string
  instanceId: string
  activationCodeId: string | null
  leaseId: string | null
  leaseSequence: number
  edition: string | null
  features: string[]
  products: LicenseProduct[]
  heartbeatIn: number
  leaseIssuedAt: string | null
  leaseExpiresAt: string | null
  lastHeartbeatAt: string | null
  lastVerifiedAt: string | null
  lastError: string | null
  errorCode: string | null
  retryable: boolean
  canRetry: boolean
  retrying: boolean
  retryAttempt: number
  nextRetryAt: string | null
  startupValidationPending: boolean
  activationCodeHint: string | null
  activationEmail: string | null
  publicKeyFingerprint: string | null
  rateLimitedUntil: string | null
}

/** 获取当前授权状态。对应后端 endpoint：GET /license/status */
export function getLicenseStatus() {
  return apiGet<LicenseStatus>('/license/status', { dedupe: false })
}

/**
 * 提交「购买邮箱 + 激活码」完成激活。
 * 对应后端 endpoint：POST /license/activate
 * @param email 商店下单账号邮箱
 * @param activationCode 商店发放的激活码
 */
export function activateLicense(email: string, activationCode: string) {
  return apiPost<LicenseStatus>('/license/activate', { email, activationCode })
}

