import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { urlFlag } from '../../../render-kit/url-flags'
import { recordStudioGpuIncident } from '../../../studio-gpu-compat'

/** 上下文丢失后等浏览器自己恢复的窗口；超过它基本可以认定 GPU 进程没能重建（Edge 会退化到 --use-gl=disabled）。 */
const CONTEXT_LOST_RECOVERY_TIMEOUT_MS = 8000
const CONTEXT_LOST_HINT_TEXT = '3D 图形上下文丢失，正在自动恢复…'
const CONTEXT_LOST_FATAL_TEXT = '3D 图形上下文已丢失且未能自动恢复，请刷新页面重试。'
/** `#webgl-message` 节点缺失（或文案被清空）时的兜底：恢复后别把提示留成空白。 */
const CONTEXT_LOST_FALLBACK_TEXT = '当前浏览器无法创建 3D 画面。'

/**
 * 编辑器里给「上下文丢失」一个可见出口。
 *
 * 此前编辑器只在丢失时上报 RUM，画布就那样定住：GPU 进程崩过之后浏览器未必还能恢复
 * （Edge 连续崩溃后会用 `--use-gl=disabled` 重启 GPU 进程，`webglcontextrestored` 永远不来），
 * 用户看到的是「点什么都没反应 + 3D 定格」。这里复用初始化失败那块 `#webgl-message`：
 * 先提示正在恢复，超时仍未恢复就明确让人刷新。
 *
 * 嵌入舞台不在这里显示：宿主的 `applyStageGpuHint` 已有同名提示，两条叠在一起更乱。
 */
function createContextLostHint(runtime: StudioAppRuntime, ownerDocument: Document) {
  let recoveryTimer: number | null = null
  let isShown = false
  // 初始化失败的兜底文案也写在这个节点上（见 createStudioRenderer 的 catch）；
  // 恢复后要还回去，不能留空 —— 否则下次真失败时用户看到的是一块空白提示。
  const defaultText = ownerDocument.getElementById('webgl-message')?.textContent?.trim() || CONTEXT_LOST_FALLBACK_TEXT
  const clearRecoveryTimer = () => {
    if (recoveryTimer !== null) window.clearTimeout(recoveryTimer)
    recoveryTimer = null
  }
  const paint = (text: string) => {
    const messageElement = ownerDocument.getElementById('webgl-message') as HTMLElement | null
    if (!messageElement) return false
    messageElement.hidden = false
    messageElement.textContent = text
    isShown = true
    return true
  }
  return {
    show() {
      if (runtime.isEmbeddedStage) return
      clearRecoveryTimer()
      if (!paint(CONTEXT_LOST_HINT_TEXT)) return
      recoveryTimer = window.setTimeout(() => {
        recoveryTimer = null
        paint(CONTEXT_LOST_FATAL_TEXT)
      }, CONTEXT_LOST_RECOVERY_TIMEOUT_MS)
    },
    hide() {
      clearRecoveryTimer()
      if (!isShown) return
      isShown = false
      const messageElement = ownerDocument.getElementById('webgl-message') as HTMLElement | null
      if (!messageElement) return
      messageElement.hidden = true
      messageElement.textContent = defaultText
    },
    dispose() {
      clearRecoveryTimer()
    },
  }
}

export function renderStudioFrame(runtime: StudioAppRuntime) {
  ;(runtime.appCtx.isLightCacheReady = true),
    (runtime.appCtx.isLightCachePending = false),
    runtime.appCtx.lightingScheduler?.wake()
}

