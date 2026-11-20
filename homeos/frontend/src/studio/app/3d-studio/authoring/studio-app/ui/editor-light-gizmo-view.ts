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
import type { LightAxis } from '../interaction/editor-light-gizmo'
import type { GizmoHandleSpec } from '../interaction/editor-light-gizmo-paths'

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
