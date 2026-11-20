/**
 * 主视图切换时的「平面取景保持」（0.8.7 `createEditorWorkspace` 的 centre / revision 协议）。
 *
 * 背景：`plan` / `three` 两个模式是把 `.plan-panel` 与 `.preview-card` **物理对调**，
 * 平面画布宽高会从 554×738 变成 434×444。此前的做法是切完直接「适应画布」（`resetView`），
 * 于是每切一次主视图，用户的缩放与平移都被重置 —— 画到一半切去看 3D 再回来，得重新对位。
 *
 * 上游的做法是：切换前记下**画布中心对应的平面坐标**，切换后用同一个 `zoom` 反算偏移量：
 * `offset = 画布尺寸 / 2 - centre * zoom`（`planToScreen` 就是 `plan * zoom + offset`）。
 *
 * 这里只放纯函数，方便门禁脚本单独加载断言（不依赖 runtime / three）。
 */

export interface PlanCentre {
  x: number
  y: number
}

export interface PlanViewportSize {
  width: number
  height: number
}

/**
 * 用「想保持在画布中心的平面坐标 + 缩放」反算视图偏移。
 *
 * @param centre 要落在画布中心的平面坐标（像素）
 * @param zoom 当前缩放（必须 > 0）
 * @param width 画布宽度（CSS 像素）
 * @param height 画布高度（CSS 像素）
 */
export function planCenterOffsets(
  centre: PlanCentre,
  zoom: number,
  width: number,
  height: number,
): { offsetX: number; offsetY: number } {
  if (!(zoom > 0) || !(width > 0) || !(height > 0)) return { offsetX: 0, offsetY: 0 }
  return { offsetX: width / 2 - centre.x * zoom, offsetY: height / 2 - centre.y * zoom }
}

/** `planCenterOffsets` 的逆运算：画布中心当前对着哪个平面坐标。 */
export function planCentreAtViewCenter(
  offsetX: number,
  offsetY: number,
  zoom: number,
  width: number,
  height: number,
): PlanCentre {
  if (!(zoom > 0) || !(width > 0) || !(height > 0)) return { x: 0, y: 0 }
  return { x: (width / 2 - offsetX) / zoom, y: (height / 2 - offsetY) / zoom }
}

/** 画布尺寸变化倍率上限：超过它就别硬套旧偏移了，直接「适应画布」。 */
export const PLAN_CENTRE_SIZE_LIMIT = 3

/**
 * 尺寸剧变时放弃保持：从极小的副视图放大到主视图（或反之）时，同一 zoom 下
 * 旧中心可能落在视口之外很远，硬套偏移会让户型整块跑出画布。
 */
export function shouldRestorePlanCenter(
  before: PlanViewportSize,
  after: PlanViewportSize,
  limit = PLAN_CENTRE_SIZE_LIMIT,
): boolean {
  if (!(before.width > 0) || !(before.height > 0) || !(after.width > 0) || !(after.height > 0)) return false
  const ratio = Math.max(
    after.width / before.width,
    after.height / before.height,
    before.width / after.width,
    before.height / after.height,
  )
  return Number.isFinite(ratio) && ratio <= limit
}
