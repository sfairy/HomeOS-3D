/**
 * 灯光定向工具条：DOM 结构、交互状态机、选项装配、几何视图。
 *
 * 为什么是一个文件：这几块共用同一套 `LightToolbar`/`ToolbarDom` 类型与同一份
 * 指针状态机，任何一处改动都要同步其余几处。早期按「便于阅读」拆成 5 个文件，
 * 结果是每次改交互都要跨 5 个文件核对，且拆出的文件头都要写「从 X 拆出」。
 */

import { type LightAxis, LIGHT_AXIS_LABELS, LIGHT_AXIS_COLORS, type LightPoseLike, axisRayParameter, lightMovePosition, planeRayPoint, ringRayAngle, unwrapRingRadians, type GizmoHandleSpec, lightFrame, lightGizmoHandles } from '../interaction/light-gizmo'
import { editNumberText } from '../studio-edit-metrics'
import { type Ray, type Vec3 } from '../interaction/gesture'
import { type StudioAppRuntime } from '../runtime/studio-app-runtime'
import { findItem, planPointOf, type Geometry, writeItemState, type SelectionBridge, isLightItem, modelPendingOf, screenPixelsPerMeter, elevationLimitsOf, type TransactionState } from './editor-3d'
import { applyPlacementSnap } from '../interaction/drag-and-drop'
import { isGizmoEligibleItem, isItemEditable, isItemInLibraryScope, isItemShown } from '../items/placed-item-visibility'
import { libraryModeOf } from './asset-library'
import { itemElevationMeaning } from '../loaders/studio-normalization'

/**
 * 灯带工具条的共享类型。
 *
 * 单独一个文件是为了避免 `editor-light-toolbar` ↔ `editor-light-toolbar-dom`
 * 互相 import 形成环：两边都只依赖类型定义。
 */
export type LightMode = 'move' | 'rotate'
export type LightSpace = 'world' | 'local'

/**
 * 吸附相关的读取口（工具条选项与拖动状态机共用同一组签名）。
 *
 * 单独抽出来是因为两份接口逐字重复会被 `check:duplicates` 拦下，
 * 而它们本来就该是同一个契约：状态机只读、装配层负责提供。
 */
export interface SnapSensingOptions {
  /** 轴向平移的贴墙 / 贴边吸附；用拖动中的探针位姿参与计算。 */
  placementSnap?: (
    pose: { x: number; y: number; elevation: number },
    freedom: { x: number; y: number },
  ) => { delta: { x: number; y: number }; keys: string[] } | null
  /** 吸附总开关（0.8.7 `Qt()`）。 */
  snapEnabled?: () => boolean
  /** 角度吸附开关（`settings.snapAngles`）。 */
  snapAngles?: () => boolean
  /** 网格量化开关（`settings.snapGrid`）。 */
  snapGrid?: () => boolean
}

/**
 * 灯带工具条的 DOM（从 `editor-light-toolbar` 拆出）。
 *
 * 外层仍是 0.8.7 的 `div.editor-light-toolbar`（`role=group`、`aria-label=灯光三维操作`），
 * 但内部按**三行**组织，而不是把九个节点平铺在一行里：
 *
 * 1. `.editor-light-toolbar-row.is-tools` —— `移动 / 旋转 / 世界轴 / 自身轴`；
 * 2. `.editor-light-toolbar-row.is-axes`  —— `旋转轴` 标签 + 三个 `button[data-light-axis]`；
 * 3. `output.editor-light-status`         —— 静止高度 / 拖动中的即时读数。
 *
 * 为什么分行：早先用一个 `flex: 0 0 100%` 的空 span 当换行占位，在 `width: max-content`
 * 的容器里它会吃掉全部可用宽度，工具条被撑到画布整宽、两侧留白。真实的行容器让根节点
 * 的宽度只由最宽那一行的内容决定。`closest('.editor-light-toolbar')` / 避让排版不受影响。
 *
 * 这里只建节点、绑最基础的点击回调，不碰状态机。
 */

export interface ToolbarDom {
  root: HTMLElement
  modeButtons: Map<LightMode, HTMLButtonElement>
  spaceButtons: Map<LightSpace, HTMLButtonElement>
  axisButtons: Map<LightAxis, HTMLButtonElement>
  /** 轴按钮上的实时角度读数（0–360°，例如 `45°`）。 */
  axisValues: Map<LightAxis, HTMLSpanElement>
  status: HTMLOutputElement
  /** 「旋转轴」分组标签。 */
  axisLabel: HTMLSpanElement
}

export const AXIS_ORDER: readonly LightAxis[] = ['rotation', 'verticalRotation', 'stripRollRotation']

/** 四个工具按钮的顺序与文案（上游数组顺序，含「旋转」）。 */
const MODE_ITEMS: ReadonlyArray<readonly [LightMode, string]> = [
  ['move', '移动'],
  ['rotate', '旋转'],
]
const SPACE_ITEMS: ReadonlyArray<readonly [LightSpace, string]> = [
  ['world', '世界轴'],
  ['local', '自身轴'],
]

interface ShellCallbacks {
  onMode: (mode: LightMode) => void
  onSpace: (space: LightSpace) => void
  onAxis: (axis: LightAxis) => void
}

/** 建一个按钮（统一的 type / dataset / 点击回调）。 */
function createButton(documentNode: Document, datasetKey: string, datasetValue: string, label: string, title?: string) {
  const button = documentNode.createElement('button')
  button.type = 'button'
  button.dataset[datasetKey] = datasetValue
  button.textContent = label
  button.setAttribute('aria-pressed', 'false')
  if (title) button.title = title
  return button
}

/** 工具按钮：移动 / 旋转 / 世界轴 / 自身轴（顺序与上游一致）。 */
function createToolButtons(documentNode: Document, callbacks: ShellCallbacks) {
  const modeButtons = new Map<LightMode, HTMLButtonElement>()
  const spaceButtons = new Map<LightSpace, HTMLButtonElement>()
  const MODE_TITLES: Record<LightMode, string> = {
    move: '移动模式：拖动三根箭头平移灯具',
    rotate: '旋转模式：拖动彩色圆环调整角度',
  }
  const SPACE_TITLES: Record<LightSpace, string> = {
    world: '按世界坐标轴移动',
    local: '按灯具自身轴向移动',
  }
  for (const [mode, label] of MODE_ITEMS) {
    const button = createButton(documentNode, 'lightTool', mode, label, MODE_TITLES[mode])
    button.addEventListener('click', () => callbacks.onMode(mode))
    modeButtons.set(mode, button)
  }
  for (const [space, label] of SPACE_ITEMS) {
    const button = createButton(documentNode, 'lightTool', space, label, SPACE_TITLES[space])
    button.addEventListener('click', () => callbacks.onSpace(space))
    spaceButtons.set(space, button)
  }
  return { modeButtons, spaceButtons }
}

