/**
 * 毫米标尺的界面层（0.8.7 `createDistanceRulers` 的对应实现）。
 *
 * 为什么用 HTML 叠层而不是直接画在 canvas 上：标尺上的数字要能**点进去改**，
 * 而 canvas 里做可编辑文本需要自己实现光标、选区、输入法组合 —— 在一张户型图上
 * 完全不值得。叠层只负责定位，测量仍走纯函数；**标尺线**仍画在 canvas 上
 * （虚线 + 端点），因为那是「画面的一部分」，不参与命中。
 *
 * 标签避让用「候选评分 + 障碍分档」：网格 25 档与贴边候选里挑「压得最少、离首选点最近」
 * 的那个。压住选中件手柄框才隐藏（挡操作），压住另一条标尺只扣分（读数不该因此消失）。
 */
import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import {
  bestLabelPlacement,
  createViewRotation,
  measureItemGaps,
  metersToMillimeters,
  parseRulerMillimeters,
  positionForGap,
  type DistanceGap,
  type LabelMetrics,
  type LabelObstacles,
} from '../plan/studio'
import { itemTypeCatalog, lampItemTypeSet } from '../items/item-catalog'
import { isPlacedItemHidden, isPlacedItemLocked } from '../items/placement/placed-item-state'
import { isCourtyardDrawing } from '../plan/courtyard-drawing'
import { POINT_MARKER_FILL } from '../plan/studio'
import { isEditor3DGestureActive } from './editor-3d'

/** 标尺线的颜色与线宽（与画布其它标注区分开）。 */
const RULER_LINE_COLOR = '#91b7cb'
const RULER_LINE_WIDTH = 1
const RULER_LINE_DASH: [number, number] = [3, 3]
/** 端点半径 / 描边（0.8.7 用 `drawPoint(point, '#91b7cb', 2)`：深底 + 2px 描边）。 */
const RULER_END_RADIUS = 2.5
const RULER_END_STROKE = 2
/** 标签相对线段中点的法线偏移（像素）。 */
const LABEL_NORMAL_OFFSET = 18
/** 标签半宽 / 半高的留白（0.8.7 `+4` / `+3`）。 */
const LABEL_INSET_X = 4
const LABEL_INSET_Y = 3
/** 中点跑出画布这么远就整条藏起来（0.8.7 的 `80 / 50`）。 */
const OFFSCREEN_MARGIN_X = 80
const OFFSCREEN_MARGIN_Y = 50

/** 不参与测距的物件类型：洞口与铭牌在平面上是标注，不是可摆放的实体。 */
const RULER_EXCLUDED_ITEM_TYPES = new Set(['flooropening', 'planlabel', 'exhaust-fan'])
type Point = { x: number; y: number }

interface RulerLabel {
  box: HTMLElement
  target: HTMLElement
  input: HTMLInputElement
  measurement: DistanceGap | null
  basis: string
  edit: { measurement: DistanceGap; basis: string; dirty: boolean } | null
  /** 输入框是否聚焦：`:focus-within` 会改字号与内边距，尺寸缓存要跟着失效。 */
  focused: boolean
  /** 上次量到的盒子尺寸（`offsetWidth` 是强制重排的读操作，别每帧量）。 */
  metrics: { key: string; value: LabelMetrics } | null
}

type RulerLayer = {
  host: HTMLElement
  labels: Map<string, RulerLabel>
  /** 上一帧的测量缓存键（位姿 + 可见性 + 平面旋转）。 */
  lastBasis: string
}

const layers = new WeakMap<object, RulerLayer>()

function ensureLayer(runtime: StudioAppRuntime): RulerLayer | null {
  const existing = layers.get(runtime.appCtx)
  if (existing) return existing
  const documentNode = globalThis.document
  const stage = documentNode.getElementById('plan-stage')
  if (!stage) return null
  const host = documentNode.createElement('div')
  host.className = 'distance-rulers'
  // 宿主里放着可聚焦的输入框，所以**不能** aria-hidden；初始隐藏由 `hidden` 控制。
  host.hidden = true
  stage.append(host)
  const layer: RulerLayer = { host, labels: new Map(), lastBasis: '' }
  layers.set(runtime.appCtx, layer)
  return layer
}

