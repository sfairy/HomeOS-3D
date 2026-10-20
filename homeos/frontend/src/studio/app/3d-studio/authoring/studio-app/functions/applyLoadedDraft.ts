

















































import { normalizeStudioDocument } from "../../scene/studio-document-payload";









import type { StudioAppContext } from "../studio-app-context";
export interface ApplyLoadedDraftDeps { appCtx: StudioAppContext; applyBaseLighting: any; applyCameraSnapshot: any; captureCameraView: any; collectScenePayload: any; collectSelectedFloors: () => any[]; ensureExternalModelLoaded: (record: any) => any; finishModelLoad: any; floorSelectionId: any; getActiveFloor: any; getCameraMode: any; getStudioSaveStore: any; hideStudioReadonlyBanner: any; isAutoDiagramEmbed: any; isEmbeddedStage: any; loadBackgroundImage: any; loadModelsForTypes: (payload: any) => any[]; pendingHistoryScene: any; preloadPersistentModels: any; publishModelLoadState: any; refreshLightAreasFromHa: any; refreshPreviewScene: any; refreshScopeItems: any; refreshSelection: any; renderFloorList: any; requestSceneRebuild: any; resetView: any; resizePlanStage: any; scheduleLightPrecompile: any; scheduleModelLoadFlush: any; setCameraMode: any; stageLoadTiming: any; studioDocumentDeps: any; studioDocumentStore: any; studioDraftReadonly: any; studioHistoryStore: any; syncStudioHistoryFacade: any; updateCameraView: any; updateFloorPreviewButtons: any; }