/** 三个旋转轴按钮（平面方向 / 安装倾斜 / 出光方向），带颜色点和角度读数。 */
function createAxisButtons(documentNode: Document, callbacks: ShellCallbacks) {
  const axisButtons = new Map<LightAxis, HTMLButtonElement>()
  const axisValues = new Map<LightAxis, HTMLSpanElement>()
  for (const axis of AXIS_ORDER) {
    const label = LIGHT_AXIS_LABELS[axis]
    const button = documentNode.createElement('button')
    button.type = 'button'
    button.dataset.lightAxis = axis
    button.style.setProperty('--light-axis-color', LIGHT_AXIS_COLORS[axis])
    button.title = `选择${label}轴（自动进入旋转模式），拖动圆环即可调整`
    button.setAttribute('aria-label', `选择${label}旋转轴`)
    button.setAttribute('aria-pressed', 'false')
    const name = documentNode.createElement('span')
    name.className = 'editor-light-toolbar-axis-name'
    name.textContent = label
    const value = documentNode.createElement('span')
    value.className = 'editor-light-toolbar-axis-value'
    button.append(name, value)
    button.addEventListener('click', () => callbacks.onAxis(axis))
    button.addEventListener('keydown', (event: KeyboardEvent) => {
      // 方向键交给全局快捷键（否则调轴时会顺带把物件挪 5cm）。
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) event.preventDefault()
    })
    axisButtons.set(axis, button)
    axisValues.set(axis, value)
  }
  return { axisButtons, axisValues }
}

/** 一行横排容器。`width: max-content` 的根节点靠它算出真实宽度，不再靠 100% 占位撑满。 */
function createRow(documentNode: Document, className: string) {
  const row = documentNode.createElement('div')
  row.className = `editor-light-toolbar-row ${className}`
  return row
}

/** 建整套工具条 DOM 并挂到宿主上。 */
export function createToolbarDom(documentNode: Document, host: HTMLElement, callbacks: ShellCallbacks): ToolbarDom {
  const root = documentNode.createElement('div')
  root.className = 'editor-light-toolbar'
  root.setAttribute('role', 'group')
  root.setAttribute('aria-label', '灯光三维操作')
  root.hidden = true
  const tools = createToolButtons(documentNode, callbacks)
  const axes = createAxisButtons(documentNode, callbacks)
  const status = documentNode.createElement('output')
  status.className = 'editor-light-status'
  status.setAttribute('aria-live', 'off')
  const axisLabel = documentNode.createElement('span')
  axisLabel.className = 'editor-light-toolbar-group-label'
  axisLabel.textContent = '旋转轴'
  const toolsRow = createRow(documentNode, 'is-tools')
  toolsRow.append(...tools.modeButtons.values(), ...tools.spaceButtons.values())
  const axesRow = createRow(documentNode, 'is-axes')
  axesRow.append(axisLabel, ...axes.axisButtons.values())
  /*
   * 三行：工具 / 旋转轴 / 状态。
   *
   * 早先用 `flex: 0 0 100%` 的「换行占位」在 `width: max-content` 的容器里会退化成
   * 「把可用宽度全吃掉」——工具条因此被撑到画布整宽，两侧留出大片空白。改成真实的行
   * 容器后，根节点的宽度由最宽那一行的内容决定，边框自然贴合内容。
   */
  root.append(toolsRow, axesRow, status)
  host.append(root)
  return {
    root,
    modeButtons: tools.modeButtons,
    spaceButtons: tools.spaceButtons,
    axisButtons: axes.axisButtons,
    axisValues: axes.axisValues,
    status,
    axisLabel,
  }
}

/**
 * 灯带工具条的交互状态机（从 `editor-light-toolbar` 拆出）。
 *
 * 两处交互都要「开始 → 移动 → 结束」三个阶段，且共用同一条提交链路（撤销快照 + 校验）：
 * - 圆环拖动：`ringRayAngle` 累计角度，5°（Alt 1°）吸附；
 * - 移动手柄：`axisRayParameter` 求位移，按轴换算平面位置 / 离地。
 *
 * 状态机只改数值并回调 `onAngle` / `onMovePose`，不碰 DOM 结构。
 */

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

/**
 * 灯带工具条的选项装配（从 `editor-3d-wiring` 拆出）。
 *
 * 只负责把 runtime 翻译成工具条需要的回调：位姿、锚点、圆环几何、提交链路。
 * 角度换算与拖动状态机在 `editor-light-gizmo*.ts` 与 `editor-light-toolbar.ts` 里。
 */

export interface ToolbarOptionDeps {
  runtime: StudioAppRuntime
  geometry: Geometry
  selection: SelectionBridge
  tx: TransactionState
  beginInteraction: () => void
  commitLights: () => void
}

/**
 * gizmo 的锚点与世界坐标（圆环中心 / 移动箭头原点都从这里出发）。
 *
 * 高度必须按 0.8.7 分成两支：
 * - 灯具 → `lS()`：就在 `elevation` 上（灯位圆点也在发光面附近，两者才对得上）；
 * - 家具 → `ec()`：包围盒中点。
 *
 * 灯具若也按 `elevation + height/2` 取中点，浅俯角下圆环会浮到灯体上方几十毫米，
 * 而灯位圆点仍在发光面，看起来就是「圆点和坐标系不是同一个地方」。
 */
function anchorOf(runtime: StudioAppRuntime, geometry: Geometry, selection: SelectionBridge): Vec3 | null {
  const id = selection.ids()[0]
  const item = id ? findItem(runtime, id) : undefined
  const plan = id ? planPointOf(runtime, id) : null
  if (!item || !plan) return null
  const elevation = isLightItem(item) ? plan.elevation : plan.elevation + Number(item.height || 0) / 2
  return geometry.toWorld(plan.x, plan.y, elevation)
}

/** 三轴圆环中心：灯具发光面 / 家具几何中心。 */
function centerOf(runtime: StudioAppRuntime, geometry: Geometry, selection: SelectionBridge): Vec3 | null {
  return anchorOf(runtime, geometry, selection)
}

