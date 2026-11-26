/**
 * 「标准光影 / 轻量柔光」切换的**安装层**（0.8.9）。
 *
 * 上游这个开关不是改个布尔值：`F8(mode)` 会请求一次 access、抓快照、换管线、重建预览、
 * 再恢复快照 —— 因为两条管线互斥（区域管线会换受光面材质，标准管线按逐灯投影算阴影图集）。
 *
 * 本模块只做三件事，渲染细节全部交给宿主的 `applyLightingPipeline`：
 * 1. 把草稿里的 `settings.lightingMode` 作为初值同步到按钮，**草稿落定后要再同步一次**；
 * 2. 点击时写草稿 + 切管线 + 重建灯光层（灯光要重新注册到新控制器），失败回滚；
 * 3. 嵌入舞台 / 自动导图里整行隐藏（上游 `yl.hidden = B || Me`）。
 */
import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import {
  LIGHTING_MODE_VERSION,
  paintLightingModeButtons,
  syncFixtureLightingRow,
  type StageLightingMode,
} from './lighting-row'

const ROW_ID = 'drawing-lighting-row'

/**
 * 只读草稿模式的宿主。
 *
 * 两个嵌入标志是可选字段：`applyLoadedDraft` 与 `installLightingRow` 传进来的对象
 * （deps / runtime）字段名不同，任一为真都算「不该出现这行」。
 */
export type LightingModeHost = {
  appCtx: {
    studioState?: { settings?: { lightingMode?: unknown } } | null
    previewLightingMode?: unknown
    isMaterialPrecompilePending?: unknown
  }
  isEmbedStageMode?: unknown
  isEmbeddedStage?: unknown
  isAutoDiagramEmbed?: unknown
}

/** 从草稿里读当前模式（缺省标准光影）。 */
export function readDraftLightingMode(host: LightingModeHost): StageLightingMode {
  const settings = host.appCtx?.studioState?.settings as { lightingMode?: unknown } | undefined
  return settings?.lightingMode === 'region' ? 'region' : 'standard'
}

/** 当前**管线**模式。与草稿字段分开：切换失败时只回滚草稿，管线另有一套状态。 */
function liveLightingMode(host: LightingModeHost): StageLightingMode {
  return host.appCtx?.previewLightingMode === 'region' ? 'region' : 'standard'
}

/**
 * 重建排在 rAF 里；再排一次渲染，让切换结果**立刻**可见。
 *
 * 换管线时不再顺手渲染（见 `applyLightingPipeline` 的 `render` 选项），而重建完成后的
 * 重绘只保证「实时」同步模式；手动模式下不补这一帧，用户会看到按钮切了、画面没动。
 * `requestSceneRebuild` 的 rAF 先登记，所以这一帧一定排在重建之后。
 */
function renderAfterRebuild(runtime: StudioAppRuntime): void {
  if (typeof window === 'undefined') return
  window.requestAnimationFrame(() => runtime.renderStudioFrame?.())
}

/** 嵌入舞台与自动导图里没有「切光影」这回事（上游 `B || Me`）。 */
function rowShouldHide(host: LightingModeHost): boolean {
  return host.isEmbedStageMode === true || host.isEmbeddedStage === true || host.isAutoDiagramEmbed === true
}

/**
 * 应用一次模式切换。
 *
 * 顺序不能变：先写 `appCtx.previewLightingMode`（灯光构建时读它决定是否注册），
 * 再换管线，最后重建 —— 反过来的话新灯光会注册到旧控制器上，而旧控制器随即被销毁。
 *
 * 失败要**回滚整条管线**（上游 catch 分支同样 `wh(previous) + ln() + ur(snapshot)`）：
 * 两条管线互斥，只改草稿字段会让按钮显示新模式、画面停在旧模式（或半新半旧＝双倍亮度）。
 */
