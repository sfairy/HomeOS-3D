/**
 * 3D 视口内的编辑叠层（0.8.7 `createEditor3DOverlay` 的对应实现）。
 *
 * 变更清单的原话是「可直接在 3D 画面中移动、旋转物件和调整离地高度」。落地方式是
 * **在画布上加一层 DOM 叠层 + 指针手势**，而不是往 WebGL 里塞 gizmo：
 * 手柄要显示数值、要能聚焦、要跟随 DPI 缩放，DOM 做这些比在 canvas 里画便宜得多。
 *
 * 与 OrbitControls 的关系是这个模块最需要小心的地方（0.8.7 同）：
 * - 画布上的**左键按下** → 只记下按下点并亮中心十字，不改选择、不拦截事件，OrbitControls 照常转视角；
 * - 左键**抬起且位移 < 4px** → 才算一次点击：用抬起位置拾取，命中就选中、点空白才取消选择；
 * - 物件的位置 / 旋转 / 离地只走手柄（`button.editor-height-arrow` 与灯带 gizmo 的圆环箭头），
 *   不靠「拖物件本体」——否则同一次左键拖动既想转视角又想搬东西。
 *
 * 「按下不改选择、松开才算点击」不是细节：0.8.7 的拾取监听挂在 `renderer.domElement`
 * 的 **pointerup** 上，且要求位移 < 4px。若改成 pointerdown 立刻判定，按住拖动转个视角、
 * 或点到宿主里的基础光面板 / 切换条，都会把选中项连同离地箭头、旋转环一起清掉 ——
 * 相机还能转（灯位圆点跟着走），但 gizmo 已经没了，看起来就是「坐标系不跟随」。
 *
 * 手势状态机在 `interaction/editor-3d-drag.ts`，几何在 `editor-3d-gesture.ts`；
 * 这里只负责 DOM、事件注册与手柄定位。
 *
 * DOM 契约与 0.8.7 **完全一致**，只有四个节点：
 * `button.editor-height-arrow`（内含 `span.editor-height-arrow-shape`）、
 * `span.editor-height-value`、`div.editor-orbit-marker`、`span.editor-orbit-caption`。
 * 本项目的旋转手柄与物件信息标签已按上游删除。
 */
import type { EditorPick } from '../interaction/editor-picking'
import type { Vec3 } from '../interaction/editor-3d-gesture'
import { snapEditorRotation } from '../interaction/editor-3d-gesture'
import {
  createDragController,
  NUDGE_STEP_METERS,
  ROTATE_STEP_DEGREES,
  type DragController,
  type DragControllerOptions,
  type GestureKind,
} from '../interaction/editor-3d-drag'
import { layoutEditorLabels, type EditorLabelAnchor, type EditorLabelPlacement } from './editor-labels'

/** 中心十字在「没有选中项 / 拖动中」时的展示时长（0.8.7 的 1400ms）。 */
const ORBIT_MARKER_DURATION_MS = 1400
/** 标签相对锚点的首选偏移（像素，与上游 `+12 / +5` 一致）。 */
const LABEL_OFFSET_X = 12
const LABEL_OFFSET_Y = 5

/** 叠层读取的状态（0.8.7 `fS()` 的返回值）。 */
export interface EditorOverlayRead {
  item: unknown
  /** 物件（顶面）中心的世界坐标。 */
  point: Vec3
  /** 物件顶面中心在画布内的屏幕坐标。 */
  screen: { x: number; y: number }
  angle: number
  length: number
  tip: { x: number; y: number }
  editable: boolean
  /** 不可编辑的原因（模型准备中 / 锁定 / 隐藏）。 */
  reason: string
  axisAvailable: boolean
  /** 例：`底部离地 0.54 m`。 */
  text: string
  /** 离地手势的竖直轴锚点（物件底面中心）。 */
  basePoint: Vec3
  /** 顶面（手柄锚点）的世界高度（米）。 */
  topElevation: number
}

/**
 * 叠层选项 = 拖动手势需要的全部回调（`DragControllerOptions`）+ 叠层自身需要的 DOM / 投影。
 *
 * 直接继承而不是重抄一遍：两边字段名完全一致，抄两份只会在改签名时漏掉一处。
 */