/**
 * 圆环半径（米）：**固定 42 屏幕像素**（0.8.7 `(mode==='rotate'?0x2a:0x3a)/pxPerMeter`）。
 *
 * 用物件尺寸当半径会让大沙发画出直径两三米的环、小台灯缩成一个点；
 * 固定屏幕尺寸后，任何物件在任何相机距离下看到的环都一样大。
 * 像素/米必须在**锚点**上量：同一屏里俯角不同，天花板附近和地面附近的像素/米并不相等。
 */
function radiusOf(runtime: StudioAppRuntime, geometry: Geometry, selection: SelectionBridge): number {
  const anchor = anchorOf(runtime, geometry, selection)
  if (!anchor) return 0.3
  const screenPixels = screenPixelsPerMeter(runtime, geometry, anchor)
  return screenPixels > 0 ? 42 / screenPixels : 0.3
}

/** 单个灯具的圆点位置；不在当前楼层 / 投影失败时返回 `null`。 */
function markerOf(
  runtime: StudioAppRuntime,
  geometry: Geometry,
  item: Record<string, unknown>,
): { id: string; name: string; screen: { x: number; y: number } } | null {
  const id = String(item.id || '')
  const plan = id ? planPointOf(runtime, id) : null
  if (!plan) return null
  // 0.8.7 `l0()`：锚点是**发光面**上的点 —— 从安装原点沿发光法线回退 25mm（灯带 40mm）。
  // 用模型半高（elevation + height/2）会把圆点顶到灯具中段，大俯角下明显偏出灯罩。
  const { normalAxis } = lightFrame(item)
  const offset = item.type === 'striplight' ? -0.04 : -0.025
  const world = geometry.toWorld(plan.x, plan.y, plan.elevation)
  world.x += normalAxis.x * offset
  world.y += normalAxis.y * offset
  world.z += normalAxis.z * offset
  const screen = geometry.project(world)
  if (!screen) return null
  return { id, name: String(item.note || item.name || item.type || '灯光'), screen }
}

/**
 * 这一帧到底要不要画灯位圆点（0.8.7 `c0()` 的门控）：选中「可进 gizmo 的物件」/ 已放置页签 / 灯光分类，
 * 三者都不成立时连 markers 都不算。选中判定只认单选，且该物件必须在当前素材分类作用域内、未被隐藏。
 *
 * 注意这里问的是「有没有 gizmoItem」而不是「选中的是不是灯」：0.8.7 的圆环对家具同样成立，
 * 门控因此也在家具上打开——只是那种情况下 markers 里没有灯（`Di()` 把它们挡在分类外）。
 */
function showsLightMarkers(runtime: StudioAppRuntime): boolean {
  const appCtx = runtime.appCtx
  const selected = appCtx.selectedItem as { kind?: string; id?: unknown } | null | undefined
  const hasMultiSelection = (appCtx.selectedItems ?? []).length > 0
  if (selected?.kind === 'item' && !hasMultiSelection) {
    const selectedItem = findItem(runtime, String(selected.id ?? ''))
    if (
      selectedItem &&
      isItemInLibraryScope(appCtx, selectedItem) &&
      isItemShown(appCtx, selectedItem) &&
      isGizmoEligibleItem(selectedItem)
    ) {
      return true
    }
  }
  return libraryModeOf(appCtx) === 'placed' || appCtx.activeLibraryCategory === 'light'
}

/**
 * 当前楼层的灯位圆点（只列 `Di()` 成立的灯：在分类内、未隐藏、未锁定）。嵌入舞台一个都不画：
 * 那是只读交互图，灯位圆点是编辑器的选中手柄，舞台的灯由 3D 光源本身表现。
 */
function markersOf(runtime: StudioAppRuntime, geometry: Geometry) {
  if (runtime.isEmbeddedStage || !showsLightMarkers(runtime)) return []
  // 与上游一致：投影到画布外的点不参与渲染，省掉一批必然被裁掉的节点。
  // 边界必须是**叠层坐标系**（布局像素），否则整页缩放后上半屏的点会被误裁。
  const canvasSize = geometry.hostSize()
  const markers: Array<{ id: string; name: string; screen: { x: number; y: number } }> = []
  for (const item of runtime.appCtx.studioState.items as Array<Record<string, unknown>>) {
    if (!isLightItem(item)) continue
    if (!isItemEditable(runtime.appCtx, item)) continue
    const marker = markerOf(runtime, geometry, item)
    if (!marker) continue
    if (marker.screen.x < 0 || marker.screen.x > canvasSize.width) continue
    if (marker.screen.y < 0 || marker.screen.y > canvasSize.height) continue
    markers.push(marker)
  }
  return markers
}

/** 可编辑：非舞台、未锁交互、在分类内 / 未隐藏 / 未锁定、模型就绪（0.8.7 `Di()` + 模型状态）。 */
function editableOf(runtime: StudioAppRuntime, item: Record<string, unknown>): boolean {
  if (runtime.isEmbeddedStage || runtime.appCtx.isInteractionLocked) return false
  return isItemEditable(runtime.appCtx, item) && !modelPendingOf(runtime)
}

/**
 * 吸附相关的读口，单独成函数是为了不让 `createToolbarOptions` 的字面量超过 80 行
 * 也便于单独检查这些默认值。
 */
function createSnapOptions(
  runtime: StudioAppRuntime,
  geometry: Geometry,
  selectedId: () => string | null,
): SnapSensingOptions {
  return {
    // 灯带平移沿轴向吸附墙面 / 物件边缘（0.8.7 `hS()` 里的 `uh({freedom})`）：
    // 用拖动中的探针位姿参与计算，否则吸附永远按按下前的位置算。
    placementSnap: (pose, freedom) => {
      const id = selectedId()
      const item = id ? findItem(runtime, id) : null
      if (!id || !item) return null
      const result = applyPlacementSnap(runtime.appCtx, [id], geometry.mapper().pixelsPerMeter, {
        zoom: runtime.appCtx.planView?.zoom,
        freedom,
        moving: [{ ...(item as Record<string, unknown>), ...pose } as never],
      })
      return { delta: result.delta, keys: result.keys }
    },
    snapEnabled: () => runtime.isSnapEnabled?.() ?? true,
    snapAngles: () => (runtime.appCtx.studioState.settings ?? {}).snapAngles !== false,
    snapGrid: () => (runtime.appCtx.studioState.settings ?? {}).snapGrid !== false,
  }
}

