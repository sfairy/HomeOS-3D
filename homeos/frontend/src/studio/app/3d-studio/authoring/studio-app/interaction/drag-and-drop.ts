import { type EditorPick } from './picking'
import { type ElevationTarget, type PlanMapper, type Ray, type Vec3, groundPointFromRay, snapEditorElevation, snapEditorRotation, verticalRayParameter, worldToPlan } from './gesture'
import { type StudioAppRuntime } from '../runtime/studio-app-runtime'
import { type ListDragRowSession } from '../../types/studio-app-types'
import { resolveListDragDrop } from '../../ui/studio-list-drag-drop'
import { decorationPlacementFields, registerUserDecorationModel } from '../../../loaders/external-models/user-decoration-models'
import { type StudioAppContext } from '../studio-app-context'
import { isPlacedItemHidden, isPlacedItemLocked } from '../../items/placed-item-state'
import { itemPlanCorners, placementTolerance, type Point, type PlanRectLike } from '../../../plan/studio-placement'
import { snapPlacement, type PlacementGuide } from '../../../plan/studio-placement'

/**
 * 3D 视口编辑的拖动状态机（从 `editor-3d-overlay.ts` 抽出）。
 *
 * 抽出原因：叠层模块同时负责 DOM 手柄与指针状态机，`createEditor3DOverlay` 会变得又长又深，
 * 会很快变成一大团。这里只保留「开始 / 移动 / 结束」三个入口，
 * DOM 与事件注册仍留在叠层里。
 */

export type GestureKind = 'move' | 'elevation' | 'rotate'

/** 拖动期间需要的回调（与叠层共用同一份 `Editor3DOverlayOptions` 的子集）。 */
export interface DragControllerOptions {
  pointerRay: (clientX: number, clientY: number) => Ray | null
  /** 物件底面中心的世界坐标（离地手势的竖直轴要过它）。 */
  itemBaseWorldPoint: (id: string) => Vec3 | null
  mapper: () => PlanMapper
  itemPlanPoint: (id: string) => { x: number; y: number; elevation: number; rotation: number } | null
  moveItem: (id: string, planX: number, planY: number) => void
  moveLiveItem: (id: string, planX: number, planY: number) => void
  setItemElevation: (id: string, elevation: number) => void
  rotateItem: (id: string, degrees: number) => void
  selectedIds: () => string[]
  beginInteraction: () => void
  commit: () => boolean
  endInteraction: () => void
  /**
   * 单件拖动落位（0.8.7 `dS()`）：把「期望位置」交给吸附 + 网格量化，返回最终位置与本次
   * 命中的候选键（下一帧作为迟滞输入，避免临界点来回闪）。
   *
   * `start` 是按下时的位置：网格量化的基准必须是**累计位移**（`start + round(Δ/step)*step`），
   * 逐帧量化「当前位置」会把误差累积成一串跳变。
   */
  resolveMove: (
    id: string,
    start: { x: number; y: number },
    desired: { x: number; y: number },
    previousKeys: string[],
    event: { altKey?: boolean },
  ) => { x: number; y: number; keys: string[] }
  /** 离地高度的上下限：按类型定的最小安装高度与 6m 上限。 */
  elevationLimits: (id: string) => { minimum: number; maximum: number }
  /** 离地吸附目标（贴合本层地面 / 落台）。 */
  elevationTargets: (id: string, planX: number, planY: number, elevation: number) => ElevationTarget[]
  /** 吸附容差（米）：随缩放变化。 */
  elevationTolerance: () => number
  /** 网格量化的步长（米）；`0` 表示不量化。 */
  elevationStep: (event: { altKey?: boolean }) => number
  /** 一次性快照：拖动开始时的预览窗口尺寸，移动中用它检测「窗口被改过」。 */
  viewportRect: () => { left: number; top: number; width: number; height: number }
  /** 当前场景 / 选择是否仍然允许这次拖动；不允许时返回中文原因。 */
  validateGesture: (id: string) => string | null
  showToast: (message: string, level?: 'warning' | 'error') => void
}

/** 键盘微调步长：5cm，按住 Alt 变 1cm（0.8.7 `moveStepMeters`）。 */
export const NUDGE_STEP_METERS = 0.05
/** 旋转步长。 */
export const ROTATE_STEP_DEGREES = 15
/** 指针移动超过该像素才算拖动，否则按点击处理（避免点选时手抖挪动 1cm）。 */
const DRAG_THRESHOLD_PX = 3
/** 帧间位移小于该值时不重算（0.8.7 `dS()` 的 0.25px 免抖分支）。 */
const POINTER_EPSILON_PX = 0.25

export interface DragGesture {
  kind: GestureKind
  pointerId: number
  startClientX: number
  startClientY: number
  primaryId: string
  /** 拖动开始时每个选中物件的平面位姿，多选整体平移用。 */
  startPlan: Map<string, { x: number; y: number; elevation: number; rotation: number }>
  started: boolean
  /** 离地手势的竖直轴锚点（开始时的世界底面中心）与射线参数。 */
  heightPoint: Vec3 | null
  startHeightT: number | null
  startAngle: number
  /** 上一次命中的吸附候选键（0.8.7 `snapKeys`，迟滞用）。 */
  snapKeys: string[]
  /** 上一次已处理的指针位置：位移不足 0.25px 时不重算（0.8.7 `dS()` 的免抖分支）。 */
  lastClientX: number
  lastClientY: number
  /** 拖动开始时的预览窗口尺寸。 */
  viewport: { left: number; top: number; width: number; height: number }
}

