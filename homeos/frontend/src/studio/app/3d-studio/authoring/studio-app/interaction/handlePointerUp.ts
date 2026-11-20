import { anchorGate as anchorGate2, isCourtyardGate as isCourtyardGate2 } from '../../../plan/courtyard-drawing'

import { fanDimensions as fanDimensions2 } from '../../items/studio-fan'

import {
  normalizeCurtainTrack as normalizeCurtainTrack2,
  curtainFootprintDepth as curtainFootprintDepth2,
} from '@app/shared/scene/studio-curtain-track'

import {
  clampWindowT as clampWindowT2,
  distance as distance2,
  itemRotationFromPointers as itemRotationFromPointers2,
  planDragDelta as planDragDelta2,
  projectPointToSegment as projectPointToSegment2,
  resizeRotatedItemFromCorner as resizeRotatedItemFromCorner2,
  resizeRotatedItemFromEdge as resizeRotatedItemFromEdge2,
} from '../../../plan/geometry'

import {
  finite as finite2,
  itemMinimumHeight as itemMinimumHeight2,
  itemMinimumFootprint as itemMinimumFootprint2,
} from '../../../loaders/studio-normalization'
import {
  itemFromPlanFootprintResize as itemFromPlanFootprintResize2,
  itemWithPlanFootprint as itemWithPlanFootprint2,
} from '../../items/studio-item-posture'
import { itemTypeCatalog } from '../../items/item-catalog'

import type { StudioAppContext } from '../studio-app-context'
import { applyPlacementSnap, applyPointSnap, quantizePlanDelta } from './placement-snap-apply'
import type { PlacementGuide } from '../../../plan/studio-placement-snap'

/** 指针事件的只读子集（这里只关心修饰键）。 */
type PointerLike = { shiftKey: boolean; altKey: boolean; pointerId?: number }

/** 缩放 / 旋转会改的尺寸字段（缺字段的物件按 0 处理）。 */
type ResizeItemLike = {
  id?: string
  type: string
  x: number
  y: number
  width: number
  depth: number
  height: number
  rotation?: number
}

export interface HandlePointerUpDeps {
  appCtx: StudioAppContext
  drawMarqueeOverlay: any
  eventToLocalPoint: any
  getPixelsPerMeter: any
  getSelectedObject: any
  isSnapEnabled: any
  refreshStudioView: any
  renderPlanScene: any
  screenToPlan: any
  screenToPlanPoint: any
  toggleSnapSetting: any
}

/** 缩放时的尺寸 + 模式提示（0.8.7：单边尺寸 / 整体等比 / 高度保持）。 */
function resizeModeLabel(edge: unknown, shiftKey: boolean, itemType: string | undefined): string {
  return edge ? '单边尺寸' : shiftKey || itemType === 'fan' ? '整体等比' : '高度保持'
}

/** 缩放反馈整句（画布标签用，不再写 `#snap-indicator`）。 */
function buildResizeLabel(
  item: { width?: number; depth?: number; height?: number; type?: string },
  edge: unknown,
  shiftKey: boolean,
  guides: PlacementGuide[],
  appCtx: StudioAppContext,
): string {
  const base = `宽 ${Number(item.width || 0).toFixed(2)} × 深 ${Number(item.depth || 0).toFixed(2)} × 高 ${Number(item.height || 0).toFixed(2)} m · ${resizeModeLabel(edge, shiftKey, item.type)}`
  return guides.length
    ? `${base} · ${guides.map((guide) => `${guide.label} · ${guideTargetName(appCtx, guide)}`.trim()).join(' / ')}`
    : base
}

/**
 * 拖动反馈文案的「目标名」：墙面 → 墙面；物件 → 目录名（无则退类型）。
 *
 * 与 0.8.7 同：`label · targetName`，多根引导线用 ` / ` 连接。
 */
function guideTargetName(appCtx: StudioAppContext, guide: PlacementGuide): string {
  if (!guide.targetId) return ''
  const wall = (appCtx.studioState.walls as Array<{ id?: string }>).find((candidate) => candidate.id === guide.targetId)
  if (wall) return '墙面'
  const item = (appCtx.studioState.items as Array<Record<string, unknown>>).find(
    (candidate) => String(candidate.id) === guide.targetId,
  )
  if (!item) return ''
  const catalogEntry = (itemTypeCatalog as Record<string, { name?: string }>)[String(item.type)]
  return String(catalogEntry?.name || item.type || '')
}

