/**
 * 标记落点。相机运动时每帧都要重投影所有标记：改 left/top 会让整层重新布局，
 * 这里改为写 CSS 变量 `--i3d-mx/--i3d-my`，由 stage.css 里标记的 transform 前缀消费（只重绘不布局）；
 * 坐标未变的标记不写。`?marker-position=legacy` 回到 left/top。
 */

const legacyPlacement =
  typeof location !== 'undefined' && new URLSearchParams(location.search).get('marker-position') === 'legacy'
const placedAt = new WeakMap<HTMLElement, string>()

export function placeMarker(element: HTMLElement, x: number, y: number): void {
  const left = x + 'px'
  const top = y + 'px'
  const key = left + ',' + top
  if (placedAt.get(element) === key) return
  placedAt.set(element, key)
  if (legacyPlacement) {
    element.style.left = left
    element.style.top = top
    return
  }
  if (element.style.left !== '0px') element.style.left = element.style.top = '0px'
  element.style.setProperty('--i3d-mx', left)
  element.style.setProperty('--i3d-my', top)
}