/**
 * 测量对象：只在「恰好选中一件可测物品」时出现。
 *
 * 与 0.8.7 `cw()` 对齐：单选、不是隐藏 / 锁定、不是洞口 / 铭牌 / 排风扇。
 * 多选时每个方向都有多个参照，标签会互相压住，读数也不再是「这件的间距」。
 */
/**
 * 该物件是否不参与测距（0.8.7 `cw()` 的排除集合）。
 *
 * 单独成函数而不是摊在 `rulerTarget` 里：排除项会继续增加（每次加一条都会把
 * `rulerTarget` 更长），而它们的语义是同一件事 —— 「这个类型没有间距语义」。
 */
function isRulerExcluded(item: Record<string, unknown>): boolean {
  if (RULER_EXCLUDED_ITEM_TYPES.has(String(item.type))) return true
  // 庭院绘制（区域 / 汀步 / 围挡 / 庭院门）没有「到墙面的间距」。
  return isCourtyardDrawing(item)
}

function rulerTarget(runtime: StudioAppRuntime): Record<string, unknown> | null {
  const appCtx = runtime.appCtx
  const single = (appCtx.selectedItems?.length === 1 ? appCtx.selectedItems[0] : appCtx.selectedItem) ?? null
  if (!single || single.kind !== 'item' || !single.id) return null
  const item = (appCtx.studioState.items as Array<Record<string, unknown>>).find(
    (candidate) => String(candidate.id) === String(single.id),
  )
  if (!item) return null
  if (isRulerExcluded(item)) return null
  if (isPlacedItemHidden(appCtx, item.id) || isPlacedItemLocked(appCtx, item.id)) return null
  return item
}

/** 可编辑：非嵌入舞台、未锁交互、物件未被锁定 / 隐藏。 */
function rulerEditable(runtime: StudioAppRuntime, item: Record<string, unknown> | null): boolean {
  if (!item) return false
  if (runtime.isEmbeddedStage || runtime.appCtx.isInteractionLocked) return false
  return !isPlacedItemHidden(runtime.appCtx, item.id) && !isPlacedItemLocked(runtime.appCtx, item.id)
}

/** 位姿指纹：位置 / 尺寸 / 角度任一变化都会让「输入期间的测量」失效。 */
function basisOf(runtime: StudioAppRuntime, item: Record<string, unknown>): string {
  const number = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0)
  return JSON.stringify([
    String(runtime.appCtx.activeFloorId ?? ''),
    String(item.id ?? ''),
    number(item.x),
    number(item.y),
    number(item.width),
    number(item.depth),
    number(item.rotation),
  ])
}

/** 测量集合的缓存键：位姿 + 可见性 + 平面旋转（0.8.7 `visibilityKey`）。 */
function measureKey(runtime: StudioAppRuntime, item: Record<string, unknown>): string {
  const hidden = (runtime.appCtx.studioState.items as Array<Record<string, unknown>>)
    .filter((candidate) => isPlacedItemHidden(runtime.appCtx, candidate.id))
    .map((candidate) => String(candidate.id))
    .sort()
  return JSON.stringify([basisOf(runtime, item), hidden, runtime.appCtx.planView?.rotation ?? 0])
}

/** 参照物名称：墙面 → 墙面；物件 → 目录名 + 备注（` · ` 连接）。 */
function describeGap(gap: DistanceGap): string {
  if (gap.targetKind === 'wall') return '墙面'
  const entry = (itemTypeCatalog as Record<string, { name?: string }>)[String(gap.target.type)]
  const name = String(entry?.name || gap.target.type || '物件')
  const remark = String(gap.target.remark ?? gap.target.note ?? '').trim()
  return remark ? `${name} · ${remark}` : name
}