/** 拖动反馈整句：`移动 1.23 m` + 命中引导线。 */
function buildDragLabel(
  appCtx: StudioAppContext,
  delta: { x: number; y: number },
  pixelsPerMeter: number,
  guides: PlacementGuide[],
): string {
  const distanceMeters = Math.hypot(delta.x, delta.y) / (pixelsPerMeter || 1)
  return guides.length
    ? `移动 ${distanceMeters.toFixed(2)} m · ${guides
        .map((guide) => `${guide.label} · ${guideTargetName(appCtx, guide)}`.trim())
        .join(' / ')}`
    : ''
}

/**
 * 单件 / 多选拖动的落位收尾：庭院门洞吸附，以及材质吸附加引导线。
 *
 * 收在模块级是为了不推高 `handlePointerUp` 的分支数（它已在棘轮阈值附近）。
 * 吸附在**每帧**都会走到这里（`handlePointerMove` 按帧复用 `handlePointerUp`），
 * 所以这里同时负责：吸附位移、网格量化、画布反馈文案。
 */
function snapDraggedItem(
  deps: HandlePointerUpDeps,
  appCtx: StudioAppContext,
  itemsByItemId: Map<string, { id: string; x: number; y: number }>,
  pointerEvent: { altKey: boolean },
  rawDelta: { x: number; y: number },
): void {
  const originals = appCtx.marqueeBox?.originals ?? []
  if (!originals.length) {
    appCtx.placementGuides = []
    return
  }
  const pixelsPerMeter = deps.getPixelsPerMeter() || 100
  const draggedIds = originals.map((original: { id: string }) => String(original.id))
  anchorCourtyardGateOnce(appCtx, itemsByItemId, draggedIds, pixelsPerMeter)
  const snapResult = applyPlacementSnap(appCtx, draggedIds, pixelsPerMeter, {
    zoom: appCtx.planView.zoom,
    previousKeys: appCtx.marqueeBox?.snapKeys,
  })
  if (appCtx.marqueeBox) appCtx.marqueeBox.snapKeys = snapResult.keys
  // 命中吸附：位移直接来自吸附解，不再叠加网格量化。
  // 没吸上任何东西时按 5cm（Alt 1cm）网格量化：两者互斥，避免「先被网格吸住再被墙吸走」。
  // 注意量化的是**指针位移本身**（`snapResult.delta` 在没有命中时恒为 0，
  // 拿它去量化等于没量化 —— 这是首版实现漏掉的一步）。
  const offset = snapResult.guides.length
    ? snapResult.delta
    : residualToGrid(appCtx, rawDelta, pixelsPerMeter, pointerEvent.altKey)
  shiftItems(itemsByItemId, originals as Array<{ id: string }>, offset)
  appCtx.placementGuides = snapResult.guides
}

/** 庭院门的门洞吸附：只在单件拖动时做（多件一起拖不可能是「把门放进洞口」）。 */
function anchorCourtyardGateOnce(
  appCtx: StudioAppContext,
  itemsByItemId: Map<string, { id: string; x: number; y: number }>,
  draggedIds: string[],
  pixelsPerMeter: number,
): void {
  if (draggedIds.length !== 1) return
  const item = itemsByItemId.get(draggedIds[0])
  if (!item || !isCourtyardGate2(item)) return
  anchorGate2(item, appCtx.studioState.items, pixelsPerMeter, 24 / appCtx.planView.zoom)
}

/**
 * 把「已应用的指针位移」再微调到一个网格点所需的**增量**。
 *
 * 调用方已经按 `rawDelta` 落过位；这里返回 `grid(rawDelta) - rawDelta`，
 * 再叠一次就到了网格上（而不是把物件再挪一整格）。
 */
function residualToGrid(
  appCtx: StudioAppContext,
  rawDelta: { x: number; y: number },
  pixelsPerMeter: number,
  altKey: boolean,
): { x: number; y: number } {
  const target = quantizePlanDelta(appCtx, rawDelta, pixelsPerMeter, altKey)
  return { x: target.x - rawDelta.x, y: target.y - rawDelta.y }
}