export function bindFrameDriver(runtime: StudioAppRuntime, frameCallback: any) {
  const domElement3 = runtime.appCtx.threeRenderer.domElement,
    contextLostHint = createContextLostHint(runtime, domElement3.ownerDocument),
    handleRendererLost = (rendererLostEvent: any) => {
      rendererLostEvent.preventDefault(),
        // 上下文丢失是 GPU 进程出问题最直接的信号：记一条带时间的故障，连续出现会在
        // 下一次引导自动切到兼容模式（见 studio-gpu-compat.ts）。
        recordStudioGpuIncident('context-lost'),
        !runtime.appCtx.isDisposed &&
          ((runtime.appCtx.isDisposed = true),
          runtime.emitRuntimeDiagnostic('gpu-lost'),
          contextLostHint.show(),
          // 先就地 dispose 渲染期登记的 GPU 资源再清缓存，否则上下文丢失后它们悬空占显存。
          runtime.appCtx.contextResources?.releaseLostContext(),
          runtime.appCtx.lightingScheduler?.setAvailable(false),
          (runtime.appCtx.modelRevisionCounter += 1),
          (runtime.appCtx.isFrameDirty = true),
          window.clearTimeout(runtime.appCtx.renderCommitTimeoutId),
          (runtime.appCtx.renderCommitTimeoutId = null),
          runtime.appCtx.activeLongTask?.cancel(),
          runtime.disposeShadowAtlas(),
          runtime.appCtx.compiledShaderCache?.clear(),
          runtime.effectCache?.resetContext(),
          runtime.previewResources?.release(),
          window.clearTimeout(runtime.appCtx.precompileDebounceId),
          (runtime.appCtx.precompileDebounceId = null),
          window.clearTimeout(runtime.appCtx.precompileTimeoutId),
          (runtime.appCtx.precompileTimeoutId = null),
          (runtime.appCtx.isEnvironmentLoading = true),
          runtime.appCtx.lightPrecompileController?.setContextLost(true))
    },
    handleRendererRestored = () => {
      runtime.appCtx.isDisposed &&
        ((runtime.appCtx.isDisposed = false),
        runtime.emitRuntimeDiagnostic('gpu-restored'),
        contextLostHint.hide(),
        runtime.disposeShadowAtlas(),
        runtime.appCtx.compiledShaderCache?.clear(),
        runtime.effectCache?.resetContext(),
        runtime.previewResources?.release(),
        (runtime.appCtx.isCacheReady = false),
        (runtime.appCtx.isFrameDirty = true),
        runtime.setFadeOverlay(false),
        runtime.appCtx.contactShadowController?.invalidateContext(),
        runtime.appCtx.rendererLossHandler?.invalidateContext(),
        runtime.appCtx.threeScene?.traverse((traversedLight: any) => {
          traversedLight.isLight &&
            traversedLight.castShadow &&
            traversedLight.shadow &&
            (traversedLight.shadow.needsUpdate = true)
        }),
        (runtime.appCtx.currentPrecompileSignature = ''),
        runtime.precompiledMaterialKeySet.clear(),
        runtime.renderStudioFrame(),
        frameCallback(),
        runtime.needsMotionPresentation() && runtime.scheduleLightPrecompile())
    }
  return (
    domElement3.addEventListener('webglcontextlost', handleRendererLost),
    domElement3.addEventListener('webglcontextrestored', handleRendererRestored),
    () => {
      contextLostHint.dispose(),
        domElement3.removeEventListener('webglcontextlost', handleRendererLost),
        domElement3.removeEventListener('webglcontextrestored', handleRendererRestored)
    }
  )
}

export function setFadeOverlay(runtime: StudioAppRuntime, isOverlayVisible: any) {
  ;(runtime.previewLightCacheCanvasElement.hidden = !isOverlayVisible),
    runtime.isEmbeddedStage &&
      runtime.appCtx.threeRenderer &&
      (runtime.appCtx.threeRenderer.domElement.style.opacity = isOverlayVisible ? '0' : '1')
}

export function hasPendingSceneWork(runtime: StudioAppRuntime) {
  const modelLoadState = runtime.externalModelRegistry.modelLoadState()
  return (
    (modelLoadState.pending ?? modelLoadState.active + modelLoadState.queued) > 0 ||
    runtime.appCtx.isModelLoadPending ||
    runtime.appCtx.replacementFrameCount > 0 ||
    runtime.appCtx.modelLoadTimeoutId !== null ||
    runtime.appCtx.isPrecompileBlocked
  )
}

export function canBuildScene(runtime: StudioAppRuntime) {
  return !(runtime.isEmbeddedStage && runtime.appCtx.isExternalModelPending) && !runtime.hasPendingSceneWork()
}

