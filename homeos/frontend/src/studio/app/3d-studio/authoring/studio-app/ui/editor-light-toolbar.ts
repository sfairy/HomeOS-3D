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
import type { LightAxis, LightPoseLike } from '../interaction/editor-light-gizmo'
import { itemElevationMeaning } from '../../../loaders/studio-normalization'
import { editNumberText } from '../../studio-edit-metrics'
import { lightGizmoHandles } from '../interaction/editor-light-gizmo-paths'
import type { Ray, Vec3 } from '../interaction/editor-3d-gesture'
import { createLightGizmoView, type LightGizmoMarker, type LightGizmoView } from './editor-light-gizmo-view'
import { createToolbarDom, type ToolbarDom } from './editor-light-toolbar-dom'
import { createHandleStateMachine, type HandleStateMachine } from './editor-light-toolbar-handles'
import type { LightMode, LightSpace, SnapSensingOptions } from './editor-light-toolbar-types'

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