/** 给一组物件叠加同一个像素位移。 */
function shiftItems(
  itemsByItemId: Map<string, { id: string; x: number; y: number }>,
  originals: Array<{ id: string }>,
  offset: { x: number; y: number },
): void {
  for (const original of originals) {
    const item = itemsByItemId.get(String(original.id))
    if (!item) continue
    item.x += offset.x
    item.y += offset.y
  }
}

/** 把「起始快照 + 位移」落到状态里（多选整体平移，保持相对位置）。 */
function applyMoveOffsets(
  itemsByItemId: Map<string, { id: string; x: number; y: number }>,
  originals: Array<{ id: string; x: number; y: number }>,
  offset: { x: number; y: number },
): void {
  for (const original of originals) {
    const item = itemsByItemId.get(original.id)
    if (!item) continue
    item.x = original.x + offset.x
    item.y = original.y + offset.y
  }
}

/** 位移是否真的改动了至少一件（死区判定与「是否记为一次编辑」都看它）。 */
function anyItemMoved(
  itemsByItemId: Map<string, { id: string; x: number; y: number }>,
  originals: Array<{ id: string; x: number; y: number }>,
): boolean {
  return originals.some((original) => {
    const item = itemsByItemId.get(original.id)
    if (!item) return false
    return Math.abs(item.x - original.x) > 0.000001 || Math.abs(item.y - original.y) > 0.000001
  })
}

/** 移动手势的画布反馈：锚点取第一件中心，文案带吸附目标名。 */
function writeMoveFeedback(
  deps: HandlePointerUpDeps,
  appCtx: StudioAppContext,
  itemsByItemId: Map<string, { id: string; x: number; y: number }>,
): void {
  const firstOriginal = appCtx.marqueeBox.originals[0]
  const firstCurrent = firstOriginal ? itemsByItemId.get(firstOriginal.id) : undefined
  if (!firstOriginal || !firstCurrent) {
    appCtx.dragFeedback = null
    return
  }
  const movedOffset = { x: firstCurrent.x - firstOriginal.x, y: firstCurrent.y - firstOriginal.y }
  appCtx.dragFeedback = {
    point: { x: Number(firstCurrent.x), y: Number(firstCurrent.y) },
    label: buildDragLabel(appCtx, movedOffset, deps.getPixelsPerMeter() || 100, appCtx.placementGuides),
    guides: appCtx.placementGuides,
  }
}

/** 移动手势：位移 → 吸附 / 量化 → 反馈。 */
function applyMoveItemsGesture(
  deps: HandlePointerUpDeps,
  appCtx: StudioAppContext,
  pr4: { x: number; y: number },
  pointerUpEvent: PointerLike,
): void {
  if (!appCtx.marqueeBox.moved && distance2(pr4, appCtx.marqueeBox.start) * appCtx.planView.zoom < 3) return
  // Shift 锁轴；网格量化与吸附在 `snapDraggedItem` 里做（两者互斥，命中吸附时不再量化）。
  const dragDelta = planDragDelta2(appCtx.marqueeBox.start, pr4, pointerUpEvent.shiftKey)
  const itemsByItemId: Map<string, { id: string; x: number; y: number }> = new Map(
    appCtx.studioState.items.map((entry) => [entry.id, entry]),
  )
  applyMoveOffsets(itemsByItemId, appCtx.marqueeBox.originals, dragDelta)
  snapDraggedItem(deps, appCtx, itemsByItemId, pointerUpEvent, dragDelta)
  writeMoveFeedback(deps, appCtx, itemsByItemId)
  appCtx.marqueeBox.moved = anyItemMoved(itemsByItemId, appCtx.marqueeBox.originals)
  deps.refreshStudioView()
}

/** 缩放死区：`handle` 是 ±1 向量，拿它当点算距离永远超过阈值，所以用 `startPointer`。 */
function resizeDeadzone(pr4: { x: number; y: number }, appCtx: StudioAppContext): boolean {
  if (appCtx.marqueeBox.moved) return false
  const origin = appCtx.marqueeBox.startPointer || appCtx.marqueeBox.handle
  return distance2(pr4, origin) * appCtx.planView.zoom < 3
}