export function drawToActiveSurface(
  runtime: StudioAppRuntime,
  drawingTargetCanvas: any,
  drawingSourceImage: any,
  isCancelled: any,
) {
  runtime.appCtx.activeLongTask?.cancel()
  const studioOrbitControls = runtime.appCtx.orbitControls,
    renderTaskOptions = {
      cancelled: false,
      frame: null as any,
      timer: null as any,
      idle: null as any,
      cancel: null as any,
    },
    isRenderTaskActive = () => !renderTaskOptions.cancelled && isCancelled(),
    cancelRenderTask = () => {
      ;(renderTaskOptions.cancelled = true),
        renderTaskOptions.frame !== null && window.cancelAnimationFrame(renderTaskOptions.frame),
        renderTaskOptions.timer !== null && window.clearTimeout(renderTaskOptions.timer),
        renderTaskOptions.idle !== null && window.cancelIdleCallback?.(renderTaskOptions.idle),
        (renderTaskOptions.frame = renderTaskOptions.timer = renderTaskOptions.idle = null),
        window.removeEventListener('pagehide', cancelRenderTask),
        window.removeEventListener('pointerdown', cancelRenderTask, true),
        window.removeEventListener('wheel', cancelRenderTask, true),
        studioOrbitControls?.removeEventListener('start', cancelRenderTask),
        studioOrbitControls?.removeEventListener('change', cancelRenderTask),
        drawingSourceImage && ((drawingSourceImage.width = drawingSourceImage.height = 0), (drawingSourceImage = null)),
        runtime.appCtx.activeLongTask === renderTaskOptions && (runtime.appCtx.activeLongTask = null)
    }
  ;(renderTaskOptions.cancel = cancelRenderTask), (runtime.appCtx.activeLongTask = renderTaskOptions)
  const handleRenderTaskError = (renderError: any) =>
      window.HomeOSLog?.error!(renderError, {
        phase: 'interaction3d-cache-write',
      })!,
    handleRenderTaskIdle = () => {
      ;(renderTaskOptions.idle = null),
        Promise.resolve()
          .then(() => {
            if (isRenderTaskActive())
              return runtime.renderCacheWriter?.write(drawingTargetCanvas, drawingSourceImage, isRenderTaskActive)
          })
          .catch(handleRenderTaskError)
          .finally(cancelRenderTask)
    }
  try {
    window.addEventListener('pagehide', cancelRenderTask, {
      once: true,
    }),
      window.addEventListener('pointerdown', cancelRenderTask, {
        capture: true,
        passive: true,
      }),
      window.addEventListener('wheel', cancelRenderTask, {
        capture: true,
        passive: true,
      }),
      studioOrbitControls?.addEventListener('start', cancelRenderTask),
      studioOrbitControls?.addEventListener('change', cancelRenderTask),
      (renderTaskOptions.frame = window.requestAnimationFrame(() => {
        if (((renderTaskOptions.frame = null), !isRenderTaskActive())) {
          cancelRenderTask()
          return
        }
        renderTaskOptions.timer = window.setTimeout(() => {
          if (((renderTaskOptions.timer = null), !isRenderTaskActive())) {
            cancelRenderTask()
            return
          }
          try {
            typeof window.requestIdleCallback == 'function'
              ? (renderTaskOptions.idle = window.requestIdleCallback(handleRenderTaskIdle))
              : handleRenderTaskIdle()
          } catch (renderSetupError: any) {
            cancelRenderTask(), handleRenderTaskError(renderSetupError)
          }
        }, 180)
      }))
  } catch (renderLoopError: any) {
    cancelRenderTask(), handleRenderTaskError(renderLoopError)
  }
}

export function awaitNextFramePair(runtime: StudioAppRuntime) {
  return (
    runtime.captureLightSnapshot(),
    new Promise((resolveFramePair) => requestAnimationFrame(() => requestAnimationFrame(resolveFramePair)))
  )
}

export function captureFramePixels(runtime: StudioAppRuntime, captureWidth: any, captureHeight: any) {
  const captureCanvas = document.createElement('canvas')
  ;(captureCanvas.width = captureWidth), (captureCanvas.height = captureHeight)
  const capturePixelPainter = captureCanvas.getContext('2d', {
    willReadFrequently: true,
  })
  if (!capturePixelPainter) throw new Error('当前浏览器无法创建多灯缓存画布。')
  return (
    capturePixelPainter.drawImage(runtime.appCtx.threeRenderer.domElement, 0, 0, captureWidth, captureHeight),
    capturePixelPainter.getImageData(0, 0, captureWidth, captureHeight)
  )
}

export function rerenderScene(runtime: StudioAppRuntime) {
  for (let renderPassIndex = 0; renderPassIndex < 3; renderPassIndex += 1)
    runtime.appCtx.threeRenderer.render(runtime.appCtx.threeScene, runtime.appCtx.threeCamera)
}

export function ensureRenderReady(_runtime: StudioAppRuntime) {
  return globalThis.scheduler?.yield
    ? globalThis.scheduler.yield()
    : new Promise<void>((resolveRenderWait) => requestAnimationFrame(() => resolveRenderWait()))
}

