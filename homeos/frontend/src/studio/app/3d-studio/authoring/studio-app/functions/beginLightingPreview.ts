



























import {
  buildLightDeltaPixels as buildLightDeltaPixels2,
} from "../../../export/export-utils";








import {
  finite as finite2,
} from "../../../loaders/studio-normalization";



















import type { StudioAppContext } from "../studio-app-context";
export interface BeginLightingPreviewDeps { acquireRenderSurface: any; appCtx: StudioAppContext; areLightsEnabled: any; awaitNextFramePair: any; buildLightCacheMap: any; captureFramePixels: any; collectLampEntries: any; ensureLightCache: any; ensureRenderReady: any; isEmbeddedStage: any; previewLightCacheCanvasElement: any; requestStudioRender: any; rerenderScene: any; restoreLightVisibility: any; restorePreviewAfterFade: any; scheduleStudioRender: any; setFadeOverlay: any; showCachedLights: any; showLightCacheFor: any; waitForIdleFrame: any; }

export async function beginLightingPreview(deps: BeginLightingPreviewDeps, ) {
  const { acquireRenderSurface, appCtx, areLightsEnabled, awaitNextFramePair, buildLightCacheMap, captureFramePixels, collectLampEntries, ensureLightCache, ensureRenderReady, isEmbeddedStage, previewLightCacheCanvasElement, requestStudioRender, rerenderScene, restoreLightVisibility, restorePreviewAfterFade, scheduleStudioRender, setFadeOverlay, showCachedLights, showLightCacheFor, waitForIdleFrame } = deps;

  if (isEmbeddedStage) return acquireRenderSurface();
  if (
    ((appCtx.renderCommitTimeoutId = null),
    !appCtx.threeRenderer ||
      appCtx.pendingRuntimeSettings ||
      appCtx.isRenderSuppressed ||
      appCtx.isWindowHidden ||
      appCtx.isCapturingLights ||
      appCtx.prewarmState ||
      appCtx.isPrewarming ||
      !areLightsEnabled())
  )
    return;
  const Et3 = appCtx.modelRevisionCounter,
    previewLightEntries = collectLampEntries().filter(
      ({ item: previewLightItem, group: _previewLightGroup }: any) =>
        finite2(previewLightItem.lightBrightness, 0) > 0,
    ),
    domElement6 = appCtx.threeRenderer.domElement;
  let width5 = domElement6.width,
    height5 = domElement6.height;
  if (!width5 || !height5 || !previewLightEntries.length) return;
  ((appCtx.isCapturingLights = true), (appCtx.isFrameDirty = true));
  const enabled = appCtx.orbitControls.enabled,
    previewVisibilityByObject = new Map();
  let isPreviewLocked = false;
  requestStudioRender();
  try {
    const previewSurfacePainter = previewLightCacheCanvasElement.getContext("2d");
    if (!previewSurfacePainter) throw new Error("当前浏览器无法显示多灯缓存。");
    (previewLightCacheCanvasElement.hidden ||
      !appCtx.isCacheReady ||
      previewLightCacheCanvasElement.width !== width5 ||
      previewLightCacheCanvasElement.height !== height5) &&
      ((previewLightCacheCanvasElement.width = width5),
      (previewLightCacheCanvasElement.height = height5),
      previewSurfacePainter.clearRect(0, 0, width5, height5));
    const compositeCanvas = document.createElement("canvas");
    ((compositeCanvas.width = width5), (compositeCanvas.height = height5));
    const compositePainter = compositeCanvas.getContext("2d"),
      lightDeltaCanvas = document.createElement("canvas");
    ((lightDeltaCanvas.width = width5), (lightDeltaCanvas.height = height5));
    const lightDeltaPainter = lightDeltaCanvas.getContext("2d");
    if (!compositePainter || !lightDeltaPainter) throw new Error("当前浏览器无法合成多灯缓存。");
    const lightLayerCanvasByKey = new Map(),
      jl3 = ensureLightCache(previewLightEntries);
    if (
      (await awaitNextFramePair(),
      Et3 !== appCtx.modelRevisionCounter ||
        appCtx.pendingRuntimeSettings ||
        appCtx.isRenderSuppressed ||
        appCtx.isWindowHidden ||
        !areLightsEnabled())
    )
      return;
    (showLightCacheFor(jl3),
      compositePainter.clearRect(0, 0, width5, height5),
      appCtx.sceneRootNode.traverse((gridObject: any) => {
        gridObject.userData?.exportRole === "grid" &&
          (previewVisibilityByObject.set(gridObject, gridObject.visible),
          (gridObject.visible = false));
      }));
    let cachedLightPixels;
    for (const previewEntry of previewLightEntries) {
      if (
        (await waitForIdleFrame(),
        Et3 !== appCtx.modelRevisionCounter ||
          appCtx.pendingRuntimeSettings ||
          appCtx.isRenderSuppressed ||
          appCtx.isWindowHidden ||
          !areLightsEnabled())
      )
        break;
      const {
        group: previewGroup,
        itemKey: previewItemKey,
        groupKey: previewGroupKey,
      } = previewEntry;
      lightDeltaPainter.clearRect(0, 0, width5, height5);
      {
        (cachedLightPixels ||
          (showLightCacheFor(jl3),
          rerenderScene(),
          (cachedLightPixels = captureFramePixels(width5, height5))),
          showLightCacheFor(jl3, previewItemKey),
          rerenderScene());
        const ff2 = captureFramePixels(width5, height5),
          lightDeltaPixels = buildLightDeltaPixels2(cachedLightPixels.data, ff2.data);
        lightDeltaPainter.putImageData(new ImageData(lightDeltaPixels, width5, height5), 0, 0);
      }
      compositePainter.drawImage(lightDeltaCanvas, 0, 0);
      let lightLayerCanvas = lightLayerCanvasByKey.get(previewGroupKey);
      if (
        (lightLayerCanvas ||
          ((lightLayerCanvas = document.createElement("canvas")),
          (lightLayerCanvas.width = width5),
          (lightLayerCanvas.height = height5),
          (lightLayerCanvas.userData = {
            enabled: previewGroup?.enabled !== false,
          }),
          lightLayerCanvasByKey.set(previewGroupKey, lightLayerCanvas)),
        lightLayerCanvas.getContext("2d")?.drawImage(lightDeltaCanvas, 0, 0),
        await ensureRenderReady(),
        Et3 !== appCtx.modelRevisionCounter ||
          appCtx.pendingRuntimeSettings ||
          appCtx.isRenderSuppressed ||
          appCtx.isWindowHidden ||
          !areLightsEnabled())
      )
        break;
    }
    if (Et3 === appCtx.modelRevisionCounter && !appCtx.pendingRuntimeSettings && areLightsEnabled()) {
      appCtx.lightGroupCacheByFloor = lightLayerCanvasByKey;
      for (const [lightLayerKey, lightLayerTarget] of lightLayerCanvasByKey)
        appCtx.lightGainByFloor.set(lightLayerKey, lightLayerTarget.userData?.enabled === false ? 0 : 1);
      ((appCtx.isCacheReady = true),
        (appCtx.isFrameDirty = false),
        setFadeOverlay(true),
        restoreLightVisibility(),
        (isPreviewLocked = true));
    }
  } catch (previewCaptureError: any) {
    (window.HomeOSLog?.error!(previewCaptureError, {
      phase: "studio-light-cache",
    }),
      console.error(previewCaptureError),
      (appCtx.isCacheReady = !previewLightCacheCanvasElement.hidden));
  } finally {
    for (const [restoreObject, restoreVisibility] of previewVisibilityByObject)
      restoreObject.visible = restoreVisibility;
    const restoredLightCache = buildLightCacheMap();
    (appCtx.prewarmState
      ? appCtx.prewarmState.restore()
      : appCtx.isRenderSuppressed
        ? showCachedLights(restoredLightCache)
        : showLightCacheFor(restoredLightCache),
      rerenderScene(),
      isPreviewLocked
        ? requestAnimationFrame(() => restorePreviewAfterFade())
        : restorePreviewAfterFade(),
      (appCtx.orbitControls.enabled = enabled),
      (appCtx.isCapturingLights = false),
      requestStudioRender(),
      appCtx.isFrameDirty && areLightsEnabled() && !appCtx.pendingRuntimeSettings && scheduleStudioRender());
  }

}
