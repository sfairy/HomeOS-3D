/**
 * 3D 单层浏览手势（0.8.9 `view-gestures.js`）。
 *
 * 解决的问题：以前 3D 舞台只有「点标记 / 长按」这一套指针语义，想换个角度看户型必须
 * 退出到编辑器。0.8.9 给单层浏览加了缩放 / 平移 / 旋转三件套。
 *
 * 设计约束（这几条决定了实现形状）：
 *
 * 1. **必须能被上层拦住**：标记点击、长按弹窗、范围编辑都要能"吃掉"这次手势。
 *    因此每个手势开始前先问 ``canStart``，通过后再调 ``claim`` —— 一旦 claim，
 *    点击路径（tap）就应当放弃。
 * 2. **单指旋转 / 双指缩放平移**：双指时分不清谁是"第一指"，所以用**两指中点**
 *    的位移做平移、**两指间距变化**做缩放，各自独立于手指顺序。
 * 3. **同一时刻只认一个手势**：第二根手指按下时，把已经开始的单指旋转**升级**成
 *    双指手势（而不是并行两条增量），否则画面会同时转 + 缩，手感发飘。
 * 4. **滚轮与触控板同一条路径**：``wheel`` 的 ``deltaY`` 统一折算成缩放增量，
 *    ``ctrlKey``（触控板捏合）给更大的系数。
 *
 * 本模块只**产出意图**（``rotate`` / ``pan`` / ``zoom``），不动相机 —— 相机由舞台宿主
 * 决定怎么消费。这样手势逻辑可以在 node 里直接断言，也不必知道 three 的存在。
 *
 * 实现上把「状态」与「处理器」分开：状态是一个可变对象，处理器都是**顶层函数**
 * （``onPointerDown`` 等）。这样每个函数都短小、可单独阅读，也不会因为闭包嵌套
 * 让整个 ``installViewGestures`` 变成上百行的巨型函数（项目有函数长度棘轮）。
 */

/** 单指拖动超过这个距离才算旋转（否则仍按点击处理）。 */
export const VIEW_GESTURE_DRAG_SLOP = 8

/** 双指间距变化超过这个距离才开始缩放（避免两指轻触就缩放）。 */
export const VIEW_GESTURE_PINCH_SLOP = 4

/** 旋转灵敏度：像素 → 弧度。0.0045 约等于「拖 140px 转 36°」。 */
export const VIEW_GESTURE_ROTATE_SPEED = 0.0045

/** 平移灵敏度：像素 → 世界单位（正交视角下由宿主再乘缩放系数）。 */
export const VIEW_GESTURE_PAN_SPEED = 0.18

/** 滚轮一格的缩放系数（指数缩放，保证连续滚动不突变）。 */
export const VIEW_GESTURE_WHEEL_ZOOM = 0.0012

/** 触控板捏合（``wheel + ctrlKey``）的放大系数。 */
export const VIEW_GESTURE_PINCH_WHEEL_ZOOM = 0.006

/** 单次手势事件的最小间隔（毫秒）：同一帧内的重复 ``pointermove`` 合并。 */
export const VIEW_GESTURE_MIN_INTERVAL_MS = 16

export type ViewGestureKind = 'rotate' | 'pan' | 'zoom'

/** 一次手势增量。宿主按 ``kind`` 决定改哪个相机参数。 */
export type ViewGestureIntent = {
  kind: ViewGestureKind
  /** 水平位移（像素，已乘灵敏度）。 */
  dx: number
  /** 垂直位移（像素，已乘灵敏度）。 */
  dy: number
  /** 缩放比例（``1`` 表示不变；>1 拉近，<1 推远）。仅 ``zoom`` 有意义。 */
  scale: number
}

type PointerLike = {
  pointerId: number
  clientX: number
  clientY: number
  timeStamp?: number
  button?: number
  isPrimary?: boolean
  ctrlKey?: boolean
  deltaY?: number
  deltaMode?: number
  preventDefault?: () => void
  stopPropagation?: () => void
  target?: unknown
}

