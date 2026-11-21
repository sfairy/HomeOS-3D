/**
 * 工作区主视图切换（0.8.7 `createEditorWorkspace` 的对应实现）。
 *
 * 语义不是「改列宽」，而是**把两块画布在两个位置之间对调**：
 * - `plan`  平面为主：中栏放大 `#plan-stage`，右栏顶部是 3D 预览；
 * - `three` 3D 为主：中栏放 3D 预览（真正的大画布），右栏顶部退成「平面副视图」。
 *
 * 0.8.7 是物理移动 DOM 节点。这里照做而不是用 CSS 调换顺序，原因是副视图形态不同：
 * 平面面板退到右栏时只保留一条紧凑工具条（`.editor-secondary-view` 里隐藏 `.tool-group`），
 * 纯改列宽做不出这个形态。
 *
 * 对调会同时改掉两块画布的宽高，所以每次切换后平面都要按**新画布**重新量尺寸并整幅适应
 * （`fitPlanToCanvas`）：从小副视图放大回来时沿用旧 zoom 会把户型裁掉一角，反方向
 * 又会在画布上只剩一小块，两个方向都应当整幅适应。
 *
 * 切换条挂在**当前主视图的画布宿主**（`#plan-stage` / `#preview-3d`）上，而不是面板：
 * `.plan-panel` / `.preview-card` 没有 `position: relative`，挂面板会按外层定位，
 * 「右上角」这个语义就丢了。上游 `createEditorWorkspace` 同样是 `querySelector('#plan-stage')`。
 *
 * 安全性说明：被移动的两个节点（`.plan-panel` / `.preview-card`）在 Vue 模板里是**静态子树**
 * （没有 v-if / v-for），Vue 只会就地 patch 属性，不会依赖它们的父节点，
 * 所以命令式重挂不会和渲染器打架。移动节点本身不会销毁 canvas，WebGL 上下文保留。
 */
import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { cancelEditor3D } from './editor-3d-wiring'
import { dismissOverlapPicker } from './overlap-and-preview-wiring'
import { registerOverlayObstacles } from './overlay-obstacles'
import { LEAVE_PLAN_FOCUS_EVENT } from './workspace-events'

export type WorkspaceMode = 'plan' | 'three'

const STORAGE_KEY = 'ha-bridge:studio:workspace-view'
/** 0.8.7 的标签：`plan` = 平面为主，`three` = 3D为主（注意存的是 `three`，不是 `model`）。 */
const MODE_LABELS: ReadonlyArray<readonly [WorkspaceMode, string]> = [
  ['plan', '平面为主'],
  ['three', '3D为主'],
]
const FLOOR_NOTE_TEXT = '全楼视图仅编辑当前楼层'

interface WorkspaceDom {
  shell: HTMLElement
  planPanel: HTMLElement
  previewPanel: HTMLElement
  detailsPanel: HTMLElement
  mainView: HTMLElement
  primaryView: HTMLElement
  secondaryView: HTMLElement
}

interface WorkspaceBar {
  element: HTMLElement
  buttons: Map<WorkspaceMode, HTMLButtonElement>
  note: HTMLElement
}

export interface Rect {
  left: number
  right: number
  top: number
  bottom: number
}

export interface WorkspaceViewOptions {
  /**
   * 切换前：结束进行中的手势、收起浮层、退出与新主视图冲突的编辑态。
   *
   * 不再交回平面取景快照：切换后平面一律在新画布上整幅适应（见 `fitPlanToCanvas`），
   * 旧 zoom / 中心点不跨主副视图保留。
   */
  beforeChange?: (nextMode: WorkspaceMode) => void
  /** 切换后：重绘两个视图（平面已经在新画布上适应）。 */
  afterChange?: (previousMode: WorkspaceMode) => void
  /** 是否允许切换（嵌入舞台 / 保存中不允许）。 */
  canChange?: () => boolean
}

export interface WorkspaceView {
  readonly mode: WorkspaceMode
  /** 重新按当前状态摆放（例如楼层模式变化后刷新提示）。 */
  refresh: () => void
  /** 切换条相对某宿主的矩形，供 3D 叠层做标签避让；不在该宿主内时返回空数组。 */
  overlayRects: (root: HTMLElement) => Rect[]
  dispose: () => void
}

/** 可变状态：布局函数与切换函数都需要读写同一份。 */
interface WorkspaceState {
  runtime: StudioAppRuntime
  dom: WorkspaceDom
  bar: WorkspaceBar
  mode: WorkspaceMode
  disposed: boolean
  frameId: number
}

function readMode(): WorkspaceMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as { mode?: unknown } | null) : null
    return parsed?.mode === 'three' ? 'three' : 'plan'
  } catch {
    // 存储被禁用 / 内容损坏时回落平面，不要让引导失败。
    return 'plan'
  }
}

function persistMode(mode: WorkspaceMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode }))
  } catch {
    /* 存储不可用时仅本次生效 */
  }
}

