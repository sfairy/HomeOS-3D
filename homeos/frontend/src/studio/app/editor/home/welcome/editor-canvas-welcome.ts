/**
 * 编辑器画布「手写欢迎」叠层（0.8.8 `editor-canvas-welcome.js` 的行为）。
 *
 * 与上游一致的地方：
 * - 载入文档时铺一层手写动画；有「已挂载但尚未呈现」的 3D 宿主时等它出画面再淡出；
 * - canvas 逻辑尺寸 796×136、DPR 上限 2、`ResizeObserver` 跟随、`prefers-reduced-motion` 下不播动画；
 * - **七色彩虹渐变**（`#ff89a6 → #ffae6c → #eccc66 → #a9d87d → #73dbc4 → #83b8f6 → #db9af0`，
 *   渐变锚点 13 → 783）与圆头笔迹，色值与锚点都照搬上游；
 * - 书写时长 2380ms（上游 `E`）。
 *
 * 与上游不同的地方（有意）：
 * - 上游那 12 段 `Path2D` 画的是**上游品牌字**。我们的文案是 `Welcome to HomeOS`，
 *   照搬笔画就会出现「笔画是别人的字、文字被藏起来」，所以改为用本机手写字体把文案
 *   写成笔迹（只描边不填充，见 `buildInk`）。
 * - **整句一次 `strokeText`**，不逐字拆开：Savoye LET 这类连笔体的连贯感来自相邻字母的
 *   连接笔画，逐字绘制再补字距会把这些连接切断，大写（`HomeOS`）尤其明显 —— 看起来像
 *   一个个印章而不是一行字。揭示动画本来就是从左往右的擦除（见 `paintInk`），
 *   整句绘制不影响「一笔写过去」的观感。
 *
 * 状态全部放在 `WelcomeState` 里、由模块级小函数操作：工厂函数本身保持短小
 * （复杂度门禁按函数节点计行数，把逻辑塞进工厂会让它轻松越过 80 行）。
 */

/** 书写时长（0.8.8 `E` = 2380）。上游就是这么长，慢到能看清每一笔走过去。 */
const REVEAL_DURATION_MS = 2380
/** 最短可见时长：与动画同值，保证这一遍写得完（本地载入太快也不至于只闪一下）。 */
const MIN_VISIBLE_MS = REVEAL_DURATION_MS
/** 上游画布逻辑宽度（用于把描边宽度按比例换算到实际像素）。 */
const INK_WIDTH = 796
/** 笔锋宽度：上游 `7.3` 在 796 宽下约等于 0.9% 画布宽度，这里按同比例换算。 */
const INK_STROKE_RATIO = 7.3 / 796
/** 等待 3D 呈现的轮询间隔与上限。 */
const PRESENTATION_POLL_MS = 120
const PRESENTATION_TIMEOUT_MS = 12_000

/**
 * 0.8.8 的七色墨迹渐变，**原值照搬**（粉 → 橙 → 黄 → 绿 → 青 → 蓝 → 紫）。
 *
 * 上游把七档硬编码在 `editor-canvas-welcome.js` 的 `w` 数组里，渐变锚点是
 * `(13, 72) → (783, 72)`，所以整句是**一道固定的彩虹**：笔迹走过去颜色不流动。
 */
const INK_GRADIENT_STOPS: ReadonlyArray<readonly [number, string]> = [
  [0, '#ff89a6'],
  [0.17, '#ffae6c'],
  [0.33, '#eccc66'],
  [0.49, '#a9d87d'],
  [0.66, '#73dbc4'],
  [0.82, '#83b8f6'],
  [1, '#db9af0'],
]
/** 渐变起止点（上游 13 / 783 相对 796 的比例）。 */
const INK_GRADIENT_FROM = 13 / INK_WIDTH
const INK_GRADIENT_TO = 783 / INK_WIDTH

/**
 * 手写字体栈：优先**花体/连笔**（最接近 0.8.8 那个手写标识的观感），
 * 再退到随性手写与中文手札体。canvas 与 CSS 兜底文字共用这一份。
 */
