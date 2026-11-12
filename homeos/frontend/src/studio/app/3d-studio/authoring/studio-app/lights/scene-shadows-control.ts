import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { trimSharedGeometryCache as trimSharedGeometryCache2 } from '../../studio-shared-geometry-cache'

export function setShadowFreeze(runtime: StudioAppRuntime, isFrozen = true) {
  runtime.appCtx.isShadowFrozen &&
    (!runtime.isEmbedStageMode ||
      Math.abs(runtime.appCtx.threeRenderer.getPixelRatio() - runtime.computeRenderPixelRatio(false)) > 0.000001 ||
      !runtime.appCtx.shadowAtlasCanvas?.matches(runtime.computeRenderPixelRatio(true))) &&
    runtime.updateShadowState(true, {
      preserveLightCache: true,
    }),
    runtime.appCtx.isShadowFrozen
      ? (runtime.appCtx.compiledShaderCache?.clear(),
        runtime.appCtx.shadowAtlasCanvas.render(runtime.appCtx.threeScene, runtime.appCtx.threeCamera))
      : runtime.isEffectCacheReady() &&
          (runtime.shouldForceEffectFrame || (runtime.appCtx.isBackgroundMoving && !!runtime.effectCache.stats.bytes))
        ? (runtime.appCtx.compiledShaderCache?.clear(),
          runtime.effectCache.render(runtime.appCtx.threeScene, runtime.appCtx.threeCamera, {
            enabled:
              runtime.appCtx.isBackgroundMoving &&
              !runtime.appCtx.isRenderSuppressed &&
              !runtime.appCtx.pendingRuntimeSettings,
            background: runtime.appCtx.backgroundController?.cacheBackground,
          }),
          runtime.isRenderStatsTest &&
            (runtime.appCtx.threeRenderer.domElement.dataset.effectCacheStats = JSON.stringify(
              runtime.effectCache.stats,
            )))
        : runtime.appCtx.compiledShaderCache
          ? runtime.appCtx.compiledShaderCache.render(runtime.appCtx.threeScene, runtime.appCtx.threeCamera, {
              background: runtime.appCtx.backgroundController?.cacheBackground,
              changed: isFrozen,
              enabled:
                runtime.appCtx.isBackgroundMoving &&
                !runtime.appCtx.isRenderSuppressed &&
                !runtime.appCtx.pendingRuntimeSettings,
            })
          : runtime.appCtx.threeRenderer.render(runtime.appCtx.threeScene, runtime.appCtx.threeCamera),
    (runtime.shouldForceEffectFrame = false),
    // 背景缓存接管了整帧时，效果缓存没有复用价值，及时释放显存。
    !runtime.appCtx.isShadowFrozen &&
      runtime.appCtx.compiledShaderCache?.active &&
      runtime.effectCache?.stats.bytes &&
      runtime.effectCache.clear(),
    runtime.previewResources?.release(),
    runtime.shouldTrimSharedGeometry &&
      ((runtime.shouldTrimSharedGeometry = false),
      trimSharedGeometryCache2(runtime.geometryCacheByKey, [runtime.appCtx.threeScene, runtime.appCtx.sceneRootNode])),
    runtime.prepareShadowAtlas()
}

export function updateShadowState(
  runtime: StudioAppRuntime,
  isShadowsEnabled: any,
  { preserveLightCache: shouldPreserveLightCache = false } = {},
) {
  if (!runtime.appCtx.threeRenderer || (runtime.appCtx.pendingRuntimeSettings && !runtime.isAutoDiagramEmbed)) return
  const zn3 = runtime.computeRenderPixelRatio(false),
    isPixelRatioStable = Math.abs(runtime.appCtx.threeRenderer.getPixelRatio() - zn3) < 0.000001
  if (
    (!runtime.appCtx.isShadowPreparing &&
      isShadowsEnabled &&
      runtime.appCtx.isRenderSuppressed &&
      runtime.isEmbeddedStage &&
      runtime.isEmbedStageMode &&
      isPixelRatioStable &&
      runtime.computeRenderPixelRatio(true) < zn3 &&
      runtime.appCtx.shadowAtlasCanvas?.matches(runtime.computeRenderPixelRatio(true)) &&
      (runtime.appCtx.isShadowPreparing = true),
    runtime.appCtx.isShadowPreparing)
  ) {
    if (
      runtime.isEmbedStageMode &&
      isPixelRatioStable &&
      (!isShadowsEnabled || runtime.appCtx.shadowAtlasCanvas?.matches(runtime.computeRenderPixelRatio(true)))
    ) {
      ;(runtime.appCtx.isShadowFrozen = isShadowsEnabled),
        isShadowsEnabled || (runtime.appCtx.isShadowPreparing = false),
        runtime.refreshSceneRender({
          preserveLightCache: shouldPreserveLightCache,
        })
      return
    }
    runtime.appCtx.isShadowPreparing = runtime.appCtx.isShadowFrozen = false
  }
  const $f2 = runtime.appCtx.pendingRuntimeSettings
    ? runtime.resolvePixelRatio(isShadowsEnabled)
    : runtime.computeRenderPixelRatio(isShadowsEnabled)
  Math.abs(runtime.appCtx.threeRenderer.getPixelRatio() - $f2) > 0.000001 &&
    runtime.appCtx.threeRenderer.setPixelRatio($f2),
    runtime.refreshSceneRender({
      preserveLightCache: shouldPreserveLightCache,
    })
}