/** 找齐五个容器；缺任何一个就说明不在编辑器页面，直接放弃。 */
function collectDom(): WorkspaceDom | null {
  const documentNode = globalThis.document
  const shell = documentNode.querySelector<HTMLElement>('.studio-shell')
  const planPanel = shell?.querySelector<HTMLElement>('.plan-panel')
  const previewPanel = shell?.querySelector<HTMLElement>('.preview-card')
  const detailsPanel = shell?.querySelector<HTMLElement>('.details-panel')
  const mainView = shell?.querySelector<HTMLElement>('.editor-main-view')
  const primaryView = mainView?.querySelector<HTMLElement>('.editor-primary-view')
  const secondaryView = detailsPanel?.querySelector<HTMLElement>('.editor-secondary-view')
  if (!shell || !planPanel || !previewPanel || !detailsPanel || !mainView || !primaryView || !secondaryView) return null
  return { shell, planPanel, previewPanel, detailsPanel, mainView, primaryView, secondaryView }
}

/** 切换按钮条：绝对定位在**当前主视图的画布右上角**，因此每次切换都要跟着搬。 */
function createBar(): WorkspaceBar {
  const documentNode = globalThis.document
  const element = documentNode.createElement('div')
  element.className = 'editor-workspace-bar'
  element.setAttribute('role', 'group')
  element.setAttribute('aria-label', '工作区视图')
  const buttons = new Map<WorkspaceMode, HTMLButtonElement>()
  for (const [mode, label] of MODE_LABELS) {
    const button = documentNode.createElement('button')
    button.type = 'button'
    button.textContent = label
    button.dataset.workspaceAction = mode
    buttons.set(mode, button)
    element.append(button)
  }
  const note = documentNode.createElement('small')
  note.className = 'workspace-floor-note'
  note.textContent = FLOOR_NOTE_TEXT
  element.append(note)
  return { element, buttons, note }
}

/**
 * 主副视图对调后，平面画布的宽高都变了；切换条按钮的语义是「换个大画布看」，
 * 所以每次切换都按新画布整幅适应，而不是沿用旧 zoom / 中心点。
 *
 * 顺序必须是「先量尺寸，再适应」：`resizePlanStage` 同时更新 canvas 背板与
 * `planViewWidth/Height`，而 `resetView` 的可用宽高正是取自这两个值。
 */
function fitPlanToCanvas(runtime: StudioAppRuntime): void {
  runtime.resizePlanStage?.()
  runtime.resetView?.()
}

/** 当前主视图里承载切换条的画布宿主；取不到时退回面板本身。 */
function barHostFor(dom: WorkspaceDom, mode: WorkspaceMode): HTMLElement {
  const panel = mode === 'three' ? dom.previewPanel : dom.planPanel
  const stage = panel.querySelector<HTMLElement>(mode === 'three' ? '#preview-3d' : '#plan-stage')
  return stage ?? panel
}

/** 把两块面板放到对应位置，并同步按钮态与提示。 */
function layoutWorkspace(state: WorkspaceState): void {
  const { dom, bar, mode, runtime } = state
  const primaryPanel = mode === 'three' ? dom.previewPanel : dom.planPanel
  const secondaryPanel = mode === 'three' ? dom.planPanel : dom.previewPanel
  // `append` 对已在文档中的节点是「移动」，不重建；只有位置不同才动，避免无谓的重排。
  if (primaryPanel.parentElement !== dom.primaryView) dom.primaryView.append(primaryPanel)
  if (secondaryPanel.parentElement !== dom.secondaryView) dom.secondaryView.append(secondaryPanel)
  const barHost = barHostFor(dom, mode)
  if (bar.element.parentElement !== barHost) barHost.append(bar.element)
  dom.shell.dataset.editorWorkspace = 'true'
  dom.shell.dataset.workspacePrimary = mode
  dom.secondaryView.hidden = false
  for (const [candidate, button] of bar.buttons) {
    button.classList.toggle('active', candidate === mode)
    button.setAttribute('aria-pressed', String(candidate === mode))
  }
  // 「全楼视图仅编辑当前楼层」只跟楼层模式有关，与主视图无关（0.8.7 `ch()` 同）。
  bar.note.hidden = runtime.getPreviewFloorMode?.() !== 'all'
}

/** 切换：先让调用方收拾现场，再布局、持久化，最后等一帧量尺寸并整幅适应平面。 */
function switchWorkspace(state: WorkspaceState, options: WorkspaceViewOptions, nextMode: WorkspaceMode): void {
  const { runtime } = state
  const previous = state.mode
  options.beforeChange?.(nextMode)
  state.mode = nextMode
  layoutWorkspace(state)
  persistMode(state.mode)
  if (state.frameId) cancelAnimationFrame(state.frameId)
  // 等一帧让布局落定再量尺寸：否则渲染器拿到的还是旧容器宽高。
  state.frameId = requestAnimationFrame(() => {
    state.frameId = 0
    runtime.resizeStudioRenderer?.()
    runtime.resizeRenderCanvas?.()
    fitPlanToCanvas(runtime)
    window.dispatchEvent(new Event('resize'))
    options.afterChange?.(previous)
  })
}