/** 测距的邻居集合：只排除灯具（上游 `dw()` 只过滤 `lightTypes`），隐藏项一并排除。 */
function measureItems(runtime: StudioAppRuntime): Record<string, unknown>[] {
  return (runtime.appCtx.studioState.items as Array<Record<string, unknown>>).filter(
    (candidate) => !lampItemTypeSet.has(String(candidate.type)) && !isPlacedItemHidden(runtime.appCtx, candidate.id),
  )
}

/**
 * 每次渲染建一次的投影器：`planToScreen`（zoom / offset）之后再叠上平面视图旋转。
 *
 * 标尺的标签（HTML 叠层）与标尺虚线（`restore()` 之后）都画在画布的旋转之外，
 * 必须自己补这一次，否则视图转 90°/180°/270° 时标尺会停在未旋转的位置
 * （读数对、位置错，就是「边距显示错位」）。三处调用点（避让障碍 / 标签落点 /
 * 虚线端点）共用同一个投影器：一帧里十来个点只建一次变换，也不会彼此脱节。
 */
function viewProjector(runtime: StudioAppRuntime): (point: Point) => Point {
  const rotate = createViewRotation(runtime.appCtx.planView?.rotation ?? 0, {
    width: runtime.appCtx.planViewWidth,
    height: runtime.appCtx.planViewHeight,
  })
  const planToScreen = runtime.planToScreen as (point: Point) => Point
  return (planPoint) => rotate(planToScreen(planPoint))
}

/**
 * 标签避让的障碍：**只有选中件自己的手柄框**（四角 + 旋转手柄，外扩 10px）。
 *
 * 0.8.7 `nS()` 只传这一个矩形。此前这里还塞进了切换条与灯带工具条，导致标签被推得
 * 远离物件、甚至因为「压住东西」而整条不显示 —— 而切换条在画布右上角，标尺本来就不会
 * 跑到那里去。
 */
function collectObstacles(
  runtime: StudioAppRuntime,
  item: Record<string, unknown>,
  project: (point: Point) => Point,
): LabelObstacles {
  const handles = runtime.buildHandleGeometry?.(item) as
    | { corners?: Array<{ point: { x: number; y: number } }>; rotationHandle?: { x: number; y: number } }
    | null
    | undefined
  if (!handles?.corners?.length) return { hard: [], soft: [] }
  const points = handles.corners.map((corner) => project(corner.point))
  if (handles.rotationHandle) points.push(project(handles.rotationHandle))
  return {
    hard: [
      {
        left: Math.min(...points.map((point: { x: number }) => point.x)) - 10,
        right: Math.max(...points.map((point: { x: number }) => point.x)) + 10,
        top: Math.min(...points.map((point: { y: number }) => point.y)) - 10,
        bottom: Math.max(...points.map((point: { y: number }) => point.y)) + 10,
      },
    ],
    soft: [],
  }
}

/**
 * 标签的排版（0.8.7 `createDistanceRulers.render` 的候选评分法）。
 *
 * 早期这里复用 3D 标签排版器并开 `requireClear`：首选点被挡就整条藏起来。
 * 上游不是这样 —— 它在首选点周围试 **25 个网格位置**，再加上「贴着每个障碍四条边」的
 * 候选，按「压住障碍的面积 → 离首选点的距离」打分取最优，只有最优解仍然压住障碍才隐藏。
 * 差别在密集户型里非常明显：上游的标尺会往旁边挪一格，我们则直接消失。
 *
 * 与上游的两处**有意差异**（小件上四条标尺同时出现时最明显）：
 * 1. 障碍分档：压住选中件手柄框（挡操作）才算「必须藏」；压住另一条标尺只扣分。
 *    少显示一条读数，比两条稍微叠一点更糟 —— 前者用户根本改不了那个方向。
 * 2. 正在输入的标签永不隐藏：把用户正在敲的输入框藏掉并丢焦点，比标签被挡更不能接受。
 *
 * 评分本身是纯函数（`bestLabelPlacement`，在 plan 模块里），本层只负责量尺寸与写样式。
 */

