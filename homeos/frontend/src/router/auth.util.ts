/**
 * 路由鉴权导航决策（纯函数，供 router 与单测复用）
 *
 * 首装流程顺序：**注册 → 登录 → 授权检测**。
 * 1. 本机尚无账号（未初始化）→ 注册页（`/register`）
 * 2. 已有账号但无会话 → 登录页（`/login`，仅需认证的路由强制）
 * 3. 已登录 → 授权检测（未激活 → `/activate`）
 *
 * 依赖：@/types/router 的导航上下文类型。
 */
import type { NavigationContext, NavigationDecision, RoutableLocation } from '@/types/router'

/** 未登录也允许停留的入户页路由名（后端离线时仅放行这些）。 */
const GUEST_ROUTES = new Set(['register', 'setup', 'login', 'activation', 'license-recovery'])

/**
 * 根据导航上下文决策目标路由的走向。
 *
 * 决策优先级（从上到下短路返回）：
 * 1. 系统初始化状态未确定 → 中止
 * 2. 后端离线 → 放行入户页，其余阻断
 * 3. 未初始化 → 注册页
 * 4. 已初始化但仍在注册页 → 已登录回首页，未登录去登录页
 * 5. 需认证但未登录 → 登录页
 * 6. 授权状态未确定 → 中止
 * 7. 未激活 → 激活页
 * 8. 已登录仍在登录页 / 已激活仍在激活页 → 首页
 * 9. 设置锁 → 拦截
 * 10. 默认放行（公开展示页无需登录）
 */
export function resolveNavigationTarget(
  to: RoutableLocation,
  ctx: NavigationContext,
): NavigationDecision {
  const {
    systemInitialized,
    isAuthenticated,
    // 缺省为 null（fail-closed）：调用方必须显式传入探测结果
    licenseActivated = null,
    settingsLockEnabled = false,
    isSettingsUnlocked = true,
  } = ctx

  // 1. 系统初始化状态未确定
  if (systemInitialized === null || systemInitialized === undefined) {
    return undefined
  }

  const routeName = typeof to.name === 'string' ? to.name : undefined
  const isEntryRoute = Boolean(routeName && GUEST_ROUTES.has(routeName))

  // 2. 离线态：只放行入户页，业务路由一律阻断（等待后端恢复）
  if (systemInitialized === 'offline') {
    return isEntryRoute ? null : false
  }

  // 3. 未初始化：本机零用户，只能去注册页
  if (!systemInitialized) {
    return routeName === 'register' || routeName === 'setup' ? null : '/register'
  }

  // 4. 已初始化仍在注册页：注册入口已关闭
  if (routeName === 'register' || routeName === 'setup') {
    return isAuthenticated ? '/' : '/login'
  }

  // 5. 需认证但未登录 → 登录页（公开展示页不拦）
  if (!isAuthenticated && to.meta?.requiresAuth) {
    return '/login'
  }

  // 6. 授权状态未确定 → 中止（守卫已先行探测，正常不会走到这里）
  if (licenseActivated === null || licenseActivated === undefined) {
    return undefined
  }

  // 7. 商业授权门禁（LICENSE_REQUIRED 关闭时调用方传入 true）
  // `/activate` 现要求本机会话，故未登录时必须能停留在 `/login`，否则会与激活页互踢。
  if (licenseActivated === false) {
    if (routeName === 'activation' || routeName === 'login') return null
    return isAuthenticated ? '/activate' : '/login'
  }

  // 8. 已授权仍在入户页 → 首页
  if (routeName === 'activation' || routeName === 'login') {
    return '/'
  }

  // 9. 设置锁
  if (
    (to.path?.startsWith('/settings') || routeName === 'builder') &&
    settingsLockEnabled &&
    !isSettingsUnlocked
  ) {
    return '/'
  }

  return null
}