export function createToolbarOptions(deps: ToolbarOptionDeps): LightToolbarOptions {
  const { runtime, geometry, selection, beginInteraction, commitLights } = deps
  // gizmo 只服务单选：0.8.7 `c0()` 同样要求 `be.length === 0`。
  // 多选时若取第一个 id，拖动圆环只会转其中一件，用户会以为「多选失效」。
  const selectedId = (): string | null => {
    const ids = selection.ids()
    return ids.length === 1 ? ids[0] : null
  }
  return {
    host: globalThis.document.getElementById('preview-3d') as HTMLElement,
    pose: () => {
      // 0.8.7 `c0()` 的 gizmoItem：单选任意物件都进 gizmo（非灯具在渲染层固定成 rotate），
      // 但必须在当前分类作用域内、未被隐藏、且类型可画圆环（`Or() && En() && lw()`）。
      // 「家居」分类下选中一盏灯在这里返回 null —— 工具条与灯位圆点因此一起消失，与上游一致。
      const id = selectedId()
      const item = id ? findItem(runtime, id) : null
      if (!id || !item) return null
      if (!isItemInLibraryScope(runtime.appCtx, item)) return null
      if (!isItemShown(runtime.appCtx, item)) return null
      if (!isGizmoEligibleItem(item)) return null
      return item as Record<string, unknown>
    },
    isLight: (pose) => isLightItem(pose as Record<string, unknown>),
    center: () => centerOf(runtime, geometry, selection),
    project: geometry.project,
    pointerRay: geometry.pointerRay,
    pixelsPerMeter: () => geometry.mapper().pixelsPerMeter,
    radius: () => radiusOf(runtime, geometry, selection),
    itemId: selectedId,
    markers: () => markersOf(runtime, geometry),
    editable: () => {
      const id = selectedId()
      const item = id ? findItem(runtime, id) : null
      return item ? editableOf(runtime, item as Record<string, unknown>) : false
    },
    minimumElevation: () => {
      const id = selectedId()
      return id ? elevationLimitsOf(runtime, id).minimum : 0
    },
    ...createSnapOptions(runtime, geometry, selectedId),
    onSelectItem: (id: string) => {
      runtime.selectSceneObject('item', id)
      runtime.refreshStudioUi?.()
      runtime.refreshStudioView?.()
    },
    onChange: (axis: LightAxis, degrees: number) => {
      const id = selectedId()
      const item = findItem(runtime, id ?? '')
      if (!id || !item) return
      // 任意一轴手调后就不再是预设安装方式，否则读档会被 `normalizeStripPoseRecord` 覆盖回去。
      // 家具没有 `stripMount`，只写角度。
      writeItemState(runtime, selection, id, (target) => {
        if (isLightItem(target)) target.stripMount = 'custom'
        target[axis] = ((degrees % 360) + 360) % 360
      })
      runtime.refreshStudioView?.()
    },
    onMovePose: (next: { x: number; y: number; elevation: number }) => {
      const id = selectedId()
      if (!id) return
      writeItemState(runtime, selection, id, (item) => {
        item.x = next.x
        item.y = next.y
        item.elevation = next.elevation
      })
      const object = selection.liveObject(id)
      if (object) {
        const world = geometry.toWorld(next.x, next.y, next.elevation)
        ;(object.position as { set: (x: number, y: number, z: number) => void }).set(world.x, world.y, world.z)
      }
      runtime.refreshStudioView?.()
    },
    onBegin: () => {
      beginInteraction()
    },
    onEnd: () => {
      commitLights()
    },
  }
}

/**
 * 灯带 gizmo 的 DOM（0.8.7 `createEditorLightGizmo` 的视图部分）。
 *
 * 与 `editor-light-toolbar` 的分工：
 * - 本模块只建 SVG（圆环 / 箭头 + 手柄 + 灯位圆点）并维护它们的路径与状态类；
 * - 角度换算、滑杆、提交链路仍在工具条里，命中后回调同一个入口。
 *
 * 为什么 SVG 而不是 DOM 绝对定位：圆环是二维折线，SVG 的 `path` 一条就够，
 * 用 div 拼 40 段会多出 120 个节点且缩放时线宽会漂。
 */

const SVG_NS = 'http://www.w3.org/2000/svg'

export interface LightGizmoMarker {
  id: string
  name: string
  screen: { x: number; y: number }
}

export interface LightGizmoRenderState {
  /** `null` / 空数组表示这次不画手柄（例如 move 模式下轴不可用），但灯位圆点仍可保留。 */
  handles: GizmoHandleSpec[] | null
  mode: 'move' | 'rotate'
  space: 'world' | 'local'
  rotationAxis: LightAxis
  editable: boolean
  /** 当前选中灯 id（灯位圆点 aria-pressed）。 */
  itemId: string | null
  width: number
  height: number
}

export interface LightGizmoViewOptions {
  host: HTMLElement
  /** 当前楼层的灯位（屏幕坐标）。 */
  markers: () => LightGizmoMarker[]
  onSelectItem: (id: string) => void
  /** 手柄拖动：角度增量由工具条统一换算，视图只报指针事件阶段。 */
  onAxisPointer: (handle: GizmoHandleSpec, phase: 'begin' | 'move' | 'end', event: PointerEvent) => void
  /** 手柄获得焦点 / 被点击：同步高亮对应轴。 */
  onAxisFocus: (axis: LightAxis) => void
}

export interface LightGizmoView {
  render: (state: LightGizmoRenderState | null) => void
  dispose: () => void
}

/**
 * 屏幕坐标 → SVG 属性文本。
 *
 * **不取整**：0.8.7 一律把投影得到的浮点数原样写进 `cx/cy/x/y`。取整会让灯位圆点
 * 只能按 1px 台阶移动，相机连续旋转 / 缩放时整层圆点「一跳一跳」，而圆环路径是 0.1px
 * 精度 —— 两者一动一静，看起来就是灯光图在抖。浮点写法的浏览器光栅化本来就是抗锯齿的，
 * 不需要（也不该）手工对齐像素。
 */
function pointText(value: number): string {
  return Number.isFinite(value) ? String(value) : '0'
}

