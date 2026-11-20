/**
 * 平面画布上的「悬空件」样式（0.8.7 `rc()` 的那一条判定）。
 *
 * 为什么单独成模块：`studio-plan-item-drawing.ts` 已经有 1650+ 行，函体量门禁按文件计，
 * 把这十几行塞进去必然触发 `check:file-size` 的增长告警；而它本身不依赖画布细节，
 * 只需要「一个 2D 上下文」+「按 id 取真实高度包围盒」，抽出来反而更好断言。
 *
 * 语义：**未选中** 且 **精确包围盒的最小高度 > 8cm** 的物件整体压到 42% 透明度并转虚线。
 * 挂画 / 壁灯 / 挂墙电视不虚化会被读成落地实心块 —— 这是户型图与上游观感差异的主要来源。
 */

export interface PlanSuspendBounds {
  min: number
  max: number
  /** 是否真的取到了模型几何（拿不到时不能凭空虚化）。 */
  exact: boolean
}

export interface PlanSuspendStyleDeps {
  /** 平面画布 2D 上下文（只用到这两个属性）。 */
  planCanvasRenderer: {
    globalAlpha: number
    setLineDash: (segments: number[]) => void
  }
  /** 物件真实高度包围盒；不提供时一律按「不悬空」处理。 */
  heightBoundsOf?: (itemId: string) => PlanSuspendBounds | null
}

/** 悬空判定阈值（米）：0.8.7 `rc()` 的 `min > 0.08`。 */
export const SUSPENDED_MIN_ELEVATION = 0.08
/** 悬空件的整体透明度（0.8.7 `globalAlpha *= 0.42`）。 */
export const SUSPENDED_ALPHA = 0.42
/** 悬空件的边框节奏（0.8.7 `setLineDash([5,3])`）。 */
export const SUSPENDED_DASH = [5, 3]

export function applySuspendedItemStyle(
  deps: PlanSuspendStyleDeps,
  planItem: { id?: unknown },
  isSelected: boolean,
): void {
  // 选中件必须画实：虚化会让「拖哪一条边」看不准。
  if (isSelected) return
  const bounds = deps.heightBoundsOf?.(String(planItem.id ?? ''))
  if (!bounds?.exact || !(bounds.min > SUSPENDED_MIN_ELEVATION)) return
  deps.planCanvasRenderer.globalAlpha *= SUSPENDED_ALPHA
  deps.planCanvasRenderer.setLineDash(SUSPENDED_DASH)
}
