/**
 * 窗扇删除的**可撤销快照**与合并（0.8.7 `studio-window-layout` 的删扇三件套）。
 *
 * 为什么从 `layout.ts` 拆出来：版式引擎（分格树 / 约束 / 校验）已经接近单文件上限，
 * 而「删扇快照 + 三方合并」是一块**独立语义**（配合文档层撤销，不在窗型编辑器里用）。
 *
 * 三方合并（current / before / after）的规则见 `restoreWindowDeletion`：只把消失的窗扇
 * 加回来，保留之后对其它窗扇的修改；结构对不上就抛错，绝不猜。
 */

import type { WindowDesign, WindowKind, WindowLeaf, WindowRecord } from './layout'
import { entries, isCustomWindow, validateWindowRecord } from './layout'

const clone = <T>(value: T): T => structuredClone(value)

/** 墙段的几何形状（`remapWindowOrientation` 只用到端点）。 */
export interface WindowWallSegment {
  start: { x: number; y: number }
  end: { x: number; y: number }
}

/** 改动一条墙的端点后，把窗型朝向（`wallDirection`）一并修正。
 *
 * 合并同一直线墙时 `mergeCollinearWallSegments` 可能把墙的 start/end 对调：
 * 此时窗口沿墙的参数 `t` 仍落在同一位置，但「内开 / 外开」会翻到另一侧。
 * 上游口径：只有 `version === 1` 的自定义窗型带朝向；走向点积 < 0 才取反。
 */
export function remapWindowOrientation<T extends WindowRecord>(
  window: T,
  sourceWall: WindowWallSegment,
  targetWall: WindowWallSegment,
): T {
  if (window.windowDesign?.version !== 1) return window
  const dot =
    (sourceWall.end.x - sourceWall.start.x) * (targetWall.end.x - targetWall.start.x) +
    (sourceWall.end.y - sourceWall.start.y) * (targetWall.end.y - targetWall.start.y)
  if (dot >= 0) return window
  return {
    ...window,
    windowDesign: {
      ...clone(window.windowDesign),
      wallDirection: -(window.windowDesign.wallDirection ?? 1),
    },
  }
}

/** 一片「可单独删除的窗扇」（推拉组的每一扇也算一片）。 */
export interface WindowSashTarget {
  id: string
  groupId: string
  kind: WindowKind
}

/** 当前窗型里**可删除**的窗扇：固定扇不参与（删掉它等于删整窗，走整窗删除）。 */
export function windowSashTargets(window: WindowRecord | null | undefined): WindowSashTarget[] {
  if (!isCustomWindow(window)) return []
  // 脏数据兜底：`mode === 'custom'` 但 `layout` 缺失（老草稿 / 手改文件）时按「没有窗扇」处理。
  // 遍历会一路 `flatten(node.children)`，缺 layout 会直接抛 TypeError —— 撤销不该因此炸掉。
  if (!window?.windowDesign?.layout) return []
  return entries(window)
    .filter((entry) => !entry.node.children && (entry.node as WindowLeaf).kind !== 'fixed')
    .flatMap((entry) => {
      const node = entry.node as WindowLeaf
      // 推拉组：组本身 + 每个面板都是可删目标（删单扇 = 减一扇，删整组 = 全拆）。
      if (node.kind === 'sliding') {
        return [node.id, ...node.panelIds].map((panelId) => ({ id: panelId, groupId: node.id, kind: node.kind }))
      }
      return [{ id: node.id, groupId: node.id, kind: node.kind }]
    })
}

/** 一次「删除窗扇」的可撤销快照。 */
export interface WindowDeletionChange {
  id: string
  before: WindowDeletionSnapshot
  after: WindowDeletionSnapshot
  /** 被删窗扇上的备注：撤销时按 id 只恢复这些，不动其它窗扇的备注。 */
  remarks: Record<string, string>
}

/** 快照只存「结构 + 尺寸 + 位置」，不含备注（备注单独存，避免整份覆盖别人的修改）。 */
interface WindowDeletionSnapshot {
  id: string
  width: number
  height: number
  t?: number
  windowDesign?: Omit<WindowDesign, 'sashRemarks'>
}

const withoutRemarks = (window: WindowRecord): WindowDeletionSnapshot => ({
  id: window.id,
  width: window.width,
  height: window.height,
  t: window.t,
  windowDesign: window.windowDesign
    ? (Object.fromEntries(Object.entries(window.windowDesign).filter(([key]) => key !== 'sashRemarks')) as Omit<
        WindowDesign,
        'sashRemarks'
      >)
    : undefined,
})