/**
 * 尺寸缓存键：只有这些输入变了，盒子宽高才会变。
 *
 * `offsetWidth` 是**强制重排**的读操作。标尺每帧都要重排（`refreshStudioView` 每帧调
 * `refreshDistanceRulers`），四个标签逐条「写 hidden → 读尺寸」就是每帧四轮读写交替。
 * 缓存之后，只有文案 / 只读态 / 聚焦态（`:focus-within` 会改字号与内边距）变化时才量。
 */
function metricsKey(label: RulerLabel): string {
  return `${label.target.textContent ?? ''}\u0000${label.input.readOnly ? 1 : 0}\u0000${label.focused ? 1 : 0}`
}

function measureMetrics(label: RulerLabel): LabelMetrics {
  const halfWidth = Math.max(label.box.offsetWidth, label.target.offsetWidth) / 2 + LABEL_INSET_X
  const halfHeight = label.box.offsetHeight / 2 + LABEL_INSET_Y
  return { halfWidth, halfHeight, fullHeight: halfHeight + label.target.offsetHeight }
}

function metricsOf(label: RulerLabel): LabelMetrics {
  const key = metricsKey(label)
  if (label.metrics?.key === key) return label.metrics.value
  const value = measureMetrics(label)
  // 宿主还藏着的时候量到的是 0：别把 0 缓存下来，等可见了再量。
  if (value.halfWidth > LABEL_INSET_X && value.halfHeight > LABEL_INSET_Y) {
    label.metrics = { key, value }
  }
  return value
}

/** 标签中点跑出画布这么远就没必要画了（上游同样口径）。 */
function isOffscreen(mid: Point, viewport: { width: number; height: number }): boolean {
  return (
    mid.x < -OFFSCREEN_MARGIN_X ||
    mid.y < -OFFSCREEN_MARGIN_Y ||
    mid.x > viewport.width + OFFSCREEN_MARGIN_X ||
    mid.y > viewport.height + OFFSCREEN_MARGIN_Y
  )
}

/** 标签首选落点：线段中点沿法线外推一格（法线在**旋转后的屏幕空间**里算）。 */
function preferredLabelPoint(from: Point, to: Point): Point {
  const deltaX = to.x - from.x
  const deltaY = to.y - from.y
  const length = Math.hypot(deltaX, deltaY)
  // 线段退化成一点（贴合 0mm）时没有法线：固定往正上方放。
  const normalX = length ? -deltaY / length : 0
  const normalY = length ? deltaX / length : -1
  return {
    x: (from.x + to.x) / 2 + normalX * LABEL_NORMAL_OFFSET,
    y: (from.y + to.y) / 2 + normalY * LABEL_NORMAL_OFFSET,
  }
}

/** 只在真的变了才写：同一位置重复赋 px 也会让浏览器重新失效样式。 */
function writeLabelPosition(label: RulerLabel, point: Point): void {
  const left = `${point.x}px`
  const top = `${point.y}px`
  if (label.box.style.left !== left) label.box.style.left = left
  if (label.box.style.top !== top) label.box.style.top = top
}

/**
 * 依次给一组标签找落点；返回真正显示出来的 key。
 *
 * 顺序必须是「先同步文案（会影响 offsetWidth）→ 再量尺寸 → 再排版」：
 * 文案换成长名字后盒子会变宽，先排版会让候选步距按旧宽度算。
 * 量尺寸单独成一趟（先解除全部 hidden，再一次性量），避免逐条读写交替触发重排。
 */