function overlayRectsOf(state: WorkspaceState, root: HTMLElement): Rect[] {
  const { bar } = state
  if (!root.contains(bar.element) || bar.element.hidden) return []
  const barRect = bar.element.getBoundingClientRect()
  const rootRect = root.getBoundingClientRect()
  return [
    {
      left: barRect.left - rootRect.left,
      right: barRect.right - rootRect.left,
      top: barRect.top - rootRect.top,
      bottom: barRect.bottom - rootRect.top,
    },
  ]
}

export function createWorkspaceView(runtime: StudioAppRuntime, options: WorkspaceViewOptions = {}): WorkspaceView {
  /*
   * 嵌入舞台（`/api/v1/modules/interaction3d/stage.html`）只有一个全屏 `#preview-3d`：
   * `stage.css` 会把 `.details-panel` 里**除 `.preview-card` 以外**的子元素全部
   * `display:none !important`。一旦这里参与「平面 / 3D 对调」，默认的 `plan` 模式就会把
   * `.preview-card` 搬进 `.editor-secondary-view` —— 那正是一个被隐藏的容器，于是 3D 画布
   * 被量成 0×0，总览页的 3D 交互只剩天气层（云）在动。舞台不提供切换入口，直接不布线。
   */
  if (runtime.isEmbeddedStage) return { mode: 'plan', refresh: () => {}, overlayRects: () => [], dispose: () => {} }
  const dom = collectDom()
  if (!dom) return { mode: 'plan', refresh: () => {}, overlayRects: () => [], dispose: () => {} }
  const state: WorkspaceState = {
    runtime,
    dom,
    bar: createBar(),
    mode: readMode(),
    disposed: false,
    frameId: 0,
  }
  for (const [candidate, button] of state.bar.buttons) {
    button.addEventListener('click', () => {
      if (state.disposed || candidate === state.mode) return
      if (options.canChange && !options.canChange()) return
      switchWorkspace(state, options, candidate)
    })
  }
  layoutWorkspace(state)
  // 首次进入不写回存储：保持「用户没选过就用默认」的语义。
  if (readMode() !== state.mode) persistMode(state.mode)

  return {
    get mode() {
      return state.mode
    },
    refresh: () => layoutWorkspace(state), // 切层 / 切全楼 / 选中变化后刷新提示
    overlayRects: (root) => overlayRectsOf(state, root),
    dispose() {
      state.disposed = true
      if (state.frameId) cancelAnimationFrame(state.frameId)
      state.bar.element.remove()
    },
  }
}

/**
 * 在 boot 里一行接上：默认钩子全部走 runtime facade，不再从 boot 作用域抓闭包。
 *
 * 这样 boot 那边只需要 `bindWorkspaceView(studioRuntime)`，避免为了四个回调
 * 往已经贴着行数预算的引导文件里再加一段。
 */
/** 按 `appCtx` 记录实例：boot 的 facade 需要在不持有引用的前提下刷新提示条。 */
const workspaceViewsByAppCtx = new WeakMap<object, WorkspaceView>()

/** 刷新当前工作区视图（切层 / 切「全楼」/ 选中变化后由 boot facade 调用）。 */
export function refreshWorkspaceViewFor(appCtx: object): void {
  workspaceViewsByAppCtx.get(appCtx)?.refresh()
}

export function bindWorkspaceView(runtime: StudioAppRuntime): WorkspaceView {
  const view = createWorkspaceView(runtime, {
    canChange: () => !runtime.appCtx.isInteractionLocked && !runtime.isEmbeddedStage,
    beforeChange: (nextMode) => {
      // 结束而不是丢弃进行中的手势：3D 拖动会先提交，避免留下「改过但没进历史」的状态。
      runtime.endStudioGesture()
      cancelEditor3D(runtime.appCtx)
      dismissOverlapPicker(runtime)
      // 切到 3D 为主时回到选择工具（上游同）：3D 视口里没有画墙 / 画门的概念。
      if (nextMode === 'three') runtime.selectStudioTool?.('select')
      // 「平面聚焦」收掉的是右栏，而 3D 面板正是搬进右栏：不退出就会量成 0×0。
      if (nextMode === 'three') globalThis.dispatchEvent(new CustomEvent(LEAVE_PLAN_FOCUS_EVENT))
    },
    afterChange: () => {
      runtime.refreshStudioUi()
      runtime.refreshStudioView()
      runtime.syncExportControls?.()
    },
  })
  workspaceViewsByAppCtx.set(runtime.appCtx, view)
  // 切换条也参与 3D 标签避让：它是浮在画布右上角的可点元素，标签盖上去就点不到。
  const unregister = registerOverlayObstacles(runtime.appCtx, (root) => view.overlayRects(root as HTMLElement))
  const originalDispose = view.dispose
  view.dispose = () => {
    unregister()
    originalDispose()
  }
  return view
}
