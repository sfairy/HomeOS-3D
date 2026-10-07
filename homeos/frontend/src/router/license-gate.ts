/**
 * 商业授权门禁状态（独立模块，避免 api-client ↔ router 循环依赖）
 */
import { ref } from 'vue'

/** null=未检查；LICENSE_REQUIRED=0 时记为 true */
const licenseActivated = ref<boolean | null>(null)

/** 上次成功探测 /license/status 的时间戳 */
let lastLicenseCheckAt = 0
const LICENSE_CHECK_TTL_MS = 15_000

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
 * 功能码门禁明细（``GET /license/status`` 的 ``featureAccess``）。
 *
 * 后端已经是权威执行点（未授权模块的接口直接 403），这里只用于**界面显隐**：
 * 导航栏与入口按标志收起，避免点进去才发现被拒。
 * ``licenseFeaturesLoaded=false``：明细未就绪 → fail-closed（入口先收起）。
 * 已加载后：只有显式 ``false`` 才收起；未登记码视为放行。
 */
const licenseFeatureAccess = ref<Record<string, boolean>>({})

/** 是否已拿到过一份功能码明细（含「拉取失败后的空对象」）。 */
const licenseFeaturesLoaded = ref(false)

/** 写入功能码明细；传空表示重置（登出时调用）。 */
export function setLicenseFeatureAccess(access?: Record<string, boolean> | null): void {
  if (!access) {
    licenseFeatureAccess.value = {}
    licenseFeaturesLoaded.value = false
    return
  }
  licenseFeatureAccess.value = { ...access }
  licenseFeaturesLoaded.value = true
}

/** 读取当前功能码明细（供 watch）。 */
export function useLicenseFeatureAccess() {
  return licenseFeatureAccess
}

/** 是否已加载过功能码明细。 */
export function hasLicenseFeatureAccess(): boolean {
  return licenseFeaturesLoaded.value
}

/**
 * 指定功能码是否放行（仅用于界面显隐）。
 * @param code 功能码；明细未加载时 fail-closed；已加载但未登记该码时视为放行
 */
export function isLicenseFeatureGranted(code: string): boolean {
  const access = licenseFeatureAccess.value
  // 明细未加载：fail-closed，避免未授权模块导航闪现；加载完成后按明细判定。
  if (!licenseFeaturesLoaded.value) return false
  return access[code] !== false
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
