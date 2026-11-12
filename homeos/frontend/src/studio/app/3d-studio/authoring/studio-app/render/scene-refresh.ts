import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { cacheObjectTransforms as cacheObjectTransforms2 } from '../../../../bridge/scene/scene-matrices'
import * as ns2 from '/static/vendor/three/0.187.0/three.module.min.js'
import type { SceneRefreshOptions } from '../../types/studio-app-types'

export function refreshSceneRender(runtime: StudioAppRuntime, refreshOptions: SceneRefreshOptions = {}) {
  // 场景/材质/阴影有变化时先作废静态帧缓存，下一次渲染会重新捕获。
  runtime.effectCache?.invalidate()
  if (
    (runtime.isEmbeddedStage &&
      (refreshOptions.scene === true || refreshOptions.shadows === true) &&
      runtime.appCtx.sceneRevisionCount++,
    (runtime.appCtx.isLightCacheReady = true),
    (runtime.appCtx.isLightCachePending = false),
    runtime.appCtx.lightingScheduler?.wake(),
    runtime.isEmbeddedStage &&
      (refreshOptions.scene === true || refreshOptions.shadows === true) &&
      cacheObjectTransforms2(runtime.appCtx.threeScene, ns2.Object3D),
    refreshOptions.shadows === true &&
      runtime.appCtx.threeScene?.traverse((shadowLightObject: any) => {
        shadowLightObject.isLight &&
          shadowLightObject.castShadow &&
          shadowLightObject.shadow &&
          (shadowLightObject.shadow.needsUpdate = true)
      }),
    !runtime.appCtx.isLightOverrideOn)
  ) {
    if (
      refreshOptions.preserveLightCache === true &&
      runtime.areLightsEnabled() &&
      !runtime.appCtx.pendingRuntimeSettings
    ) {
      !runtime.appCtx.isCacheReady && !runtime.appCtx.isCapturingLights && runtime.scheduleStudioRender()
      return
    }
    runtime.areLightsEnabled() && !runtime.appCtx.pendingRuntimeSettings
      ? ((runtime.appCtx.modelRevisionCounter += 1),
        (runtime.appCtx.isFrameDirty = true),
        (runtime.isEmbeddedStage || refreshOptions.scene === true || !runtime.appCtx.isCacheReady) &&
          runtime.setFadeOverlay(false),
        runtime.scheduleStudioRender(),
        runtime.requestStudioRender())
      : (window.clearTimeout(runtime.appCtx.renderCommitTimeoutId),
        (runtime.appCtx.renderCommitTimeoutId = null),
        (runtime.appCtx.isCacheReady = false),
        (runtime.appCtx.isFrameDirty = false),
        runtime.setFadeOverlay(false))
  }
}

export function disposeShadowAtlas(runtime: StudioAppRuntime) {
  window.clearTimeout(runtime.appCtx.shadowPrepareTimeoutId),
    (runtime.appCtx.shadowPrepareTimeoutId = null),
    (runtime.appCtx.isShadowPreparing = runtime.appCtx.isShadowFrozen = false),
    runtime.appCtx.shadowAtlasCanvas?.clear()
}

export function prepareShadowAtlas(runtime: StudioAppRuntime) {
  if (
    !runtime.appCtx.shadowAtlasCanvas ||
    runtime.appCtx.shadowPrepareTimeoutId !== null ||
    runtime.appCtx.isRenderSuppressed ||
    runtime.appCtx.isShadowPreparing ||
    document.hidden ||
    !runtime.appCtx.isHighDetailQuality ||
    runtime.appCtx.isExternalModelPending
  )
    return
  const zn2 = runtime.computeRenderPixelRatio(true)
  zn2 >= runtime.computeRenderPixelRatio(false) ||
    runtime.appCtx.shadowAtlasCanvas.matches(zn2) ||
    (runtime.appCtx.shadowPrepareTimeoutId = window.setTimeout(() => {
      ;(runtime.appCtx.shadowPrepareTimeoutId = null),
        !runtime.appCtx.isRenderSuppressed &&
          !runtime.appCtx.isShadowPreparing &&
          !document.hidden &&
          runtime.appCtx.isHighDetailQuality &&
          runtime.appCtx.shadowAtlasCanvas.prepare(runtime.computeRenderPixelRatio(true))
    }, 250))
}
