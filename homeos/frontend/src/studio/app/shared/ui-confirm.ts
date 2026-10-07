/**
 * 站内统一确认框（薄封装）。
 *
 * 旧实现自己挂一套 ``<dialog>`` + ``/static/shared/ui-confirm.css``；现在改走外壳
 * ``chrome.confirm`` / ``VConfirmModal``，保持 ``confirmAction({...})`` 调用签名不变，
 * 编辑器里那一处冲突确认不用改调用点。
 */

import { shellConfirm } from '../../runtime/shell-chrome'

type ConfirmOptions = {
  kicker?: string
  title?: string
  message?: string
  detail?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: string
}

/** 弹出站内确认框，行为对齐原生 confirm：取消 / Esc / 遮罩 → false。 */
export async function confirmAction(options: ConfirmOptions = {}): Promise<boolean> {
  return shellConfirm(options)
}
