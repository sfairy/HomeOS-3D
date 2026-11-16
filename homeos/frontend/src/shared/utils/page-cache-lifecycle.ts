/**
 * @file page-cache-lifecycle.ts
 * @module frontend/src/shared/utils
 */
/**
 * bfcache（前进 / 后退缓存）与实时通道的交接点。
 *
 * 页面被放进 bfcache 时浏览器**冻结整个文档**：定时器暂停、WebSocket 由浏览器直接切断。
 * 由此产生两个都不是「警告层面」的后果：
 *
 * 1. 断连不是我们发起的，控制台会打 `WebSocket connection to … failed: Page entered
 *    Back-Forward Cache`。看着像故障，实际只是浏览器代劳 —— 于是真正的问题被这条噪音盖住。
 * 2. 冻结期间既没有 `close` 回调也没有定时器，`scheduleReconnect` 那套指数退避**一次都
 *    不会跑**。回到页面后只能等心跳超时（`light-stream` 是 65s，界面一直停在旧值）或者等
 *    下一次 `visibilitychange` 碰巧触发，实时性直接失效。
 *
 * 所以统一在这里提供两个时机：进入 bfcache / 被冻结前主动停止实时通道，恢复时立刻重建
 * （而不是等超时）。注意 Chrome 149+ 仍可能在 freeze 那一刻打印
 * `Page entered Back-Forward Cache`（close 的握手下发后来不及完成，浏览器会按 bfcache 路径
 * 收尾），这条日志无法从 JS 侧完全消除；主动关的价值是「恢复后能干净重连 + 服务端不必等
 * 心跳超时才发现死连接」，不是消噪。
 *
 * 只认 `persisted === true`：普通卸载不会再有 `pageshow`，那属于各模块 dispose 的职责；
 * 在这里一并处理反而会和「页面真的关掉了」抢时序。
 *
 * 另补 Page Lifecycle 的 `freeze` / `resume`：Chrome 149+ 在移动端「切后台被冻结」这条
 * 路径上可能既不发 `pageshow` 也不发 `visibilitychange`（只有 `resume`），只靠
 * `pagehide/pageshow` 会让实时通道一直停在冻结前的状态。`freeze` 与 `pagehide` 会先后
 * 到达，用 `suspended` 标志保证一轮挂起只通知一次。
 */

type PageCacheListener = () => void

const suspendListeners = new Set<PageCacheListener>()
const resumeListeners = new Set<PageCacheListener>()
let listenersInstalled = false
/** 当前是否「已挂起、尚未恢复」：pagehide(persisted) 与 freeze 先后到达时只通知一次。 */
let suspended = false

function notify(listeners: Set<PageCacheListener>): void {
  // 逐个 try：一个通道的恢复失败不能拦住其它通道，否则整个页面会停在「半连接」状态。
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch (listenerError) {
      // 挂起 / 恢复属于清理路径，异常绝不能抛回浏览器的事件派发里。
      console.warn('[page-cache] 实时通道切换失败', listenerError)
    }
  }
}

function installListeners(): void {
  if (listenersInstalled || typeof window === 'undefined') return
  listenersInstalled = true
  /**
   * 挂起 / 恢复共用同一个开关：`pagehide(persisted)` 与 `freeze` 会先后到达，
   * 只在状态真正翻转时通知，保证一轮冻结里只挂起一次、只恢复一次。
   */
  const toggle = (isFrozen: boolean) => {
    if (suspended === isFrozen) return
    suspended = isFrozen
    notify(isFrozen ? suspendListeners : resumeListeners)
  }
  window.addEventListener('pagehide', (pageHideEvent) => pageHideEvent.persisted === true && toggle(true))
  window.addEventListener('pageshow', (pageShowEvent) => pageShowEvent.persisted === true && toggle(false))
  // `freeze` / `resume` 不在 lib.dom 的 DocumentEventMap 里，走 EventTarget 的字符串重载。
  const lifecycleTarget = document as EventTarget
  lifecycleTarget.addEventListener('freeze', () => toggle(true))
  lifecycleTarget.addEventListener('resume', () => toggle(false))
}

/**
 * 页面即将进入 bfcache：立刻断开实时通道（此时主动关不会产生控制台错误）。
 *
 * @returns 取消订阅函数，供组件 dispose 时调用。
 */
export function onPageCacheSuspend(listener: PageCacheListener): () => void {
  installListeners()
  suspendListeners.add(listener)
  return () => suspendListeners.delete(listener)
}

/**
 * 页面刚从 bfcache 恢复：立刻重建实时通道。
 *
 * @returns 取消订阅函数，供组件 dispose 时调用。
 */
export function onPageCacheResume(listener: PageCacheListener): () => void {
  installListeners()
  resumeListeners.add(listener)
  return () => resumeListeners.delete(listener)
}