export type InstallViewGesturesOptions = {
  /** 手势监听的元素（通常是 3D 画布）。 */
  surface: Element
  /** 这次指针事件是否允许开始手势（例如编辑态、范围编辑中返回 false）。 */
  canStart: (event: PointerLike) => boolean
  /** 是否允许平移（单层锁定视角时可只允许缩放）。 */
  canPan?: (event: PointerLike) => boolean
  /** 事件是否发生在本 surface 上（跨 iframe / 弹窗时由宿主判定）。 */
  isSurface?: (event: PointerLike) => boolean
  /** 认领这次手势：调用后点击路径应当放弃（返回 false 表示拒绝认领）。 */
  claim: (kind: ViewGestureKind) => boolean
  /** 消费手势增量。 */
  begin: (intent: ViewGestureIntent) => void
  /** 手势结束（用于结束惯性 / 释放 pointer capture）。 */
  end?: (kind: ViewGestureKind) => void
  /** 同一帧内合并重复事件的间隔（毫秒）。单测里传 0 可关闭合并。 */
  minIntervalMs?: number
}

/** 手势引擎的可变状态。处理器都是顶层函数，靠它共享上下文。 */
type GestureState = {
  options: InstallViewGesturesOptions
  minInterval: number
  points: Map<number, PointerLike>
  kind: ViewGestureKind | null
  claimed: boolean
  disposed: boolean
  lastEmitAt: number
  originX: number
  originY: number
  originSpan: number
  pinchAccumulated: number
}

/** 两指中点与间距。 */
function pointerPair(points: Map<number, PointerLike>): { x: number; y: number; span: number } | null {
  const [first, second] = [...points.values()]
  if (!first || !second) return null
  return {
    x: (first.clientX + second.clientX) / 2,
    y: (first.clientY + second.clientY) / 2,
    span: Math.max(1, Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY)),
  }
}

/** 安全缩放因子：非有限值或非正数时退回 1（宁可不缩，也不要 NaN 进相机）。 */
function safeScale(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1
}

function resetGesture(state: GestureState): void {
  if (state.kind && state.claimed) state.options.end?.(state.kind)
  state.points.clear()
  state.kind = null
  state.claimed = false
  state.originSpan = 0
  state.pinchAccumulated = 0
}

function emitIntent(state: GestureState, intent: ViewGestureIntent): void {
  if (!state.claimed || state.disposed) return
  const now = Date.now()
  // 同帧内的重复事件合并：拖动时 ``pointermove`` 可以一秒上百次。
  if (state.minInterval > 0 && now - state.lastEmitAt < state.minInterval) return
  state.lastEmitAt = now
  state.options.begin(intent)
}

function beginSingleGesture(state: GestureState, event: PointerLike): boolean {
  if (!state.options.canStart(event)) return false
  if (!state.options.claim('rotate')) return false
  state.kind = 'rotate'
  state.claimed = true
  state.originX = event.clientX
  state.originY = event.clientY
  return true
}

function beginPairGesture(state: GestureState): boolean {
  const pair = pointerPair(state.points)
  if (!pair) return false
  // 从单指升级：已经 claim 过就不重复认领（否则上层会收到两次「放弃点击」）。
  if (!state.claimed && !state.options.claim('pan')) return false
  state.kind = 'pan'
  state.claimed = true
  state.originX = pair.x
  state.originY = pair.y
  state.originSpan = pair.span
  state.pinchAccumulated = 0
  return true
}

function onPointerDown(state: GestureState, event: PointerLike): void {
  if (state.disposed) return
  const { isSurface } = state.options
  if (isSurface && !isSurface(event)) return
  if (state.points.size === 0 && !beginSingleGesture(state, event)) return
  state.points.set(event.pointerId, event)
  if (state.points.size >= 2) beginPairGesture(state)
}

/** 单指旋转的一段增量：超过 slop 才发，发完把原点推到当前位置。 */
function moveRotate(state: GestureState, event: PointerLike): void {
  const dx = event.clientX - state.originX
  const dy = event.clientY - state.originY
  if (Math.hypot(dx, dy) < VIEW_GESTURE_DRAG_SLOP) return
  state.originX = event.clientX
  state.originY = event.clientY
  emitIntent(state, {
    kind: 'rotate',
    dx: dx * VIEW_GESTURE_ROTATE_SPEED,
    dy: dy * VIEW_GESTURE_ROTATE_SPEED,
    scale: 1,
  })
}

/** 双指：间距变化优先当缩放，否则按中点位移当平移。 */
function movePair(state: GestureState, event: PointerLike): void {
  const pair = pointerPair(state.points)
  if (!pair) return
  const panX = pair.x - state.originX
  const panY = pair.y - state.originY
  const spanDelta = pair.span - state.originSpan
  state.originX = pair.x
  state.originY = pair.y
  state.originSpan = pair.span
  // 缩放与平移互斥判定：间距变化超过阈值就按缩放处理，避免「捏合同时画面乱跑」。
  state.pinchAccumulated += spanDelta
  if (Math.abs(state.pinchAccumulated) >= VIEW_GESTURE_PINCH_SLOP) {
    emitIntent(state, {
      kind: 'zoom',
      dx: 0,
      dy: 0,
      scale: safeScale(pair.span / Math.max(1, pair.span - spanDelta)),
    })
    return
  }
  if (state.options.canPan && !state.options.canPan(event)) return
  emitIntent(state, {
    kind: 'pan',
    dx: panX * VIEW_GESTURE_PAN_SPEED,
    dy: panY * VIEW_GESTURE_PAN_SPEED,
    scale: 1,
  })
}