/** 缩放范围：扇形按比例、Shift 等比、其余只改被拖的维度。 */
function resizeLimitsOf(
  appCtx: StudioAppContext,
  source: { width: number; depth: number },
  minimumFootprint: number,
  heightMeters: number,
  shiftKey: boolean,
  itemType: string,
): { minimum: number; maximum: number } | undefined {
  if (itemType === 'fan') {
    const fanScale = fanDimensions2(appCtx.marqueeBox.originalItem).fanScale
    return { minimum: 0.6 / fanScale, maximum: 1.6 / fanScale }
  }
  if (!shiftKey) return undefined
  return {
    minimum: Math.max(
      minimumFootprint / Math.max(source.width, minimumFootprint),
      minimumFootprint / Math.max(source.depth, minimumFootprint),
      itemMinimumHeight2(appCtx.marqueeBox.originalItem.type) / heightMeters,
    ),
    maximum: Math.min(
      8 / Math.max(source.width, minimumFootprint),
      8 / Math.max(source.depth, minimumFootprint),
      6 / heightMeters,
    ),
  }
}

/** 窗帘非直轨时按深度比例缩放左右长度（否则弯轨会与机身错位）。 */
function applyCurtainTrackRatio(item: ResizeItemLike, original: ResizeItemLike): void {
  if (item.type !== 'curtain' || normalizeCurtainTrack2(item).curtainTrack === 'straight') return
  const config = normalizeCurtainTrack2(original)
  const ratio = Math.max(0.2, item.depth - 0.18) / Math.max(0.2, original.depth - 0.18)
  Object.assign(
    item,
    normalizeCurtainTrack2({
      ...item,
      curtainLeftLength: config.curtainLeftLength * ratio,
      curtainRightLength: config.curtainRightLength * ratio,
    }),
  )
  item.depth = curtainFootprintDepth2(item)
}

/** 写回缩放结果：尺寸、风扇比例、窗帘轨道，返回尺寸是否变化。 */
function applyResizeResult(
  appCtx: StudioAppContext,
  item: ResizeItemLike,
  result: { width: number; depth: number },
  pixelsPerMeter: number,
): boolean {
  const original = appCtx.marqueeBox.originalItem
  Object.assign(item, itemFromPlanFootprintResize2(original, result, pixelsPerMeter))
  if (item.type === 'fan') {
    Object.assign(item, fanDimensions2({ ...original, fanScale: result.width / 0.434 }))
  }
  if (item.type === 'curtain' && normalizeCurtainTrack2(item).curtainTrack !== 'straight') {
    applyCurtainTrackRatio(item, original)
  }
  return (
    Math.abs(item.x - original.x) > 0.000001 ||
    Math.abs(item.y - original.y) > 0.000001 ||
    Math.abs(item.width - original.width) > 0.000001 ||
    Math.abs(item.depth - original.depth) > 0.000001 ||
    Math.abs(item.height - original.height) > 0.000001
  )
}

/** 缩放手势：被拖的边参与吸附 → 计算尺寸 → 写回 → 反馈。 */
function applyResizeGesture(
  deps: HandlePointerUpDeps,
  appCtx: StudioAppContext,
  pr4: { x: number; y: number },
  pointerUpEvent: PointerLike,
): void {
  if (resizeDeadzone(pr4, appCtx)) return
  const item = deps.getSelectedObject()
  if (!item) return
  const pixelsPerMeter = deps.getPixelsPerMeter() || 100
  // 被拖的边本身参与吸附：贴墙 / 对齐邻居边缘时，尺寸跟着落在精确值上（0.8.7 同）。
  const snap = appCtx.marqueeBox.edge
    ? applyPointSnap(appCtx, [String(item.id ?? '')], pixelsPerMeter, pr4, {
        zoom: appCtx.planView.zoom,
        previousKeys: appCtx.marqueeBox.snapKeys,
      })
    : null
  if (snap) appCtx.marqueeBox.snapKeys = snap.keys
  const point = snap?.point ?? pr4
  const result = computeResize(appCtx, item, point, pixelsPerMeter, pointerUpEvent)
  // 先写回尺寸再拼文案：反过来的话标签显示的是**上一帧**的宽深高（差一格）。
  const changed = applyResizeResult(appCtx, item, result, pixelsPerMeter)
  appCtx.placementGuides = snap?.guides ?? []
  appCtx.dragFeedback = {
    point: { x: Number(item.x), y: Number(item.y) },
    label: buildResizeLabel(item, appCtx.marqueeBox.edge, pointerUpEvent.shiftKey, appCtx.placementGuides, appCtx),
    guides: appCtx.placementGuides,
  }
  appCtx.marqueeBox.moved = changed || appCtx.marqueeBox.moved
  deps.refreshStudioView()
}