/** 对比删除前后：没有窗扇消失就返回 `null`（普通改尺寸 / 换窗型不进这条路径）。 */
export function windowDeletionChange(
  before: WindowRecord | null | undefined,
  after: WindowRecord | null | undefined,
): WindowDeletionChange | null {
  if (!before || !after) return null
  const afterIds = new Set(windowSashTargets(after).map((target) => target.id))
  if (!windowSashTargets(before).some((target) => !afterIds.has(target.id))) return null
  const remarks = Object.fromEntries(
    windowSashTargets(before)
      .filter((target) => !afterIds.has(target.id))
      .filter((target) => Object.hasOwn(before.windowDesign?.sashRemarks || {}, target.id))
      .map((target) => [target.id, before.windowDesign!.sashRemarks![target.id]]),
  )
  return {
    id: before.id,
    before: clone(withoutRemarks(before)),
    after: clone(withoutRemarks(after)),
    remarks,
  }
}

/** 三方合并的失败原因：结构与「删除前 / 删除后」都对不上，说明之后又改过窗型。 */
const WINDOW_DELETION_CONFLICT = '相关窗扇结构已再次修改，请先撤销这些改动，再撤销删除。'

const sameWindowValue = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)

const idOfValue = (value: unknown) => (value && typeof value === 'object' ? (value as { id?: unknown }).id : undefined)

/** 非 null 的对象（数组也算：数组也要逐项比较身份）。 */
const isObjectLike = (value: unknown): boolean => !!value && typeof value === 'object'

/** 三方是不是「同一种容器」：同为数组或同为对象。 */
const hasSameContainerKind = (now: unknown, before: unknown, after: unknown): boolean =>
  Array.isArray(now) === Array.isArray(before) && Array.isArray(before) === Array.isArray(after)

/** 数组还要求长度一致：长度不同就没有逐项对应的语义。 */
function hasComparableLength(now: unknown, before: unknown, after: unknown): boolean {
  if (!Array.isArray(before)) return true
  const beforeLength = (before as unknown[]).length
  return (after as unknown[]).length === beforeLength && (now as unknown[]).length === beforeLength
}

/**
 * 能不能继续向下逐键合并。
 *
 * 条件是「三者都是对象 + 同类容器 + 同一身份 + 数组长度一致」：形状不同的两个值没有共同的
 * 键可谈，继续合并只会把一边的字段静默删掉 —— 那是猜，不是合并。
 */
function isMergeableValue(now: unknown, before: unknown, after: unknown): boolean {
  if (!isObjectLike(now) || !isObjectLike(before) || !isObjectLike(after)) return false
  if (!hasSameContainerKind(now, before, after)) return false
  if (!hasComparableLength(now, before, after)) return false
  return idOfValue(before) === idOfValue(after) && idOfValue(now) === idOfValue(after)
}

/**
 * 三方合并（current / before / after）：
 * - 当前与删除后一致 → 这个字段之后没人动过，回到删除前的值；
 * - 当前与删除前一致 → 已经是目标值，保持；
 * - 删除前后本来就相同 → 与这次删除无关，保持当前；
 * - 否则两者都动过且互不相让 → 抛错（让用户先撤销后续改动），绝不猜。
 */
function mergeWindowValue(now: unknown, before: unknown, after: unknown): unknown {
  if (sameWindowValue(before, after) || sameWindowValue(now, before)) return now
  if (sameWindowValue(now, after)) return clone(before)
  if (!isMergeableValue(now, before, after)) throw Error(WINDOW_DELETION_CONFLICT)
  const beforeRecord = before as Record<string, unknown>
  const afterRecord = after as Record<string, unknown>
  const nowRecord = now as Record<string, unknown>
  const merged = clone(nowRecord)
  for (const key of new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)])) {
    const value = mergeWindowValue(nowRecord[key], beforeRecord[key], afterRecord[key])
    if (value === undefined) delete merged[key]
    else merged[key] = value
  }
  return merged
}

/** 撤销「删除窗扇」：只把消失的窗扇加回来，**保留之后对其它窗扇的修改**。 */
export function restoreWindowDeletion(current: WindowRecord, change: WindowDeletionChange): WindowRecord {
  const restored = mergeWindowValue(current, change.before, change.after) as WindowRecord
  if (Object.keys(change.remarks || {}).length) {
    // 备注单独并：先放回被删窗扇的备注，再让当前窗扇的备注覆盖（之后改过的优先）。
    restored.windowDesign = {
      ...(restored.windowDesign as WindowDesign),
      sashRemarks: { ...change.remarks, ...(restored.windowDesign?.sashRemarks || {}) },
    }
  }
  validateWindowRecord(restored)
  return restored
}
