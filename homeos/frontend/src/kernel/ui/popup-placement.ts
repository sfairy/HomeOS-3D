/**
 * 弹窗开合方向与对齐方式计算工具。
 *
 * 优先顺序固定为：上 → 下 → 右 → 左（取第一个能完整放下的方向）。
 * 可用空间相对于「显示区域」bounds（如户型图画布）计算，避免弹窗外溢。
 */

/** 弹窗方向/对齐：百分比与固定锚点共用 */
type PopupPlacementDirection = {
  position: 'top' | 'bottom' | 'left' | 'right'
  alignment: 'center' | 'left' | 'right' | 'top' | 'bottom'
}

/** 定位参考区（与锚点同一坐标系） */
export type PopupPlacementBounds = {
  left: number
  top: number
  right: number
  bottom: number
}

type Side = PopupPlacementDirection['position']

/** 方向优先序：上 → 下 → 右 → 左 */
const SIDE_PRIORITY: Side[] = ['top', 'bottom', 'right', 'left']

/**
 * 根据锚点与弹窗尺寸选择开合方向与对齐。
 *
 * @param cx 锚点中心 x
 * @param cy 锚点中心 y
 * @param w 弹窗宽度
 * @param h 弹窗高度
 * @param bounds 可放置区域（户型图显示区）
 * @param margin 安全间距
 */
export function pickPopupPlacementDirection(
  cx: number,
  cy: number,
  w: number,
  h: number,
  bounds: PopupPlacementBounds,
  margin: number,
): PopupPlacementDirection {
  const box: PopupPlacementBounds = bounds

  const spaceAbove = cy - box.top - margin
  const spaceBelow = box.bottom - cy - margin
  const spaceLeft = cx - box.left - margin
  const spaceRight = box.right - cx - margin
  const areaH = box.bottom - box.top
  const canPlaceVertically = h + margin * 2 <= areaH

  const fit: Record<Side, boolean> = {
    top: spaceAbove >= h,
    bottom: spaceBelow >= h,
    right: spaceRight >= w && canPlaceVertically,
    left: spaceLeft >= w && canPlaceVertically,
  }

  const space: Record<Side, number> = {
    top: spaceAbove,
    bottom: spaceBelow,
    right: spaceRight,
    left: spaceLeft,
  }

  // 按 上→下→右→左 取第一个能放下的方向
  let pos: Side = SIDE_PRIORITY.find((side) => fit[side]) ?? 'top'

  // 都放不下：仍按同一优先序，选空间最大者（同空间时靠前优先）
  if (!SIDE_PRIORITY.some((side) => fit[side])) {
    pos = SIDE_PRIORITY.reduce((best, side) => (space[side] > space[best] ? side : best))
  }

  let align: PopupPlacementDirection['alignment'] = 'center'
  if (pos === 'top' || pos === 'bottom') {
    if (cx < box.left + w / 2 + margin) align = 'left'
    else if (cx > box.right - w / 2 - margin) align = 'right'
  } else {
    if (cy < box.top + h / 2 + margin) align = 'top'
    else if (cy > box.bottom - h / 2 - margin) align = 'bottom'
  }
  return { position: pos, alignment: align }
}