const INK_FONT_STACK = [
  '"Savoye LET"',
  '"Snell Roundhand"',
  '"Bradley Hand"',
  '"Noteworthy"',
  '"Hannotate SC"',
  '"HanziPen SC"',
  'cursive',
].join(', ')

/** 3D 宿主上的呈现状态探针（由 `bridge.ts` 挂载）。 */
type Interaction3dHostProbe = Element & { isInteraction3dPresentationPending?: () => boolean }

/**
 * 真正承载 3D 宿主的容器：`#editor-canvas` 只放编辑器渲染器，仪表盘预览（含 3D 交互）在
 * 兄弟节点 `#dashboard-preview` 里，所以统一向上取工作区容器再做探测。
 */
function scopeOf(element: Element): Element {
  return element.closest('.workspace') ?? element
}

/**
 * 容器里是否还有「可见且尚未呈现」的 3D 宿主。
 *
 * 与上游 `D()` 同口径：宿主自己或其祖先 `[hidden]` 一律不算；还要求宿主与容器矩形相交
 * （在别的页签里的 3D 组件不应该把欢迎层一直吊着）。
 */
export function isPresentationPending(container: Element | null): boolean {
  if (!container || (container as HTMLElement).hidden) return false
  const containerBounds = container.getBoundingClientRect()
  return Array.from(container.querySelectorAll('.hb-interaction3d-host')).some((hostElement) => {
    if (hostElement.closest('[hidden]')) return false
    const probe = hostElement as Interaction3dHostProbe
    if (!probe.isInteraction3dPresentationPending?.()) return false
    return overlaps(hostElement.getBoundingClientRect(), containerBounds)
  })
}

/** 宿主与容器是否相交（尺寸为 0 的一律不算）。 */
function overlaps(hostBounds: DOMRect, containerBounds: DOMRect) {
  return (
    hostBounds.width > 0 &&
    hostBounds.height > 0 &&
    hostBounds.right > containerBounds.left &&
    hostBounds.left < containerBounds.right &&
    hostBounds.bottom > containerBounds.top &&
    hostBounds.top < containerBounds.bottom
  )
}

export interface EditorCanvasWelcome {
  /** 开始等待：返回的结束函数由调用方在文档就绪后调用。 */
  begin: () => (readyRoot?: Element | null) => void
  /** 无仪表盘等场景下立刻收尾。 */
  clear: () => void
  /** 页面卸载时释放计时器与动画帧。 */
  dispose: () => void
}

/**
 * 量出一份「刚好填满」的排版参数。
 *
 * 花体的 em 宽度比印刷体大很多，只缩不放会让它显得很小；所以用 100px 试排得到
 * 每 px 的字宽/字高比例，再反推能同时满足「宽 ≤ 88%」「高 ≤ 82%」的字号。
 */
function measureInkLayout(targetContext: CanvasRenderingContext2D, text: string, width: number, height: number) {
  const fontOf = (size: number) => `${size}px ${INK_FONT_STACK}`
  const measureAt = (size: number) => {
    targetContext.font = fontOf(size)
    return targetContext.measureText(text)
  }
  const probeSize = 100
  const probe = measureAt(probeSize)
  const emWidth = Math.max(1e-3, probe.width / probeSize)
  const emHeight = Math.max(
    1e-3,
    ((probe.actualBoundingBoxAscent || probeSize * 0.8) + (probe.actualBoundingBoxDescent || probeSize * 0.2)) /
      probeSize,
  )
  const fontSize = Math.min((width * 0.88) / emWidth, (height * 0.82) / emHeight)
  const fitted = measureAt(fontSize)
  return {
    fontOf,
    fontSize,
    ascent: fitted.actualBoundingBoxAscent || fontSize * 0.8,
    descent: fitted.actualBoundingBoxDescent || fontSize * 0.2,
    width: fitted.width,
  }
}

/** 笔迹绘制器的全部可变状态。 */
interface InkState {
  view: Window & typeof globalThis
  host: HTMLElement
  canvas: HTMLCanvasElement | null
  context: CanvasRenderingContext2D | null
  reducedMotion: MediaQueryList
  offscreen: HTMLCanvasElement | null
  progress: number
  startedAt: number
  frameId: number | null
  resizeObserver: ResizeObserver | null
}

