/** 家庭模式事件注册表（从 entity-store-support.ts 拆回）。 */

// ── entity-mode-events.util ──
type ModeEventHandler = (payload: unknown) => void

/**
 * 创建家庭模式事件注册表
 * @returns listeners（供 ws-bind 派发）+ onHomeModeEvent 订阅 API
 */
export function createEntityModeEventRegistry() {
  // 家庭模式事件监听器列表（home_mode_event 触发时遍历调用）
  const homeModeListeners: ModeEventHandler[] = []

  /**
   * 订阅家庭模式事件
   * @param fn 事件处理函数；非函数时返回空操作退订函数
   * @returns 退订函数，调用后从监听器列表移除该 fn
   */
  function onHomeModeEvent(fn: ModeEventHandler): () => void {
    if (typeof fn !== 'function') return () => {}
    homeModeListeners.push(fn)
    return () => {
      const idx = homeModeListeners.indexOf(fn)
      if (idx >= 0) homeModeListeners.splice(idx, 1)
    }
  }

  return {
    listeners: { homeModeListeners },
    onHomeModeEvent,
  }
}