export interface Editor3DOverlayOptions extends DragControllerOptions {
  /** 叠层的宿主（通常是 `#preview-3d`）。 */
  host: HTMLElement
  /** 事件源（three 的 canvas）。 */
  canvas: HTMLCanvasElement
  /** 读取当前叠层状态；`null` 表示不显示。 */
  read: () => EditorOverlayRead | null
  /** 指针 → 命中的物件。 */
  pickAt: (clientX: number, clientY: number) => EditorPick | null
  /** 选中 / 取消选中（`additive` = Shift 追加）。 */
  select: (pick: EditorPick | null, additive: boolean) => void
  /** 当前是否允许在 3D 视口里编辑（例如嵌入舞台只读）。 */
  isEditable: () => boolean
  /** 双击聚焦物件（0.8.7 双击 = 把相机对准它）。 */
  focusItem?: (id: string) => void
  /**
   * 拖动期间的「中心十字」锚点（0.8.7 `orbitPoint`）：返回屏幕坐标与文案。
   * 未提供或不返回时隐藏；文案由调用方区分「物件中心 / 光源中心 / 视图中心」。
   */
  orbitPoint?: () => { x: number; y: number; label: string } | null
  /** 标签避让的障碍物（切换条 / 灯带工具条），坐标相对宿主。 */
  obstacles?: () => Array<{ left: number; right: number; top: number; bottom: number }>
  onError?: (message: string) => void
}

export interface Editor3DOverlay {
  update: () => void
  /** 结束进行中的拖动（工作区切换 / 场景重建 / 窗口失焦）；无手势时是空操作。 */
  cancel: () => void
  /** 拖动中 / 刚结束的短暂时间里画中心十字。 */
  showOrbit: () => void
  /** 当前是否有 3D 拖动手势进行中（标尺等叠层据此避让）。 */
  isDragging: () => boolean
  dispose: () => void
}

/** 叠层的 DOM 句柄（与上游四个节点一一对应）。 */
interface OverlayDom {
  root: HTMLElement
  /** 0.8.7 契约：`button.editor-height-arrow`（内部 `span.editor-height-arrow-shape`）。 */
  heightArrow: HTMLButtonElement
  /** 0.8.7 契约：`span.editor-height-value`（离地数值，独立于按钮）。 */
  heightValue: HTMLElement
  orbitMarker: HTMLElement
  orbitCaption: HTMLElement
}

function createOverlayDom(documentNode: Document, host: HTMLElement): OverlayDom {
  const root = documentNode.createElement('div')
  root.className = 'editor-3d-overlay'
  root.setAttribute('aria-hidden', 'true')

  // 高度箭头：0.8.7 用「按钮 + 内部形状」而不是一个圆点 —— 形状是竖条，
  // 长度由 `--editor-height-length` 控制，方向由 `--editor-height-angle` 控制。
  const heightArrow = documentNode.createElement('button')
  heightArrow.type = 'button'
  heightArrow.className = 'editor-height-arrow'
  heightArrow.setAttribute('aria-label', '拖动调整离地高度')
  heightArrow.tabIndex = -1
  const heightShape = documentNode.createElement('span')
  heightShape.className = 'editor-height-arrow-shape'
  heightShape.setAttribute('aria-hidden', 'true')
  heightArrow.append(heightShape)

  const heightValue = documentNode.createElement('span')
  heightValue.className = 'editor-height-value'
  heightValue.hidden = true

  const orbitMarker = documentNode.createElement('div')
  orbitMarker.className = 'editor-orbit-marker'
  orbitMarker.hidden = true
  orbitMarker.setAttribute('aria-hidden', 'true')

  const orbitCaption = documentNode.createElement('span')
  orbitCaption.className = 'editor-orbit-caption'
  orbitCaption.hidden = true
  orbitCaption.setAttribute('aria-hidden', 'true')

  root.append(heightArrow, heightValue, orbitMarker, orbitCaption)
  host.append(root)
  return { root, heightArrow, heightValue, orbitMarker, orbitCaption }
}

function placeHandle(element: HTMLElement, x: number, y: number): void {
  // 不取整：0.8.7 直接写 `style.left = screen.x + 'px'`。取整会让手柄 / 数值牌
  // 只能按 1px 台阶跳动，相机连续旋转时与圆环（0.1px 精度）不同步，看起来在抖。
  element.style.left = `${Number.isFinite(x) ? x : 0}px`
  element.style.top = `${Number.isFinite(y) ? y : 0}px`
}