/** 把整句文案画进离屏画布。 */
function buildInk(state: InkState) {
  const { host, offscreen } = state
  const targetContext = offscreen?.getContext('2d')
  const text = (host.querySelector('.editor-canvas-welcome-art span')?.textContent || 'Welcome to HomeOS').trim()
  if (!targetContext || !offscreen || !text) return
  const canvasWidth = offscreen.width
  const canvasHeight = offscreen.height
  targetContext.setTransform(1, 0, 0, 1, 0, 0)
  targetContext.clearRect(0, 0, canvasWidth, canvasHeight)
  const layout = measureInkLayout(targetContext, text, canvasWidth, canvasHeight)
  targetContext.font = layout.fontOf(layout.fontSize)
  targetContext.textAlign = 'left'
  targetContext.textBaseline = 'alphabetic'
  targetContext.lineCap = 'round'
  targetContext.lineJoin = 'round'
  // 一道固定的七色彩虹横跨整句（上游 13 → 783 的锚点），笔迹走过去颜色不流动。
  const inkGradient = targetContext.createLinearGradient(
    canvasWidth * INK_GRADIENT_FROM,
    0,
    canvasWidth * INK_GRADIENT_TO,
    0,
  )
  for (const [offset, color] of INK_GRADIENT_STOPS) inkGradient.addColorStop(offset, color)
  targetContext.strokeStyle = inkGradient
  targetContext.lineWidth = INK_STROKE_RATIO * canvasWidth
  // 按实测升部/降部把整行垂直居中（花体的长尾不会顶出画布）。
  const baseY = canvasHeight / 2 + (layout.ascent - layout.descent) / 2
  targetContext.strokeText(text, (canvasWidth - layout.width) / 2, baseY)
}

/** 按当前 `progress` 把离屏画布「揭示」到可见画布上。 */
function paintInk(state: InkState) {
  const { context, canvas, offscreen } = state
  if (!context || !canvas || !offscreen) return
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.clearRect(0, 0, canvas.width, canvas.height)
  const revealedWidth = Math.max(1, offscreen.width * state.progress)
  context.drawImage(offscreen, 0, 0, revealedWidth, offscreen.height, 0, 0, revealedWidth, canvas.height)
}

/** 按容器尺寸重建离屏画布（DPR ≤ 2）。 */
function rebuildInk(state: InkState) {
  const { canvas, view } = state
  if (!canvas) return
  const bounds = canvas.getBoundingClientRect()
  const pixelRatio = Math.min(view.devicePixelRatio || 1, 2)
  const nextWidth = Math.max(1, Math.round(bounds.width * pixelRatio))
  const nextHeight = Math.max(1, Math.round(bounds.height * pixelRatio))
  if (canvas.width !== nextWidth) canvas.width = nextWidth
  if (canvas.height !== nextHeight) canvas.height = nextHeight
  state.offscreen ??= canvas.ownerDocument.createElement('canvas')
  state.offscreen.width = nextWidth
  state.offscreen.height = nextHeight
  buildInk(state)
  paintInk(state)
}

/** 一帧：按**墙上时间**推进进度。 */
function stepInk(state: InkState) {
  state.frameId = null
  // 进度按墙上时间而不是 rAF 帧数：SPA 引导期主线程很忙、rAF 会被明显节流，
  // 按帧算的话 2380ms 到点只画到一半，收尾时再「瞬跳补满」，观感是抖一下。
  state.progress = state.reducedMotion.matches ? 1 : Math.min(1, (Date.now() - state.startedAt) / REVEAL_DURATION_MS)
  paintInk(state)
  if (state.progress < 1) state.frameId = state.view.requestAnimationFrame(() => stepInk(state))
}

/** 从头写一遍。 */
function startInk(state: InkState) {
  if (!state.context || !state.canvas) return
  state.progress = state.reducedMotion.matches ? 1 : 0
  state.startedAt = Date.now()
  rebuildInk(state)
  state.resizeObserver = new ResizeObserver(() => rebuildInk(state))
  state.resizeObserver.observe(state.canvas)
  if (state.progress < 1) state.frameId = state.view.requestAnimationFrame(() => stepInk(state))
}

