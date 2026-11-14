/** 统一操作图标（0.8.6）：`<span class="hb-ui-icon">` + MDI SVG 遮罩，样式见 `/static/ui-icons.css`。 */
import { domElement } from '@app/shared/util/dom-factory'
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