/** 当前是否处于「拖动中 / 刚结束」窗口（决定中心十字显不显示）。 */
function orbitOf(
  options: Editor3DOverlayOptions,
  drag: DragController,
  orbitUntil: number,
): { x: number; y: number; label: string } | null {
  const active = Boolean(drag.current()) || Date.now() < orbitUntil
  return active ? (options.orbitPoint?.() ?? null) : null
}

/**
 * 组装这一帧需要避让排版的标签（与上游同一组）：高度数值 + 中心十字文案。
 *
 * 灯带 gizmo 的标签由 `editor-light-toolbar` 自己排版（它也有自己的 obstacles），
 * 所以这里只放叠层自己的两个。
 */
function buildOverlayLabels(
  dom: OverlayDom,
  read: EditorOverlayRead | null,
  orbit: { x: number; y: number; label: string } | null,
): EditorLabelAnchor[] {
  const labels: EditorLabelAnchor[] = []
  if (read && !dom.heightArrow.hidden) {
    const anchor = read.tip ?? read.screen
    const width = dom.heightValue.offsetWidth || 90
    const height = dom.heightValue.offsetHeight || 18
    labels.push({
      id: 'height',
      anchor,
      width,
      height,
      preferred: { x: anchor.x + width / 2 + LABEL_OFFSET_X, y: anchor.y + height / 2 + LABEL_OFFSET_Y },
    })
  }
  if (orbit) {
    const width = dom.orbitCaption.offsetWidth || 70
    const height = dom.orbitCaption.offsetHeight || 14
    labels.push({
      id: 'orbit',
      anchor: { x: orbit.x, y: orbit.y },
      width,
      height,
      preferred: { x: orbit.x + width / 2 + 14, y: orbit.y + 19 },
    })
  }
  return labels
}

/** 把排版结果写回 DOM；缺失的标签保持隐藏。 */
function applyOverlayLabels(
  dom: OverlayDom,
  labels: EditorLabelAnchor[],
  placements: EditorLabelPlacement[],
  orbit: { x: number; y: number; label: string } | null,
): Map<string, { x: number; y: number }> {
  const byId = new Map(placements.map((placement) => [placement.id, placement]))
  const heightPlacement = byId.get('height')
  dom.heightValue.hidden = !heightPlacement
  if (heightPlacement) placeHandle(dom.heightValue, heightPlacement.x, heightPlacement.y)
  const orbitPlacement = byId.get('orbit')
  dom.orbitCaption.hidden = !orbitPlacement || !orbit
  if (orbitPlacement && orbit) {
    placeHandle(dom.orbitCaption, orbitPlacement.x, orbitPlacement.y)
    dom.orbitCaption.textContent = orbit.label
  }
  // 记录「相对锚点」的偏移，下一帧优先保持不动，避免拖动时左右横跳。
  const anchorById = new Map(labels.map((label) => [label.id, label.anchor]))
  const offsets = new Map<string, { x: number; y: number }>()
  for (const placement of placements) {
    const anchor = anchorById.get(placement.id)
    if (!anchor) continue
    offsets.set(placement.id, { x: placement.x - anchor.x, y: placement.y - anchor.y })
  }
  return offsets
}

/** 每帧 / 相机变化时重算手柄与标签位置。 */
function renderOverlay(
  options: Editor3DOverlayOptions,
  dom: OverlayDom,
  drag: DragController,
  state: { orbitUntil: number; previous: Map<string, { x: number; y: number }> },
): void {
  const read = options.read()
  dom.root.classList.toggle('is-visible', Boolean(read))
  const orbit = orbitOf(options, drag, state.orbitUntil)
  dom.orbitMarker.hidden = !orbit
  if (orbit) placeHandle(dom.orbitMarker, orbit.x, orbit.y)

  if (!read) {
    dom.heightArrow.hidden = true
    dom.heightValue.hidden = true
    dom.orbitCaption.hidden = !orbit
    if (orbit) dom.orbitCaption.textContent = orbit.label
    return
  }
  const { screen, angle, length } = read
  dom.heightArrow.hidden = !read.axisAvailable
  dom.heightArrow.disabled = !read.editable
  dom.heightArrow.style.setProperty('--editor-height-angle', `${angle.toFixed(4)}rad`)
  dom.heightArrow.style.setProperty('--editor-height-length', `${length.toFixed(1)}px`)
  placeHandle(dom.heightArrow, screen.x, screen.y)
  dom.heightArrow.title =
    read.reason ||
    (read.editable
      ? '沿箭头拖动只调整安装/离地高度；键盘↑↓调整高度，Alt 精调，S 暂停吸附，Esc 取消'
      : '物品已锁定或隐藏，请先从已放置列表解锁/显示')
  dom.heightArrow.setAttribute('aria-label', `拖动调整离地高度${read.text ? `，${read.text}` : ''}`)
  dom.heightValue.textContent = read.text

  const labels = buildOverlayLabels(dom, read, orbit)
  const placements = layoutEditorLabels(labels, {
    width: options.host.clientWidth,
    height: options.host.clientHeight,
    obstacles: options.obstacles?.() ?? [],
    previous: state.previous,
  })
  state.previous = applyOverlayLabels(dom, labels, placements, orbit)
}