export function applyPreviewLightingMode(runtime: StudioAppRuntime, mode: StageLightingMode): void {
  const settings = runtime.appCtx.studioState?.settings as
    | { lightingMode?: StageLightingMode; lightingModeVersion?: number }
    | undefined
  if (!settings) return
  const previousMode = liveLightingMode(runtime)
  if (previousMode === mode) return
  settings.lightingMode = mode
  settings.lightingModeVersion = LIGHTING_MODE_VERSION
  runtime.appCtx.previewLightingMode = mode
  try {
    // `render: false`：换完管线立刻整场景重建，中间那一帧还没有灯注册进新控制器
    // （区域模式下是整片发灰）—— 上游 `wh()` 在同一任务里紧接 `Jn()`，同样不渲染。
    runtime.appCtx.applyLightingPipeline?.(mode, { render: false })
    // 整场景重建（不是分 scope 调两次）：灯光要重新注册到新控制器，受光面材质也被换过，
    // 分两次会跑两遍材质预编译。上游 `F8` 同样是「换管线 + 重建预览」。
    runtime.requestSceneRebuild({ force: true, preserveLightCache: false })
    renderAfterRebuild(runtime)
  } catch (switchError) {
    settings.lightingMode = previousMode
    runtime.appCtx.previewLightingMode = previousMode
    try {
      runtime.appCtx.applyLightingPipeline?.(previousMode, { render: false })
      runtime.requestSceneRebuild({ force: true, preserveLightCache: false })
      renderAfterRebuild(runtime)
    } catch (revertError) {
      // 回滚也失败：管线已经处于不可用状态，只能把两段原因都留给现场排查。
      if (typeof window !== 'undefined') {
        window.HomeOSLog?.error?.(revertError, { phase: 'studio-lighting-mode-revert' })
      }
    }
    syncLightingRow(runtime)
    throw switchError
  }
  runtime.markDocumentDirty()
  syncLightingRow(runtime)
}

/** 同步按钮选中态（`aria-pressed` 同时驱动样式与读屏）。 */
export function syncLightingRow(runtime: LightingModeHost): void {
  syncFixtureLightingRow({
    lightingMode: readDraftLightingMode(runtime),
    hideModeRow: rowShouldHide(runtime),
    fixture: null,
    isLamp: false,
    override: undefined,
    setLightingMode: () => {},
    editFixtureRange: () => {},
  })
}

/**
 * 等下一帧画完再执行切换重活。
 *
 * 切换一次要 dispose 两三个控制器、重编 40+ 个 shader、再整场景重建，主线程会连续占用
 * 0.4~0.7s。这段活如果和 click 处理器同步跑，浏览器在它返回前不会重绘 ——
 * 按钮的按下态一直画不出来，用户看到的就是「按下去没反应，然后按钮和画面一起跳」。
 * `requestAnimationFrame` 保证选中态已经提交渲染，`setTimeout 0` 再让出一次任务，
 * 让那次绘制真正上屏，之后才开始重活。
 */
function runAfterPaint(runHeavyWork: () => void): void {
  // 隐藏页签里 rAF 根本不触发：此时不排队，直接干活（否则切完去看别的标签页，
  // 回来才发现光影没切）。
  if (typeof window === 'undefined' || document.hidden) {
    runHeavyWork()
    return
  }
  window.requestAnimationFrame(() => window.setTimeout(runHeavyWork, 0))
}

/**
 * 安装点击绑定（只绑一次）。
 *
 * 不用 `bindStudioChrome` 转发：那个入口的 import 已经很多，
 * 而这里只多一处 DOM 事件，放在 boot 的装配段更直接。
 */
export function installLightingRow(runtime: StudioAppRuntime): void {
  const row = document.getElementById(ROW_ID)
  if (!row || row.dataset.lightingRowBound === '1') return
  row.dataset.lightingRowBound = '1'
  row.addEventListener('click', (clickEvent) => {
    const target = clickEvent.target
    const button = target instanceof Element ? target.closest<HTMLElement>('[data-drawing-lighting]') : null
    const requested = button?.dataset.drawingLighting
    if (requested !== 'standard' && requested !== 'region') return
    // 判据用**当前管线**而不是草稿字段：切换失败时草稿会被回滚，两者一旦不同步，
    // 按草稿判会把「点高亮的那个按钮」直接吞掉（看着像点了没反应）。
    if (liveLightingMode(runtime) === requested) return
    // 上一次切换的重建还在排队：再排一次就是两轮全场景重建（两轮 shader 重编）。
    // 只挡这不到一帧的窗口，不做长时间禁用 —— 冻结期内按钮仍然可点，代价由用户在
    // 冻结结束后点到的那一下承担，和上游一致。
    if (row.dataset.lightingPending === '1' || runtime.appCtx.isMaterialPrecompilePending === true) return
    // 乐观上屏：先在当前任务里把选中态写上，重活推到绘制之后。
    // **不能**顺手改 `previewLightingMode` —— 那是「当前管线」，`applyPreviewLightingMode`
    // 靠它判断上一模式（相同就直接返回），提前改会让真正的切换被当成空操作。
    row.dataset.lightingPending = '1'
    paintLightingModeButtons(requested)
    runAfterPaint(() => {
      delete row.dataset.lightingPending
      try {
        applyPreviewLightingMode(runtime, requested)
      } catch (switchError) {
        // `applyPreviewLightingMode` 内部已回滚管线与草稿；这里只补按钮的最终态。
        syncLightingRow(runtime)
        throw switchError
      }
    })
  })
  syncLightingRow(runtime)
}
