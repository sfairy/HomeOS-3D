/**
 * 灯带工具条的交互状态机（从 `editor-light-toolbar` 拆出）。
 *
 * 两处交互都要「开始 → 移动 → 结束」三个阶段，且共用同一条提交链路（撤销快照 + 校验）：
 * - 圆环拖动：`ringRayAngle` 累计角度，5°（Alt 1°）吸附；
 * - 移动手柄：`axisRayParameter` 求位移，按轴换算平面位置 / 离地。
 *
 * 状态机只改数值并回调 `onAngle` / `onMovePose`，不碰 DOM 结构。
 */
import type { LightAxis, LightPoseLike } from '../interaction/editor-light-gizmo'
import {
  axisRayParameter,
  lightMovePosition,
  planeRayPoint,
  ringRayAngle,
  unwrapRingRadians,
} from '../interaction/editor-light-gizmo'
import { editNumberText } from '../../studio-edit-metrics'
import type { GizmoHandleSpec } from '../interaction/editor-light-gizmo-paths'
import type { Ray, Vec3 } from '../interaction/editor-3d-gesture'
import type { SnapSensingOptions } from './editor-light-toolbar-types'

/** 角度吸附：默认 5°，按住 Alt 1°（0.8.7 同）。 */
const ANGLE_SNAP_DEGREES = 5
const ANGLE_SNAP_FINE_DEGREES = 1
/** 平面移动求交用的水平面法线（0.8.7 `move-center` 的平面）。 */
const PLANE_NORMAL: Vec3 = { x: 0, y: 1, z: 0 }

export interface HandleStateOptions extends SnapSensingOptions {
  pose: () => LightPoseLike | null
  center: () => Vec3 | null
  pointerRay?: (clientX: number, clientY: number) => Ray | null
  pixelsPerMeter?: () => number
  minimumElevation?: () => number
  onBegin: () => void
  onEnd: () => void
  onAngle: (axis: LightAxis, degrees: number) => void
  onMovePose?: (pose: { x: number; y: number; elevation: number }) => void
  onStatus: (text: string) => void
}

/** 归一化到 0–360 并对齐到 `step`。 */
export function snapDegrees(degrees: number, step: number): number {
  const normalized = ((degrees % 360) + 360) % 360
  return step > 0 ? (Math.round(normalized / step) * step) % 360 : normalized
}

type HandleDrag =
  | { kind: 'rotate'; spec: GizmoHandleSpec; lastAngle: number; accumulated: number; startDegrees: number }
  | { kind: 'move'; spec: GizmoHandleSpec; startT: number; startPose: { x: number; y: number; elevation: number } }
  | {
      kind: 'plane'
      spec: GizmoHandleSpec
      startPoint: Vec3
      startPose: { x: number; y: number; elevation: number }
    }

/** 圆环拖动的起始状态（角度求不出来时返回 `null` 并给提示）。 */
function rotateDragOf(
  spec: GizmoHandleSpec,
  pose: LightPoseLike,
  center: Vec3,
  ray: Ray,
  onStatus: (text: string) => void,
): Extract<HandleDrag, { kind: 'rotate' }> | null {
  if (!spec.field) return null
  const startAngle = ringRayAngle(ray, center, spec.axis, spec.u, spec.v)
  if (startAngle === null) {
    onStatus('当前轴接近侧视，请转动视角后拖动圆环')
    return null
  }
  return {
    kind: 'rotate',
    spec,
    lastAngle: startAngle,
    accumulated: 0,
    startDegrees: Number(pose[spec.field] || 0),
  }
}

/** 移动手柄的起始状态（轴与射线近平行时返回 `null` 并给提示）。 */
function moveDragOf(
  spec: GizmoHandleSpec,
  pose: LightPoseLike,
  center: Vec3,
  ray: Ray,
  onStatus: (text: string) => void,
): Extract<HandleDrag, { kind: 'move' }> | null {
  const startT = axisRayParameter(ray, center, spec.axis)
  if (startT === null) {
    onStatus('当前轴接近侧视，请转动视角后拖动圆环')
    return null
  }
  return {
    kind: 'move',
    spec,
    startT,
    startPose: { x: Number(pose.x || 0), y: Number(pose.y || 0), elevation: Number(pose.elevation || 0) },
  }
}