interface OverlayHandlers {
  pointerDown: (event: PointerEvent) => void
  pointerUp: (event: PointerEvent) => void
  dblClick: (event: MouseEvent) => void
  keyDown: (event: KeyboardEvent) => void
  handlePointerDown: (kind: GestureKind) => (event: PointerEvent) => void
}

/**
 * 这次 pointerdown 是否应该走 3D 编辑：
 * 必须可编辑、左键、无修饰键，且**点在画布本身**（不是宿主的其它子节点）。
 *
 * 为什么必须限定画布：0.8.7 的拾取监听挂在 `renderer.domElement` 上，而这里的宿主
 * `#preview-3d` 里还有基础光调节面板、工作区切换条等可点节点。只判「不是叠层」的话，
 * 点一下这些面板就会被当成「点了空白」→ 取消选中 → 旋转环与离地箭头一起消失。
 *
 * 叠层自己的手柄 / 工具条 / gizmo 圆环也要排除：它们的 pointerdown 会先冒到宿主捕获阶段，
 * 若这里也记一笔按下点，抬起时就会凭空多出一次「点击」—— 把手柄下方那个物件选中/取消选中。
 * `editor-light-gizmo` 必须一并排除：它和叠层是兄弟节点，不属于 `.editor-3d-overlay`。
 */
function isPrimaryPointer(disposed: boolean, options: Editor3DOverlayOptions, event: PointerEvent): boolean {
  if (disposed || !options.isEditable()) return false
  if (event.button !== 0 || event.ctrlKey || event.metaKey) return false
  if (!options.canvas.contains(event.target as Node | null)) return false
  return !(event.target as Element | null)?.closest?.('.editor-3d-overlay, .editor-light-toolbar, .editor-light-gizmo')
}

/** 按下到抬起位移小于该值才算「点击」而不是拖动转视角（0.8.7 `_0x13b494` 的 4px）。 */
const PICK_CLICK_MAX_TRAVEL_PX = 4

