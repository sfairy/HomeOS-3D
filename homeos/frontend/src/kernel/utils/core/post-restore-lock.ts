/**
 * 全量恢复成功后的导航锁。
 *
 * 恢复成功的那一刻，当前页面的会话与授权都已失效：设置页上仍在跑的后台请求会陆续撞上
 * 401 / 授权失效，各自触发「去登录页（带 redirect 回设置页）」或「去激活页」。它们一旦
 * 抢在恢复流程的整页跳转之前生效，用户就会先落到激活页而不是登录页。
 *
 * 上锁后上述自动跳转一律让路，只留恢复流程自己的 `location.replace`。本模块不得引入
 * 任何依赖：api client、路由守卫、运行时导航桥都要读它，引入依赖即成环。
 */
let locked = false

/** 恢复成功后立即上锁；页面随后整页跳走，锁随文档一起销毁，无需解锁。 */
export function lockNavigationAfterRestore(): void {
  locked = true
}

/** 是否处于恢复后的跳转窗口（为 true 时自动跳转应直接放弃）。 */
export function isNavigationLockedAfterRestore(): boolean {
  return locked
}
