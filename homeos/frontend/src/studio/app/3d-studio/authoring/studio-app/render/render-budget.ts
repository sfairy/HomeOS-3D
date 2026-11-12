import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { idleRenderPixelRatio, interactionResourcePolicy } from '../../../studio-resource-policy'
import {
  adaptiveDeviceLightBudget as adaptiveDeviceLightBudget2,
  adaptiveLightRenderCost as adaptiveLightRenderCost2,
  assessAdaptiveRenderFrames as assessAdaptiveRenderFrames2,
  clamp as clamp2,
} from '../../../plan/geometry'
import { previewIssues } from '../../../loaders/preview-diagnostics'

const previewIssueCount = () => previewIssues().length

export function assessRenderBudget(runtime: StudioAppRuntime) {
  const bf2 = runtime.collectActiveLightEntries(),
    rendererCanvas = runtime.appCtx.threeRenderer?.domElement,
    previewPixelCount =
      rendererCanvas?.width && rendererCanvas?.height
        ? rendererCanvas.width * rendererCanvas.height
        : Math.max(window.innerWidth * window.innerHeight * 0.32, 120000)
  return {
    count: bf2.length,
    cost: adaptiveLightRenderCost2(
      bf2.map((lightEntry: any) => ({
        type: lightEntry.type,
        angle: lightEntry.lightAngle,
        brightness: lightEntry.lightBrightness,
        enabled: true,
      })),
    ),
    budget: adaptiveDeviceLightBudget2({
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: navigator.deviceMemory,
      previewPixels: previewPixelCount,
    }),
  }
}

export function canRenderScene(runtime: StudioAppRuntime) {
  if (runtime.isEmbeddedStage)
    return (
      (runtime.appCtx.isAdaptiveRenderActive = true),
      (runtime.appCtx.hasAdaptiveRenderStarted = true),
      {
        count: 0,
        cost: 0,
        budget: 0,
      }
    )
  const zl2 = runtime.assessRenderBudget(),
    Yn2 = runtime.appCtx.isAdaptiveRenderActive
  return (
    runtime.appCtx.hasAdaptiveRenderStarted
      ? runtime.appCtx.isAdaptiveRenderActive &&
        zl2.cost < Math.min(zl2.budget * 0.68, Math.max(runtime.appCtx.adaptiveRenderCostBudget * 0.55, 1)) &&
        ((runtime.appCtx.isAdaptiveRenderActive = false),
        (runtime.appCtx.adaptiveRenderCostBudget = 0),
        (runtime.appCtx.slowFrameStreak = 0))
      : (runtime.appCtx.hasAdaptiveRenderStarted = true),
    Yn2 &&
      !runtime.appCtx.isAdaptiveRenderActive &&
      ((runtime.appCtx.modelRevisionCounter += 1),
      (runtime.appCtx.isCacheReady = false),
      (runtime.appCtx.isFrameDirty = false),
      runtime.setFadeOverlay(false)),
    zl2
  )
}

export function applyAdaptiveQuality(runtime: StudioAppRuntime, frameAssessment: any) {
  runtime.appCtx.isAdaptiveRenderActive ||
    !frameAssessment?.sufficient ||
    ((runtime.appCtx.isAdaptiveRenderActive = true),
    (runtime.appCtx.hasAdaptiveRenderStarted = true),
    (runtime.appCtx.adaptiveRenderCostBudget = runtime.assessRenderBudget().cost),
    (runtime.appCtx.modelRevisionCounter += 1),
    (runtime.appCtx.isFrameDirty = true),
    runtime.requestStudioRender())
}

export function resetFrameSamples(runtime: StudioAppRuntime) {
  if (runtime.appCtx.isAdaptiveRenderActive) return
  const renderFrameAssessment = assessAdaptiveRenderFrames2(runtime.appCtx.frameDurationSamples)
  if (!renderFrameAssessment.sufficient) return
  const zl3 = runtime.assessRenderBudget(),
    renderCostRatio = zl3.cost / Math.max(zl3.budget, 1),
    qualityStepLimit = renderCostRatio >= 1.8 ? 3 : renderCostRatio >= 1 ? 4 : 5
  renderFrameAssessment.severe
    ? (runtime.appCtx.slowFrameStreak = qualityStepLimit)
    : renderFrameAssessment.slow
      ? (runtime.appCtx.slowFrameStreak += 1)
      : renderFrameAssessment.smooth && (runtime.appCtx.slowFrameStreak = 0),
    runtime.appCtx.slowFrameStreak >= qualityStepLimit && runtime.applyAdaptiveQuality(renderFrameAssessment)
}

