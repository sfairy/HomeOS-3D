/**
 * 旧命令式运行时 → 外壳 chrome（toast / confirm / media modal）的桥。
 *
 * 编辑器 / 户型图绘制 / 展示页里原先各自维护 DOM toast（`.toast`）与独立
 * ``ui-confirm`` 对话框；现在统一走 Pinia ``chrome.store``，由 App 根挂载的
 * ``VNotification`` / ``VConfirmModal`` / ``MediaPlayerModal`` 渲染，
 * 和设备页等 shell 路由同一套原语。
 */

import { useChromeStore } from '@/stores/chrome.store'

type NotifyType = 'info' | 'success' | 'warning' | 'error'

/** studio toast 种类 → chrome NotifyType；未知种类按 info。 */
function toNotifyType(kind: string): NotifyType {
  if (kind === 'success' || kind === 'warning' || kind === 'error') return kind
  return 'info'
}

/**
 * 推一条 toast（对齐旧 ``showToast(message, kind)`` 签名）。
 * @param message 正文
 * @param kind ``success`` / ``warning`` / ``error`` / 其它（按 info）
 */
export function shellNotify(message: string, kind = ''): void {
  const text = String(message || '').trim()
  if (!text) return
  const type = toNotifyType(String(kind || '').trim())
  // 对齐旧 toast 时长：warning 稍长，其余约 2.6s
  const duration = type === 'warning' ? 4400 : 2600
  useChromeStore().notify(text, type, duration)
}

/**
 * 弹出确认框（对齐旧 ``confirmAction({ title, message, ... })``）。
 * @returns 用户是否点了确认
 */
export async function shellConfirm(options: {
  title?: string
  message?: string
  detail?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: string
} = {}): Promise<boolean> {
  const title = String(options.title || '确认操作')
  const message = [options.message, options.detail].filter(Boolean).join('\n')
  const tone = options.tone === 'danger' || options.tone === 'warning' ? 'danger' : 'primary'
  return useChromeStore().confirm(message || title, title, {
    confirmText: options.confirmLabel || '确定',
    cancelText: options.cancelLabel || '取消',
    type: tone,
  })
}

/**
 * 打开全局媒体全屏弹窗（栈 B MediaPlayerModal）。
 * 画布 more-info / MiniWidget / 紧凑弹窗「展开」共用此入口，避免 renderer 手写第三套 UI。
 */
export function shellOpenMediaPlayer(entityId: string): void {
  const id = String(entityId || '').trim()
  if (!id.includes('.')) return
  useChromeStore().openMediaPlayer(id)
}