function placeLabels(
  runtime: StudioAppRuntime,
  entries: Array<{ label: RulerLabel; gap: DistanceGap }>,
  obstacles: LabelObstacles,
  project: (point: Point) => Point,
): Set<string> {
  const visible = new Set<string>()
  const viewport = { width: runtime.appCtx.planViewWidth, height: runtime.appCtx.planViewHeight }
  // 第一趟（写）：`[hidden]{display:none}` 时 offsetWidth 为 0，先全部显形。
  for (const { label } of entries) label.box.hidden = false
  // 第二趟（读）：投影与尺寸，一次量完。
  const prepared = entries.map((entry) => ({
    ...entry,
    from: project(entry.gap.start),
    to: project(entry.gap.end),
    metrics: metricsOf(entry.label),
  }))
  // 已放下的标签成为软障碍：原地增长，后面每条都看得到前面占了哪。
  const soft = [...obstacles.soft]
  const live: LabelObstacles = { hard: obstacles.hard, soft }
  // 第三趟（写）：排版与样式。
  for (const { label, gap, from, to, metrics } of prepared) {
    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
    if (isOffscreen(mid, viewport)) {
      label.box.hidden = true
      continue
    }
    const placement = bestLabelPlacement(preferredLabelPoint(from, to), metrics, viewport, live)
    // 压住手柄框就该藏（挡操作）；但正在输入的标签例外 —— 藏掉等于丢掉用户正在敲的值。
    if (placement.hardCovered > 0 && !label.focused) {
      label.edit = null
      label.box.hidden = true
      continue
    }
    soft.push(placement.rect)
    writeLabelPosition(label, placement.point)
    visible.add(gap.key)
  }
  return visible
}

/** 提交一次间距输入（错误处理统一在调用方转成提示）。 */
function applyGap(runtime: StudioAppRuntime, edit: NonNullable<RulerLabel['edit']>, meters: number): void {
  const item = rulerTarget(runtime)
  if (!item || basisOf(runtime, item) !== edit.basis) throw Error('物品或楼层已变化，请重新选择后调整间距')
  const fresh = measureItemGaps({
    item: item as never,
    items: measureItems(runtime) as never,
    walls: runtime.appCtx.studioState.walls as never,
    pixelsPerMeter: runtime.getPixelsPerMeter(),
  }).find(
    (gap) =>
      gap.key === edit.measurement.key &&
      gap.targetKind === edit.measurement.targetKind &&
      gap.targetId === edit.measurement.targetId &&
      gap.targetStamp === edit.measurement.targetStamp,
  )
  if (!fresh) throw Error('参照对象已变化，请重新选择间距')
  const next = positionForGap(item as never, fresh, meters, runtime.getPixelsPerMeter())
  if (Math.hypot(next.x - Number(item.x), next.y - Number(item.y)) < 1e-8) return
  const before = runtime.captureUndoSnapshot?.()
  const originalX = Number(item.x ?? 0)
  const originalY = Number(item.y ?? 0)
  item.x = next.x
  item.y = next.y
  if (before && !runtime.validateSelectionChange?.(before)) {
    // 校验拒绝（例如推到与他物重叠）时把坐标还原，避免留下「校验没过但已经动了」的状态。
    item.x = originalX
    item.y = originalY
    runtime.showToast?.('物品或楼层已变化，请重新选择后调整间距', 'warning')
    return
  }
  runtime.applyPlacementChange?.(before)
  runtime.markDocumentDirty?.()
  runtime.refreshStudioUi?.()
  runtime.refreshStudioView?.()
}

/** 编辑框的失焦 / 回车提交；非法值回填当前测量值。 */
function commitLabelEdit(runtime: StudioAppRuntime, label: RulerLabel, layer: RulerLayer): void {
  const edit = label.edit
  label.edit = null
  layer.lastBasis = ''
  if (!edit) return
  const parsed = parseRulerMillimeters(label.input.value)
  if (parsed === null) {
    runtime.showToast?.('请输入 0–100000 mm 的有效间距', 'warning')
    label.input.value = String(metersToMillimeters(edit.measurement.meters))
    return
  }
  try {
    applyGap(runtime, edit, edit.dirty ? parsed / 1000 : edit.measurement.meters)
  } catch (error) {
    runtime.showToast?.((error as Error).message || String(error), 'error')
    label.input.value = String(metersToMillimeters(edit.measurement.meters))
  }
}