/** gizmo 内部持久的节点表。 */
interface GizmoNodes {
  svg: SVGSVGElement
  handleLayer: SVGGElement
  pointLayer: SVGGElement
  handles: Map<string, HandleNodes>
  points: Map<string, SVGCircleElement>
  /** 拖动状态：一次只允许拖一根轴。 */
  dragging: { spec: GizmoHandleSpec; pointerId: number } | null
}

interface HandleNodes {
  group: SVGGElement
  hit: SVGPathElement
  line: SVGPathElement
  head: SVGPathElement
  label: SVGTextElement
  spec: GizmoHandleSpec
}

function createLayer(documentNode: Document, svg: SVGSVGElement, className: string): SVGGElement {
  const layer = documentNode.createElementNS(SVG_NS, 'g')
  layer.classList.add(className)
  svg.append(layer)
  return layer
}

/** 建一组手柄节点（0.8.7 的 `g > path.light-handle-hit + line + head + text.label`）。 */
function createHandleGroup(documentNode: Document, spec: GizmoHandleSpec): HandleNodes {
  const group = documentNode.createElementNS(SVG_NS, 'g')
  group.dataset.lightHandle = spec.key
  group.setAttribute('role', 'slider')
  group.setAttribute('tabindex', '0')
  group.setAttribute('aria-label', spec.label)
  const hit = documentNode.createElementNS(SVG_NS, 'path')
  hit.classList.add('light-handle-hit')
  const line = documentNode.createElementNS(SVG_NS, 'path')
  line.classList.add('light-handle-line')
  const head = documentNode.createElementNS(SVG_NS, 'path')
  head.classList.add('light-handle-head')
  const label = documentNode.createElementNS(SVG_NS, 'text')
  label.classList.add('light-handle-label')
  group.append(hit, line, head, label)
  return { group, hit, line, head, label, spec }
}

/** 手柄的指针事件：只在本组按下的那一根上继续跟随。 */
function bindHandlePointer(nodes: HandleNodes, gizmo: GizmoNodes, options: LightGizmoViewOptions): void {
  const resolve = (): GizmoHandleSpec | null => gizmo.handles.get(String(nodes.group.dataset.lightHandle))?.spec ?? null
  nodes.hit.addEventListener('pointerdown', (event: PointerEvent) => {
    if (event.button !== 0) return
    const spec = resolve()
    if (!spec) return
    event.preventDefault()
    event.stopPropagation()
    gizmo.dragging = { spec, pointerId: event.pointerId }
    nodes.group.setPointerCapture?.(event.pointerId)
    if (spec.field) options.onAxisFocus(spec.field)
    options.onAxisPointer(spec, 'begin', event)
  })
  nodes.group.addEventListener('pointermove', (event: PointerEvent) => {
    if (!gizmo.dragging || gizmo.dragging.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    options.onAxisPointer(gizmo.dragging.spec, 'move', event)
  })
  const finish = (event: PointerEvent): void => {
    if (!gizmo.dragging || gizmo.dragging.pointerId !== event.pointerId) return
    const spec = gizmo.dragging.spec
    gizmo.dragging = null
    nodes.group.releasePointerCapture?.(event.pointerId)
    options.onAxisPointer(spec, 'end', event)
  }
  nodes.group.addEventListener('pointerup', finish)
  nodes.group.addEventListener('pointercancel', finish)
  nodes.group.addEventListener('focus', () => {
    const spec = resolve()
    if (spec?.field) options.onAxisFocus(spec.field)
  })
}

/** 灯位圆点：按下 = 选中该灯（不进入拖动）。 */
function createPointNode(
  documentNode: Document,
  marker: LightGizmoMarker,
  options: LightGizmoViewOptions,
): SVGCircleElement {
  const circle = documentNode.createElementNS(SVG_NS, 'circle')
  circle.classList.add('editor-light-point')
  circle.dataset.editorLightId = marker.id
  circle.setAttribute('r', '6')
  circle.setAttribute('role', 'button')
  const pick = (event: Event): void => {
    event.preventDefault()
    event.stopPropagation()
    options.onSelectItem(marker.id)
  }
  circle.addEventListener('pointerdown', pick)
  circle.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') pick(event)
  })
  return circle
}

/** 渲染灯位圆点；返回本次可见的 id 集合。 */
function renderPoints(
  gizmo: GizmoNodes,
  documentNode: Document,
  options: LightGizmoViewOptions,
  itemId: string | null,
): boolean {
  const visible = new Set<string>()
  for (const marker of options.markers()) {
    visible.add(marker.id)
    const circle = gizmo.points.get(marker.id) ?? createPointNode(documentNode, marker, options)
    if (!gizmo.points.has(marker.id)) {
      gizmo.pointLayer.append(circle)
      gizmo.points.set(marker.id, circle)
    }
    // 圆点坐标**不取整**（0.8.7 `setAttribute('cx', screen.x)` 原样写浮点）：
    // 取整会让圆点只能按 1px 台阶移动，相机连续旋转 / 缩放时整层灯位会「一格一格跳」，
    // 与下面用 0.1px 精度画出的圆环互相错开，看上去就是灯光图在抖。
    circle.setAttribute('cx', pointText(marker.screen.x))
    circle.setAttribute('cy', pointText(marker.screen.y))
    circle.setAttribute('aria-label', `选择灯光 ${marker.name}`)
    circle.setAttribute('aria-pressed', String(marker.id === itemId))
  }
  for (const [id, circle] of gizmo.points) {
    if (visible.has(id)) continue
    circle.remove()
    gizmo.points.delete(id)
  }
  return visible.size > 0
}

/** 同步一组手柄的路径与状态类。 */
function renderHandleSpec(nodes: HandleNodes, spec: GizmoHandleSpec, state: LightGizmoRenderState): void {
  // 旋转模式只让「当前选中的轴」可交互：三圈同时可点会互相抢命中。
  const inactive = spec.kind === 'rotate' && spec.field !== null && spec.field !== state.rotationAxis
  nodes.spec = spec
  nodes.group.style.display = ''
  nodes.group.style.setProperty('--light-axis-color', spec.color)
  nodes.group.classList.toggle('is-inactive-axis', inactive)
  nodes.group.classList.toggle('is-selected-axis', spec.kind === 'rotate' && !inactive)
  nodes.group.classList.toggle('disabled', !state.editable)
  nodes.group.setAttribute('aria-disabled', String(!state.editable || inactive))
  nodes.group.setAttribute('tabindex', inactive ? '-1' : '0')
  nodes.hit.setAttribute('d', spec.path)
  nodes.line.setAttribute('d', spec.path)
  nodes.head.setAttribute('d', spec.head)
  nodes.label.textContent = spec.short
  nodes.label.setAttribute('x', pointText(spec.labelPoint.x))
  nodes.label.setAttribute('y', pointText(spec.labelPoint.y))
  nodes.label.style.display = ''
}

