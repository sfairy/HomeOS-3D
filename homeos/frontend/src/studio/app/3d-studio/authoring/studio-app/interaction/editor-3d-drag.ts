/**
 * 3D 视口编辑的拖动状态机（从 `editor-3d-overlay.ts` 抽出）。
 *
 * 抽出原因：叠层模块同时负责 DOM 手柄与指针状态机，`createEditor3DOverlay` 会变得又长又深，
 * 直接顶到前端复杂度棘轮。这里只保留「开始 / 移动 / 结束」三个入口，
 * DOM 与事件注册仍留在叠层里。
 */
import type { EditorPick } from './editor-picking'
import type { ElevationTarget, PlanMapper, Ray, Vec3 } from './editor-3d-gesture'
import {
  groundPointFromRay,
  snapEditorElevation,
  snapEditorRotation,
  verticalRayParameter,
  worldToPlan,
} from './editor-3d-gesture'

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