/** 收尾：停掉动画并把笔迹补满（半截字在淡出时像渲染错误）。 */
function stopInk(state: InkState) {
  if (state.frameId !== null) state.view.cancelAnimationFrame(state.frameId)
  state.frameId = null
  state.resizeObserver?.disconnect()
  state.resizeObserver = null
  if (!state.context || state.progress >= 1) return
  state.progress = 1
  paintInk(state)
}

/** 叠层的全部可变状态。 */
interface WelcomeState {
  root: HTMLElement
  view: Window & typeof globalThis
  ink: InkState
  isActive: boolean
  revision: number
  pollTimer: number | null
  hideTimer: number | null
  visibleAt: number
  dismissController: AbortController | null
}

function stopPolling(state: WelcomeState) {
  if (state.pollTimer !== null) state.view.clearInterval(state.pollTimer)
  state.pollTimer = null
}

function stopDismissListeners(state: WelcomeState) {
  state.dismissController?.abort()
  state.dismissController = null
}

/** 真正的收尾（已经过了最短可见时长且笔迹写完了才会走到这里）。 */
function hideWelcomeNow(state: WelcomeState) {
  if (!state.isActive) return
  state.isActive = false
  if (state.hideTimer !== null) state.view.clearTimeout(state.hideTimer)
  state.hideTimer = null
  stopPolling(state)
  stopDismissListeners(state)
  stopInk(state.ink)
  state.root.classList.remove('is-loading')
  state.root.setAttribute('aria-hidden', 'true')
}

/** 用户主动打断（点击 / 按键 / 滚轮）：不等了，立刻进画布。 */
function dismissWelcome(state: WelcomeState) {
  state.revision += 1
  hideWelcomeNow(state)
}

function showWelcome(state: WelcomeState) {
  // 上一轮可能在淡出排队中（例如切仪表盘时连着 begin）：取消它，重新写一遍。
  if (state.hideTimer !== null) {
    state.view.clearTimeout(state.hideTimer)
    state.hideTimer = null
  }
  state.isActive = true
  state.visibleAt = Date.now()
  state.root.setAttribute('aria-hidden', 'false')
  state.root.classList.add('is-loading')
  if (state.ink.context) state.root.classList.add('has-ink')
  startInk(state.ink)
  // 欢迎层在 `.is-loading` 期间接管指针（上游同），所以这几下事件一定落在它自己身上；
  // 想赶紧开始编辑的用户点一下就能跳过。
  state.dismissController = new AbortController()
  const signal = state.dismissController.signal
  state.root.addEventListener('pointerdown', () => dismissWelcome(state), { capture: true, signal })
  state.root.addEventListener('wheel', () => dismissWelcome(state), { capture: true, signal, passive: true })
  state.view.document.addEventListener('keydown', () => dismissWelcome(state), { capture: true, signal })
}

/**
 * 请求收尾：载入完成不代表可以立刻收起。
 *
 * 两个条件都要满足才淡出，否则会出现「只写了两三笔就消失」或「写到一半瞬跳补满」：
 * 1. 已可见至少 `MIN_VISIBLE_MS`（本地一次网络往返就载完，靠这条保证看得见）；
 * 2. 笔迹真的写完（`progress >= 1`）—— rAF 在引导期会被节流，只按时间等不够。
 */
function hideWelcome(state: WelcomeState) {
  if (!state.isActive || state.hideTimer !== null) return
  const waitForInk = () => {
    if (!state.isActive) return
    const remaining = state.ink.reducedMotion.matches ? 0 : MIN_VISIBLE_MS - (Date.now() - state.visibleAt)
    if (remaining <= 0 && state.ink.progress >= 1) {
      state.hideTimer = null
      hideWelcomeNow(state)
      return
    }
    state.hideTimer = state.view.setTimeout(waitForInk, remaining > 0 ? Math.min(remaining, 80) : 40)
  }
  waitForInk()
}

/**
 * 等到容器里没有「待呈现」的 3D 宿主再淡出。
 *
 * 上游靠 `MutationObserver` 监听 `aria-busy` / `hidden`；本项目的呈现状态是宿主上的
 * 方法（不写 DOM 属性），所以改成轻量轮询 —— 每 120ms 一次、命中即停，并留 12s 上限。
 */