/** 渲染手柄（按 key 复用节点）。 */
function renderHandles(
  gizmo: GizmoNodes,
  documentNode: Document,
  options: LightGizmoViewOptions,
  state: LightGizmoRenderState,
): void {
  const visible = new Set<string>()
  for (const spec of state.handles ?? []) {
    visible.add(spec.key)
    let nodes = gizmo.handles.get(spec.key)
    if (!nodes) {
      nodes = createHandleGroup(documentNode, spec)
      gizmo.handleLayer.append(nodes.group)
      bindHandlePointer(nodes, gizmo, options)
      gizmo.handles.set(spec.key, nodes)
    }
    renderHandleSpec(nodes, spec, state)
  }
  for (const [key, nodes] of gizmo.handles) {
    if (visible.has(key)) continue
    nodes.group.style.display = 'none'
  }
}

/**
 * 清掉所有手柄节点。
 *
 * 必须有这一支：没有手柄的帧（取消选中、灯具被隐藏）**不能只是跳过渲染** ——
 * 灯位圆点还让 svg 保持可见，上一帧的箭头就会留在画面上「点得到但拖不动」。
 * 0.8.7 的 render 也是无条件遍历节点表把不在本次集合里的组 `display:none`。
 */
function hideAllHandles(gizmo: GizmoNodes): void {
  for (const nodes of gizmo.handles.values()) nodes.group.style.display = 'none'
}

export function createLightGizmoView(options: LightGizmoViewOptions): LightGizmoView {
  const documentNode = options.host.ownerDocument
  const svg = documentNode.createElementNS(SVG_NS, 'svg')
  svg.classList.add('editor-light-gizmo')
  svg.toggleAttribute('hidden', true)
  svg.setAttribute('aria-hidden', 'true')
  // 先建手柄层再建灯位层：灯位圆点要压在圆环上面，才能点得中。
  const gizmo: GizmoNodes = {
    svg,
    handleLayer: createLayer(documentNode, svg, 'editor-light-handles'),
    pointLayer: createLayer(documentNode, svg, 'editor-light-points'),
    handles: new Map(),
    points: new Map(),
    dragging: null,
  }
  options.host.append(svg)

  return {
    render(state) {
      if (!state) {
        svg.toggleAttribute('hidden', true)
        hideAllHandles(gizmo)
        renderPoints(gizmo, documentNode, options, null)
        return
      }
      const hasHandles = Boolean(state.handles?.length)
      // viewBox 每帧都写（0.8.7 同）：即使这次没有手柄、只剩灯位圆点，
      // 缩放过的主机也必须用当前尺寸重新映射，否则圆点会按旧 viewBox 的比例被拉伸。
      svg.setAttribute('viewBox', `0 0 ${Math.max(1, state.width)} ${Math.max(1, state.height)}`)
      const hasPoints = renderPoints(gizmo, documentNode, options, state.itemId)
      // 没有手柄时也要走一遍渲染，把上一帧的箭头清掉（见 `hideAllHandles` 的说明）。
      if (hasHandles) renderHandles(gizmo, documentNode, options, state)
      else hideAllHandles(gizmo)
      // 没有手柄时仍然保留灯位圆点（上游只在「没有灯具」时整块隐藏）。
      svg.toggleAttribute('hidden', !hasHandles && !hasPoints)
    },
    dispose() {
      gizmo.dragging = null
      svg.remove()
      gizmo.handles.clear()
      gizmo.points.clear()
    },
  }
}

/**
 * 灯带方向工具条（0.8.7 `createEditorLightGizmo` 的工具条部分）。
 *
 * 0.8.7 的形态：**固定在画布左上角**的一条横排容器，含
 * `移动 / 旋转 / 世界轴 / 自身轴`、三个 `button[data-light-axis]`、`output.editor-light-status`。
 * 它不是跟着灯位浮动的：跟随式面板会随灯带跑，把「当前在操作什么轴」的上下文一起带走。
 *
 * 本实现的三处行为约定（都有对应注释）：
 * - 点轴按钮**直接进入旋转模式**，不再要求先点「旋转」（旧逻辑里轴按钮在移动模式下永远置灰）；
 * - 轴的高亮只在旋转模式下成立，移动模式不假装「已经在转」；
 * - Esc / 工作区切换会**回滚**进行中的拖动，而不是把半成品角度提交下去。
 *
 * 拆分：DOM 在 `editor-light-toolbar-dom`，交互状态机在 `editor-light-toolbar-handles`，
 * 本文件只做「状态默认值 + 按钮同步 + 渲染」。
 */

export interface LightToolbarOptions extends SnapSensingOptions {
  host: HTMLElement
  /**
   * 当前单选的物件位姿；没有单选时返回 `null`。
   *
   * 不只是灯具：0.8.7 的 `createEditorLightGizmo` 由 3D 叠层创建，选中的家具
   * 也会拿到旋转环（标签「平面旋转」），只是不显示工具条。
   */
  pose: () => LightPoseLike | null
  /** 这个位姿是不是灯具（决定工具条显隐与默认模式）。 */
  isLight?: (pose: LightPoseLike) => boolean
  /** 灯带中心的世界坐标（画三轴圆环用）。 */
  center?: () => Vec3 | null
  /** 世界 → 画布内屏幕坐标。 */
  project?: (world: Vec3) => { x: number; y: number } | null
  /** 指针 → 世界射线。 */
  pointerRay?: (clientX: number, clientY: number) => Ray | null
  /** 当前楼层的灯位圆点。 */
  markers?: () => LightGizmoMarker[]
  /** 点灯位圆点时的选中回调。 */
  onSelectItem?: (id: string) => void
  /** 当前选中灯带的 id。 */
  itemId?: () => string | null
  /** 圆环半径（米）。 */
  radius?: () => number
  /** 圆环改某个轴的角度（度，已归一化）。 */
  onChange: (axis: LightAxis, degrees: number) => void
  /** 移动手柄：把灯带平移到新的平面位置 / 离地高度。 */
  onMovePose?: (pose: { x: number; y: number; elevation: number }) => void
  /** 一次拖动开始的钩子（记撤销快照）。 */
  onBegin: () => void
  /** 一次拖动结束的钩子（校验 + 提交）。 */
  onEnd: () => void
  /** 最小离地高度（由灯具类型决定）。 */
  minimumElevation?: () => number
  /** 像素/米：移动手柄把世界位移换算成平面像素。 */
  pixelsPerMeter?: () => number
  /** 当前是否可编辑（锁定 / 隐藏 / 模型准备中时为 false）。 */
  editable?: () => boolean
}