function createHandlers(
  options: Editor3DOverlayOptions,
  drag: DragController,
  primarySelectedId: () => string | null,
  isDisposed: () => boolean,
  showOrbit: () => void,
): OverlayHandlers {
  /**
   * 按下画布时的位置。0.8.7 只在这里记一笔，真正的选择判定放到 pointerup ——
   * 「按一下就清选中」和「转个视角就清选中」是同一个 bug 的两种表现。
   */
  let press: { pointerId: number; clientX: number; clientY: number; shiftKey: boolean } | null = null

  const pointerDown = (event: PointerEvent): void => {
    if (!isPrimaryPointer(isDisposed(), options, event)) return
    // 0.8.7 `_0x5a64c7`：按下画布只记一笔并且亮中心十字（1.4s 后自己收），
    // **不拾取、不改选中、不 stopPropagation** —— 左键按下必须留给 OrbitControls 转视角。
    // 一旦在这里 stopPropagation，相机就再也转不动：灯位圆点由渲染钩子驱动仍会跟着相机走，
    // 而 gizmo 依赖的选中/手势被打断，表现出来就是「灯在动、坐标系不动」。
    showOrbit()
    press = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      shiftKey: event.shiftKey,
    }
  }

  const pointerUp = (event: PointerEvent): void => {
    const dragging = Boolean(drag.current())
    drag.finish(event)
    releasePointer(options.canvas, event.pointerId)
    const started = press
    press = null
    if (!started || started.pointerId !== event.pointerId) return
    // 拖动 / 取消（pointercancel）不是点击：0.8.7 同样只在「按下→抬起 < 4px」时拾取。
    if (event.type === 'pointercancel' || dragging) return
    if (isDisposed() || !options.isEditable()) return
    const travel = Math.hypot(event.clientX - started.clientX, event.clientY - started.clientY)
    if (travel >= PICK_CLICK_MAX_TRAVEL_PX) return
    // 0.8.7 `_0x13b494`：用**抬起位置**重新拾取；点空白才取消选择。
    const pick = options.pickAt(event.clientX, event.clientY)
    options.select(pick, started.shiftKey)
  }

  const dblClick = (event: MouseEvent): void => {
    if (isDisposed() || !options.isEditable() || !options.focusItem) return
    // 与拾取同口径：只有双击画布本身才算「聚焦物件」，宿主里的面板不算。
    if (!options.canvas.contains(event.target as Node | null)) return
    const pick = options.pickAt(event.clientX, event.clientY)
    if (!pick || pick.kind !== 'item') return
    event.preventDefault()
    event.stopPropagation()
    options.focusItem(pick.id)
  }

  const keyDown = (event: KeyboardEvent): void => {
    if (isDisposed() || !options.isEditable() || !primarySelectedId()) return
    const step = event.shiftKey ? NUDGE_STEP_METERS * 5 : event.altKey ? NUDGE_STEP_METERS / 5 : NUDGE_STEP_METERS
    const pixels = step * options.mapper().pixelsPerMeter
    const actions: Record<string, () => void> = {
      ArrowLeft: () => nudgeSelection(options, -pixels, 0),
      ArrowRight: () => nudgeSelection(options, pixels, 0),
      ArrowUp: () => nudgeSelection(options, 0, -pixels),
      ArrowDown: () => nudgeSelection(options, 0, pixels),
      PageUp: () => stepElevation(options, step),
      PageDown: () => stepElevation(options, -step),
      '[': () => stepRotation(options, -ROTATE_STEP_DEGREES),
      ']': () => stepRotation(options, ROTATE_STEP_DEGREES),
    }
    const action = actions[event.key]
    if (!action) return
    event.preventDefault()
    event.stopPropagation()
    action()
  }

  const handlePointerDown = (kind: GestureKind) => (event: PointerEvent) => {
    if (isDisposed() || !options.isEditable()) return
    event.stopPropagation()
    event.preventDefault()
    const primaryId = primarySelectedId()
    if (primaryId && drag.begin(kind, event, { kind: 'item', id: primaryId }))
      capturePointer(options.canvas, event.pointerId)
  }

  return { pointerDown, pointerUp, dblClick, keyDown, handlePointerDown }
}