export async function applyLoadedDraft(deps: ApplyLoadedDraftDeps, draftPayload: any, draftScene: any = null) {
  const { appCtx, applyBaseLighting, applyCameraSnapshot, captureCameraView, collectScenePayload, collectSelectedFloors, ensureExternalModelLoaded, finishModelLoad, floorSelectionId, getActiveFloor, getCameraMode, getStudioSaveStore, hideStudioReadonlyBanner, isAutoDiagramEmbed, isEmbeddedStage, loadBackgroundImage, loadModelsForTypes, preloadPersistentModels, publishModelLoadState, refreshLightAreasFromHa, refreshPreviewScene, refreshScopeItems, refreshSelection, renderFloorList, requestSceneRebuild, resetView, resizePlanStage, scheduleLightPrecompile, scheduleModelLoadFlush, setCameraMode, stageLoadTiming, studioDocumentDeps, studioDocumentStore, studioHistoryStore, syncStudioHistoryFacade, updateCameraView, updateFloorPreviewButtons } = deps;

  stageLoadTiming("draft-normalize-start");
  const draftApplyRequestId = ++appCtx.draftLoadRequestId;
  if (
    (window.clearTimeout(appCtx.modelLoadDebounceId),
    (appCtx.modelLoadDebounceId = null),
    (appCtx.deferredModelTypes = []),
    (appCtx.isExternalModelLoadDeferred = false),
    (window.externalModelLoadsDeferred = false),
    (appCtx.loadedDraft = draftPayload),
    // C3：GET / 冲突载入 / 只读重试的草稿在这里成为新的版本权威与干净基线。
    // C4：全量同步载荷（interaction3d 场景）不带 revision —— 保留当前已载入 revision，
    // 不把保存版本线打回 0（否则下一次 CAS PUT 必然 409）。
    studioDocumentStore.applyLoaded({
      revision:
        typeof draftPayload?.revision === "number"
          ? draftPayload.revision
          : studioDocumentStore.getLoadedRevision(),
      scene: draftPayload?.scene,
    }),
    getStudioSaveStore().acceptLoaded(),
    (deps.studioDraftReadonly = false),
    hideStudioReadonlyBanner(),
    (appCtx.localSaveRevision = 0),
    (appCtx.remoteSaveRevision = 0),
    (appCtx.firstLocalChangeAt = appCtx.lastLocalChangeAt = null),
    (appCtx.pendingConflict = null),
    (appCtx.isSceneStillLoading = isEmbeddedStage),
    (appCtx.studioProject = draftScene || normalizeStudioDocument(draftPayload.scene, studioDocumentDeps())),
    isEmbeddedStage)
  ) {
    for (const livePreviewFloor of appCtx.studioProject.floors)
      livePreviewFloor.scene.settings.livePreviewEnabled = true;
  }
  if (
    (applyBaseLighting(appCtx.studioProject.baseLighting),
    (appCtx.activeFloorId = appCtx.studioProject.activeFloorId),
    isAutoDiagramEmbed &&
      appCtx.studioProject.floors.length > 1 &&
      (appCtx.studioProject.previewFloorMode = "all"),
    isAutoDiagramEmbed && floorSelectionId !== null)
  ) {
    const floorSelectionRecord = appCtx.studioProject.floors.find(
      (floorSelectionMatch: any) => floorSelectionMatch.id === floorSelectionId,
    );
    floorSelectionId === "all" && appCtx.studioProject.floors.length > 1
      ? (appCtx.studioProject.previewFloorMode = "all")
      : floorSelectionRecord &&
        ((appCtx.studioProject.previewFloorMode = "active"),
        (appCtx.studioProject.activeFloorId = floorSelectionRecord.id),
        (appCtx.activeFloorId = floorSelectionRecord.id));
  }
  ((appCtx.studioState = getActiveFloor().scene),
    (appCtx.activeLightGroupId = ""),
    refreshSelection(),
    refreshPreviewScene(),
    (appCtx.undoRecords = []),
    (appCtx.redoRecords = []),
    studioHistoryStore?.clear(),
    (deps.pendingHistoryScene = null));
  // 整篇载入 = 新基线，旧历史补丁不再适用。
  syncStudioHistoryFacade();

  await refreshLightAreasFromHa();
  const selectedFloorRecords = collectSelectedFloors();
  if (isEmbeddedStage) {
    appCtx.isExternalModelPending = true;
    const sceneModelPayload = collectScenePayload(appCtx.studioProject.floors, {
      includeCurtains: true,
    });
    (preloadPersistentModels(sceneModelPayload),
      Promise.allSettled(loadModelsForTypes(sceneModelPayload)).then(
        (modelLoadResults) => (stageLoadTiming("initial-models-ready"), modelLoadResults),
      ),
      stageLoadTiming("initial-models-start"));
  }
  const Qe2 = isAutoDiagramEmbed;
  Qe2 && (appCtx.isModelLoadDeferred = true);
  let preloadModelPromises: any[] = [];
  (Qe2 &&
    (preloadModelPromises = selectedFloorRecords.map((modelRecord) =>
      ensureExternalModelLoaded(modelRecord),
    )),
    (appCtx.isExternalModelLoadDeferred = !Qe2 && !isEmbeddedStage),
    (window.externalModelLoadsDeferred = appCtx.isExternalModelLoadDeferred),
    (appCtx.deferredModelTypes = Qe2 ? [] : selectedFloorRecords),
    appCtx.isExternalModelLoadDeferred && scheduleModelLoadFlush(),
    publishModelLoadState(),
    updateFloorPreviewButtons(),
    renderFloorList(),
    (appCtx.planView.rotation = appCtx.studioState.settings.planViewRotation),
    stageLoadTiming("background-start"));
  const gu3 = loadBackgroundImage();
  if (
    (isEmbeddedStage || (await gu3),
    stageLoadTiming("background-end"),
    refreshScopeItems(Qe2 ? "none" : "all"),
    !Qe2 && !isEmbeddedStage && scheduleLightPrecompile(1200),
    Qe2)
  )
    try {
      const allSettled = Promise.allSettled(preloadModelPromises);
      (await Promise.race([
        allSettled,
        new Promise((raceTimeoutResolve) => window.setTimeout(raceTimeoutResolve, 3500)),
      ]),
        Promise.allSettled(preloadModelPromises).then(() => {
          draftApplyRequestId === appCtx.draftLoadRequestId && finishModelLoad();
        }));
    } finally {
      draftApplyRequestId === appCtx.draftLoadRequestId &&
        (window.clearTimeout(appCtx.modelLoadTimeoutId),
        (appCtx.modelLoadTimeoutId = null),
        (appCtx.isModelLoadDeferred = false),
        publishModelLoadState());
    }
  else
    (requestSceneRebuild({
      force: true,
    }),
      preloadModelPromises.length &&
        Promise.allSettled(preloadModelPromises).then(() => {
          draftApplyRequestId === appCtx.draftLoadRequestId && finishModelLoad();
        }));
  (resizePlanStage(),
    resetView(),
    !Qe2 &&
      !isEmbeddedStage &&
      requestAnimationFrame(() => {
        captureCameraView()
          ? applyCameraSnapshot({
              recordChange: false,
              silent: true,
            })
          : (setCameraMode(getCameraMode(), {
              preserveView: false,
            }),
            updateCameraView());
      }));

}
