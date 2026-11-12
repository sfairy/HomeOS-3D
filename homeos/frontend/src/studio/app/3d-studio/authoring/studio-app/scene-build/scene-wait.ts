import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { completeSceneReadyWarmup } from './scene-ready-warmup'

export async function waitForSceneRevision(runtime: StudioAppRuntime) {
  const sceneAtStart = runtime.appCtx.studioProject,
    rootAtStart = runtime.appCtx.sceneRootNode,
    isSceneRevisionCurrent = () =>
      !runtime.assetLoaderState.disposed &&
      sceneAtStart === runtime.appCtx.studioProject &&
      rootAtStart === runtime.appCtx.sceneRootNode
  for (; isSceneRevisionCurrent(); ) {
    const revision = runtime.assetLoaderState.revision,
      bg2 = runtime.buildFloorsAsync()
    try {
      let shouldWaitForScene = false
      for (; isSceneRevisionCurrent() && revision === runtime.assetLoaderState.revision; ) {
        if (bg2.next().done) {
          shouldWaitForScene = true
          break
        }
        await new Promise(requestAnimationFrame)
      }
      if (shouldWaitForScene)
        return (
          (runtime.appCtx.isSceneStillLoading = false),
          runtime.updateExternalModelDataset(),
          runtime.scheduleExternalPrecompile(),
          (runtime.appCtx.isSceneDirty = false),
          runtime.refreshPreviewSync(),
          true
        )
    } finally {
      bg2.return()
    }
  }
  return false
}

export async function waitForSceneReady(runtime: StudioAppRuntime, sceneWaitTimeout: any = null) {
  if (!runtime.isEmbedStageMode || !runtime.appCtx.regionLightController || !runtime.appCtx.threeRenderer) return
  const sceneSnapshotRef = runtime.appCtx.sceneRootNode,
    floorsSnapshotRef = runtime.appCtx.threeRenderer,
    ue3 = runtime.appCtx.threeScene,
    cameraSnapshotRef = runtime.appCtx.threeCamera,
    Gt2 = runtime.appCtx.sceneRevisionCount,
    isSceneStable = () =>
      !runtime.assetLoaderState.disposed &&
      !runtime.appCtx.isDisposed &&
      !document.hidden &&
      runtime.appCtx.isHighDetailQuality &&
      runtime.appCtx.sceneRootNode === sceneSnapshotRef &&
      runtime.appCtx.threeRenderer === floorsSnapshotRef &&
      runtime.appCtx.threeScene === ue3 &&
      runtime.appCtx.threeCamera === cameraSnapshotRef &&
      runtime.appCtx.sceneRevisionCount === Gt2
  ue3.updateMatrixWorld(true),
    runtime.appCtx.regionLightController.sync(cameraSnapshotRef),
    sceneWaitTimeout?.preparePresentationMaterials?.(sceneSnapshotRef, Gt2 + ':' + runtime.appCtx.curtainFrameKey)
  await completeSceneReadyWarmup({
    runtime,
    floors: floorsSnapshotRef,
    scene: ue3,
    camera: cameraSnapshotRef,
    sceneRoot: sceneSnapshotRef,
    isSceneStable,
  })
}
