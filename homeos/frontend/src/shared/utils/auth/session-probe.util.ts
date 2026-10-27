/**
 * 首屏「要不要打一发 `/auth/me`」的判定。
 *
 * 背景：路由守卫在首个导航里会探一次登录态（`GET /auth/me`）。匿名访客必然是 401 ——
 * 拦截器已经把它当正常分支（`skipAuthRedirect`）处理，不会弹窗也不会清会话，但浏览器照样
 * 会把这次请求标红打到控制台。入户页（登录 / 注册 / 激活 / 找回）恰恰是匿名访客最常落地的
 * 页面，于是每次冷开都留一条 `Failed to load resource: 401`，看起来像坏了一样。
 *
 * 现在服务端渲染外壳时就把结论写进 `<html data-auth="guest|user">`（见
 * `backend/src/bootstrap/spa_static.py` 的 `inject_auth_hint`）：服务端能看到请求有没有
 * 会话 Cookie。**没有** Cookie 时 `/auth/me` 一定 401，这一发没有任何信息量，直接跳过。
 *
 * 为什么只信 `guest`：
 *   · 服务端只能确认「有没有 Cookie」，确认不了「这个 Cookie 还有效」，所以 `user` 只是
 *     「可能已登录」，必须真打一次才知道；
 *   · `unknown`（属性缺失）也必须打 —— Vite 开发索引不经过后端外壳渲染，没有这个属性。
 *     若按「不认识就不打」处理，开发态硬刷新会把已登录用户当成匿名：守卫不放行受保护路由，
 *     人也到不了总览页，而 Cookie 其实是好的。这条与商店 `session-probe.ts` 的口径一致。
 */

/** 服务端给出的登录态提示。`unknown` = 外壳上没有这个属性（开发索引 / 老模板）。 */
export type ServerAuthHint = 'guest' | 'user' | 'unknown'

/**
 * 解析 `data-auth` 的取值。
 *
 * 未知取值一律收敛成 `unknown`（等于「照旧探测」）：宁可多打一发 401，也不要把
 * 已登录用户误判成游客 —— 后者的症状是「刷新后停在登录页、Cookie 明明是好的」。
 *
 * @param value - `<html data-auth>` 的原始字符串
 */
export function parseServerAuthHint(value: string | null | undefined): ServerAuthHint {
  if (value === 'guest') return 'guest'
  if (value === 'user') return 'user'
  return 'unknown'
}

/**
 * 是否该发登录态探针。
 *
 * 只有服务端**明确**判定 `guest` 时跳过 —— 那种情况下 `/auth/me` 必然 401。
 */
export function shouldProbeSession(hint: ServerAuthHint): boolean {
  return hint !== 'guest'
}

/**
 * 读当前文档外壳上的登录态提示。
 *
 * 只在首屏有意义：SPA 内导航不换 `<html>`，属性会变旧（登录 / 登出后仍是首屏那次的值）。
 * 调用点因此限死在「首个导航的登录态探测」这一处。
 */
export function readServerAuthHint(): ServerAuthHint {
  if (typeof document === 'undefined') return 'unknown'
  return parseServerAuthHint(document.documentElement.getAttribute('data-auth'))
}
