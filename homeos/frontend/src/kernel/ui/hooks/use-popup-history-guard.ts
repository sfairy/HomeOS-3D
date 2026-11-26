/**
 * 弹层与浏览器历史的桥接：打开时压一个「哨兵」历史项，返回键/侧滑关闭弹层而不是离开页面。
 *
 * 背景（审计 U-03）：全仓只有路由层处理 `popstate`（用于恢复滚动位置），弹层打开时
 * 不压历史项，于是安卓平板/桌面浏览器全屏按返回会**直接路由离开**，用户会觉得「点错了
 * 一下整个页面没了」。
 *
 * ## 为什么不用简单的 `pushState` + `history.back()`
 *
 * 直接在卸载时 `history.back()` 会吃掉一次真实导航：用户点弹层里的链接跳到别的页面时，
 * 弹层组件会卸载，此时再 back 一刀就把他刚到的页面退回去了。所以这里靠**哨兵键**判断
 * 自己是不是仍处于栈顶：
 *
 * - 打开：`pushState({ __hosPopupKey: key })`；
 * - `popstate`：栈顶不再是自己 → 说明哨兵被弹掉了（用户按了返回）→ 只关闭，不再 back；
 * - 卸载：仅当栈顶仍是自己的哨兵（说明是「关弹层」而非「离开页面」）才 `back()` 清掉它。
 *
 * 嵌套弹层天然正确：每层各压一个键，返回键逐个关闭。
 */

/** 哨兵状态里的键名（加前缀避免与 vue-router 的 state 冲突）。 */
const POPUP_STATE_KEY = '__hosPopupKey'

let popupSequence = 0

/** vue-router 写进 history.state 的字段（保留它，避免破坏路由自身的状态）。 */
function currentState(): Record<string, unknown> {
  const state = globalThis.history?.state
  return state && typeof state === 'object' ? (state as Record<string, unknown>) : {}
}

/**
 * 注册一个弹层的历史哨兵。
 *
 * @param onClose 用户按返回键时应执行的关闭动作（通常是 `emit('close')`）
 * @returns 卸载函数：组件卸载时必须调用，它决定是否需要清掉哨兵
 */
export function installPopupHistoryGuard(onClose: () => void): () => void {
  if (typeof globalThis.history === 'undefined') return () => {}
  const key = `hos-popup-${++popupSequence}`
  let pushed = false

  function ownsTopEntry(): boolean {
    return currentState()[POPUP_STATE_KEY] === key
  }

  function handlePopState() {
    // 栈顶已经不是自己 → 哨兵被弹掉（用户按了返回/侧滑），只关闭、不再 back。
    if (!pushed || ownsTopEntry()) return
    pushed = false
    onClose()
  }

  try {
    // 只写自己的键：新条目不需要继承路由 state（返回时回到的是**原**条目，那里的 state 还在）。
    globalThis.history.pushState({ [POPUP_STATE_KEY]: key }, '')
    pushed = true
    globalThis.addEventListener('popstate', handlePopState)
  } catch {
    // 极端环境（无 history / 跨域 iframe 限制）：退化为「不接历史」，不影响弹层本身
    return () => {}
  }

  return () => {
    // 先摘监听：紧接着的 back() 会同步派发 popstate，不能让已经卸载的弹层再关一次。
    globalThis.removeEventListener('popstate', handlePopState)
    if (!pushed) return
    pushed = false
    // 只有「仍停在哨兵上」才回退一步；否则说明已经发生了真实导航，再 back 会吃掉它。
    if (!ownsTopEntry()) return
    globalThis.history.back()
  }
}