export function waitForIdleFrame(_runtime: StudioAppRuntime) {
  return globalThis.scheduler?.yield
    ? globalThis.scheduler.yield()
    : typeof globalThis.requestIdleCallback === 'function'
      ? new Promise<void>((resolveIdleWait) =>
          requestIdleCallback(() => resolveIdleWait(), {
            timeout: 80,
          }),
        )
      : new Promise<void>((resolveAnimationWait) => requestAnimationFrame(() => resolveAnimationWait()))
}

export function scheduleStudioRender(runtime: StudioAppRuntime, renderDelayMs = 420) {
  runtime.appCtx.isDisposed ||
    (runtime.isEmbeddedStage && !runtime.appCtx.isHighDetailQuality) ||
    (runtime.isEmbeddedStage && runtime.renderCacheWriter?.closed) ||
    !runtime.appCtx.threeRenderer ||
    !runtime.appCtx.sceneRootNode ||
    runtime.appCtx.pendingRuntimeSettings ||
    runtime.appCtx.isRenderSuppressed ||
    runtime.appCtx.isWindowHidden ||
    runtime.appCtx.isCapturingLights ||
    runtime.appCtx.prewarmState ||
    runtime.appCtx.isPrewarming ||
    !runtime.areLightsEnabled() ||
    (window.clearTimeout(runtime.appCtx.renderCommitTimeoutId),
    (runtime.appCtx.renderCommitTimeoutId = window.setTimeout(() => {
      const modelLoadState2 = runtime.externalModelRegistry.modelLoadState()
      if ((modelLoadState2.pending ?? modelLoadState2.active + modelLoadState2.queued) > 0) {
        ;(runtime.appCtx.renderCommitTimeoutId = null), runtime.scheduleStudioRender(240)
        return
      }
      runtime.beginLightingPreview()
    }, renderDelayMs)))
}

export function discardLightingEdit(runtime: StudioAppRuntime) {
  !runtime.areLightsEnabled() ||
    runtime.appCtx.pendingRuntimeSettings ||
    runtime.appCtx.isCapturingLights ||
    ((runtime.appCtx.isFrameDirty = true), runtime.scheduleStudioRender(0), runtime.requestStudioRender())
}

export function resetPlanInteraction(runtime: StudioAppRuntime) {
  window.clearTimeout(runtime.appCtx.deferredRenderTimeoutId),
    (runtime.appCtx.deferredRenderTimeoutId = null),
    (runtime.appCtx.isWindowHidden = true),
    window.clearTimeout(runtime.appCtx.renderCommitTimeoutId),
    (runtime.appCtx.renderCommitTimeoutId = null),
    runtime.appCtx.isCapturingLights &&
      ((runtime.appCtx.modelRevisionCounter += 1), (runtime.appCtx.isFrameDirty = true))
}

export function endStudioGesture(runtime: StudioAppRuntime) {
  window.clearTimeout(runtime.appCtx.deferredRenderTimeoutId),
    (runtime.appCtx.deferredRenderTimeoutId = window.setTimeout(() => {
      if (
        ((runtime.appCtx.deferredRenderTimeoutId = null),
        (runtime.appCtx.isWindowHidden = false),
        runtime.handleInteractionEnded(),
        runtime.dirtyFloorIdSet.size && !runtime.appCtx.isPrecompileBlocked)
      ) {
        const activeScopes = [...runtime.dirtyFloorIdSet],
          activeScopeName = activeScopes.includes('all') ? 'all' : activeScopes[0]
        runtime.requestSceneRebuild({
          scope: activeScopeName as string,
          preserveLightCache: !runtime.appCtx.isLightCachePreserved,
        })
      }
      runtime.appCtx.isFrameDirty && runtime.scheduleStudioRender(420),
        runtime.appCtx.isModelLoadPending && runtime.requestSceneRender()
    }, 120))
}

/** 效果缓存可用性：与 0.7.8 `ng()` 同一判定集（渲染冲突时一律退回整帧）。 */
export function isEffectCacheReady(runtime: StudioAppRuntime) {
  return (
    !!runtime.effectCache &&
    !runtime.appCtx.isRenderSuppressed &&
    !runtime.appCtx.isCapturingLights &&
    !runtime.appCtx.isCurtainMoving &&
    !runtime.appCtx.isVacuumMoving &&
    !runtime.appCtx.isLockMoving &&
    runtime.studioReflectionDetailMode === 1 &&
    !runtime.appCtx.pendingRuntimeSettings &&
    !runtime.appCtx.contactShadowController?.isPending?.() &&
    !runtime.appCtx.contactShadowController?.hasPendingSurfaces?.() &&
    urlFlag('effect-cache') !== 'baseline'
  )
}