function bindLabelEditing(runtime: StudioAppRuntime, label: RulerLabel, layer: RulerLayer): void {
  const { input } = label
  input.addEventListener('focus', () => {
    const measurement = label.measurement
    // `:focus-within` 会让标签变大（字号 / 内边距），先用标记让尺寸缓存失效再重排。
    label.focused = true
    label.edit = input.readOnly || !measurement ? null : { measurement, basis: label.basis, dirty: false }
    input.select()
    layer.lastBasis = ''
  })
  input.addEventListener('input', () => {
    if (label.edit) label.edit.dirty = true
  })
  input.addEventListener('blur', () => {
    // 先落标记：提交会触发重做，重做时量到的必须是「未聚焦」的尺寸。
    label.focused = false
    commitLabelEdit(runtime, label, layer)
  })
  input.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      commitLabelEdit(runtime, label, layer)
      input.blur()
      return
    }
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    label.edit = null
    input.value = label.measurement ? String(metersToMillimeters(label.measurement.meters)) : ''
    input.blur()
  })
}

/** 标签 DOM：`span`（参照物名）+ `input type=text` + `small(mm)`。 */
function createLabel(runtime: StudioAppRuntime, gap: DistanceGap, layer: RulerLayer): RulerLabel {
  const documentNode = globalThis.document
  const box = documentNode.createElement('label')
  box.className = 'distance-ruler-label'
  const target = documentNode.createElement('span')
  const input = documentNode.createElement('input')
  input.type = 'text'
  input.inputMode = 'decimal'
  input.autocomplete = 'off'
  input.spellcheck = false
  input.dataset.distanceSide = gap.key
  const unit = documentNode.createElement('small')
  unit.textContent = 'mm'
  box.append(target, input, unit)
  layer.host.append(box)
  const label: RulerLabel = {
    box,
    target,
    input,
    measurement: null,
    basis: '',
    edit: null,
    focused: false,
    metrics: null,
  }
  bindLabelEditing(runtime, label, layer)
  layer.labels.set(gap.key, label)
  return label
}

/** 标尺线画在 canvas 上：虚线 + 两端小圆点（与 0.8.7 的 `drawLine` + `drawPoint` 同形）。 */
function paintRulerLines(runtime: StudioAppRuntime, gaps: DistanceGap[], project: (point: Point) => Point): void {
  const context = runtime.planCanvasRenderer as CanvasRenderingContext2D | undefined
  if (!context || !gaps.length) return
  context.save()
  context.lineCap = 'round'
  context.strokeStyle = RULER_LINE_COLOR
  context.lineWidth = RULER_LINE_WIDTH
  context.setLineDash(RULER_LINE_DASH)
  for (const gap of gaps) {
    const start = project(gap.start)
    const end = project(gap.end)
    context.beginPath()
    context.moveTo(start.x, start.y)
    context.lineTo(end.x, end.y)
    context.stroke()
    context.setLineDash([])
    // 端点：深底 + 彩色描边（不是实心色点），与上游 `drawPoint` 一致。
    for (const point of [start, end]) {
      context.beginPath()
      context.arc(point.x, point.y, RULER_END_RADIUS, 0, Math.PI * 2)
      context.fillStyle = POINT_MARKER_FILL
      context.fill()
      context.lineWidth = RULER_END_STROKE
      context.strokeStyle = RULER_LINE_COLOR
      context.stroke()
    }
    context.lineWidth = RULER_LINE_WIDTH
    context.strokeStyle = RULER_LINE_COLOR
    context.setLineDash(RULER_LINE_DASH)
  }
  context.restore()
}

