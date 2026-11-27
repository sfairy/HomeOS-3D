/**
 * 「显不显示 / 能不能编辑 / 进不进 gizmo」的统一判定（0.8.7 `En` / `Or` / `Di` / `lw`）。
 *
 * 0.8.7 把这四条写成一串内联布尔，散落在叠层、灯带 gizmo、标尺、吸附、拾取里：
 * 每加一条排除条件就要全部跟改，漏一处就出现「2D 没了 3D 还有」「灯位圆点画了却点不中」
 * 这类只在现场才发现的偏差。这里收成四个具名函数，调用点只表达「我在问什么」。
 *
 * 语义（与上游一一对应）：
 * - `isItemShown`（`En`）：本次编辑内没被「已放置」隐藏。
 * - `isItemInLibraryScope`（`Or`）：属于当前素材分类；「已放置」页签下全部算在内。
 * - `isItemEditable`（`Di`）：在分类内 + 可见 + 未锁定。
 * - `isGizmoEligibleItem`（`lw`）：排除没有平面旋转语义 / 没有夹点的类型。
 *
 * 为什么不塞进 `placed-item-state`：那份注册表被引擎最底层读取（绘制 / 拾取 / 拖拽拦截），
 * 只该依赖 `StudioAppContext`；分类目录、庭院判定属于更上层的知识，混进去会把整棵目录树
 * 拖进每个命中测试。
 */
import type { StudioAppContext } from '../app-context'
import { isPlacedItemHidden, isPlacedItemLocked } from './placed-item-state'
import { lampItemTypeSet } from './item-catalog'
import { libraryModeOf } from '../ui/asset-library'
import { isCourtyardDrawing, isCourtyardGate } from '../plan/courtyard-drawing'
import { isCourtyardPlanItem } from '../plan/courtyard'

type ItemLike = Record<string, unknown> | null | undefined

/** 0.8.7 `En`：没有被「已放置」隐藏。 */
export function isItemShown(appCtx: StudioAppContext, item: ItemLike): boolean {
  return !!item && !isPlacedItemHidden(appCtx, item.id)
}

/**
 * 0.8.7 `Or`：物件属于当前素材分类。
 *
 * 「已放置」页签是跨分类的清单，所以整层都算在作用域内；否则只有与当前分类同类
 * （灯光分类 ↔ 灯具、庭院分类 ↔ 庭院绘制、其余 ↔ 家居/电器）的物件才参与编辑。
 * 这解释了上游为什么在「家居」分类下点不亮一盏灯的工具条：它不在作用域里。
 */
export function isItemInLibraryScope(appCtx: StudioAppContext, item: ItemLike): boolean {
  if (!item) return false
  if (libraryModeOf(appCtx) === 'placed') return true
  const category = String(appCtx.activeLibraryCategory ?? '')
  if (category === 'courtyard') return isCourtyardPlanItem(item)
  return lampItemTypeSet.has(String(item.type ?? '')) === (category === 'light')
}

/** 0.8.7 `Di`：在分类内 + 可见 + 未锁定（锁定件仍可选中，但不能拖）。 */
export function isItemEditable(appCtx: StudioAppContext, item: ItemLike): boolean {
  return (
    !!item && isItemInLibraryScope(appCtx, item) && isItemShown(appCtx, item) && !isPlacedItemLocked(appCtx, item.id)
  )
}

/**
 * 0.8.7 `lw`：排除「画不出三轴圆环」的类型。
 *
 * 庭院绘制 / 庭院门没有平面旋转语义，楼板洞口与平面文字不是实体，出风口横置在墙上
 * （旋转轴在侧边），四类都不进 gizmo —— 上游对它们连圆环都不画。
 */
export function isGizmoEligibleItem(item: ItemLike): boolean {
  if (!item) return false
  if (isCourtyardDrawing(item) || isCourtyardGate(item)) return false
  return !['flooropening', 'planlabel', 'exhaust-fan'].includes(String(item.type ?? ''))
}
