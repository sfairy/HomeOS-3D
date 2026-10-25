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
 * 所以统一在这里提供两个时机：进入 bfcache 前主动停止实时通道（主动关比被浏览器硬断少一条
 * 误导性错误），从 bfcache 恢复时立刻重建（而不是等超时）。
 *
 * 只认 `persisted === true`：普通卸载不会再有 `pageshow`，那属于各模块 dispose 的职责；
 * 在这里一并处理反而会和「页面真的关掉了」抢时序。
 */

export type PageCacheListener = () => void

const suspendListeners = new Set<PageCacheListener>()
const resumeListeners = new Set<PageCacheListener>()
let listenersInstalled = false
let inPageCache = false

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
  window.addEventListener('pagehide', (pageHideEvent) => {
    if (pageHideEvent.persisted !== true) return
    inPageCache = true
    notify(suspendListeners)
  })
  window.addEventListener('pageshow', (pageShowEvent) => {
    if (pageShowEvent.persisted !== true) return
    inPageCache = false
    notify(resumeListeners)
  })
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

/**
 * 当前文档是否停在 bfcache 里。
 *
 * 用途限于「判断此刻该不该建连」：`pageshow` 恢复时会先把这个标记复位再通知订阅者，
 * 订阅者在回调里读到的一定是 `false`。
 */
export function isInPageCache(): boolean {
  return inPageCache
}
