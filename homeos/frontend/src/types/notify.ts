/**
 * UI 通知类型（与 chrome.store notify 一致）。
 * 用于统一通知提示的类型与选项。
 */

/** 通知类型：success=成功，error=错误，warning=警告，info=信息 */
export type NotifyType = 'success' | 'error' | 'warning' | 'info'

/** 通知选项 */
export interface NotifyOptions {
  silent?: boolean // 是否静默（不弹 toast，仅记录）
  log?: boolean // 是否写入事件日志
  type?: NotifyType // 通知类型
  duration?: number // 展示时长（毫秒）
}