/** 中心十字的起始状态：指针射线与「过物件中心的水平面」求交（0.8.7 `move-center`）。 */
function planeDragOf(
  spec: GizmoHandleSpec,
  pose: LightPoseLike,
  center: Vec3,
  ray: Ray,
  onStatus: (text: string) => void,
): Extract<HandleDrag, { kind: 'plane' }> | null {
  const startPoint = planeRayPoint(ray, center, PLANE_NORMAL)
  if (!startPoint) {
    onStatus('当前视角接近水平，请转动视角后拖动')
    return null
  }
  return {
    kind: 'plane',
    spec,
    startPoint,
    startPose: { x: Number(pose.x || 0), y: Number(pose.y || 0), elevation: Number(pose.elevation || 0) },
  }
}

/** 圆环移动：累计弧度 → 方向符号 → 增量吸附 → 起始角 + 增量。 */
function rotateDragStep(
  active: Extract<HandleDrag, { kind: 'rotate' }>,
  ray: Ray,
  center: Vec3,
  fine: boolean,
  options: HandleStateOptions,
): void {
  const current = ringRayAngle(ray, center, active.spec.axis, active.spec.u, active.spec.v)
  if (current === null) return
  active.accumulated += unwrapRingRadians(active.lastAngle, current)
  active.lastAngle = current
  const field = active.spec.field
  if (!field) return
  // 0.8.7：`deg = angle * 180/π * handle.sign` —— 平面方向环的基与绕 Y 正方向相反。
  let deltaDegrees = ((active.accumulated * 180) / Math.PI) * (active.spec.sign || 1)
  if (options.snapEnabled?.() !== false && options.snapAngles?.() !== false) {
    // 吸附的是**增量**（`original + 吸附后的增量`），不是绝对角度：
    // 吸绝对值会把 37° 的灯带拖一下跳到 40°，上游是 37° + 5° = 42°。
    const step = fine ? ANGLE_SNAP_FINE_DEGREES : ANGLE_SNAP_DEGREES
    deltaDegrees = Math.round(deltaDegrees / step) * step
  }
  const degrees = (((active.startDegrees + deltaDegrees) % 360) + 360) % 360
  options.onAngle(field, degrees)
  // 状态条报的是本次增量（上游 `short + ' ' + fmt(deg) + '°'`）。
  options.onStatus(`${active.spec.short} ${editNumberText(deltaDegrees)}°`)
}

export interface HandleStateMachine {
  handlePointer: (spec: GizmoHandleSpec, phase: 'begin' | 'move' | 'end', event: PointerEvent) => void
  cancel: () => void
  readonly dragging: boolean
}

/** 吸附到平面网格时的步长（米）：默认 5cm，按住 Alt 1cm（0.8.7 `moveStepMeters`）。 */
function gridStep(fine: boolean): number {
  return fine ? 0.01 : 0.05
}

/**
 * 水平轴的贴墙 / 贴边吸附修正量（米）。
 *
 * 返回 `null` 表示这一帧没有命中吸附（调用方才会去做网格量化）。
 * 修正量从平面像素投影回轴向参数：`Δxy · axis / (ppm · |axis_xy|²)`。
 */
function axisSnapCorrection(
  probe: { x: number; y: number; elevation: number },
  axis: Vec3,
  pixelsPerMeter: number,
  options: HandleStateOptions,
): number | null {
  const result = options.placementSnap?.(probe, { x: axis.x, y: axis.z })
  if (!result?.keys.length) return null
  const denominator = pixelsPerMeter * (axis.x * axis.x + axis.z * axis.z)
  if (!(denominator > 0)) return null
  return (result.delta.x * axis.x + result.delta.y * axis.z) / denominator
}

/**
 * 移动手柄的一步：轴向位移 → 贴墙/贴边吸附 → 网格量化 → 换算位姿。
 *
 * 与 0.8.7 `hS()` 的移动分支逐条对应：
 * - 只有水平轴（`|axis.y| < 1e-7`）参与平面吸附，吸附修正量按 `freedom` 投影回轴向参数；
 * - 命中吸附时不再量化网格（两套都改位移会互相打架）；
 * - 竖直轴直接落到 `lightMovePosition`，由它夹最小离地高度。
 */