export function recordFrameTime(runtime: StudioAppRuntime, frameTimestamp = performance.now()) {
  if (
    (!runtime.appCtx.isRenderSuppressed && !(runtime.isEmbeddedStage && runtime.appCtx.isPrewarming)) ||
    runtime.appCtx.pendingRuntimeSettings ||
    runtime.appCtx.isAdaptiveRenderActive ||
    !runtime.collectActiveLightEntries().length
  ) {
    runtime.appCtx.samplingWindowStartMs = 0
    return
  }
  if (runtime.appCtx.samplingWindowStartMs > 0) {
    const frameDeltaMs = frameTimestamp - runtime.appCtx.samplingWindowStartMs
    frameDeltaMs >= 8 &&
      (frameDeltaMs <= 120 || (runtime.isEmbeddedStage && frameDeltaMs <= 2000)) &&
      runtime.appCtx.frameDurationSamples.push(Math.min(frameDeltaMs, 120))
  }
  ;(runtime.appCtx.samplingWindowStartMs = frameTimestamp),
    !(runtime.appCtx.frameDurationSamples.length < 24) &&
      (runtime.resetFrameSamples(), runtime.appCtx.frameDurationSamples.splice(0, 12))
}

export function getPreviewSyncMode(runtime: StudioAppRuntime) {
  return runtime.appCtx.studioState.settings?.livePreviewEnabled !== false
}

export function refreshPreviewSync(runtime: StudioAppRuntime) {
  const kl2 = runtime.getPreviewSyncMode()
  for (const previewSyncButton of runtime.previewSyncControls) {
    const isPreviewSyncActive = previewSyncButton.dataset.previewSync === (kl2 ? 'live' : 'manual')
    previewSyncButton.classList.toggle('active', isPreviewSyncActive),
      previewSyncButton.setAttribute('aria-pressed', String(isPreviewSyncActive))
  }
  ;(runtime.refreshPreviewButton.hidden = kl2),
    (runtime.refreshPreviewButton.disabled = !runtime.appCtx.isSceneDirty),
    runtime.refreshPreviewButton.classList.toggle('is-dirty', runtime.appCtx.isSceneDirty),
    (runtime.refreshPreviewButton.textContent = runtime.appCtx.isSceneDirty ? '待更新 · 更新' : '已更新')
}

export function requestStudioRender(runtime: StudioAppRuntime) {
  if (!runtime.appCtx.orbitControls) return
  // 有新内容要画：静态帧缓存作废，下一次整帧重新捕获。
  runtime.effectCache?.invalidate()
  const ht2 = runtime.areLightsEnabled(),
    at6 = runtime.isEmbeddedStage && runtime.appCtx.prewarmState && !runtime.appCtx.isCapturingLights
  runtime.appCtx.lightPrecompileController?.setEnabled(runtime.isEmbeddedStage || !ht2 || !!at6),
    (runtime.appCtx.orbitControls.enableRotate = runtime.getCameraView() !== 'top'),
    /**
     * 预览状态徽标：只有**没有加载异常**时才隐藏。旧实现在每次重绘时无条件清空，
     * 于是刚写进去的「lite 解析失败」下一帧就被抹掉，等于没有诊断。
     */
    runtime.previewQualityStatusElement &&
      previewIssueCount() === 0 &&
      ((runtime.previewQualityStatusElement.hidden = true),
      (runtime.previewQualityStatusElement.title = ''),
      (runtime.previewQualityStatusElement.textContent = '')),
    runtime.refreshLightPreviewButton &&
      ((runtime.refreshLightPreviewButton.hidden = true), (runtime.refreshLightPreviewButton.disabled = true))
}

export function computeRenderPixelRatio(runtime: StudioAppRuntime, isMotionQuality = false) {
  // 参数名历史遗留：true = 运动/交互中的质量档，false = 静置高清档。
  const idleRatio = idleRenderPixelRatio(runtime.isEmbeddedStage ? runtime.appCtx.basePixelRatio : 1)
  if (
    runtime.isEmbeddedStage &&
    isMotionQuality &&
    runtime.appCtx.adaptivePixelRatio !== null &&
    (!runtime.appCtx.isPrewarming || runtime.appCtx.isRenderSuppressed)
  )
    return Math.max(idleRatio * runtime.appCtx.adaptivePixelRatio, Math.min(idleRatio, 1))
  if (runtime.isEmbedStageMode) {
    return isMotionQuality ? Math.min(idleRatio, interactionResourcePolicy.motion.maxPixelRatio) : idleRatio
  }
  const Kt2 = runtime.isEmbeddedStage && runtime.appCtx.isPrewarming
  let ratio = idleRatio
  // 运动期不再把 DPR 硬砍到 1；仅在超预算时温和下调，地板不低于 0.85×idle。
  if (runtime.isEmbeddedStage && (isMotionQuality || Kt2)) {
    const { cost: zl4, budget: zl5 } = runtime.assessRenderBudget()
    zl4 > zl5 && (ratio = Math.min(ratio, clamp2(Math.sqrt(zl5 / zl4) * idleRatio, idleRatio * 0.85, idleRatio)))
  }
  return ratio
}
