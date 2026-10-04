/**
 * 商业授权门禁状态（独立模块，避免 api-client ↔ router 循环依赖）
 */
import { ref } from 'vue'

/** null=未检查；LICENSE_REQUIRED=0 时记为 true */
const licenseActivated = ref<boolean | null>(null)

/** 上次成功探测 /license/status 的时间戳 */
let lastLicenseCheckAt = 0
const LICENSE_CHECK_TTL_MS = 60_000

function touchLicenseCheckedAt(): void {
  lastLicenseCheckAt = Date.now()
}

/** 激活页成功后 / 401 拦截时更新缓存 */
export function markLicenseActivated(value = true): void {
  licenseActivated.value = value
  touchLicenseCheckedAt()
}

/** 未明确放行时不拉业务 API（null 视为未放行） */
export function isLicenseGateOpen(): boolean {
  return licenseActivated.value === true
}

/** 响应式授权状态（供 watch） */
export function useLicenseActivatedRef() {
  return licenseActivated
}

/** 读取当前值（路由守卫） */
export function getLicenseActivated(): boolean | null {
  return licenseActivated.value
}

/** 写入当前值（路由守卫探测后） */
export function setLicenseActivated(value: boolean | null): void {
  licenseActivated.value = value
  touchLicenseCheckedAt()
}

/**
 * 是否应重新拉取 /license/status。
 * null 或 TTL 过期时刷新；进入激活页时强制刷新。
 */
export function shouldRefreshLicenseStatus(force = false): boolean {
  if (force) return true
  if (licenseActivated.value === null) return true
  return Date.now() - lastLicenseCheckAt >= LICENSE_CHECK_TTL_MS
}