/** 一次测量 + 渲染（位姿变了才走这里）。 */
function renderRulers(runtime: StudioAppRuntime, layer: RulerLayer, item: Record<string, unknown>): void {
  const gaps = measureItemGaps({
    item: item as never,
    items: measureItems(runtime) as never,
    walls: runtime.appCtx.studioState.walls as never,
    pixelsPerMeter: runtime.getPixelsPerMeter(),
  })
  layer.host.hidden = !gaps.length
  const editable = rulerEditable(runtime, item)
  const basis = basisOf(runtime, item)
  const project = viewProjector(runtime)
  const obstacles = collectObstacles(runtime, item, project)
  const entries: Array<{ label: RulerLabel; gap: DistanceGap }> = []
  for (const gap of gaps) {
    const label = layer.labels.get(gap.key) ?? createLabel(runtime, gap, layer)
    // 基础数据变了：正在编辑的输入框要作废，否则会把旧读数提交到新位姿上。
    if (label.edit && label.edit.basis !== basis) {
      label.edit = null
      label.input.blur()
    }
    label.measurement = gap
    label.basis = basis
    // 文案先写：长名字会把标签撑宽，候选步距要按新宽度算（上游同样先 `textContent`）。
    const text = describeGap(gap)
    label.target.textContent = text
    label.input.readOnly = !editable
    label.input.setAttribute('aria-label', `${gap.name}距${text}（毫米）`)
    label.box.title = `${gap.name}距${text}；只移动位置，不改变尺寸或离地`
    if (!label.edit) label.input.value = String(metersToMillimeters(gap.meters))
    entries.push({ label, gap })
  }
  const alive = placeLabels(runtime, entries, obstacles, project)
  for (const [key, label] of layer.labels) {
    if (alive.has(key)) continue
    label.edit = null
    label.box.hidden = true
  }
  paintRulerLines(runtime, gaps, project)
}

/** 位姿没变时的轻量重排：只按当前视口重新定位（缩放 / 平移 / 视图旋转不改测量值）。 */
function relayoutRulers(runtime: StudioAppRuntime, layer: RulerLayer, item: Record<string, unknown>): void {
  const entries = [...layer.labels.values()]
    .filter((label): label is RulerLabel & { measurement: DistanceGap } => Boolean(label.measurement))
    .map((label) => ({ label, gap: label.measurement }))
  const project = viewProjector(runtime)
  placeLabels(runtime, entries, collectObstacles(runtime, item, project), project)
  paintRulerLines(
    runtime,
    entries.map((entry) => entry.gap),
    project,
  )
}

/** 每次画布重绘后调用：重算间距、复用标签、更新位置。 */
export function refreshDistanceRulers(runtime: StudioAppRuntime): void {
  const item = rulerTarget(runtime)
  const busy =
    Boolean(runtime.appCtx.marqueeBox) ||
    runtime.appCtx.activeLibraryCategory === 'courtyard' ||
    runtime.isEmbeddedStage ||
    // 3D 手势进行中（0.8.7 `nS()` 的 `On`）：标尺会盖在手柄上，整层收起。
    isEditor3DGestureActive(runtime.appCtx)
  if (!item || busy) {
    clearDistanceRulers(runtime)
    return
  }
  const layer = ensureLayer(runtime)
  if (!layer) return
  const key = measureKey(runtime, item)
  if (key === layer.lastBasis) {
    relayoutRulers(runtime, layer, item)
    return
  }
  layer.lastBasis = key
  renderRulers(runtime, layer, item)
}

export function clearDistanceRulers(runtime: StudioAppRuntime): void {
  const layer = layers.get(runtime.appCtx)
  if (!layer) return
  for (const label of layer.labels.values()) {
    label.edit = null
    label.box.hidden = true
  }
  layer.host.hidden = true
  layer.lastBasis = ''
}

/** 卸载（路由离开）：标签是追加到 #plan-stage 的节点，不清理会跟着下一个户型残留。 */
export function disposeDistanceRulers(runtime: StudioAppRuntime): void {
  const layer = layers.get(runtime.appCtx)
  if (!layer) return
  layer.host.remove()
  layer.labels.clear()
  layers.delete(runtime.appCtx)
}
