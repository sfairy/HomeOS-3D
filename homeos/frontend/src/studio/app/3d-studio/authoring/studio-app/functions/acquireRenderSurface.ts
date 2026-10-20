





















import {
  sha256 as sha2562,
  stableCacheJSON as stableCacheJSON2,
} from "../../../../bridge/scene/render-cache";



































import type { StudioAppContext } from "../studio-app-context";
export interface AcquireRenderSurfaceDeps { appCtx: StudioAppContext; collectLampEntries: any; drawToActiveSurface: any; ensureLightCache: any; hasPendingSceneWork: any; previewLightCacheCanvasElement: any; renderCacheWriter: any; requestStudioRender: any; sceneCacheDescriptor: any; scheduleStudioRender: any; setFadeOverlay: any; showCachedLights: any; }

export async function acquireRenderSurface(deps: AcquireRenderSurfaceDeps, ) {
  const { appCtx, collectLampEntries, drawToActiveSurface, ensureLightCache, hasPendingSceneWork, previewLightCacheCanvasElement, renderCacheWriter, requestStudioRender, sceneCacheDescriptor, scheduleStudioRender, setFadeOverlay, showCachedLights } = deps;

  if (
    ((appCtx.renderCommitTimeoutId = null),
    appCtx.isDisposed ||
      !appCtx.isHighDetailQuality ||
      renderCacheWriter?.closed ||
      !appCtx.threeRenderer ||
      appCtx.pendingRuntimeSettings ||
      appCtx.isRenderSuppressed ||
      appCtx.isWindowHidden ||
      appCtx.isCapturingLights ||
      appCtx.prewarmState ||
      appCtx.isPrewarming ||
      appCtx.isCurtainMoving ||
      appCtx.isVacuumMoving ||
      appCtx.isBackgroundMoving ||
      appCtx.isPrecompilePending)
  )
    return;
  if (
    hasPendingSceneWork() ||
    appCtx.lightPrecompileController?.isBuilding() ||
    appCtx.lightPrecompileController?.isPending()
  ) {
    scheduleStudioRender(120);
    return;
  }
  const domElement4 = appCtx.threeRenderer.domElement,
    width4 = domElement4.width,
    height4 = domElement4.height;
  if (!width4 || !height4) return;
  const Et2 = appCtx.modelRevisionCounter,
    shouldAbortSurface = () =>
      !appCtx.isDisposed &&
      appCtx.isHighDetailQuality &&
      !renderCacheWriter?.closed &&
      !hasPendingSceneWork() &&
      Et2 === appCtx.modelRevisionCounter &&
      !appCtx.pendingRuntimeSettings &&
      !appCtx.isRenderSuppressed &&
      !appCtx.isWindowHidden &&
      !appCtx.prewarmState &&
      !appCtx.isPrewarming &&
      !appCtx.isCurtainMoving &&
      !appCtx.isVacuumMoving &&
      !appCtx.isBackgroundMoving &&
      !appCtx.isPrecompilePending;
  appCtx.isCapturingLights = true;
  let acquiredSurfaceCanvas: any,
    previousSurfaceCanvas: any = null,
    surfaceKey,
    isSurfaceSuspended = false;
  try {
    const fr2 = collectLampEntries(),
      surfaceRequestKey = sha2562(
        stableCacheJSON2({
          kind: "settled-rgba-v1",
          base: sceneCacheDescriptor(width4, height4),
          lights: fr2.map(
            ({ item: lightEntryItem, itemKey: lightEntryKey, group: lightEntryGroup }: any) => ({
              key: lightEntryKey,
              enabled: lightEntryGroup?.enabled !== false,
              brightness: lightEntryItem.lightBrightness,
              temperature: lightEntryItem.lightTemperature,
              color: lightEntryItem.lightColorRgb || null,
            }),
          ),
        }),
      );
    if (
      ((surfaceKey = surfaceRequestKey),
      (acquiredSurfaceCanvas = await renderCacheWriter?.acquire(
        surfaceRequestKey,
        width4,
        height4,
        shouldAbortSurface,
      )),
      !shouldAbortSurface())
    )
      return;
    if (!acquiredSurfaceCanvas) {
      const jl2 = ensureLightCache(fr2);
      (showCachedLights(jl2),
        requestStudioRender(),
        appCtx.threeRenderer.render(appCtx.threeScene, appCtx.threeCamera),
        (acquiredSurfaceCanvas = document.createElement("canvas")),
        (previousSurfaceCanvas = acquiredSurfaceCanvas),
        (acquiredSurfaceCanvas.width = width4),
        (acquiredSurfaceCanvas.height = height4));
      const context = acquiredSurfaceCanvas.getContext("2d");
      if (!context) throw new Error("当前浏览器无法创建静止画面缓存。");
      context.drawImage(domElement4, 0, 0);
    }
    if (!shouldAbortSurface()) return;
    const snapshotSurfacePainter = previewLightCacheCanvasElement.getContext("2d");
    if (!snapshotSurfacePainter) throw new Error("当前浏览器无法创建静止画面缓存。");
    ((previewLightCacheCanvasElement.width = width4),
      (previewLightCacheCanvasElement.height = height4),
      snapshotSurfacePainter.clearRect(0, 0, width4, height4),
      snapshotSurfacePainter.drawImage(acquiredSurfaceCanvas.image || acquiredSurfaceCanvas, 0, 0),
      appCtx.lightGroupCacheByFloor.clear(),
      appCtx.lightGainByFloor.clear(),
      (appCtx.isCacheReady = true),
      (appCtx.isFrameDirty = false),
      (domElement4.dataset.lightCachePixels = String(width4 * height4)),
      (domElement4.dataset.lightCacheRetainedGroups = "complete-frame"),
      setFadeOverlay(true),
      previousSurfaceCanvas &&
        (drawToActiveSurface(surfaceKey, previousSurfaceCanvas, shouldAbortSurface),
        (previousSurfaceCanvas = null)));
  } catch (snapshotError: any) {
    ((isSurfaceSuspended = true),
      setFadeOverlay(false),
      window.HomeOSLog?.error!(snapshotError, {
        phase: "interaction3d-settled-cache",
      })!);
  } finally {
    try {
      (acquiredSurfaceCanvas?.close?.(),
        previousSurfaceCanvas && (previousSurfaceCanvas.width = previousSurfaceCanvas.height = 0));
    } finally {
      appCtx.isCapturingLights = false;
    }
    appCtx.isFrameDirty &&
      (!isSurfaceSuspended || Et2 !== appCtx.modelRevisionCounter) &&
      scheduleStudioRender(420);
  }

}
