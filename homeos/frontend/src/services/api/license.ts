/**
 * 商业授权 REST API（单 HTTP 栈）
 *
 * 职责：查询联网租约授权状态、用「购买邮箱 + 激活码」激活、显式重试续租 / 恢复，
 *       以及把授权状态码 / 错误信封翻译成面向用户的中文文案。
 * 依赖：../api-client 提供的 apiGet / apiPost；@/utils/core/error-message 的统一错误文案。
 * 端点：GET /license/status、GET /license/availability、POST /license/activate、
 *       POST /license/reactivate、POST /license/retry。
 *
 * 鉴权口径：`/availability` 公开脱敏；`/status`、`/activate`、`/reactivate`、`/retry`
 * 均要求登录会话（激活会上报本机账号名）。因此**门禁探测一律走 `/availability`**
 * （未登录也能读），`/status` 只用于已登录的管理面（编辑器诊断）。
 */
import { apiGet, apiPost } from '../api-client'
import { getApiErrorMessage, isUnauthorizedError } from '@/utils/core/error-message'

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
  /** 本机注册账号名（激活时上报给商店，记录在 DeviceBinding.account_name）。 */
  accountName: string | null
  publicKeyFingerprint: string | null
  rateLimitedUntil: string | null
  /** 功能码门禁明细：编辑器 / 3D 交互 / 各增量模块是否放行。 */
  featureAccess: Record<string, boolean>
}

/** 授权可用性响应（GET /license/availability，字段是 LicenseStatus 的子集 + displayAllowed）。 */
export type LicenseAvailability = {
  /** 本机是否要求激活（LICENSE_REQUIRED）。 */
  required: boolean
  status: LicenseState | string
  allowed: boolean
  editorAllowed: boolean
  displayAllowed: boolean
  canRetry: boolean
  retryable?: boolean
  retrying?: boolean
  retryAttempt?: number
  nextRetryAt?: string | null
  errorCode?: string | null
  lastError?: string | null
}

/** 文案渲染只需要这些字段；status / availability 两种响应都能传进来。 */
export type LicenseMessageState = {
  status?: string | null
  statusLabel?: string | null
  errorCode?: string | null
  lastError?: string | null
  retrying?: boolean | null
  retryable?: boolean | null
  nextRetryAt?: string | null
  retryAttempt?: number | null
}

/** 授权状态码 → 面向用户的中文说明。 */
const LICENSE_STATUS_MESSAGES: Record<string, string> = {
  UNACTIVATED: '当前服务尚未激活，请管理员激活 HomeOS。',
  DEACTIVATED: '当前授权已停用，请管理员检查。',
  RECOVERY_RETRY: '授权后台拒绝了当前会话，正在再次验证；验证成功前暂不可使用。',
  RECOVERY_REQUIRED: '授权会话恢复失败，请管理员重新激活。已有项目和配对信息已保留。',
  REMOTE_REJECTED: '授权后台明确拒绝了当前请求，请管理员检查授权。',
  REVOKED: '授权已被停用或撤销，请联系管理员；重试网络不能解除此限制。',
  INSTANCE_CHANGED: '本机安装标识已变化，请重新激活授权。',
  INSTANCE_MISMATCH: '该授权已绑定其他设备，请先到商店账号中心解除绑定后重新激活。',
  CLOCK_ROLLBACK: '系统时间异常，请先校准服务器时间，再点击重新验证。',
  INVALID: '授权签名、密钥或本地凭证校验失败，请管理员检查；不会自动清除数据。',
  LEASE_EXPIRED: '本地授权租约已到期，暂不可使用；联网恢复成功后会自动打开。',
  STARTUP_VALIDATION_REQUIRED: '服务已启动，正在后台验证授权。本地有效授权可继续使用。',
  CONNECTION_WARNING: '暂时无法完成授权联网验证，后台会自动重试；仅在本地租约有效期内继续使用。',
  ACTIVE: '授权有效，正在打开页面…',
}

/** 后端限流错误码：叠加上「授权后台请求较多」提示。 */
const LICENSE_RATE_LIMITED_HINT = 'LICENSE_RATE_LIMITED'

/** 「已绑定其他设备」的处置步骤（比状态码文案更可执行，故单独一条长提示）。 */
export const LICENSE_INSTANCE_MISMATCH_HINT =
  '处理步骤：打开商店账号中心 → 解除设备绑定 → 回到本页，用商店购买邮箱与激活码重新激活。解绑后即可立即激活，无需等待；解绑冷却只约束「下一次解绑」，不影响重新激活。本页邮箱是商店账号；顶栏「退出本机登录」只退出本机管理员会话。'

