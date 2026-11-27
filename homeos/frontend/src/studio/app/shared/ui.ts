import { shellConfirm } from '@/studio/platform/shell-chrome'
import { domElement } from '@app/shared/util/dom-factory'

/**
 * 站内统一确认框（薄封装）。
 *
 * 改走外壳 ``chrome.confirm`` / ``VConfirmModal``，保持 ``confirmAction({...})`` 调用签名不变，
 * 编辑器里那一处冲突确认不用改调用点。
 */


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

/** 统一操作图标（0.8.6）：`<span class="hb-ui-icon">` + MDI SVG 遮罩，样式见 `/static/ui-icons.css`。 */
const MDI_ICON_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function uiIconUrl(name: string | null | undefined): string {
  const bare = String(name || '').replace(/^mdi:/, '')
  return MDI_ICON_NAME.test(bare) ? '/static/vendor/mdi/7.4.47/svg/' + bare + '.svg' : ''
}

export function createUiIcon(doc: Document, name: string): HTMLSpanElement {
  const icon = domElement(doc, 'span', 'hb-ui-icon')
  icon.setAttribute('aria-hidden', 'true')
  const url = uiIconUrl(name)
  icon.hidden = !url
  if (url) {
    icon.style.setProperty('mask-image', 'url("' + url + '")')
    icon.style.setProperty('-webkit-mask-image', 'url("' + url + '")')
  }
  return icon
}

/** 渲染器控件里的 `<i aria-hidden>` 图标位，内含一个 MDI 图标。 */
export function createUiIconSlot(doc: Document, name: string): HTMLElement {
  const slot = doc.createElement('i')
  slot.setAttribute('aria-hidden', 'true')
  slot.append(createUiIcon(doc, name))
  return slot
}