export function createEditor3DOverlay(options: Editor3DOverlayOptions): Editor3DOverlay {
  const dom = createOverlayDom(options.host.ownerDocument, options.host)
  const drag = createDragController(options)
  let disposed = false
  const state = { orbitUntil: 0, previous: new Map<string, { x: number; y: number }>() }
  /** 中心十字的收起计时器（0.8.7 `_0x78bea4`）。 */
  let orbitTimer: ReturnType<typeof setTimeout> | null = null
  /**
   * 叠层重排不能让手势中断：这里在事件处理里同步跑，抛错会把同一次 pointerdown 的
   * 其余监听（OrbitControls）一起打断，表现为「按一下整个预览卡住」。
   */
  const repaintOrbit = (): void => {
    try {
      renderOverlay(options, dom, drag, state)
    } catch (overlayError) {
      console.warn('[studio] 中心十字重排失败', overlayError)
    }
  }
  /**
   * 亮中心十字：**立即重排一次**，1.4s 后再重排收起（0.8.7 `_0x78bea4` 的定时器）。
   *
   * 只写 `orbitUntil` 而不重排的话，相机不动就没有下一帧 —— 用户按下画布后
   * 十字要等到下一次相机变化才出现，看起来像「没反应」。
   */
  const showOrbit = (): void => {
    state.orbitUntil = Date.now() + ORBIT_MARKER_DURATION_MS
    repaintOrbit()
    if (orbitTimer) clearTimeout(orbitTimer)
    orbitTimer = setTimeout(() => {
      orbitTimer = null
      if (!disposed) repaintOrbit()
    }, ORBIT_MARKER_DURATION_MS)
  }
  const primarySelectedId = (): string | null => options.selectedIds()[0] ?? null
  const handlers = createHandlers(options, drag, primarySelectedId, () => disposed, showOrbit)
  const contextLost = (): void => {
    drag.finishActive()
    renderOverlay(options, dom, drag, state)
  }

  /*
   * 必须挂在**宿主**的捕获阶段，而不是画布上。
   * OrbitControls 的 pointerdown 注册在画布上；同一个元素上的监听按注册顺序触发，
   * 它是先注册的，挂在画布上就抢不到。宿主是画布的祖先，捕获阶段一定先跑 ——
   * 这里只做「记下按下点 / 亮中心十字」，不拦截事件，所以左键拖动仍然是转视角
   * （0.8.7 的拾取同样发生在 pointerup，且挂在 `renderer.domElement` 上）。
   */
  options.host.addEventListener('pointerdown', handlers.pointerDown, { capture: true })
  window.addEventListener('pointermove', drag.move)
  window.addEventListener('pointerup', handlers.pointerUp)
  window.addEventListener('pointercancel', handlers.pointerUp)
  options.host.addEventListener('dblclick', handlers.dblClick)
  options.host.addEventListener('webglcontextlost', contextLost)
  dom.heightArrow.addEventListener('pointerdown', handlers.handlePointerDown('elevation'))
  options.host.addEventListener('keydown', handlers.keyDown)
  if (options.host.tabIndex < 0) options.host.tabIndex = 0

  return {
    update: () => {
      if (!disposed) renderOverlay(options, dom, drag, state)
    },
    cancel() {
      if (disposed) return
      drag.finishActive()
      renderOverlay(options, dom, drag, state)
    },
    showOrbit,
    isDragging: () => Boolean(drag.current()),
    dispose() {
      disposed = true
      if (orbitTimer) clearTimeout(orbitTimer)
      orbitTimer = null
      options.host.removeEventListener('pointerdown', handlers.pointerDown, { capture: true })
      window.removeEventListener('pointermove', drag.move)
      window.removeEventListener('pointerup', handlers.pointerUp)
      window.removeEventListener('pointercancel', handlers.pointerUp)
      options.host.removeEventListener('dblclick', handlers.dblClick)
      options.host.removeEventListener('webglcontextlost', contextLost)
      options.host.removeEventListener('keydown', handlers.keyDown)
      dom.root.remove()
    },
  }
}

/** 一次编辑事务：开始 → 改 → 提交 → 结束（键盘操作与拖动共用同一条链路）。 */
function withTransaction(options: Editor3DOverlayOptions, mutator: () => void): void {
  options.beginInteraction()
  mutator()
  options.commit()
  options.endInteraction()
}

function nudgeSelection(options: Editor3DOverlayOptions, deltaX: number, deltaY: number): void {
  const targets = options.selectedIds()
  const primaryId = targets[0]
  withTransaction(options, () => {
    for (const id of targets.length ? targets : primaryId ? [primaryId] : []) {
      const start = options.itemPlanPoint(id)
      if (!start) continue
      options.moveItem(id, start.x + deltaX, start.y + deltaY)
      options.moveLiveItem(id, start.x + deltaX, start.y + deltaY)
    }
  })
}

function stepElevation(options: Editor3DOverlayOptions, delta: number): void {
  const primaryId = options.selectedIds()[0]
  const plan = primaryId ? options.itemPlanPoint(primaryId) : null
  if (!primaryId || !plan) return
  const limits = options.elevationLimits(primaryId)
  withTransaction(options, () =>
    options.setItemElevation(primaryId, Math.min(limits.maximum, Math.max(limits.minimum, plan.elevation + delta))),
  )
}

function stepRotation(options: Editor3DOverlayOptions, delta: number): void {
  const primaryId = options.selectedIds()[0]
  const plan = primaryId ? options.itemPlanPoint(primaryId) : null
  if (!primaryId || !plan) return
  withTransaction(options, () => options.rotateItem(primaryId, snapEditorRotation(plan.rotation + delta)))
}

/** 指针捕获在合成事件 / 已失效的 pointerId 上会抛，捕获失败不该打断拖动手势。 */
function capturePointer(canvas: HTMLElement, pointerId: number): void {
  try {
    canvas.setPointerCapture?.(pointerId)
  } catch {
    /* 忽略：合成事件或指针已释放 */
  }
}

function releasePointer(canvas: HTMLElement, pointerId: number): void {
  try {
    canvas.releasePointerCapture?.(pointerId)
  } catch {
    /* 忽略：指针从未被捕获 */
  }
}