/** 按手柄类型算新尺寸：边手柄改单维，角手柄改整体（Shift / 风扇等比）。 */
function computeResize(
  appCtx: StudioAppContext,
  item: ResizeItemLike,
  point: { x: number; y: number },
  pixelsPerMeter: number,
  event: PointerLike,
): { width: number; depth: number } {
  const heightMeters = Math.max(finite2(appCtx.marqueeBox.originalItem.height, 0.05), 0.001)
  const source = itemWithPlanFootprint2(appCtx.marqueeBox.originalItem, pixelsPerMeter)
  const minimumFootprint = itemMinimumFootprint2(appCtx.marqueeBox.originalItem.type)
  const limits = resizeLimitsOf(appCtx, source, minimumFootprint, heightMeters, event.shiftKey, item.type)
  const options = { ...limits, minimumDimension: minimumFootprint }
  if (appCtx.marqueeBox.edge) {
    return resizeRotatedItemFromEdge2(
      source,
      appCtx.marqueeBox.handle,
      appCtx.marqueeBox.anchor,
      point,
      pixelsPerMeter,
      options,
    )
  }
  return resizeRotatedItemFromCorner2(
    source,
    appCtx.marqueeBox.handle,
    appCtx.marqueeBox.anchor,
    point,
    pixelsPerMeter,
    event.shiftKey || item.type === 'fan',
    options,
  )
}

/** 旋转量化步长：Shift 15°、Alt 0.1°、默认 1°；`snapAngles === false` 时不量化。 */
function rotateStepFor(appCtx: StudioAppContext, event: PointerLike): number {
  if (event.shiftKey) return 15
  const settings = (appCtx.studioState.settings ?? {}) as Record<string, unknown>
  if (settings.snapAngles === false) return 0
  return event.altKey ? 0.1 : 1
}

/** 旋转手势：算角度 → 画布反馈。 */
function applyRotateGesture(
  deps: HandlePointerUpDeps,
  appCtx: StudioAppContext,
  pr4: { x: number; y: number },
  pointerUpEvent: PointerLike,
): void {
  if (!appCtx.marqueeBox.moved && distance2(pr4, appCtx.marqueeBox.startPointer) * appCtx.planView.zoom < 3) return
  const item = deps.getSelectedObject()
  if (!item) return
  item.rotation = itemRotationFromPointers2(
    appCtx.marqueeBox.originalItem.rotation,
    appCtx.marqueeBox.center,
    appCtx.marqueeBox.startPointer,
    pr4,
    rotateStepFor(appCtx, pointerUpEvent),
  )
  appCtx.placementGuides = []
  appCtx.dragFeedback = {
    point: { x: Number(appCtx.marqueeBox.center?.x ?? item.x), y: Number(appCtx.marqueeBox.center?.y ?? item.y) },
    label: `旋转 ${Number(item.rotation || 0).toFixed(1)}°`,
    guides: [],
  }
  appCtx.marqueeBox.moved = Math.abs(item.rotation - appCtx.marqueeBox.originalItem.rotation) > 0.000001
  deps.refreshStudioView()
}

/** 门窗移动：把 `t` 投影到所属墙段并夹在合法区间内。 */
function applyMoveOpeningGesture(
  deps: HandlePointerUpDeps,
  appCtx: StudioAppContext,
  pr4: { x: number; y: number },
): void {
  if (!appCtx.marqueeBox.moved && distance2(pr4, appCtx.marqueeBox.start) * appCtx.planView.zoom < 3) return
  const item = deps.getSelectedObject()
  const wall = appCtx.studioState.walls.find((candidate) => candidate.id === item?.wallId)
  if (!item || !wall) return
  item.t = clampWindowT2(
    wall,
    { ...item, t: projectPointToSegment2(pr4, wall.start, wall.end).t },
    deps.getPixelsPerMeter(),
  )
  const before = appCtx.marqueeBox.before?.[String(appCtx.selectedItem?.kind) + 's']?.find?.(
    (entry: { id?: string; t?: number }) => entry.id === item.id,
  )
  appCtx.marqueeBox.moved = !before || Math.abs(item.t - before.t) > 0.000001
  deps.refreshStudioView()
}