function waitForPresentation(state: WelcomeState, container: Element | null, expectedRevision: number) {
  if (!isPresentationPending(container)) {
    hideWelcome(state)
    return
  }
  const deadline = Date.now() + PRESENTATION_TIMEOUT_MS
  state.pollTimer = state.view.setInterval(() => {
    if (!state.isActive || expectedRevision !== state.revision) {
      stopPolling(state)
      return
    }
    if (!isPresentationPending(container) || Date.now() > deadline) hideWelcome(state)
  }, PRESENTATION_POLL_MS)
}

/**
 * 绑定到 `#editor-canvas-welcome` 的控制器。
 *
 * 状态全在 `WelcomeState` 里，逻辑在模块级小函数上；这个工厂只负责装配。
 */
export function createEditorCanvasWelcome(rootElement: HTMLElement | null): EditorCanvasWelcome {
  if (!rootElement) return { begin: () => () => {}, clear: () => {}, dispose: () => {} }
  const view = rootElement.ownerDocument.defaultView ?? window
  const canvas = rootElement.querySelector('canvas')
  // `Path2D`/2D 上下文不可用的环境退回纯文字欢迎语，不画笔迹。
  const context = canvas?.getContext('2d') ?? null
  const state: WelcomeState = {
    root: rootElement,
    view,
    ink: {
      view,
      host: rootElement,
      canvas,
      context,
      reducedMotion: view.matchMedia('(prefers-reduced-motion: reduce)'),
      offscreen: null,
      progress: 0,
      startedAt: 0,
      frameId: null,
      resizeObserver: null,
    },
    isActive: false,
    revision: 0,
    pollTimer: null,
    hideTimer: null,
    visibleAt: 0,
    dismissController: null,
  }
  return {
    begin() {
      const expectedRevision = ++state.revision
      stopPolling(state)
      // 连开两次（切仪表盘）时重写一遍，第二遍也是完整的。
      if (state.isActive) startInk(state.ink)
      else showWelcome(state)
      return (readyRoot: Element | null = null) => {
        if (!state.isActive || expectedRevision !== state.revision) return
        waitForPresentation(state, scopeOf(readyRoot ?? state.root), expectedRevision)
      }
    },
    clear() {
      state.revision += 1
      // 「没有仪表盘」必须立刻收起：否则空态提示会被「加载中…」盖住一两秒。
      hideWelcomeNow(state)
    },
    dispose() {
      state.revision += 1
      hideWelcomeNow(state)
    },
  }
}

/** 惰性单例：同一次编辑器会话里 `#editor-canvas-welcome` 不会换节点。 */
let boundRoot: HTMLElement | null = null
let boundController: EditorCanvasWelcome | null = null

function controllerFor(ownerDocument: Document): EditorCanvasWelcome | null {
  const rootElement = ownerDocument.getElementById('editor-canvas-welcome')
  if (!rootElement) return null
  if (boundController && boundRoot === rootElement && rootElement.isConnected) return boundController
  boundController?.dispose()
  boundRoot = rootElement
  boundController = createEditorCanvasWelcome(rootElement)
  return boundController
}

/** 开始等待文档载入；返回结束函数（由加载流程在 finally 调用）。 */
export function beginEditorCanvasWelcome(ownerDocument: Document = document): (readyRoot?: Element | null) => void {
  return controllerFor(ownerDocument)?.begin() ?? (() => {})
}

/** 立刻收尾（没有仪表盘时）。 */
export function clearEditorCanvasWelcome(ownerDocument: Document = document) {
  if (!boundController) return
  // 节点已被 Vue 重建/移除（路由重挂载）时只做释放，别在孤儿节点上改 class。
  if (!boundRoot || !ownerDocument.getElementById('editor-canvas-welcome')) {
    boundController.dispose()
    boundController = null
    boundRoot = null
    return
  }
  boundController.clear()
}

/** 编辑器卸载：释放计时器与动画帧，避免离开页面后还在画。 */
export function disposeEditorCanvasWelcome() {
  boundController?.dispose()
  boundController = null
  boundRoot = null
}
