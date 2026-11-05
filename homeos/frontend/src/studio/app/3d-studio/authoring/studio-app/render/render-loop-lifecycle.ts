/**
 * 渲染循环里与相机同步 / 资源回收相关的叶子操作（从 `runStudioRenderLoop` 的闭包里拆出）。
 *
 * 拆出的原因只有一个：宿主文件已经是「一个函数装下整个渲染循环」的形态，任何新增的回收逻辑
 * 都会让它继续膨胀。这里只放不依赖闭包状态的动作，闭包状态一律由调用方显式传入。
 */

type OrbitControlsLike = {
  enablePan?: boolean
  enableZoom?: boolean
  minPolarAngle?: number
  maxPolarAngle?: number
  minAzimuthAngle?: number
  maxAzimuthAngle?: number
  getPolarAngle: () => number
  getAzimuthalAngle: () => number
}

type CameraLike = {
  uuid: string
  setViewOffset: (
    fullWidth: number,
    fullHeight: number,
    offsetX: number,
    offsetY: number,
    width: number,
    height: number,
  ) => void
  clearViewOffset: () => void
}

type ScreenSize = { x?: number; y?: number }

/** 渲染循环闭包里与相机相关的可变状态。 */
type RenderLoopCameraState = {
  cameraViewMode?: string
  stereoSampleIndex?: number
  lastViewOffsetSignature?: string
  shouldEnablePan?: boolean
  shouldEnableZoom?: boolean
}

/** 渲染循环闭包里自管的帧步进句柄与定时器。 */
type RenderLoopTeardownState = {
  renderTickCounter?: number
  reflectionPassCounter?: number
  overviewTimeoutHandle?: number | null
  presentationHandle?: number | null
  isPresentationRunning?: boolean
  hasEffectsPrepared?: boolean
}

export function applyOrbitControlSettingsTo(
  appCtx: { orbitControls: OrbitControlsLike },
  ctx: RenderLoopCameraState,
): void {
  const orbitControls = appCtx.orbitControls
  orbitControls.enablePan = ctx.shouldEnablePan
  orbitControls.enableZoom = ctx.shouldEnableZoom
  if (ctx.cameraViewMode === 'horizontal')
    orbitControls.minPolarAngle = orbitControls.maxPolarAngle = orbitControls.getPolarAngle()
  if (ctx.cameraViewMode === 'vertical')
    orbitControls.minAzimuthAngle = orbitControls.maxAzimuthAngle = orbitControls.getAzimuthalAngle()
}

/**
 * 立体采样下把相机视口偏移同步到渲染分辨率。
 *
 * 签名没变时只重算快照相机，避免每帧都 `setViewOffset`（three.js 会因此重建投影矩阵）。
 */
export function syncViewOffsetFor(
  appCtx: { threeRenderer: { getSize: (target: ScreenSize) => unknown }; threeCamera: CameraLike },
  ctx: RenderLoopCameraState,
  projectedScreenPoint: ScreenSize,
  syncSnapshotCamera: () => void,
): void {
  appCtx.threeRenderer.getSize(projectedScreenPoint)
  const viewOffsetWidth = Math.max(projectedScreenPoint.x || 1, 1),
    viewOffsetHeight = Math.max(projectedScreenPoint.y || 1, 1),
    stereoSampleIndex = ctx.stereoSampleIndex ?? 0,
    viewOffsetSignature =
      viewOffsetWidth + '/' + viewOffsetHeight + '/' + stereoSampleIndex + '/' + appCtx.threeCamera.uuid
  if (viewOffsetSignature === ctx.lastViewOffsetSignature) {
    syncSnapshotCamera()
    return
  }
  ctx.lastViewOffsetSignature = viewOffsetSignature
  if (stereoSampleIndex)
    appCtx.threeCamera.setViewOffset(
      viewOffsetWidth,
      viewOffsetHeight,
      (viewOffsetWidth * stereoSampleIndex) / 2,
      0,
      viewOffsetWidth,
      viewOffsetHeight,
    )
  else appCtx.threeCamera.clearViewOffset()
  syncSnapshotCamera()
}

/**
 * 本次渲染循环的显式回收入口（幂等）。
 *
 * SPA 内路由切换不会触发 `pagehide`，而四个渲染子系统原先只在 `pagehide` 上 dispose：
 * 旧实例的探针捕获循环与交互预热会与新实例并存，持续出帧、抓住已 release 的 scene，
 * 并把 GPU 时间翻倍。闭包里自管的 RAF / 定时器同理必须在这里取消。
 */
export function createRenderLoopTeardown(params: {
  state: RenderLoopTeardownState
  appCtx: { rendererLossHandler?: unknown }
  groundReflections: unknown
  progressListeners: { clear: () => void }
  subsystems: ({ dispose?: () => void } | null | undefined)[]
  releaseInteractionBatches: () => void
}): () => void {
  let isDisposed = false
  return () => {
    if (isDisposed) return
    isDisposed = true
    const { state } = params
    if (state.renderTickCounter) cancelAnimationFrame(state.renderTickCounter)
    state.renderTickCounter = 0
    if (state.reflectionPassCounter) cancelAnimationFrame(state.reflectionPassCounter)
    state.reflectionPassCounter = 0
    if (state.overviewTimeoutHandle != null) window.clearTimeout(state.overviewTimeoutHandle)
    state.overviewTimeoutHandle = null
    if (state.presentationHandle != null) window.clearTimeout(state.presentationHandle)
    state.presentationHandle = null
    params.progressListeners.clear()
    for (const renderSubsystem of params.subsystems) {
      try {
        renderSubsystem?.dispose?.()
      } catch (disposeError) {
        // 显存/上下文可能已丢失，单个子系统回收失败不应阻断其余回收。
        console.warn('[studio] 渲染子系统回收失败', disposeError)
      }
    }
    if (params.appCtx.rendererLossHandler === params.groundReflections) params.appCtx.rendererLossHandler = null
    params.releaseInteractionBatches()
    state.isPresentationRunning = false
    state.hasEffectsPrepared = false
  }
}
