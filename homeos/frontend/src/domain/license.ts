import { ref } from 'vue'
import { getLicenseAvailability } from '@/domain/api/license'
import { lockNavigationAfterRestore } from '@/kernel/core/post-restore-lock'

/**
 * 商业授权门禁状态（独立模块，避免 api-client ↔ router 循环依赖）
 */

/** null=未检查；LICENSE_REQUIRED=0 时记为 true */
const licenseActivated = ref<boolean | null>(null)

/** 上次成功探测 /license/status 的时间戳 */
let lastLicenseCheckAt = 0
const LICENSE_CHECK_TTL_MS = 15_000

function touchLicenseCheckedAt(): void {
  lastLicenseCheckAt = Date.now()
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
  touchLicenseCheckedAt()
}

/**
 * 功能码明细是否应重新拉取（与 license status 共用 TTL）。
 * 失败后保持 ``loaded=false`` 时也会返回 true，避免永久卡在 fail-closed。
 */
export function shouldRefreshLicenseFeatures(force = false): boolean {
  if (force) return true
  if (!licenseFeaturesLoaded.value) return true
  return Date.now() - lastLicenseCheckAt >= LICENSE_CHECK_TTL_MS
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

/**
 * 授权可用性快照（`GET /license/availability`）。
 *
 * 为什么需要它：路由守卫**本来**就要在放行入户路由之前拉一次可用性（门禁判定的输入），
 * 但激活页此前并不知道这件事 —— 它挂载后再自己拉一次，于是首帧只能画骨架，数据回来
 * 再换成状态句 + 表单 / 购买区块，整块面板重排一次。
 *
 * 现在守卫把同一份响应存进这里，激活页在 **setup 顶层**同步读：首帧就是最终形态。
 * 缓存只保存「最近一次真实响应」，不设置过期 —— 激活页挂载后仍会照常轮询，
 * 缓存只负责让第一帧不空着。
 */

/** 可用性响应的 `data` 形状（从 API 函数反推，避免在 services 层再导出一个类型）。 */
type LicenseAvailabilitySnapshot = Awaited<ReturnType<typeof getLicenseAvailability>>['data']

let snapshot: LicenseAvailabilitySnapshot | null = null

/** 记下守卫刚拿到的一份可用性。 */
export function rememberLicenseAvailability(value: LicenseAvailabilitySnapshot): void {
  snapshot = value
}

/** 同步读取最近一份可用性；没有就是 null（调用方据此保留骨架）。 */
export function peekLicenseAvailability(): LicenseAvailabilitySnapshot | null {
  return snapshot
}

/** 清空（登出 / 重新初始化时调用，避免把上一台机器的授权画到新页面上）。 */
export function forgetLicenseAvailability(): void {
  snapshot = null
}

/**
 * 全量备份恢复后的落点。
 *
 * 恢复是「整库原样覆盖」，只有**登录会话**必然失效：
 * `sessions` 表在快照里就是空的（见 `business_backup.EXCLUDED_DB_TABLES`），恢复后当前
 * 浏览器持有的 Cookie 已失效。
 *
 * **授权不随备份还原**：`license_state`、授权密钥与本机实例标识都在恢复前留存，整库替换后
 * 原样写回（见 `business_backup._apply_local_license`）。所以已激活的机器恢复后仍是激活态，
 * 换机恢复也不会被灌进备份里那台机器的激活码。仅当本机恢复前就未激活时才需要去激活页。
 *
 * 恢复成功后仍**不能原地 `location.reload()`**：设置页这类深链接不在授权门禁的白名单里，
 * 未激活时后端会回 JSON 401，浏览器把响应体当网页渲染 —— 用户看到的就是屏幕上一段代码。
 * 这里统一把用户送到登录（或激活引导）页，让授权页自己说明下一步。
 */

/** 未激活：登录成功后直接进激活页。 */
const LOGIN_WITH_ACTIVATION = '/login?next=/activate'
/** 已激活（或不需要授权）：只需重新登录。 */
const LOGIN_ONLY = '/login'

type PostRestoreDestination = {
  /** 登录页地址。 */
  path: string
  /** 登录后是否还需要重新激活本机授权。 */
  needsActivation: boolean
  /** 给用户看的一句提示（不出现状态码 / 英文标识）。 */
  message: string
}

/**
 * 恢复后的目标地址（纯函数，便于单测）。
 *
 * @param licenseUsable `true` 授权可用 / 不需要授权；`false` 需要（重新）激活；
 *   `null` 状态读取失败 —— 仍回登录页，登录后由路由守卫重新判定。
 */
function postRestoreDestination(licenseUsable: boolean | null): PostRestoreDestination {
  if (licenseUsable === false) {
    return {
      path: LOGIN_WITH_ACTIVATION,
      needsActivation: true,
      message:
        '全量数据已恢复。登录会话已清空，请用备份中的账号密码重新登录；本机授权保持恢复前状态，若此前未激活还需进入激活页。',
    }
  }
  return {
    path: LOGIN_ONLY,
    needsActivation: false,
    message: '全量数据已恢复。登录会话已清空，请用备份中的账号密码重新登录。',
  }
}

/**
 * 探测授权状态，得到恢复后的落点。
 *
 * 读取失败（后端刚换完库、仍在重建运行时）不阻塞恢复流程：回登录页，登录后由路由守卫再判。
 *
 * 必须在恢复接口成功返回后**立即**调用：第一步就锁住其它自动跳转，保证用户先到登录页。
 */
export async function resolvePostRestoreDestination(): Promise<PostRestoreDestination> {
  lockNavigationAfterRestore()
  try {
    const { data } = await getLicenseAvailability()
    return postRestoreDestination(!data?.required || Boolean(data?.allowed))
  } catch {
    return postRestoreDestination(null)
  }
}

/**
 * 整页跳转到落点。
 *
 * 用 `location.replace` 而不是 `push` / `reload`：恢复后的已登录界面已经失效，
 * 不该留在历史栈里让用户按「后退」回去。
 *
 * @param destination `resolvePostRestoreDestination` 的返回值
 * @param delayMs 留一小段停留时间，让用户看清弹窗 / 通知里的结果再跳
 */
export function navigateAfterRestore(destination: PostRestoreDestination, delayMs = 800): void {
  window.setTimeout(() => window.location.replace(destination.path), delayMs)
}
