/**
 * 路由鉴权导航决策（纯函数，供 router 与单测复用）
 *
 * 职责：根据商业授权、系统初始化状态、认证状态、设置锁状态，决策目标路由。
 *
 * 收敛到 homeos-3d 机制后：不再有访客（guest）路由 —— 3D 只存在单一管理员会话，
 * 未登录一律回登录页。
 */
import type { NavigationContext, NavigationDecision, RoutableLocation } from '@/types/router'

/**
 * 根据导航上下文决策目标路由的走向。
 *
 * 决策优先级（从上到下短路返回）：
 * 1. 授权状态未确定 → 中止
 * 2. 未激活 → 跳转 activate（已在 activate 则放行）
 * 3. 已激活但仍在 activate → 首页
 * 4. 系统状态未确定 → 中止
 * 5. 离线态 → 仅放行 login/setup/activate
 * 6. 未初始化 → 跳转 setup
 * 7. 已初始化但仍在 setup → 按认证状态跳转
 * 8. 需认证但未登录 → 登录
 * 9. 已登录访问 login → 首页
 * 10. 设置锁 → 拦截
 * 11. 默认放行
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

  // 1. 授权状态未确定
  if (licenseActivated === null || licenseActivated === undefined) {
    return undefined
  }

  // 2–3. 商业授权门禁（LICENSE_REQUIRED 关闭时调用方传入 true）
  if (licenseActivated === false) {
    if (to.name === 'activation') return null
    return '/activate'
  }
  if (to.name === 'activation') {
    return '/'
  }

  // 4. 系统初始化状态未确定
  if (systemInitialized === null || systemInitialized === undefined) {
    return undefined
  }

  // 5. 离线态：仅允许 login/setup/activate
  if (systemInitialized === 'offline') {
    if (to.name === 'login' || to.name === 'setup' || to.name === 'activation') return null
    return false
  }

  // 6. 未初始化 → setup
  if (!systemInitialized && to.name !== 'setup') return '/setup'

  // 7. 已初始化仍在 setup
  if (to.name === 'setup' && systemInitialized) {
    return isAuthenticated ? '/' : '/login'
  }

  // 8. 需认证未登录
  if (to.meta?.requiresAuth && !isAuthenticated) return '/login'

  // 9. 已登录访问 login
  if (to.name === 'login' && isAuthenticated) return '/'

  // 10. 设置锁
  if (
    (to.path?.startsWith('/settings') || to.name === 'builder') &&
    settingsLockEnabled &&
    !isSettingsUnlocked
  ) {
    return '/'
  }

  return null
}