export function handlePointerUp(deps: HandlePointerUpDeps, pointerUpEvent: PointerLike) {
  const { appCtx, eventToLocalPoint, screenToPlan, toggleSnapSetting } = deps
  const local = eventToLocalPoint(pointerUpEvent)
  const plan = screenToPlan(local)
  if (appCtx.marqueeBox?.pointerId === pointerUpEvent.pointerId) {
    if (handleBoxGesture(deps, appCtx, local, plan, pointerUpEvent)) return
  }
  toggleSnapSetting(pointerUpEvent)
  if (appCtx.alignmentState || ['scale', 'wall', 'window', 'door', 'railing'].includes(appCtx.activeToolName)) {
    deps.refreshStudioView()
  }
}

/** 按手势类型分派；返回是否已接管（已接管则不再走「未拖动」的收尾）。 */
function handleBoxGesture(
  deps: HandlePointerUpDeps,
  appCtx: StudioAppContext,
  local: { x: number; y: number },
  plan: { x: number; y: number },
  event: PointerLike,
): boolean {
  const box = appCtx.marqueeBox
  if (!box) return false
  const handlers: Record<string, () => void> = {
    'draw-flooropening': () => applyFloorOpeningGesture(deps, appCtx, plan, event),
    marquee: () => applyMarqueeGesture(deps, appCtx, plan),
    pan: () => applyPanGesture(deps, appCtx, local),
    'move-items': () => applyMoveItemsGesture(deps, appCtx, plan, event),
    'resize-item': () => applyResizeGesture(deps, appCtx, plan, event),
    'rotate-item': () => applyRotateGesture(deps, appCtx, plan, event),
    'move-opening': () => applyMoveOpeningGesture(deps, appCtx, plan),
  }
  const handler = handlers[String(box.type)]
  if (!handler) return false
  handler()
  return true
}

/** 楼板洞口：Shift 约束成正方形。 */
function applyFloorOpeningGesture(
  deps: HandlePointerUpDeps,
  appCtx: StudioAppContext,
  plan: { x: number; y: number },
  event: PointerLike,
): void {
  appCtx.marqueeBox.current = event.shiftKey ? squareCorner(appCtx.marqueeBox.start, plan) : plan
  deps.refreshStudioView()
}

/** 以 `start` 为一角、把 `plan` 校正成正方形后的对角点。 */
function squareCorner(start: { x: number; y: number }, plan: { x: number; y: number }): { x: number; y: number } {
  const deltaX = plan.x - start.x
  const deltaY = plan.y - start.y
  const magnitude = Math.max(Math.abs(deltaX), Math.abs(deltaY))
  return { x: start.x + Math.sign(deltaX || 1) * magnitude, y: start.y + Math.sign(deltaY || 1) * magnitude }
}

/** 框选：更新终点与「是否算一次拖动」，再决定重绘哪一层。 */
function applyMarqueeGesture(
  deps: HandlePointerUpDeps,
  appCtx: StudioAppContext,
  plan: { x: number; y: number },
): void {
  appCtx.marqueeBox.current = plan
  appCtx.marqueeBox.moved = distance2(appCtx.marqueeBox.start, plan) * appCtx.planView.zoom >= 4
  if (deps.drawMarqueeOverlay()) deps.renderPlanScene()
  else deps.refreshStudioView()
}

/** 平移：按「屏幕位移 → 平面位移」更新 offset。 */
function applyPanGesture(deps: HandlePointerUpDeps, appCtx: StudioAppContext, local: { x: number; y: number }): void {
  const planPoint = deps.screenToPlanPoint(local)
  appCtx.planView.offsetX = appCtx.marqueeBox.offsetX + planPoint.x - appCtx.marqueeBox.screen.x
  appCtx.planView.offsetY = appCtx.marqueeBox.offsetY + planPoint.y - appCtx.marqueeBox.screen.y
  const overlayDrawn = deps.drawMarqueeOverlay({
    offsetX: local.x - appCtx.marqueeBox.visibleScreen.x,
    offsetY: local.y - appCtx.marqueeBox.visibleScreen.y,
  })
  if (!overlayDrawn) deps.refreshStudioView()
}