function moveDragStep(
  active: Extract<HandleDrag, { kind: 'move' }>,
  ray: Ray,
  center: Vec3,
  fine: boolean,
  options: HandleStateOptions,
): void {
  const currentT = axisRayParameter(ray, center, active.spec.axis)
  if (currentT === null) return
  const axis = active.spec.axis
  const pixelsPerMeter = options.pixelsPerMeter?.() ?? 100
  const limits = { minimum: options.minimumElevation?.() ?? 0 }
  let travel = currentT - active.startT
  const horizontal = Math.abs(axis.y) < 1e-7
  const correction = horizontal
    ? axisSnapCorrection(
        lightMovePosition(active.startPose, travel, axis, pixelsPerMeter, limits),
        axis,
        pixelsPerMeter,
        options,
      )
    : null
  const snapGrid = options.snapGrid?.() !== false && options.snapEnabled?.() !== false
  if (correction !== null) travel += correction
  else if (snapGrid) travel = Math.round(travel / gridStep(fine)) * gridStep(fine)
  const moved = lightMovePosition(active.startPose, travel, axis, pixelsPerMeter, limits)
  options.onMovePose?.(moved)
  // 上游状态条：`X +0.25 → 2.4 m`（位移用有符号数，箭头后是换算后的离地高度）。
  const signed = travel >= 0 ? `+${editNumberText(travel)}` : editNumberText(travel)
  options.onStatus(`${active.spec.short} ${signed} → ${editNumberText(moved.elevation)} m`)
}

/** 拖动一步：按手势类型分派。 */
function stepDrag(active: HandleDrag, ray: Ray, center: Vec3, fine: boolean, options: HandleStateOptions): void {
  if (active.kind === 'rotate') {
    rotateDragStep(active, ray, center, fine, options)
    return
  }
  if (active.kind === 'plane') {
    // 平面移动：两次射线与同一水平面的交点差 → 世界米 → 平面像素（0.8.7 `move-center`）。
    const point = planeRayPoint(ray, center, PLANE_NORMAL)
    if (!point) return
    const scale = options.pixelsPerMeter?.() ?? 100
    options.onMovePose?.({
      x: active.startPose.x + (point.x - active.startPoint.x) * scale,
      y: active.startPose.y + (point.z - active.startPoint.z) * scale,
      elevation: active.startPose.elevation,
    })
    options.onStatus('平面移动')
    return
  }
  moveDragStep(active, ray, center, fine, options)
}

/** 状态机的可变部分（提到模块作用域，主工厂函数才不会超 80 行）。 */
interface MachineState {
  drag: HandleDrag | null
}

function beginDrag(
  state: MachineState,
  options: HandleStateOptions,
  spec: GizmoHandleSpec,
  pose: LightPoseLike,
  center: Vec3,
  ray: Ray,
): boolean {
  const next =
    spec.kind === 'rotate'
      ? rotateDragOf(spec, pose, center, ray, options.onStatus)
      : spec.kind === 'plane'
        ? planeDragOf(spec, pose, center, ray, options.onStatus)
        : moveDragOf(spec, pose, center, ray, options.onStatus)
  if (!next) return false
  state.drag = next
  return true
}

function handlePointerEvent(
  state: MachineState,
  options: HandleStateOptions,
  spec: GizmoHandleSpec,
  phase: 'begin' | 'move' | 'end',
  event: PointerEvent,
): void {
  // 「抬起」必须在投影守卫之前处理：那一帧若相机正好被重建、`pointerRay` 求不出来，
  // 拖动态会永久卡住（下一次按下会以新的 startT 覆盖，物件就此错位）。
  if (phase === 'end') {
    if (!state.drag) return
    state.drag = null
    options.onEnd()
    return
  }
  const pose = options.pose()
  const center = options.center()
  const ray = options.pointerRay?.(event.clientX, event.clientY)
  if (!pose || !center || !ray) return
  if (phase === 'begin') {
    if (beginDrag(state, options, spec, pose, center, ray)) options.onBegin()
    return
  }
  if (!state.drag) return
  stepDrag(state.drag, ray, center, event.altKey, options)
}

/**
 * 取消进行中的拖动：把位姿写回按下前的值，再走同一条提交链路。
 *
 * 只把 `state.drag` 置空是不够的 —— 拖动是「边拖边写」的，直接取消会停在中途的
 * 半成品角度上。`startDegrees` / `startPose` 在 begin 时就已经存好，这里原地回滚。
 */
function cancelDrag(state: MachineState, options: HandleStateOptions): void {
  const active = state.drag
  if (!active) return
  state.drag = null
  if (active.kind === 'rotate') {
    if (active.spec.field) options.onAngle(active.spec.field, active.startDegrees)
  } else {
    options.onMovePose?.({ ...active.startPose })
  }
  options.onEnd()
}

export function createHandleStateMachine(options: HandleStateOptions): HandleStateMachine {
  const state: MachineState = { drag: null }
  return {
    handlePointer: (spec, phase, event) => handlePointerEvent(state, options, spec, phase, event),
    cancel() {
      cancelDrag(state, options)
    },
    get dragging() {
      return Boolean(state.drag)
    },
  }
}
