/** 路由鉴权导航决策（纯函数，供 router 与单测复用） */
import type { NavigationContext, NavigationDecision, RoutableLocation } from '@/shared/types/router'

/** 未登录也允许停留的入户页路由名（后端离线时仅放行这些）。 */
const GUEST_ROUTES = new Set([
  'register',
  'login',
  'activation',
  'license-recovery',
  'reset-password',
])

/** 零用户（本机还没有任何账号）时允许停留的两页：登录页会给出注册入口，注册页是表单本体。 */
const ZERO_USER_ENTRY_ROUTES = new Set(['login', 'register'])

/**
 * 零用户（本机还没有任何账号）时的落点。
 *
 * 单独抽出来是为了让 `router/index.ts` 的守卫与 `resolveNavigationTarget` 用**同一个函数**
 * 而不是两处手抄同一句条件：这条规则改动频率高（从 `/register` 改成 `/login` 就是一次），
 * 而两处不同步的后果是「守卫放行、纯函数又把人弹走」这类只在某个入口复现的鬼打墙。
 *
 * @param routeName 目标路由名（非命名路由传 undefined）
 * @returns 需要跳转时返回目标地址；本页可停留时返回 null
 */
export function resolveZeroUserTarget(routeName?: string): '/login' | null {
  return routeName && ZERO_USER_ENTRY_ROUTES.has(routeName) ? null : '/login'
}

/**
 * 根据导航上下文决策目标路由的走向。
 *
 * 决策优先级（从上到下短路返回）：
 * 1. 系统初始化状态未确定 → 中止
 * 2. 后端离线 → 放行入户页，其余阻断
 * 3. 未初始化 → `resolveZeroUserTarget`（登录页 / 注册页，其余去登录页）
 * 4. 已初始化但仍在注册页 → 已登录回首页，未登录去登录页
 * 5. 需认证但未登录 → 登录页
 * 6. 授权状态未确定 → 中止
 * 7. 未激活 → 激活页（`login` / `activation` / `reset-password` 例外）
 * 8. 已登录仍在登录页 / 找回密码页 / 已激活仍在激活页 → 首页
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

  // 3. 未初始化：本机零用户。登录页与注册页都放行（登录页会显示「创建本机唯一账号」入口），
  // 其余地址先去登录页 —— 规则集中在 resolveZeroUserTarget，守卫也用同一个函数。
  if (!systemInitialized) {
    return resolveZeroUserTarget(routeName)
  }

  // 4. 已初始化仍在注册页：注册入口已关闭
  if (routeName === 'register') {
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
    if (routeName === 'activation' || routeName === 'login' || routeName === 'reset-password')
      return null
    return isAuthenticated ? '/activate' : '/login'
  }

  // 8. 已登录且已授权仍停在入户页 → 首页。
  // 未登录时必须能停留在 /login（否则会 /login → / → /login 死循环，启动覆盖层永不收起）。
  if (routeName === 'login') {
    return isAuthenticated ? '/' : null
  }
  // 已登录还去「找回密码」没有意义：账号就在手上，回首页。
  if (routeName === 'reset-password') {
    return isAuthenticated ? '/' : null
  }
  if (routeName === 'activation') {
    return isAuthenticated ? '/' : '/login'
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