function onPointerMove(state: GestureState, event: PointerLike): void {
  if (state.disposed || !state.points.has(event.pointerId)) return
  state.points.set(event.pointerId, event)
  if (state.kind === 'rotate') moveRotate(state, event)
  else if (state.kind === 'pan') movePair(state, event)
}

/** 双指退回单指：重设原点，避免用旧中点算出一段跳变。 */
function downgradeToSinglePointer(state: GestureState): void {
  const [remaining] = [...state.points.values()]
  if (remaining) {
    state.kind = 'rotate'
    state.originX = remaining.clientX
    state.originY = remaining.clientY
  }
  state.originSpan = 0
  state.pinchAccumulated = 0
}

function onPointerEnd(state: GestureState, event: PointerLike): void {
  if (state.disposed) return
  state.points.delete(event.pointerId)
  if (state.points.size === 0) resetGesture(state)
  else if (state.points.size === 1) downgradeToSinglePointer(state)
}

function onWheel(state: GestureState, event: PointerLike): void {
  if (state.disposed) return
  const { isSurface, canStart, claim, begin, end } = state.options
  if (isSurface && !isSurface(event)) return
  if (!canStart(event)) return
  const rawDelta = Number(event.deltaY)
  if (!Number.isFinite(rawDelta) || rawDelta === 0) return
  if (!claim('zoom')) return
  // 触控板捏合会带 ctrlKey，且 delta 更细：给更大的系数，手感才与双指捏合接近。
  const factor = event.ctrlKey ? VIEW_GESTURE_PINCH_WHEEL_ZOOM : VIEW_GESTURE_WHEEL_ZOOM
  event.preventDefault?.()
  // 指数缩放：连续滚动是等比累积，不会在两端突变。
  begin({ kind: 'zoom', dx: 0, dy: 0, scale: safeScale(Math.exp(-rawDelta * factor)) })
  state.lastEmitAt = Date.now()
  end?.('zoom')
}

/**
 * 安装手势。返回句柄：``dispose()`` 解绑，``active()`` 查询是否在手势中。
 *
 * 监听全部挂在 ``surface`` 上并使用 ``AbortController`` 统一解绑：舞台会随楼层切换
 * 反复重建，逐个 ``removeEventListener`` 漏一个就是「换层后手势重复响应」。
 * 另外保留一个 ``disposed`` 标志：它让「解绑后仍有排队事件」也不会被处理。
 */
export function installViewGestures(options: InstallViewGesturesOptions) {
  const controller = new AbortController()
  const state: GestureState = {
    options,
    minInterval: options.minIntervalMs ?? VIEW_GESTURE_MIN_INTERVAL_MS,
    points: new Map(),
    kind: null,
    claimed: false,
    disposed: false,
    lastEmitAt: 0,
    originX: 0,
    originY: 0,
    originSpan: 0,
    pinchAccumulated: 0,
  }
  const listenerOptions = { capture: true, passive: false, signal: controller.signal } as AddEventListenerOptions

  const bind = (type: string, handler: (state: GestureState, event: PointerLike) => void) => {
    options.surface.addEventListener(
      type,
      ((event: PointerLike) => handler(state, event)) as unknown as EventListener,
      listenerOptions,
    )
  }
  bind('pointerdown', onPointerDown)
  bind('pointermove', onPointerMove)
  bind('pointerup', onPointerEnd)
  bind('pointercancel', onPointerEnd)
  bind('wheel', onWheel)

  return {
    /** 是否正在手势中（宿主据此暂停点击路径 / 惯性旋转）。 */
    active: () => state.claimed,
    /** 当前手势类型（无手势时为 ``null``）。 */
    kind: () => state.kind,
    /** 解绑全部监听（换楼层 / 关闭舞台时调用）。 */
    dispose: () => {
      state.disposed = true
      resetGesture(state)
      controller.abort()
    },
  }
}

export type ViewGestureHandle = ReturnType<typeof installViewGestures>