export interface LightToolbar {
  update: () => void
  /** 中止进行中的拖动（Esc / 工作区切换 / 场景重建）：位姿回到按下前，无拖动时是空操作。 */
  cancel: () => void
  dispose: () => void
}

/** 轴按钮上的实时角度读数：归一化到 0–360°，没有数值时留空。 */
function axisValueText(pose: LightPoseLike | null, axis: LightAxis): string {
  const value = Number(pose?.[axis])
  if (!pose || !Number.isFinite(value)) return ''
  return `${editNumberText(((value % 360) + 360) % 360)}°`
}

/** 三个轴按钮的态与读数（单独成函数，避免主同步函数继续变长）。 */
function syncAxisButtons(
  dom: ToolbarDom,
  pose: LightPoseLike | null,
  options: { isStrip: boolean; effectiveAxis: LightAxis; rotating: boolean; editable: boolean },
): void {
  for (const [candidate, button] of dom.axisButtons) {
    button.hidden = candidate !== 'rotation' && !options.isStrip
    button.disabled = !options.editable
    button.setAttribute('aria-pressed', String(options.rotating && candidate === options.effectiveAxis))
    const value = dom.axisValues.get(candidate)
    if (!value) continue
    const text = axisValueText(pose, candidate)
    // 每秒会刷新多帧，只在读数真的变了才写 DOM，避免无谓的样式重算。
    if (value.textContent !== text) value.textContent = text
  }
}

/**
 * 按钮态同步：四个工具按钮 + 三个轴按钮。
 *
 * 三条口径：
 * - 轴按钮**永不因模式变灰**：点它本身就是「切到旋转并用这根轴」的入口；
 * - 轴的高亮只在旋转模式下成立 —— 移动模式下圆环不存在，仍高亮会让人以为已经在转；
 * - 不可编辑（锁定 / 隐藏 / 模型准备中）时全部按钮置灰，与环的 `disabled` 态一致。
 */
function syncButtons(
  dom: ToolbarDom,
  state: { mode: LightMode; space: LightSpace; axis: LightAxis },
  pose: LightPoseLike | null,
  editable: boolean,
): void {
  const isStrip = pose?.type === 'striplight'
  // 非灯带只有「平面方向」一个自由度：默认轴要落到它身上，否则 aria-pressed 会指向一个看不见的按钮。
  const effectiveAxis: LightAxis = isStrip ? state.axis : 'rotation'
  const rotating = state.mode === 'rotate'
  for (const [candidate, button] of dom.modeButtons) {
    // 上游：只有灯带才有「旋转」（三轴圆环）；非灯带只有平移。
    if (candidate === 'rotate') button.hidden = !isStrip
    button.disabled = !editable
    button.setAttribute('aria-pressed', String(candidate === state.mode))
  }
  for (const [candidate, button] of dom.spaceButtons) {
    // 不再隐藏：隐藏会让第一行变窄、整块面板跟着跳一格。移动模式下才有意义 → 置灰。
    button.disabled = !editable || rotating
    button.setAttribute('aria-pressed', String(rotating ? false : candidate === state.space))
  }
  syncAxisButtons(dom, pose, { isStrip, effectiveAxis, rotating, editable })
}

/** 工具条的长提示放在 `title` 上（上游同）：写进 `output` 会把容器撑到画布整宽。 */
const TOOLBAR_TITLE =
  '拖动箭头移动；点「旋转轴」里的彩色按钮直接进入旋转，再拖动加粗圆环。Alt 精调，S 暂停吸附，Esc 取消。'

/**
 * 状态条的静止文案（0.8.7 `fS().text`）：类型化离地，例如 `光源安装高度 3.50 m`。
 *
 * 拖动期间由 `onStatus` 覆盖成「平面方向 45°」/「移动 X 轴」这类即时反馈。
 */
function idleStatusText(pose: LightPoseLike): string {
  const elevation = Number(pose.elevation)
  return `${itemElevationMeaning(pose.type).label} ${editNumberText(Number.isFinite(elevation) ? elevation : 0)} m`
}

/** 当前状态：模式 / 轴空间 / 激活轴（默认对齐上游 move + local + 出光方向）。 */
interface ToolbarState {
  mode: LightMode
  space: LightSpace
  axis: LightAxis
}

/** 没有单选时：不画手柄，但灯位圆点仍要渲染（gizmo 自己判断该不该隐藏）。 */
function renderEmptyGizmo(options: LightToolbarOptions, gizmo: LightGizmoView, state: ToolbarState): void {
  gizmo.render({
    handles: [],
    mode: state.mode,
    space: state.space,
    rotationAxis: state.axis,
    editable: false,
    itemId: null,
    width: options.host.clientWidth,
    height: options.host.clientHeight,
  })
}

/** 灯具专属的工具条状态（家具不显示工具条，只借 gizmo 的旋转环）。 */
function syncLightChrome(
  dom: ToolbarDom,
  pose: LightPoseLike,
  state: ToolbarState,
  mode: LightMode,
  dragging: boolean,
  editable: boolean,
): void {
  // 没选中灯时按钮态也要同步（模式 / 轴空间的静态高亮），否则 aria 全是 null。
  // 传的是**生效模式**而不是 `state.mode`：非灯带被强制成 move，按钮的显隐要跟着它走。
  syncButtons(dom, { mode, space: state.space, axis: state.axis }, pose, editable)
  // 静止时状态条只放短文案；长提示挂在容器 `title` 上（上游 `_0x3ac24a['title']`）。
  dom.root.title = TOOLBAR_TITLE
  dom.root.toggleAttribute('data-dragging', dragging)
  if (!dragging) dom.status.textContent = idleStatusText(pose)
}

