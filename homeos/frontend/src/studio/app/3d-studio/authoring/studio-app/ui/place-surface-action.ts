/**
 * 属性面板里的「贴合台面」动作（0.8.7 `#item-place-surface`）。
 *
 * 单独成模块而不是写在 `boot.ts` 里：`boot.ts` 有 4200 行的拆分预算，
 * 而这段逻辑需要一圈引擎依赖 —— 塞回去会把预算顶破，摊平又会变成一串裸调用。
 *
 * 与 0.8.7 逐条对齐的三处口径（早期实现三处都偏了）：
 * 1. **显式吸附**：上游 `h0(item, state, { explicit: true })` 会跳过「吸附」总开关与
 *    `snapSurfaces` 设置。用户关掉吸附是不想要「拖到哪都自动吸」，不是禁止主动贴台面；
 *    之前复用拖动路径导致「关了吸附 → 点按钮毫无反应」。
 * 2. **位置没变就什么都不做**：上游先比 `elevation`，相等直接 `return`。之前无条件
 *    `applyPlacementChange + markDocumentDirty`，于是「已经在台面上」也会把文档标脏。
 * 3. **只有找不到台面才提示**：之前用「几何校验失败」当代理信号，而无台面时几何根本没变、
 *    校验必然通过，于是提示永远不弹、用户只看到一颗没反应的按钮。
 */
import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { isPlacedItemHidden, isPlacedItemLocked } from '../../items/placed-item-state'

/** 引擎依赖签名：这些绑定在 boot 里都是 `(...args) => impl(runtime, ...args)` 形态。 */
type EngineCall = (...args: unknown[]) => unknown

export type PlaceSurfaceDeps = {
  appCtx: StudioAppRuntime['appCtx']
  getSelectedObject: EngineCall
  captureUndoSnapshot: EngineCall
  validateSelectionChange: EngineCall
  applyPlacementChange: EngineCall
  refreshScopeItems: EngineCall
  resolvePreviewScope: EngineCall
  markDocumentDirty: EngineCall
  refreshStudioView: EngineCall
  /** 台面吸附解析（`finalizeAddedItem`）；第三个参数为 `true` 时强制解析，返回 `null` 表示没有台面。 */
  finalizeAddedItem: EngineCall
  showToast: EngineCall
  /** 模型装载状态：有 pending 时先别改几何（改了也看不到，用户会以为没生效）。 */
  modelLoadState: () => { pending?: number; queued?: number; active?: number }
}

/** 离地高度的比较容差（米）：吸附会带来 1e-9 级的浮点抖动，不该被当成「位置变了」。 */
const ELEVATION_EPSILON = 1e-4

const NO_SURFACE_MESSAGE = '当前位置没有可用台面；请先将物件移动到支撑物上方。'

/** 模型装载中：台面识别要量模型，缺模型只会得出「没有台面」的错误结论。 */
function isModelLoading(deps: PlaceSurfaceDeps): boolean {
  const loadState = deps.modelLoadState?.()
  return Boolean(loadState && ((loadState.pending ?? 0) > 0 || (loadState.queued ?? 0) > 0))
}

/** 可贴台面（0.8.7 `Rt()`）：隐藏的物件没有可点的支撑面，锁定的物件拒绝改几何。 */
function isPlaceable(deps: PlaceSurfaceDeps, itemId: string): boolean {
  return !isPlacedItemHidden(deps.appCtx, itemId) && !isPlacedItemLocked(deps.appCtx, itemId)
}

/** 解析结果里的离地高度；没有台面 / 值不可用时为 `null`。 */
function surfaceElevationOf(resolved: { elevation?: number } | null): number | null {
  const elevation = Number(resolved?.elevation)
  return resolved && Number.isFinite(elevation) ? elevation : null
}

/**
 * 把选中物件的离地高度落到当前支撑面上。
 *
 * 复用「拖放新物件」的台面吸附，因此支撑面识别与拖动松手完全一致；差别只在
 * `explicit`（见文件头）与「没变就不动」。
 */
export function placeSelectedItemOnSurface(deps: PlaceSurfaceDeps): void {
  const item = deps.getSelectedObject() as { id?: string; elevation?: number } | null | undefined
  if (!item?.id || deps.appCtx.selectedItem?.kind !== 'item') return
  if (!isPlaceable(deps, item.id)) return
  if (isModelLoading(deps)) {
    deps.showToast('模型正在准备，请稍后再操作', 'warning')
    return
  }
  const previousElevation = Number(item.elevation) || 0
  // 快照必须在吸附解析**之前**取：解析本身会写 `item.elevation`，之后再拍就撤不回去了。
  const snapshot = deps.captureUndoSnapshot()
  const nextElevation = surfaceElevationOf(
    deps.finalizeAddedItem(item, [item.id], true) as {
      elevation?: number
    } | null,
  )
  if (nextElevation === null) {
    // 解析失败时把可能被写过的离地高度还原，宁可不动也不要留下半截状态。
    item.elevation = previousElevation
    deps.showToast(NO_SURFACE_MESSAGE)
    return
  }
  if (Math.abs(nextElevation - previousElevation) < ELEVATION_EPSILON) {
    // 已经在台面上：不记历史、不标脏、不提示（0.8.7 同）。
    item.elevation = previousElevation
    return
  }
  item.elevation = nextElevation
  if (!deps.validateSelectionChange(snapshot)) {
    item.elevation = previousElevation
    deps.refreshScopeItems(deps.resolvePreviewScope(item))
    deps.refreshStudioView()
    return
  }
  deps.applyPlacementChange(snapshot)
  deps.refreshScopeItems(deps.resolvePreviewScope(item))
  deps.markDocumentDirty()
  deps.refreshStudioView()
}