export interface DragController {
  /** 开始一个手势；缺少可用物件时返回 `false`。 */
  begin: (kind: GestureKind, event: PointerEvent, pick: EditorPick | null) => boolean
  move: (event: PointerEvent) => void
  finish: (event: PointerEvent) => void
  /**
   * 没有 pointerup 时（工作区切换 / 场景重建 / 窗口失焦）结束手势。
   *
   * 走的是与 `finish` 相同的提交链路：3D 拖动期间状态已经被改写，
   * 直接丢掉手势会留下「改过但没进撤销栈」的物件。
   */
  finishActive: () => void
  current: () => DragGesture | null
}

function angleOf(center: { x: number; y: number }, point: { x: number; y: number }): number {
  return (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI
}

/** 指针落点（平面像素）；相机近乎水平、射线打不到地面时返回 `null`。 */
function pointerPlanPoint(
  options: DragControllerOptions,
  event: PointerEvent,
  planeY: number,
): { x: number; y: number } | null {
  const ray = options.pointerRay(event.clientX, event.clientY)
  if (!ray) return null
  const ground = groundPointFromRay(ray, planeY)
  if (!ground) return null
  return worldToPlan(options.mapper(), ground.x, ground.z)
}

/** 手势的可变状态（每个控制器一份，避免模块级单例在多个舞台实例间串味）。 */
interface DragState {
  gesture: DragGesture | null
}

function collectStartPlan(
  options: DragControllerOptions,
  primaryId: string,
): Map<string, { x: number; y: number; elevation: number; rotation: number }> {
  const startPlan = new Map<string, { x: number; y: number; elevation: number; rotation: number }>()
  for (const id of options.selectedIds()) {
    const plan = options.itemPlanPoint(id)
    if (plan) startPlan.set(id, plan)
  }
  if (!startPlan.has(primaryId)) {
    const plan = options.itemPlanPoint(primaryId)
    if (plan) startPlan.set(primaryId, plan)
  }
  return startPlan
}

function beginGesture(
  options: DragControllerOptions,
  state: DragState,
  kind: GestureKind,
  event: PointerEvent,
  pick: EditorPick | null,
): boolean {
  const primaryId = pick?.id || options.selectedIds()[0]
  if (!primaryId) return false
  // 开始前先验一次：选中被改、楼层被切、物件被锁定 / 隐藏时不进入手势。
  const reason = options.validateGesture(primaryId)
  if (reason) {
    options.showToast(reason, 'warning')
    return false
  }
  const startPlan = collectStartPlan(options, primaryId)
  const primaryPlan = startPlan.get(primaryId)
  if (!primaryPlan) return false
  const heightPoint = options.itemBaseWorldPoint(primaryId)
  const ray = options.pointerRay(event.clientX, event.clientY)
  const rotatedTo = pointerPlanPoint(options, event, primaryPlan.elevation) ?? primaryPlan
  state.gesture = {
    kind,
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    primaryId,
    startPlan,
    started: false,
    heightPoint,
    startHeightT: heightPoint && ray ? verticalRayParameter(ray, heightPoint) : null,
    startAngle: angleOf(primaryPlan, rotatedTo),
    snapKeys: [],
    lastClientX: event.clientX,
    lastClientY: event.clientY,
    viewport: options.viewportRect(),
  }
  return true
}

/** 每次移动前检查窗口尺寸：布局被改过（列宽拖拽 / 浏览器缩放）后屏幕换算已失效。 */
function viewportChanged(options: DragControllerOptions, gesture: DragGesture): boolean {
  const current = options.viewportRect()
  return (
    Math.abs(current.left - gesture.viewport.left) > 1 ||
    Math.abs(current.top - gesture.viewport.top) > 1 ||
    Math.abs(current.width - gesture.viewport.width) > 1 ||
    Math.abs(current.height - gesture.viewport.height) > 1
  )
}

function applyMove(options: DragControllerOptions, active: DragGesture, event: PointerEvent): void {
  const primaryStart = active.startPlan.get(active.primaryId)
  if (!primaryStart) return
  // 以「起始时物件所在的水平面」为拖动平面：抬高过的物件不会被拉回地面。
  const plan = pointerPlanPoint(options, event, primaryStart.elevation)
  if (!plan) return
  const deltaX = plan.x - primaryStart.x
  const deltaY = plan.y - primaryStart.y
  if (active.startPlan.size === 1) {
    // 单件：吸附 + 网格量化由 `resolveMove` 统一决定（0.8.7 `dS()` 的两条分支）。
    const resolved = options.resolveMove(
      active.primaryId,
      { x: primaryStart.x, y: primaryStart.y },
      { x: primaryStart.x + deltaX, y: primaryStart.y + deltaY },
      active.snapKeys,
      event,
    )
    active.snapKeys = resolved.keys
    options.moveItem(active.primaryId, resolved.x, resolved.y)
    options.moveLiveItem(active.primaryId, resolved.x, resolved.y)
    return
  }
  // 多件：保持相对位置整体平移（上游多选同样不做吸附）。
  for (const [id, start] of active.startPlan) {
    options.moveItem(id, start.x + deltaX, start.y + deltaY)
    options.moveLiveItem(id, start.x + deltaX, start.y + deltaY)
  }
}

function applyElevation(options: DragControllerOptions, active: DragGesture, event: PointerEvent): void {
  const start = active.startPlan.get(active.primaryId)
  if (!start || !active.heightPoint || active.startHeightT === null) return
  const ray = options.pointerRay(event.clientX, event.clientY)
  if (!ray) return
  const currentT = verticalRayParameter(ray, active.heightPoint)
  if (currentT === null) return
  const limits = options.elevationLimits(active.primaryId)
  const rawElevation = start.elevation + (currentT - active.startHeightT)
  const snapped = snapEditorElevation({
    raw: rawElevation,
    original: start.elevation,
    minimum: limits.minimum,
    maximum: limits.maximum,
    step: options.elevationStep(event),
    targets: options.elevationTargets(active.primaryId, start.x, start.y, rawElevation),
    tolerance: options.elevationTolerance(),
  })
  // 高度变化小于 1e-10 不写（上游 `gS()`）：避免每帧一次无效的三维位移与撤销脏标记。
  if (Math.abs(snapped.value - start.elevation) < 1e-10) return
  options.setItemElevation(active.primaryId, snapped.value)
}

function applyRotate(options: DragControllerOptions, active: DragGesture, event: PointerEvent): void {
  const start = active.startPlan.get(active.primaryId)
  const plan = pointerPlanPoint(options, event, start?.elevation ?? 0)
  if (!start || !plan) return
  const delta = angleOf({ x: start.x, y: start.y }, plan) - active.startAngle
  for (const [id, entry] of active.startPlan) {
    options.rotateItem(id, snapEditorRotation(entry.rotation + delta, ROTATE_STEP_DEGREES, !event.altKey))
  }
}

function moveGesture(options: DragControllerOptions, state: DragState, event: PointerEvent): void {
  const gesture = state.gesture
  if (!gesture || event.pointerId !== gesture.pointerId) return
  if (!gesture.started) {
    const travel = Math.hypot(event.clientX - gesture.startClientX, event.clientY - gesture.startClientY)
    if (travel < DRAG_THRESHOLD_PX) return
    gesture.started = true
    options.beginInteraction()
  }
  // 布局在此期间变了（拖分栏、浏览器缩放）→ 屏幕↔世界换算已失效，直接中止。
  if (viewportChanged(options, gesture)) {
    state.gesture = null
    options.showToast('预览窗口尺寸已变化，操作已取消', 'warning')
    options.endInteraction()
    return
  }
  const reason = options.validateGesture(gesture.primaryId)
  if (reason) {
    state.gesture = null
    options.showToast(reason, 'warning')
    options.endInteraction()
    return
  }
  // 帧间位移不足 0.25px：这一帧不重算，并清掉迟滞键（上游同）。
  if (Math.hypot(event.clientX - gesture.lastClientX, event.clientY - gesture.lastClientY) < POINTER_EPSILON_PX) {
    gesture.snapKeys = []
    return
  }
  gesture.lastClientX = event.clientX
  gesture.lastClientY = event.clientY
  if (gesture.kind === 'move') applyMove(options, gesture, event)
  else if (gesture.kind === 'elevation') applyElevation(options, gesture, event)
  else applyRotate(options, gesture, event)
  event.preventDefault()
}

function finishGesture(options: DragControllerOptions, state: DragState, event: PointerEvent): void {
  const gesture = state.gesture
  if (!gesture || event.pointerId !== gesture.pointerId) return
  const started = gesture.started
  state.gesture = null
  if (!started) return
  const accepted = options.commit()
  if (!accepted) options.showToast('位置与其它物件冲突，已还原', 'warning')
  options.endInteraction()
}

export function createDragController(options: DragControllerOptions): DragController {
  const state: DragState = { gesture: null }
  return {
    begin: (kind, event, pick) => beginGesture(options, state, kind, event, pick),
    move: (event) => moveGesture(options, state, event),
    finish: (event) => finishGesture(options, state, event),
    finishActive: () => {
      const gesture = state.gesture
      if (!gesture) return
      const started = gesture.started
      state.gesture = null
      if (!started) return
      const accepted = options.commit()
      if (!accepted) options.showToast('位置与其它物件冲突，已还原', 'warning')
      options.endInteraction()
    },
    current: () => state.gesture,
  }
}


export function clearLightGroupDropIndicator(runtime: StudioAppRuntime) {
  for (const lightGroupDropIndicatorElement of runtime.lightGroupListElement.querySelectorAll('.light-group-row'))
    lightGroupDropIndicatorElement.classList.remove('drop-before', 'drop-after'),
      delete lightGroupDropIndicatorElement.dataset.dropPosition
  for (const areaDropIndicatorElement of runtime.lightGroupListElement.querySelectorAll('.light-area-row'))
    areaDropIndicatorElement.classList.remove('drop-into', 'drop-before', 'drop-after'),
      delete areaDropIndicatorElement.dataset.dropPosition
}

/** 起拖瞬间把所有落点的矩形抓一份快照，之后拖动过程中不再读 DOM：这样即使源行被重绘（同一帧内不会），本次拖动的判定也不会错位。 */
export function collectListDragDropTargets(runtime: StudioAppRuntime) {
  const listDragDropTargets: any[] = []
  for (const areaRowElement of runtime.lightGroupListElement.querySelectorAll('.light-area-row')) {
    const listedAreaId = areaRowElement.dataset.areaId
    if (!listedAreaId) continue
    const areaSectionElement = areaRowElement.closest('.light-area-section')
    listDragDropTargets.push({
      kind: 'area',
      id: listedAreaId,
      rowElement: areaRowElement,
      rowRect: areaRowElement.getBoundingClientRect(),
      sectionRect: areaSectionElement ? areaSectionElement.getBoundingClientRect() : null,
    })
  }
  for (const groupRowElement of runtime.lightGroupListElement.querySelectorAll('.light-group-row')) {
    const listedGroupId = groupRowElement.dataset.lightGroupId
    if (!listedGroupId) continue
    listDragDropTargets.push({
      kind: 'group',
      id: listedGroupId,
      areaId: groupRowElement.dataset.lightGroupAreaId || null,
      rowElement: groupRowElement,
      rowRect: groupRowElement.getBoundingClientRect(),
      sectionRect: null as any,
    })
  }
  return listDragDropTargets
}

/** 指针落点 → 落点语义。 */
export function applyListDragDropIndicator(runtime: StudioAppRuntime, listDragSession: any, pendingListDrop: any) {
  runtime.clearLightGroupDropIndicator()
  if (!pendingListDrop) return
  const findDropIndicatorRow = (dropIndicatorTargetId: any) =>
    listDragSession.dropTargets.find((dropTargetCandidate: any) => dropTargetCandidate.id === dropIndicatorTargetId)
      ?.rowElement
  if (pendingListDrop.kind === 'area') {
    findDropIndicatorRow(pendingListDrop.targetId)?.classList.add(
      pendingListDrop.insertAfter ? 'drop-after' : 'drop-before',
    )
    return
  }
  if (pendingListDrop.anchorGroupId) {
    findDropIndicatorRow(pendingListDrop.anchorGroupId)?.classList.add(
      pendingListDrop.insertAfter ? 'drop-after' : 'drop-before',
    )
    return
  }
  pendingListDrop.areaId && findDropIndicatorRow(pendingListDrop.areaId)?.classList.add('drop-into')
}

export function activateListDrag(runtime: StudioAppRuntime, listDragSession: any) {
  ;(listDragSession.active = true),
    (listDragSession.dropTargets = runtime.collectListDragDropTargets()),
    listDragSession.rowElement.classList.remove('drag-ready'),
    listDragSession.rowElement.classList.add('dragging'),
    document.documentElement.classList.add('list-drag-active')
  const dragGhostElement = document.createElement('div')
  ;(dragGhostElement.className = 'light-row-drag-ghost'),
    (dragGhostElement.textContent = listDragSession.name || ''),
    document.body.append(dragGhostElement),
    (listDragSession.ghostElement = dragGhostElement)
  try {
    listDragSession.rowElement.setPointerCapture(listDragSession.pointerId)
  } catch {
    /* 指针捕获：指针已失效（pointercancel / 元素已卸载）时规范要求抛错，忽略即可 */
  }
}

export function handleListDragPointerMove(runtime: StudioAppRuntime, listDragPointerMoveEvent: any) {
  const listDragSession = runtime.appCtx.activeListDragSession
  if (!listDragSession || listDragPointerMoveEvent.pointerId !== listDragSession.pointerId) return
  const movedDistance = Math.hypot(
    listDragPointerMoveEvent.clientX - listDragSession.startX,
    listDragPointerMoveEvent.clientY - listDragSession.startY,
  )
  if (!listDragSession.active) {
    if (!listDragSession.armed) {
      movedDistance > runtime.LIST_DRAG_TOUCH_GIVE_UP_DISTANCE && runtime.finishListDrag(false)
      return
    }
    if (movedDistance < runtime.LIST_DRAG_START_DISTANCE) return
    runtime.activateListDrag(listDragSession)
  }
  listDragPointerMoveEvent.cancelable && listDragPointerMoveEvent.preventDefault(),
    listDragSession.ghostElement &&
      ((listDragSession.ghostElement.style.left = listDragPointerMoveEvent.clientX + 'px'),
      (listDragSession.ghostElement.style.top = listDragPointerMoveEvent.clientY + 'px')),
    (listDragSession.pendingDrop = resolveListDragDrop(
      listDragSession,
      listDragPointerMoveEvent.clientX,
      listDragPointerMoveEvent.clientY,
    )),
    runtime.applyListDragDropIndicator(listDragSession, listDragSession.pendingDrop)
}

export function handleListDragPointerUp(runtime: StudioAppRuntime, listDragPointerUpEvent: any) {
  const listDragSession = runtime.appCtx.activeListDragSession
  if (!listDragSession || listDragPointerUpEvent.pointerId !== listDragSession.pointerId) return
  runtime.finishListDrag(true)
}

export function handleListDragPointerCancel(runtime: StudioAppRuntime) {
  runtime.finishListDrag(false)
}

/** 触摸拖动期间必须吃掉 touchmove，否则面板会跟着手指一起滚动。 */
export function handleListDragTouchMove(runtime: StudioAppRuntime, listDragTouchMoveEvent: any) {
  runtime.appCtx.activeListDragSession?.active &&
    listDragTouchMoveEvent.cancelable &&
    listDragTouchMoveEvent.preventDefault()
}

export function finishListDrag(runtime: StudioAppRuntime, commitListDropFlag: any) {
  const listDragSession = runtime.appCtx.activeListDragSession
  if (!listDragSession) return
  ;(runtime.appCtx.activeListDragSession = null),
    listDragSession.holdTimeoutId && clearTimeout(listDragSession.holdTimeoutId),
    window.removeEventListener('pointermove', runtime.handleListDragPointerMove),
    window.removeEventListener('pointerup', runtime.handleListDragPointerUp),
    window.removeEventListener('pointercancel', runtime.handleListDragPointerCancel),
    window.removeEventListener('touchmove', runtime.handleListDragTouchMove),
    listDragSession.ghostElement?.remove(),
    listDragSession.rowElement.classList.remove('dragging', 'drag-ready'),
    document.documentElement.classList.remove('list-drag-active'),
    runtime.clearLightGroupDropIndicator()

  if (!listDragSession.active) return
  runtime.appCtx.listDragEndedAt = Date.now()
  const pendingListDrop = listDragSession.pendingDrop
  pendingListDrop &&
    commitListDropFlag &&
    (pendingListDrop.kind === 'area'
      ? runtime.moveAreaRow(listDragSession.id, pendingListDrop.targetId, pendingListDrop.insertAfter)
      : runtime.moveLightGroupToArea(
          listDragSession.id,
          pendingListDrop.areaId,
          pendingListDrop.anchorGroupId,
          pendingListDrop.insertAfter,
        ))
}

/** 行上的 pointerdown 入口。 */
export function beginListRowDrag(
  runtime: StudioAppRuntime,
  listDragRowSession: ListDragRowSession | null,
  listDragPointerDownEvent: any,
) {
  runtime.appCtx.activeListDragSession && runtime.finishListDrag(false)
  ;(listDragRowSession!.pointerId = listDragPointerDownEvent.pointerId),
    (listDragRowSession!.pointerType = listDragPointerDownEvent.pointerType || 'mouse'),
    (listDragRowSession!.startX = listDragPointerDownEvent.clientX),
    (listDragRowSession!.startY = listDragPointerDownEvent.clientY),
    (listDragRowSession!.armed = listDragRowSession!.pointerType !== 'touch'),
    (listDragRowSession!.active = false),
    (listDragRowSession!.pendingDrop = null),
    (listDragRowSession!.ghostElement = null),
    (listDragRowSession!.dropTargets = []),
    (listDragRowSession!.holdTimeoutId = null),
    (runtime.appCtx.activeListDragSession = listDragRowSession)
  listDragRowSession!.armed ||
    (listDragRowSession!.holdTimeoutId = setTimeout(() => {
      ;(listDragRowSession!.holdTimeoutId = null),
        runtime.appCtx.activeListDragSession === listDragRowSession &&
          ((listDragRowSession!.armed = true), listDragRowSession!.rowElement.classList.add('drag-ready'))
    }, runtime.LIST_DRAG_TOUCH_HOLD_MS))
  window.addEventListener('pointermove', runtime.handleListDragPointerMove, { passive: false }),
    window.addEventListener('pointerup', runtime.handleListDragPointerUp),
    window.addEventListener('pointercancel', runtime.handleListDragPointerCancel),
    window.addEventListener('touchmove', runtime.handleListDragTouchMove, { passive: false })
}

/* 模型库拖放到平面画布：dragenter / dragover / drop / dragleave 与落点建物。
 * 从 `studio-app/boot.ts` 整块搬出：读 `appCtx` 与画布句柄，写 `appCtx.*` 与文档。 */


/**
 * 「我的装饰」卡片的拖拽 MIME（上游 `MODEL_DRAG_TYPE`）。
 *
 * 与资源库其它卡片的 `application/x-homeos-item` **分开**是必要的：
 * 前者有效负载是 `assetId`（32 位 hex），后者是类型名（`sofa` / `wallac`）。
 * 两者都是裸字符串，仅凭内容无法可靠区分，必须靠 MIME 分流。
 */
export const USER_DECORATION_DRAG_TYPE = 'application/x-ha-bridge-3d-item'

/** 拖拽是否带了本画布认识的有效负载（任一约定 MIME 命中即可）。 */
export function hasDraggablePayload(dragEvent: { dataTransfer?: DataTransfer | null }): boolean {
  const types = dragEvent.dataTransfer?.types
  if (!types) return false
  return [...types].includes(USER_DECORATION_DRAG_TYPE) || [...types].includes('application/x-homeos-item')
}

/** 装饰的占位尺寸（米）：真实包围盒由加载后的模型写回。 */
const USER_DECORATION_PLACEHOLDER_SIZE = 0.4
export function bindModelDragDrop(deps: Record<string, any>): void {
  const {
    appCtx,
    applyCameraSnapshot,
    applyPlacementChange,
    axisLockedDistance,
    buildingFootprints2,
    captureUndoSnapshot,
    closedWallLoops,
    courtyardPlanColor2,
    createCourtyardDrawingEditor2,
    createSceneItem,
    createSelectionRef,
    cursorPositionElement,
    deselectAll,
    ensureCalibrationReady,
    eventToLocalPoint,
    exportDialogElement,
    exportOverwriteDialogElement,
    exportSaveViewButton,
    fixedCameraViewButton,
    fixedOverviewViewButton,
    generateId,
    getDefaultSelectionScope,
    getPixelsPerMeter,
    getSelectedObject,
    handleCanvasWheel,
    handleInteractionEnded,
    handlePointerDown,
    handlePointerMove,
    handlePointerRelease,
    isSnapEnabled,
    itemTypeCatalog,
    markDocumentDirty,
    openExportPanel,
    planCanvasElement,
    planStageElement,
    planToScreen,
    refreshScopeItems,
    refreshStudioView,
    resetView,
    resolveOverwriteChoice,
    restorePreviewAfterExport,
    rotatePlanView,
    saveCameraView,
    saveCameraViewButton,
    saveOverviewViewButton,
    screenToPlan,
    selectElement,
    selectSceneObject,
    selectStudioTool,
    selectionInspectorElement,
    showToast,
    snapIndicatorElement,
    updateCameraView,
    zoomByScale,
  } = deps
  /**
   * 在落点建一件用户装饰。
   *
   * **先注册模型 URL 再建物品**：建场景靠这条登记把 `user-decoration` 映射到真实 GLB，
   * 顺序反了会得到一件看不见的物品。失败时给出 toast 而不是静默（拖拽最容易「没反应」）。
   */
  function createUserDecorationAt(assetId: string, planPoint: { x: number; y: number }): void {
    const modelKey = registerUserDecorationModel(assetId, {
      width: USER_DECORATION_PLACEHOLDER_SIZE,
      height: USER_DECORATION_PLACEHOLDER_SIZE,
      depth: USER_DECORATION_PLACEHOLDER_SIZE,
    })
    if (!modelKey) {
      showToast('这个装饰模型不可用，请重新上传。', 'error')
      return
    }
    createSceneItem('user-decoration', planPoint, {
      width: USER_DECORATION_PLACEHOLDER_SIZE,
      depth: USER_DECORATION_PLACEHOLDER_SIZE,
      // 与「点击放置」共用同一份字段构造：两条路径各写一份必然漂移
      // （历史上拖拽那条写死了 `name: '我的装饰'`，属性面板于是永远显示目录名）。
      extraFields: decorationPlacementFields(assetId),
    })
  }

  planStageElement.addEventListener('dragenter', (assetDragEnterEvent: any) => {
    hasDraggablePayload(assetDragEnterEvent) && planStageElement.classList.add('dragging-item')
  }),
    planStageElement.addEventListener('dragover', (assetDragOverEvent: any) => {
      hasDraggablePayload(assetDragOverEvent) &&
        (assetDragOverEvent.preventDefault(),
        (assetDragOverEvent.dataTransfer.dropEffect = 'copy'),
        planStageElement.classList.add('dragging-item'))
    }),
    planStageElement.addEventListener('dragleave', (assetDragLeaveEvent: any) => {
      planStageElement.contains(assetDragLeaveEvent.relatedTarget) || planStageElement.classList.remove('dragging-item')
    }),
    planStageElement.addEventListener('drop', (assetDropEvent: any) => {
      assetDropEvent.preventDefault(), planStageElement.classList.remove('dragging-item')
      const dropPoint = screenToPlan(eventToLocalPoint(assetDropEvent))
      // 「我的装饰」卡片带的是 assetId（上游 `x-ha-bridge-3d-item` 契约），
      // 资源库里其它卡片带的是类型名。先判装饰，再走类型名 —— 两者的有效负载
      // 都可能是裸字符串，只靠内容无法区分，必须靠 MIME。
      const decorationAssetId = assetDropEvent.dataTransfer.getData(USER_DECORATION_DRAG_TYPE)
      if (decorationAssetId) {
        createUserDecorationAt(decorationAssetId, dropPoint)
        return
      }
      const data = assetDropEvent.dataTransfer.getData('application/x-homeos-item')
      data && createSceneItem(data, dropPoint)
    }),
    (deps.planPainter = createCourtyardDrawingEditor2({
      canvas: planCanvasElement,
      toolbar: document.querySelector('.plan-toolbar'),
      inspector: selectionInspectorElement,
      scene: () => appCtx.studioState,
      selected: () => (appCtx.selectedItem?.kind === 'item' ? getSelectedObject() : null),
      point: (pointerPlanPoint: any) => screenToPlan(eventToLocalPoint(pointerPlanPoint)),
      screen: planToScreen,
      ppm: () => getPixelsPerMeter() || 100,
      zoom: () => appCtx.planView.zoom,
      feedback: (toolFeedback: any) => {
        ;(snapIndicatorElement.textContent = toolFeedback?.kind
          ? '吸附：' + toolFeedback.label
          : isSnapEnabled()
            ? '吸附：自由'
            : '吸附：关闭'),
          toolFeedback?.point &&
            (cursorPositionElement.textContent =
              'X ' +
              (toolFeedback.point.x / (getPixelsPerMeter() || 100)).toFixed(2) +
              ' m · Y ' +
              (toolFeedback.point.y / (getPixelsPerMeter() || 100)).toFixed(2) +
              ' m')
      },
      snap: axisLockedDistance,
      snapping: isSnapEnabled,
      calibrated: ensureCalibrationReady,
      panning: () => appCtx.isMiddleButtonPanning,
      planColor: (courtyardPlanColor: any) => courtyardPlanColor2(courtyardPlanColor, itemTypeCatalog),
      buildings: () =>
        buildingFootprints2(appCtx.studioState.walls, closedWallLoops(getPixelsPerMeter()), getPixelsPerMeter()),
      clone: captureUndoSnapshot,
      snapshot: deselectAll,
      push: applyPlacementChange,
      changed: markDocumentDirty,
      refresh: () => refreshScopeItems(getDefaultSelectionScope()),
      draw: refreshStudioView,
      interactionEnded: handleInteractionEnded,
      select: (selectedToolItem: any) => selectSceneObject('item', selectedToolItem),
      isSelected: (toolSelectionItem: any) => createSelectionRef('item', toolSelectionItem),
      id: () => generateId('courtyard'),
      setTool: selectStudioTool,
      toast: showToast,
    })),
    planCanvasElement.addEventListener('pointerdown', handlePointerDown),
    planCanvasElement.addEventListener('pointermove', handlePointerMove),
    planCanvasElement.addEventListener('pointerup', handlePointerRelease),
    planCanvasElement.addEventListener('pointercancel', handlePointerRelease),
    planCanvasElement.addEventListener('contextmenu', (canvasMenuEvent: any) => canvasMenuEvent.preventDefault()),
    planCanvasElement.addEventListener(
      'wheel',
      (canvasPointerEvent: any) => {
        canvasPointerEvent.preventDefault(), handleCanvasWheel(canvasPointerEvent)
      },
      {
        passive: false,
      },
    ),
    selectElement('#fit-view').addEventListener('click', resetView),
    selectElement('#rotate-plan-view').addEventListener('click', rotatePlanView),
    selectElement('#zoom-in').addEventListener('click', () => zoomByScale(1.18)),
    selectElement('#zoom-out').addEventListener('click', () => zoomByScale(1 / 1.18)),
    selectElement('#reset-camera').addEventListener('click', updateCameraView),
    saveCameraViewButton.addEventListener('click', saveCameraView),
    fixedCameraViewButton.addEventListener('click', applyCameraSnapshot),
    saveOverviewViewButton.addEventListener('click', saveCameraView),
    fixedOverviewViewButton.addEventListener('click', applyCameraSnapshot),
    exportSaveViewButton.addEventListener('click', saveCameraView),
    selectElement('#open-export').addEventListener('click', openExportPanel),
    selectElement('#export-close').addEventListener('click', () => {
      appCtx.isInteractionLocked || exportDialogElement.close()
    }),
    exportDialogElement.addEventListener('cancel', (exportDialogCancelEvent: any) => {
      exportDialogCancelEvent.preventDefault(), appCtx.isInteractionLocked || exportDialogElement.close()
    }),
    exportDialogElement.addEventListener('close', restorePreviewAfterExport),
    selectElement('#export-overwrite-close').addEventListener('click', () => resolveOverwriteChoice('cancel')),
    selectElement('#export-overwrite-cancel').addEventListener('click', () => resolveOverwriteChoice('cancel')),
    selectElement('#export-overwrite-rename').addEventListener('click', () => resolveOverwriteChoice('rename')),
    selectElement('#export-overwrite-confirm').addEventListener('click', () => resolveOverwriteChoice('overwrite')),
    exportOverwriteDialogElement.addEventListener('cancel', (overwriteDialogCancelEvent: any) => {
      overwriteDialogCancelEvent.preventDefault(), resolveOverwriteChoice('cancel')
    })
}

/**
 * 把 `snapPlacement` 接进平面手势（0.8.7 `snapPlacement` 的调用点）。
 *
 * 为什么单独成模块：`handlePointerUp` / `pointer-input` 都已经很长，这里要做
 * 「取被拖件 → 筛候选 → 算容差 → 吸附 → 交回位移与引导线」，塞进去会混进两种职责。
 *
 * 多选也吸附（0.8.7 同）：按**组合包围盒**整体平移，相对位置不变。
 * 早期版本因为「每件目标不同」直接跳过，结果是框选两件贴着墙的柜子时松手就散开。
 */

/** 墙面数组的类型（吸附模块只读 id / 端点 / 厚度）。 */
type SnapWalls = NonNullable<Parameters<typeof snapPlacement>[0]['walls']>

/** 不参与吸附的物件：洞口与铭牌在平面上是「标注」而不是可摆放的家具。 */
const NON_SNAPPABLE_TYPES = new Set(['flooropening', 'planlabel'])

export type PlacementSnapOptions = {
  /** 本次吸附的缩放（容差随缩放变化）。 */
  zoom?: number
  /** 上一次命中的候选键，用于迟滞。 */
  previousKeys?: string[]
  /** 只允许沿这个方向吸附（灯带轴向移动）。 */
  freedom?: Point | null
  /**
   * 用「拖动中的位姿」参与吸附，而不是场景里已提交的坐标（灯带轴向移动用）。
   *
   * 3D 里物件还没落位就要求吸附结果，场景数据仍是按下前的状态；
   * 不覆盖的话吸附永远按「起点」算，表现为吸附不生效。
   */
  moving?: SnapItem[]
}

export type PlacementSnapResult = {
  /** 需要加到所有被拖物件上的像素位移。 */
  delta: Point
  guides: PlacementGuide[]
  keys: string[]
}

type SnapItem = PlanRectLike & { id: string; type: string }

function itemPixelsPerMeter(appCtx: StudioAppContext, pixelsPerMeter: number): number {
  const scale = Number(pixelsPerMeter) || Number(appCtx.studioState?.calibration?.pixelsPerMeter) || 0
  return scale > 0 ? scale : 100
}

/** 吸附是否开启：总开关 + 按住 S 的临时关闭（0.8.7 `Qt()`）。 */
function snapEnabled(appCtx: StudioAppContext): boolean {
  return appCtx.studioState.settings?.snapEnabled !== false && !appCtx.isSnapTemporarilyOff
}

/** 两类吸附各自是否开启（两个都关时整体不做）。 */
function snapScope(settings: Record<string, unknown>): { walls: boolean; items: boolean } {
  return { walls: settings.snapObjectWalls !== false, items: settings.snapModels !== false }
}

/** 缩放：显式传入优先，否则取平面视图的当前缩放。 */
function resolveZoom(appCtx: StudioAppContext, rawZoom: unknown): number {
  const explicit = Number(rawZoom)
  if (explicit > 0) return explicit
  const current = Number(appCtx.planView?.zoom)
  return current > 0 ? current : 1
}

/** 吸附距离（像素）：设置里的值，缺省 13。 */
function resolveSnapTolerance(settings: Record<string, unknown>): number {
  const raw = Number(settings.snapTolerance)
  return raw > 0 ? raw : 13
}

/** 三类输入一次算齐：比例尺 / 缩放 / 容差。 */
function resolveSnapMetrics(appCtx: StudioAppContext, pixelsPerMeter: number, rawZoom: unknown) {
  const settings = (appCtx.studioState.settings ?? {}) as Record<string, unknown>
  const scale = itemPixelsPerMeter(appCtx, pixelsPerMeter)
  const zoom = resolveZoom(appCtx, rawZoom)
  return { settings, scale, zoom, tolerance: placementTolerance(scale, zoom, resolveSnapTolerance(settings)) }
}

/** 被拖件里有洞口 / 隐藏 / 锁定时不做吸附：它们本来就不该被「摆到某个精确位置」。 */
function isUnsnappable(appCtx: StudioAppContext, moving: SnapItem[]): boolean {
  return moving.some(
    (item) =>
      NON_SNAPPABLE_TYPES.has(String(item.type)) ||
      isPlacedItemHidden(appCtx, item.id) ||
      isPlacedItemLocked(appCtx, item.id),
  )
}

/** 可吸附的邻居：排除自己、洞口/铭牌、隐藏项、无尺寸项。 */
function snapTargets(appCtx: StudioAppContext, draggedIds: Set<string>): SnapItem[] {
  const targets: SnapItem[] = []
  for (const candidate of appCtx.studioState.items as unknown as SnapItem[]) {
    const id = String(candidate.id ?? '')
    if (draggedIds.has(id)) continue
    if (NON_SNAPPABLE_TYPES.has(String(candidate.type))) continue
    if (isPlacedItemHidden(appCtx, id)) continue
    if (!(Number(candidate.width) > 0 && Number(candidate.depth) > 0)) continue
    targets.push(candidate)
  }
  return targets
}

/**
 * 对被拖动的物件做吸附。
 *
 * @returns 位移 + 引导线 + 本次命中的候选键；没有吸附时位移为 0。
 */
export function applyPlacementSnap(
  appCtx: StudioAppContext,
  draggedIds: string[],
  pixelsPerMeter: number,
  options: PlacementSnapOptions = {},
): PlacementSnapResult {
  const empty: PlacementSnapResult = { delta: { x: 0, y: 0 }, guides: [], keys: [] }
  // 总开关关掉、或按住 S 临时关闭时整体不吸附（早期只看了两个分类开关，S 无效）。
  if (!snapEnabled(appCtx)) return empty
  const metrics = resolveSnapMetrics(appCtx, pixelsPerMeter, options.zoom)
  const scope = snapScope(metrics.settings)
  if (!scope.walls && !scope.items) return empty
  const idSet = new Set(draggedIds.map(String))
  const moving =
    options.moving ?? (appCtx.studioState.items as unknown as SnapItem[]).filter((item) => idSet.has(String(item.id)))
  if (!moving.length || isUnsnappable(appCtx, moving)) return empty
  const result = snapPlacement({
    moving,
    targets: scope.items ? snapTargets(appCtx, idSet) : [],
    walls: scope.walls ? (appCtx.studioState.walls as unknown as SnapWalls) : [],
    pixelsPerMeter: metrics.scale,
    tolerance: metrics.tolerance,
    previous: options.previousKeys,
    freedom: options.freedom,
  })
  return { delta: { x: result.x, y: result.y }, guides: result.guides, keys: result.keys }
}

/**
 * 单点吸附（缩放的被拖边 / 灯带轴向移动）。
 *
 * 与整件吸附共用同一套候选与容差，只是把「物件四角」换成「一个点」：
 * 缩放时真正要贴墙的是被拖的那条边，不是整件。
 */
export function applyPointSnap(
  appCtx: StudioAppContext,
  excludeIds: string[],
  pixelsPerMeter: number,
  point: Point,
  options: PlacementSnapOptions = {},
): { point: Point; guides: PlacementGuide[]; keys: string[] } {
  const unchanged = { point, guides: [] as PlacementGuide[], keys: [] as string[] }
  if (!snapEnabled(appCtx)) return unchanged
  const metrics = resolveSnapMetrics(appCtx, pixelsPerMeter, options.zoom)
  const scope = snapScope(metrics.settings)
  if (!scope.walls && !scope.items) return unchanged
  const result = snapPlacement({
    point,
    targets: scope.items ? snapTargets(appCtx, new Set(excludeIds.map(String))) : [],
    walls: scope.walls ? (appCtx.studioState.walls as unknown as SnapWalls) : [],
    pixelsPerMeter: metrics.scale,
    tolerance: metrics.tolerance,
    previous: options.previousKeys,
  })
  return {
    point: { x: point.x + result.x, y: point.y + result.y },
    guides: result.guides,
    keys: result.keys,
  }
}

/**
 * 拖动位移的网格量化（0.8.7：5cm，按住 Alt 1cm）。
 *
 * 只在**没有吸附引导线**时使用：两条都会改位移，叠加起来会让物件先被网格吸住、
 * 再被墙面吸走，手感混乱。`snapGrid === false` 时不量化。
 */
export function quantizePlanDelta(
  appCtx: StudioAppContext,
  delta: Point,
  pixelsPerMeter: number,
  altKey: boolean,
): Point {
  const settings = (appCtx.studioState.settings ?? {}) as Record<string, unknown>
  if (settings.snapGrid === false || !snapEnabled(appCtx)) return delta
  const step = (altKey ? 0.01 : 0.05) * (pixelsPerMeter || 100)
  if (!(step > 0)) return delta
  return { x: Math.round(delta.x / step) * step, y: Math.round(delta.y / step) * step }
}

/** 组合包围盒（诊断 / 画布反馈用）：多选时把「组合」画成一个框。 */
export function movingBounds(appCtx: StudioAppContext, draggedIds: string[], pixelsPerMeter: number) {
  const idSet = new Set(draggedIds.map(String))
  const moving = (appCtx.studioState.items as unknown as SnapItem[]).filter((item) => idSet.has(String(item.id)))
  if (!moving.length) return null
  const corners = moving.flatMap((item) => itemPlanCorners(item, itemPixelsPerMeter(appCtx, pixelsPerMeter)))
  return {
    minX: Math.min(...corners.map((corner) => corner.x)),
    minY: Math.min(...corners.map((corner) => corner.y)),
    maxX: Math.max(...corners.map((corner) => corner.x)),
    maxY: Math.max(...corners.map((corner) => corner.y)),
  }
}