/** 这一帧的 gizmo 手柄：家具只有旋转环 + 中心十字，灯具按当前模式出箭头/圆环。 */
function gizmoHandlesOf(
  options: LightToolbarOptions,
  pose: LightPoseLike,
  mode: LightMode,
  isLight: boolean,
  space: LightSpace,
): ReturnType<typeof lightGizmoHandles> {
  const center = options.center?.()
  const project = options.project
  if (!center || !project) return []
  return lightGizmoHandles({
    center,
    pose,
    radius: options.radius?.() ?? 0.3,
    project,
    mode,
    space,
    rotationLabel: isLight ? '平面方向' : '平面旋转',
    planeCenter: !isLight,
  })
}

/** 渲染一次：按钮态、圆环手柄、灯位圆点。 */
function renderToolbar(
  options: LightToolbarOptions,
  dom: ToolbarDom,
  gizmo: LightGizmoView,
  state: ToolbarState,
  dragging: boolean,
): void {
  const pose = options.pose()
  if (!pose) {
    dom.root.hidden = true
    renderEmptyGizmo(options, gizmo, state)
    return
  }
  const isLight = options.isLight?.(pose) ?? true
  // 工具条只属于灯具；家具只借 gizmo 的旋转环（0.8.7 同）。
  dom.root.hidden = !isLight
  // 0.8.7 `c0()`：非灯具没有 move 模式，圆环固定为 rotate（标签「平面旋转」）。
  // 非灯带灯具的「旋转」按钮藏起来（三轴里只剩平面方向），但点「平面方向」轴按钮
  // 仍可进入 rotate 看平面圆环；换选到非灯带时 `update` 会把模式复位成 move，
  // 所以不会出现「在灯带上切到 rotate 后再选吸顶灯、画面只剩圆环」的情况。
  const mode: LightMode = isLight ? state.mode : 'rotate'
  /*
   * 轴按钮与圆环必须用**同一个**生效轴：非灯带只剩「平面方向」一根环，
   * 若这里仍传 `state.axis`（默认还是 `stripRollRotation`），那唯一的一根环会被
   * gizmo 判成「非当前轴」而变灰、不可拖 —— 看起来就是「旋转模式没反应」。
   */
  const rotationAxis: LightAxis = pose.type === 'striplight' ? state.axis : 'rotation'
  const editable = options.editable?.() ?? true
  if (isLight) syncLightChrome(dom, pose, state, mode, dragging, editable)
  gizmo.render({
    handles: gizmoHandlesOf(options, pose, mode, isLight, state.space),
    mode,
    space: state.space,
    rotationAxis,
    editable,
    itemId: options.itemId?.() ?? null,
    width: options.host.clientWidth,
    height: options.host.clientHeight,
  })
}

/** 拖动状态机的选项（从工厂函数里提出来，主函数才不会超长）。 */
function createMachineOptions(
  options: LightToolbarOptions,
  dom: ToolbarDom,
  onSettled: () => void,
): Parameters<typeof createHandleStateMachine>[0] {
  return {
    pose: options.pose,
    center: () => options.center?.() ?? null,
    pointerRay: options.pointerRay,
    pixelsPerMeter: options.pixelsPerMeter,
    minimumElevation: options.minimumElevation,
    placementSnap: options.placementSnap,
    snapEnabled: options.snapEnabled,
    snapAngles: options.snapAngles,
    snapGrid: options.snapGrid,
    onBegin: options.onBegin,
    // 松手后立刻回刷一次：拖动的即时文案要换成静止文案，轴读数也要落到最终值。
    onEnd: () => {
      options.onEnd()
      onSettled()
    },
    onAngle: options.onChange,
    onMovePose: options.onMovePose,
    onStatus: (text) => {
      dom.status.textContent = text
    },
  }
}

/**
 * Esc 取消进行中的拖动。
 *
 * 工具条的 `title` 从 0.8.7 起就写着「Esc 取消」，但全局快捷键只认绘图工具 / 对齐，
 * 拖动中的 gizmo 从来没人接这一下。捕获阶段接管，顺便阻止冒泡 —— 否则同一次 Esc
 * 会继续走到全局处理器，把相机视角也一起复位了。返回解绑函数。
 */
function bindEscapeCancel(documentNode: Document, cancel: () => void, dragging: () => boolean): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !dragging()) return
    event.preventDefault()
    event.stopPropagation()
    cancel()
  }
  documentNode.addEventListener('keydown', onKeyDown, true)
  return () => documentNode.removeEventListener('keydown', onKeyDown, true)
}

export function createLightToolbar(options: LightToolbarOptions): LightToolbar {
  const documentNode = options.host.ownerDocument
  const state: ToolbarState = { mode: 'move', space: 'local', axis: 'stripRollRotation' }
  /** 上一次的选中对象签名：换选到非灯带时把模式复位成 move（见 `renderToolbar`）。 */
  let lastPoseKey = ''
  const update = (): void => {
    const pose = options.pose()
    if (!pose) {
      lastPoseKey = ''
    } else {
      const key = `${options.itemId?.() ?? ''}|${String(pose.type ?? '')}`
      if (key !== lastPoseKey) {
        lastPoseKey = key
        // 非灯带只剩「平面方向」一个环，先给回移动箭头；想转再点那个轴按钮。
        if (pose.type !== 'striplight') state.mode = 'move'
      }
    }
    renderToolbar(options, dom, gizmo, state, machine.dragging)
  }
  const dom = createToolbarDom(documentNode, options.host, {
    onMode: (next) => {
      state.mode = next
      update()
    },
    onSpace: (next) => {
      state.space = next
      update()
    },
    onAxis: (axis) => {
      // 点轴按钮即进入旋转模式 —— 旧逻辑要先点「旋转」，轴按钮在移动模式下全是灰的。
      state.mode = 'rotate'
      state.axis = axis
      update()
    },
  })

  const machine: HandleStateMachine = createHandleStateMachine(createMachineOptions(options, dom, update))

  const gizmo: LightGizmoView = createLightGizmoView({
    host: options.host,
    markers: () => options.markers?.() ?? [],
    onSelectItem: (id) => options.onSelectItem?.(id),
    onAxisFocus: (axis) => {
      state.axis = axis
      update()
    },
    onAxisPointer: (spec, phase, event) => machine.handlePointer(spec, phase, event),
  })

  const unbindEscape = bindEscapeCancel(
    documentNode,
    () => {
      machine.cancel()
      update()
    },
    () => machine.dragging,
  )

  return {
    update,
    cancel() {
      machine.cancel()
      update()
    },
    dispose() {
      unbindEscape()
      gizmo.dispose()
      dom.root.remove()
    },
  }
}