/** 可直接让用户重新填写激活码的终态：这些状态下必须由用户补凭据。 */
export const LICENSE_TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  'UNACTIVATED',
  'DEACTIVATED',
  'RECOVERY_REQUIRED',
  'REVOKED',
  'REMOTE_REJECTED',
  'INVALID',
  'INSTANCE_CHANGED',
  'INSTANCE_MISMATCH',
])

/** 带限流后缀的消息拼装。 */
function appendRateLimitHint(message: string, errorCode?: string | null): string {
  return errorCode === LICENSE_RATE_LIMITED_HINT ? `${message} 授权后台请求较多，请稍候。` : message
}

/**
 * 把授权状态渲染成一句可展示的中文提示。
 *
 * @param state 授权状态（status / availability 响应，字段可缺省）
 * @param detail 服务端下发的具体错误文案，优先级高于状态码映射
 */
export function licenseMessage(state: LicenseMessageState = {}, detail = ''): string {
  const trimmed = detail.trim()
  let message = trimmed || (state.status ? LICENSE_STATUS_MESSAGES[state.status] : '') || '正在读取授权状态…'
  message = appendRateLimitHint(message, state.errorCode)
  if (state.retrying) {
    message += ' 正在验证，请稍候。'
  } else if (state.retryable && state.nextRetryAt) {
    const seconds = Math.max(0, Math.ceil((Date.parse(state.nextRetryAt) - Date.now()) / 1000))
    if (Number.isFinite(seconds)) {
      message += ` 第 ${Number(state.retryAttempt || 0) + 1} 次重试将在约 ${seconds} 秒后进行。`
    }
  }
  return message
}

/** 后端授权错误信封里的 detail（`{ code, message, retryable }`，也兼容 string）。 */
type LicenseErrorDetail = { code?: string; message?: string; retryable?: boolean }

/** 从 axios 错误里解析后端 detail；形状不认识时返回 null。 */
function readLicenseErrorDetail(error: unknown): LicenseErrorDetail | null {
  if (!error || typeof error !== 'object') return null
  const response = (error as { response?: { data?: unknown } }).response
  const detail = (response?.data as { detail?: unknown } | undefined)?.detail
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return null
  const record = detail as Record<string, unknown>
  return {
    code: typeof record.code === 'string' ? record.code : undefined,
    message: typeof record.message === 'string' ? record.message : undefined,
    retryable: typeof record.retryable === 'boolean' ? record.retryable : undefined,
  }
}

/**
 * 从任意错误里提取授权页要展示的中文文案。
 *
 * 优先用后端 detail.message（`/license/retry` 的形状），其次走统一的错误文案归一化。
 * @param error 捕获到的错误
 * @param fallback 兜底文案
 */
export function licenseErrorMessage(error: unknown, fallback: string): string {
  if (isUnauthorizedError(error)) return '此操作需要先登录本机管理员账号。'
  const detail = readLicenseErrorDetail(error)
  if (detail?.message) return appendRateLimitHint(detail.message, detail.code)
  return getApiErrorMessage(error, fallback)
}

/** 后端是否明确表示「重试无意义」（false 时前端应隐藏重试按钮）。 */
export function licenseErrorRetryable(error: unknown): boolean | undefined {
  return readLicenseErrorDetail(error)?.retryable
}

/** 获取当前授权状态。对应后端 endpoint：GET /license/status（要求登录会话） */
export function getLicenseStatus() {
  return apiGet<LicenseStatus>('/license/status', { dedupe: false })
}

/**
 * 获取当前实例的授权可用性。对应后端 endpoint：GET /license/availability
 *
 * 公开脱敏接口：返回门禁判定所需的 `required` / `allowed` / `editorAllowed` /
 * `displayAllowed` 与状态码，不含实例标识与凭证。路由门禁与未登录页面都读它。
 */
export function getLicenseAvailability() {
  return apiGet<LicenseAvailability>('/license/availability', { dedupe: false })
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

/** 用本机已保存的凭据自动重新激活（无需再填激活码）。对应后端 endpoint：POST /license/reactivate */
export function reactivateLicense() {
  return apiPost<LicenseStatus>('/license/reactivate')
}

/** 显式触发一次授权恢复重试，不必等后台轮询。对应后端 endpoint：POST /license/retry */
export function retryLicense() {
  return apiPost<LicenseStatus>('/license/retry')
}
