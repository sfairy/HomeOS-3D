import {
  moveStepMeters as moveStepMeters2,
} from "./studio-edit-metrics";
import {
  courtyardPlanColor as courtyardPlanColor2,
} from "../plan/courtyard-plan";


import {
  buildingFootprints as buildingFootprints2,
  anchorGate as anchorGate2,
  isCourtyardGate as isCourtyardGate2,
} from "../plan/courtyard-drawing";
import { createCourtyardDrawingEditor as createCourtyardDrawingEditor2 } from "../plan/courtyard-drawing-editor";


import { resolveDoorPartMaterials } from "./studio-app/materials/door-materials";
import { runStudioRenderLoop as runStudioRenderLoopImpl, type StudioRenderDeps } from "./studio-app/render/studio-render-loop";
import { handlePointerUp as handlePointerUpImpl, type HandlePointerUpDeps } from "./studio-app/functions/handlePointerUp";
import { refreshStudioUiInner as refreshStudioUiInnerImpl, type RefreshStudioUiInnerDeps } from "./studio-app/functions/refreshStudioUiInner";
import { handlePointerDown as handlePointerDownImpl, type HandlePointerDownDeps } from "./studio-app/functions/handlePointerDown";
import { applyToolSetting as applyToolSettingImpl, type ApplyToolSettingDeps } from "./studio-app/functions/applyToolSetting";
import { createStudioRenderer as createStudioRendererImpl, type CreateStudioRendererDeps } from "./studio-app/functions/createStudioRenderer";
import { buildStudioScene as buildStudioSceneImpl, type BuildStudioSceneDeps } from "./studio-app/functions/buildStudioScene";
import { generateExportBundle as generateExportBundleImpl, type GenerateExportBundleDeps } from "./studio-app/functions/generateExportBundle";
import { refreshStudioView as refreshStudioViewImpl, type RefreshStudioViewDeps } from "./studio-app/functions/refreshStudioView";
import { openExportPanel as openExportPanelImpl, type OpenExportPanelDeps } from "./studio-app/functions/openExportPanel";
import { beginLightingPreview as beginLightingPreviewImpl, type BeginLightingPreviewDeps } from "./studio-app/functions/beginLightingPreview";
import { publishRenderStats as publishRenderStatsImpl, type PublishRenderStatsDeps } from "./studio-app/functions/publishRenderStats";
import { addLightModel as addLightModelImpl, type AddLightModelDeps } from "./studio-app/functions/addLightModel";
import { applyLoadedDraft as applyLoadedDraftImpl, type ApplyLoadedDraftDeps } from "./studio-app/functions/applyLoadedDraft";
import { createSceneItem as createSceneItemImpl, type CreateSceneItemDeps } from "./studio-app/functions/createSceneItem";
import { acquireRenderSurface as acquireRenderSurfaceImpl, type AcquireRenderSurfaceDeps } from "./studio-app/functions/acquireRenderSurface";
import { hitTestPlanItem as hitTestPlanItemImpl, type HitTestPlanItemDeps } from "./studio-app/functions/hitTestPlanItem";
import {
  sceneCacheDescriptor as sceneCacheDescriptorImpl, checkModelInUse as checkModelInUseImpl, collectScenePayload as collectScenePayloadImpl, collectSelectedFloors as collectSelectedFloorsImpl,
  scheduleModelLoadFlush as scheduleModelLoadFlushImpl, loadModelsForTypes as loadModelsForTypesImpl, preloadDefaultModels as preloadDefaultModelsImpl, requestSceneRender as requestSceneRenderImpl,
  finishModelLoad as finishModelLoadImpl, publishModelLoadState as publishModelLoadStateImpl, emitRuntimeDiagnostic as emitRuntimeDiagnosticImpl, updateModelLoadIndicator as updateModelLoadIndicatorImpl,
  materialLoadOptionsForItem as materialLoadOptionsForItemImpl, applyItemOptimization as applyItemOptimizationImpl, getActiveFloor as getActiveFloorImpl, captureStudioSnapshot as captureStudioSnapshotImpl,
  getLocalSaveRevision as getLocalSaveRevisionImpl, uniqueFloorName as uniqueFloorNameImpl, hideFloorActionMenu as hideFloorActionMenuImpl, showFloorActionMenu as showFloorActionMenuImpl,
  floorActionHandler as floorActionHandlerImpl, closeFloorDeleteDialog as closeFloorDeleteDialogImpl, confirmFloorDelete as confirmFloorDeleteImpl, openFloorRenameDialog as openFloorRenameDialogImpl,
  syncGlobalControls as syncGlobalControlsImpl, clearDropIndicator as clearDropIndicatorImpl, moveFloorRow as moveFloorRowImpl, renderFloorList as renderFloorListImpl,
  selectFloor as selectFloorImpl, addNewFloor as addNewFloorImpl, planToWorldPoint as planToWorldPointImpl, worldToPlanPoint as worldToPlanPointImpl,
  worldPointForFloor as worldPointForFloorImpl, getActiveWalls as getActiveWallsImpl, startFloorAlign as startFloorAlignImpl, cancelFloorAlign as cancelFloorAlignImpl,
  isSameAlignmentFloor as isSameAlignmentFloorImpl, updatePreviewFloorGap as updatePreviewFloorGapImpl, updateUniformOverviewStack as updateUniformOverviewStackImpl, updateExportFloorGap as updateExportFloorGapImpl,
  captureUndoSnapshot as captureUndoSnapshotImpl, resolveLightGroup as resolveLightGroupImpl, resolveFloorDefaultGroup as resolveFloorDefaultGroupImpl, isLampEnabled as isLampEnabledImpl,
  getScreenLightGroups as getScreenLightGroupsImpl, getChargingLightGroups as getChargingLightGroupsImpl, getOrderedFloorList as getOrderedFloorListImpl, floorElevationFor as floorElevationForImpl,
  composeLightGroupKey as composeLightGroupKeyImpl, collectLampEntries as collectLampEntriesImpl, listLightGroupRows as listLightGroupRowsImpl, listScreenRows as listScreenRowsImpl,
  listChargingRows as listChargingRowsImpl, syncScreenLayers as syncScreenLayersImpl, syncChargingLayers as syncChargingLayersImpl, pushUndoEntry as pushUndoEntryImpl,
} from "./studio-app/functions/groups/scene-payload-and-floors";
import {
  getLightGroups as getLightGroupsImpl, syncLightGroupSelect as syncLightGroupSelectImpl, hideLightGroupActionMenu as hideLightGroupActionMenuImpl, showLightGroupActionMenu as showLightGroupActionMenuImpl,
  deleteLightGroup as deleteLightGroupImpl, uniqueLightGroupName as uniqueLightGroupNameImpl, duplicateLightGroup as duplicateLightGroupImpl, clearLightGroupDropIndicator as clearLightGroupDropIndicatorImpl,
  collectListDragDropTargets as collectListDragDropTargetsImpl, applyListDragDropIndicator as applyListDragDropIndicatorImpl, activateListDrag as activateListDragImpl, handleListDragPointerMove as handleListDragPointerMoveImpl,
  handleListDragPointerUp as handleListDragPointerUpImpl, handleListDragPointerCancel as handleListDragPointerCancelImpl, handleListDragTouchMove as handleListDragTouchMoveImpl, finishListDrag as finishListDragImpl,
  beginListRowDrag as beginListRowDragImpl, moveAreaRow as moveAreaRowImpl, moveLightGroupToArea as moveLightGroupToAreaImpl, refreshLightAreasFromHa as refreshLightAreasFromHaImpl,
  readSavedLightAreaOrder as readSavedLightAreaOrderImpl, persistLightAreaOrder as persistLightAreaOrderImpl, applySavedLightAreaOrder as applySavedLightAreaOrderImpl, isKnownLightAreaId as isKnownLightAreaIdImpl,
  syncAreaAssignOptions as syncAreaAssignOptionsImpl, openLightGroupAreaDialog as openLightGroupAreaDialogImpl, closeLightGroupAreaDialog as closeLightGroupAreaDialogImpl, toggleAreaExpanded as toggleAreaExpandedImpl,
  createLightGroupRow as createLightGroupRowImpl, createAreaSection as createAreaSectionImpl, maybeShowDrawingLightNotice as maybeShowDrawingLightNoticeImpl, syncLightGroupList as syncLightGroupListImpl,
  setAllLightGroupsEnabled as setAllLightGroupsEnabledImpl, createSelectionRef as createSelectionRefImpl, refreshSelection as refreshSelectionImpl, isPlanItemVisible as isPlanItemVisibleImpl,
  isSelectionAllowed as isSelectionAllowedImpl, selectSceneObject as selectSceneObjectImpl, getDefaultSelectionScope as getDefaultSelectionScopeImpl, resolvePreviewScope as resolvePreviewScopeImpl,
  classifySelectionScope as classifySelectionScopeImpl, getCurrentPreviewScope as getCurrentPreviewScopeImpl, getPreviewScopeSelection as getPreviewScopeSelectionImpl, setPreviewScope as setPreviewScopeImpl,
  markWallsChanged as markWallsChangedImpl, rebuildWallIndex as rebuildWallIndexImpl, getPixelsPerMeter as getPixelsPerMeterImpl, historyUndoDepth as historyUndoDepthImpl,
  historyRedoDepth as historyRedoDepthImpl, isStudioDraftReadonly as isStudioDraftReadonlyImpl, downloadStudioLocalCopy as downloadStudioLocalCopyImpl, renderStudioReadonlyBanner as renderStudioReadonlyBannerImpl,
} from "./studio-app/functions/groups/light-groups-and-list-drag";
import {
  hideStudioReadonlyBanner as hideStudioReadonlyBannerImpl, applyStudioSaveState as applyStudioSaveStateImpl, getStudioSaveStore as getStudioSaveStoreImpl, syncDraftPayloadAfterSave as syncDraftPayloadAfterSaveImpl,
  recordSaveConflictFromServer as recordSaveConflictFromServerImpl, settleStudioSaveResult as settleStudioSaveResultImpl, waitForStudioInteractionIdle as waitForStudioInteractionIdleImpl, flushStudioSaveOnce as runStudioSaveOnceImpl,
  notifyStudioDraftLoadFailure as notifyStudioDraftLoadFailureImpl, retryStudioDraftLoad as retryStudioDraftLoadImpl, flushStudioSaveBeforeTeardown as flushStudioSaveBeforeTeardownImpl, sceneSyncFlushIsDirty as sceneSyncFlushIsDirtyImpl,
  flushSceneSyncRuntime as flushSceneSyncRuntimeImpl, currentSceneSyncSinceKey as currentSceneSyncSinceKeyImpl, rememberSceneSyncKey as rememberSceneSyncKeyImpl, refreshAfterSceneSyncOutcome as refreshAfterSceneSyncOutcomeImpl,
  fetchStudioApi as fetchStudioApiImpl, showToast as showToastImpl, showSaveState as showSaveStateImpl, syncStudioHistoryFacade as syncStudioHistoryFacadeImpl,
  syncStudioClipboardFacade as syncStudioClipboardFacadeImpl,
  historyFailureMessage as historyFailureMessageImpl, undoStudioHistory as undoStudioHistoryImpl, redoStudioHistory as redoStudioHistoryImpl, applyStudioHistoryDirection as applyStudioHistoryDirectionImpl,
  collectPatchFloorIds as collectPatchFloorIdsImpl, canApplyHistoryPatch as canApplyHistoryPatchImpl, refreshAfterHistoryChange as refreshAfterHistoryChangeImpl, validateSelectionChange as validateSelectionChangeImpl,
  primeHistorySnapshot as primeHistorySnapshotImpl, deselectAll as deselectAllImpl, applyPlacementChange as applyPlacementChangeImpl, flushPendingHistory as flushPendingHistoryImpl,
  restoreSnapshot as restoreSnapshotImpl, markDocumentDirty as markDocumentDirtyImpl, recordSaveConflict as recordSaveConflictImpl, resetSaveRetryState as resetSaveRetryStateImpl,
  scheduleAutosave as scheduleAutosaveImpl, handleInteractionEnded as handleInteractionEndedImpl, isInteractionBusy as isInteractionBusyImpl, hasUnsavedChanges as hasUnsavedChangesImpl,
  refreshExitDialogButtons as refreshExitDialogButtonsImpl, closeExitDialog as closeExitDialogImpl, leaveStudio as leaveStudioImpl, flushAutosave as flushAutosaveImpl,
  planToScreen as planToScreenImpl, screenToPlanPoint as screenToPlanPointImpl, screenToPlan as screenToPlanImpl, eventToLocalPoint as eventToLocalPointImpl,
  getCanvasSize as getCanvasSizeImpl, resetView as resetViewImpl, zoomByScale as zoomByScaleImpl, rotatePlanView as rotatePlanViewImpl,
  resizePlanStage as resizePlanStageImpl, buildSnapIndex as buildSnapIndexImpl, closedWallLoops as closedWallLoopsImpl, computeWallIntersections as computeWallIntersectionsImpl,
  computeSurfaceExclusions as computeSurfaceExclusionsImpl, computeWallPolygons as computeWallPolygonsImpl, wallWindowSpan as wallWindowSpanImpl, drawRailing as drawRailingImpl,
  rotateLocalPoint as rotateLocalPointImpl, buildHandleGeometry as buildHandleGeometryImpl,
} from "./studio-app/functions/groups/save-history-plan-coords";
import {
  hitTestHandle as hitTestHandleImpl, boundsFromCorners as boundsFromCornersImpl, marqueeDelta as marqueeDeltaImpl, updateMarqueeOverlay as updateMarqueeOverlayImpl,
  drawMarqueeOverlay as drawMarqueeOverlayImpl, renderPlanScene as renderPlanSceneImpl, getSelectedObject as getSelectedObjectImpl, getPanelRatioLimits as getPanelRatioLimitsImpl,
  applyPanelRatios as applyPanelRatiosImpl, applyDetailsRatio as applyDetailsRatioImpl, isSnapEnabled as isSnapEnabledImpl, setSnapSettingsOpen as setSnapSettingsOpenImpl,
  syncSnapControls as syncSnapControlsImpl, applySnapTolerance as applySnapToleranceImpl, refreshBackground as refreshBackgroundImpl, refreshStudioUi as refreshStudioUiImpl,
  readInspectorGroupCollapseState as readInspectorGroupCollapseStateImpl, writeInspectorGroupCollapseState as writeInspectorGroupCollapseStateImpl, inspectorGroupHasVisibleField as inspectorGroupHasVisibleFieldImpl, countInspectorGroupFields as countInspectorGroupFieldsImpl,
  syncInspectorGroups as syncInspectorGroupsImpl, toggleInspectorGroup as toggleInspectorGroupImpl, materialSlotPanelSignatureFor as materialSlotPanelSignatureForImpl, materialStyleSwatchColors as materialStyleSwatchColorsImpl,
  syncMaterialStyleStrip as syncMaterialStyleStripImpl, renderMaterialSlotGroupChips as renderMaterialSlotGroupChipsImpl, setMaterialSlotGroupFilter as setMaterialSlotGroupFilterImpl, materialSlotMetaText as materialSlotMetaTextImpl,
  doorPartDisplayColor as doorPartDisplayColorImpl, doorPartMeshOptions as doorPartMeshOptionsImpl, doorMaterialPeerCount as doorMaterialPeerCountImpl, renderDoorMaterialPanel as renderDoorMaterialPanelImpl,
  renderMaterialSlotPanel as renderMaterialSlotPanelImpl, materialCoverageSummary as materialCoverageSummaryImpl, createMaterialSlotRow as createMaterialSlotRowImpl, materialSameModelPeerCount as materialSameModelPeerCountImpl,
  materialEditModelType as materialEditModelTypeImpl, selectedMaterialEditTarget as selectedMaterialEditTargetImpl, materialSameModelPeerRecords as materialSameModelPeerRecordsImpl, commitItemMaterialEdit as commitItemMaterialEditImpl,
  setItemMaterialOverride as setItemMaterialOverrideImpl, setItemMaterialStyle as setItemMaterialStyleImpl, resetItemMaterialAll as resetItemMaterialAllImpl, setItemMaterialSurfaceOverride as setItemMaterialSurfaceOverrideImpl,
  readStoredCustomMaterialStyles as readStoredCustomMaterialStylesImpl, loadCustomMaterialStyles as loadCustomMaterialStylesImpl, ensureCustomMaterialStylesLoaded as ensureCustomMaterialStylesLoadedImpl, writeStoredCustomMaterialStyles as writeStoredCustomMaterialStylesImpl,
} from "./studio-app/functions/groups/selection-and-material-ui";
import {
  saveCurrentItemMaterialStyle as saveCurrentItemMaterialStyleImpl, deleteCustomMaterialStyle as deleteCustomMaterialStyleImpl, applyMaterialToSameModelItems as applyMaterialToSameModelItemsImpl, refreshScopeItems as refreshScopeItemsImpl,
  setDrawingToolGroupOpen as setDrawingToolGroupOpenImpl, closeDrawingToolGroups as closeDrawingToolGroupsImpl, syncDrawingToolGroupStates as syncDrawingToolGroupStatesImpl, selectStudioTool as selectStudioToolImpl,
  ensureCalibrationReady as ensureCalibrationReadyImpl, clearSelection as clearSelectionImpl, finalizeAddedItem as finalizeAddedItemImpl, duplicateSelection as duplicateSelectionImpl,
  collectSelectedPlanItems as collectSelectedPlanItemsImpl, mirrorSelection as mirrorSelectionImpl, rotateSelection as rotateSelectionImpl, loadBackgroundImage as loadBackgroundImageImpl,
  importBackgroundFile as importBackgroundFileImpl, backgroundSettings as backgroundSettingsImpl, positionLightFromAngles as positionLightFromAnglesImpl, refreshBaseLighting as refreshBaseLightingImpl,
  setShadowQualityHigh as setShadowQualityHighImpl, clampShadowMapSize as clampShadowMapSizeImpl, syncBaseLightingControls as syncBaseLightingControlsImpl, applyBaseLighting as applyBaseLightingImpl,
  saveBaseLightingEdit as saveBaseLightingEditImpl, openLightingDialog as openLightingDialogImpl, confirmLightingDialog as confirmLightingDialogImpl, updateBaseLightingFromInput as updateBaseLightingFromInputImpl,
  cameraSettings as cameraSettingsImpl, getCameraMode as getCameraModeImpl, getCameraView as getCameraViewImpl, getCameraTopRotation as getCameraTopRotationImpl,
  buildCameraUpVector as buildCameraUpVectorImpl, getCameraFocalLength as getCameraFocalLengthImpl, collectActiveLightEntries as collectActiveLightEntriesImpl, assessRenderBudget as assessRenderBudgetImpl,
  canRenderScene as canRenderSceneImpl, areLightsEnabled as areLightsEnabledImpl, applyAdaptiveQuality as applyAdaptiveQualityImpl, resetFrameSamples as resetFrameSamplesImpl,
  recordFrameTime as recordFrameTimeImpl, getPreviewSyncMode as getPreviewSyncModeImpl, refreshPreviewSync as refreshPreviewSyncImpl, syncCameraModeControls as syncCameraModeControlsImpl,
  syncCameraViewControls as syncCameraViewControlsImpl, syncCameraFocalLengthControl as syncCameraFocalLengthControlImpl, applyCameraFocalLength as applyCameraFocalLengthImpl, requestStudioRender as requestStudioRenderImpl,
  computeRenderPixelRatio as computeRenderPixelRatioImpl,
} from "./studio-app/functions/groups/materials-lighting-camera";
import {
  updateRenderStatsHud as updateRenderStatsHudImpl, pushBoundedSample as pushBoundedSampleImpl, computeAverage as computeAverageImpl, computePercentile as computePercentileImpl,
  roundToDigits as roundToDigitsImpl, ensureDiagnosticsHud as ensureDiagnosticsHudImpl, beginMotionMeasurement as beginMotionMeasurementImpl, endMotionMeasurement as endMotionMeasurementImpl,
  flushGpuQueries as flushGpuQueriesImpl, measureFloorSwitchPhase as measureFloorSwitchPhaseImpl, recordFloorSwitchTick as recordFloorSwitchTickImpl, recordRenderTiming as recordRenderTimingImpl,
  snapshotRenderStats as snapshotRenderStatsImpl, updateMotionStats as updateMotionStatsImpl, renderStudioFrame as renderStudioFrameImpl, needsMotionPresentation as needsMotionPresentationImpl,
  bindFrameDriver as bindFrameDriverImpl, setFadeOverlay as setFadeOverlayImpl, hasPendingSceneWork as hasPendingSceneWorkImpl, canBuildScene as canBuildSceneImpl,
  drawToActiveSurface as drawToActiveSurfaceImpl, restoreLightVisibility as restoreLightVisibilityImpl, fadeLightsIn as fadeLightsInImpl, findLightGroup as findLightGroupImpl,
  fadeLightsOut as fadeLightsOutImpl, transitionLightGroups as transitionLightGroupsImpl, refreshSceneRender as refreshSceneRenderImpl, syncLightCache as syncLightCacheImpl,
  buildLightCacheMap as buildLightCacheMapImpl, ensureLightCache as ensureLightCacheImpl, updateLightCache as updateLightCacheImpl, showLightCacheFor as showLightCacheForImpl,
  collectActiveLightGroupKeys as collectActiveLightGroupKeysImpl, showCachedLights as showCachedLightsImpl, captureLightSnapshot as captureLightSnapshotImpl, restorePreviewAfterFade as restorePreviewAfterFadeImpl,
  awaitNextFramePair as awaitNextFramePairImpl, captureFramePixels as captureFramePixelsImpl, rerenderScene as rerenderSceneImpl, ensureRenderReady as ensureRenderReadyImpl,
  waitForIdleFrame as waitForIdleFrameImpl, scheduleStudioRender as scheduleStudioRenderImpl, discardLightingEdit as discardLightingEditImpl, resetPlanInteraction as resetPlanInteractionImpl,
  endStudioGesture as endStudioGestureImpl, disposeShadowAtlas as disposeShadowAtlasImpl, prepareShadowAtlas as prepareShadowAtlasImpl, isEffectCacheReady as isEffectCacheReadyImpl,
} from "./studio-app/functions/groups/render-stats-and-frame-loop";
import {
  setShadowFreeze as setShadowFreezeImpl, updateShadowState as updateShadowStateImpl, handleOrbitStart as handleOrbitStartImpl, handleOrbitChange as handleOrbitChangeImpl,
  handleOrbitEnd as handleOrbitEndImpl, refreshFloorControls as refreshFloorControlsImpl, captureCameraView as captureCameraViewImpl, storeFixedCameraView as storeFixedCameraViewImpl,
  createOrbitControls as createOrbitControlsImpl, updateCameraPlanes as updateCameraPlanesImpl, computeVisibleHeight as computeVisibleHeightImpl, adjustFrameSize as adjustFrameSizeImpl,
  computeFrameSize as computeFrameSizeImpl, computeOrthoFrameSize as computeOrthoFrameSizeImpl, resolveFrameSize as resolveFrameSizeImpl, saveCameraView as saveCameraViewImpl,
  applyCameraSnapshot as applyCameraSnapshotImpl, setCameraView as setCameraViewImpl, setCameraMode as setCameraModeImpl, applyOrthoFrame as applyOrthoFrameImpl,
  resizeStudioRenderer as resizeStudioRendererImpl, captureOverviewCamera as captureOverviewCameraImpl, applyCameraState as applyCameraStateImpl, stateViewportAspectGetCanvasSize as stateViewportAspectGetCanvasSizeImpl,
  refreshCanvasSizeUi as refreshCanvasSizeUiImpl, resolvePixelRatio as resolvePixelRatioImpl, resizeRenderCanvas as resizeRenderCanvasImpl, syncCanvasSizeInputs as syncCanvasSizeInputsImpl,
  handleCanvasSizeInput as handleCanvasSizeInputImpl, openExportDialog as openExportDialogImpl, renderExportPresetSlots as renderExportPresetSlotsImpl, buildExportPreset as buildExportPresetImpl,
  importCameraPreset as importCameraPresetImpl, applyExportPreset as applyExportPresetImpl, selectExportPresetSlot as selectExportPresetSlotImpl, saveExportPreset as saveExportPresetImpl,
  syncExportControls as syncExportControlsImpl, formatPresetLabel as formatPresetLabelImpl, makeUniquePresetName as makeUniquePresetNameImpl,
} from "./studio-app/functions/groups/shadow-camera-export-presets";
import {
  saveAsNewPreset as saveAsNewPresetImpl, closePresetRenameDialog as closePresetRenameDialogImpl, openPresetRenameDialog as openPresetRenameDialogImpl, closePresetDeleteDialog as closePresetDeleteDialogImpl,
  openPresetDeleteDialog as openPresetDeleteDialogImpl, confirmDeletePreset as confirmDeletePresetImpl, ensureSceneRendered as ensureSceneRenderedImpl, prepareFreeCameraCapture as prepareFreeCameraCaptureImpl,
  selectPreviewFloor as selectPreviewFloorImpl, collectSelectedExportFiles as collectSelectedExportFilesImpl, restorePreviewAfterExport as restorePreviewAfterExportImpl, setExportBusy as setExportBusyImpl,
  prepareExportRender as prepareExportRenderImpl, canvasToBlob as canvasToBlobImpl, renderExportImage as renderExportImageImpl, renderLightDeltaLayer as renderLightDeltaLayerImpl,
  renderLightShadowLayer as renderLightShadowLayerImpl, renderBackgroundLayer as renderBackgroundLayerImpl, makeUniqueFileName as makeUniqueFileNameImpl, buildExportCamera as buildExportCameraImpl,
  buildLightExportEntry as buildLightExportEntryImpl, projectItemAnchor as projectItemAnchorImpl, projectLightGroupAnchor as projectLightGroupAnchorImpl, blobToBytes as blobToBytesImpl,
  applyExportVisibility as applyExportVisibilityImpl, setExportRoleVisibility as setExportRoleVisibilityImpl, resolveOverwriteChoice as resolveOverwriteChoiceImpl, showConflictDialog as showConflictDialogImpl,
  beginExportFlow as beginExportFlowImpl, reportExportFailure as reportExportFailureImpl, showExportResult as showExportResultImpl, disposeObjectTree as disposeObjectTreeImpl,
  disposeFloorScene as disposeFloorSceneImpl, createOutlinePath as createOutlinePathImpl, buildShapesWithHoles as buildShapesWithHolesImpl, createWallSideMaterial as createWallSideMaterialImpl,
  createWallTopMaterial as createWallTopMaterialImpl, expandPolygonOutward as expandPolygonOutwardImpl, buildInteriorScene as buildInteriorSceneImpl, buildItemModel as buildItemModelImpl,
  drawDoor as drawDoorImpl, drawCourtyardArea as drawCourtyardAreaImpl, renderExportLayers as renderExportLayersImpl, addArchitectureMesh as addArchitectureMeshImpl,
  addWindowFrames as addWindowFramesImpl, buildRugGeometry as buildRugGeometryImpl, createRugMaterial as createRugMaterialImpl, addRugMeshes as addRugMeshesImpl,
  mergeMeshesByType as mergeMeshesByTypeImpl, configureLightSourcePreview as configureLightSourcePreviewImpl,
} from "./studio-app/functions/groups/export-flow-and-scene-build";
import {
  addStripLightPreview as addStripLightPreviewImpl, applyAccentEmissive as applyAccentEmissiveImpl, planLabelAccentColor as planLabelAccentColorImpl, createPlanLabel as createPlanLabelImpl,
  collectLightSourceSpecs as collectLightSourceSpecsImpl, countMaterialTextures as countMaterialTexturesImpl, findMaxMaterialTextures as findMaxMaterialTexturesImpl, getMaxTextureUnits as getMaxTextureUnitsImpl,
  collectShadowCandidates as collectShadowCandidatesImpl, setupSceneShadows as setupSceneShadowsImpl, batchSharedMeshes as batchSharedMeshesImpl, mergeStaticItemMeshes as mergeStaticItemMeshesImpl,
  collectSharedMaterials as collectSharedMaterialsImpl, updateExternalModelDataset as updateExternalModelDatasetImpl, planLightPrecompileBatches as planLightPrecompileBatchesImpl, shouldSuspendSceneWork as shouldSuspendSceneWorkImpl,
  shouldDeferSceneWork as shouldDeferSceneWorkImpl, scheduleLightPrecompile as scheduleLightPrecompileImpl, scheduleExternalPrecompile as scheduleExternalPrecompileImpl, requestSceneRebuild as requestSceneRebuildImpl,
  getSceneContentBounds as getSceneContentBoundsImpl, computeCourtyardBounds as computeCourtyardBoundsImpl, createFloorMaterial as createFloorMaterialImpl,
} from "./studio-app/functions/groups/light-precompile-and-shared-meshes";
import {
  buildCourtyardFoundation as buildCourtyardFoundationImpl, buildGroundShadow as buildGroundShadowImpl, getPreviewFloorMode as getPreviewFloorModeImpl, updateFloorPreviewButtons as updateFloorPreviewButtonsImpl,
  setPreviewFloor as setPreviewFloorImpl, rebuildFloorLayers as rebuildFloorLayersImpl, waitForSceneRevision as waitForSceneRevisionImpl, waitForSceneReady as waitForSceneReadyImpl,
  buildFloorsAsync as buildFloorsAsyncImpl, syncFloorGroups as syncFloorGroupsImpl, createFloorWorldMapper as createFloorWorldMapperImpl, previewTransformContext as previewTransformContextImpl,
  capturePreviewTransforms as capturePreviewTransformsImpl, applyPreviewTransforms as applyPreviewTransformsImpl, buildSceneLayers as buildSceneLayersImpl, buildLayerGroup as buildLayerGroupImpl,
  buildArchitectureLayer as buildArchitectureLayerImpl, buildItemsLayer as buildItemsLayerImpl, buildLightsLayer as buildLightsLayerImpl, buildFloorAtIndex as buildFloorAtIndexImpl,
  buildLayerForFloor as buildLayerForFloorImpl, isDescendantOfRoot as isDescendantOfRootImpl, computeSceneBounds as computeSceneBoundsImpl, computeSceneExtent as computeSceneExtentImpl,
  updateCameraView as updateCameraViewImpl, axisLockedDistance as axisLockedDistanceImpl, formatMeasurement as formatMeasurementImpl,
} from "./studio-app/functions/groups/scene-layers-and-floor-build";
import {
  updateSnapIndicator as updateSnapIndicatorImpl, toggleSnapSetting as toggleSnapSettingImpl, schedulePointerMove as schedulePointerMoveImpl, handlePointerMove as handlePointerMoveImpl,
  cancelPointerDrag as cancelPointerDragImpl, scheduleDragUpdate as scheduleDragUpdateImpl, handleCanvasWheel as handleCanvasWheelImpl, finishPointerDrag as finishPointerDragImpl,
  handlePointerRelease as handlePointerReleaseImpl, refreshPreviewScene as refreshPreviewSceneImpl, resetCameraView as resetCameraViewImpl, applyWallHeightInput as applyWallHeightInputImpl,
  applyWallThicknessInput as applyWallThicknessInputImpl, applyWallOpacityInput as applyWallOpacityInputImpl, scheduleWallApply as scheduleWallApplyImpl, commitWallHeight as commitWallHeightImpl,
  commitWallThickness as commitWallThicknessImpl, commitWallOpacity as commitWallOpacityImpl, filterAssetList as filterAssetListImpl, setAssetCategory as setAssetCategoryImpl,
  toggleAssetGroup as toggleAssetGroupImpl,
  closeOpenPopovers as closeOpenPopoversImpl, applyLightGroupRename as applyLightGroupRenameImpl, createLightGroup as createLightGroupImpl, collectLightTargetInputs as collectLightTargetInputsImpl,
  syncLightTargetGroups as syncLightTargetGroupsImpl, buildLightGroupList as buildLightGroupListImpl, postBridgeState as postBridgeStateImpl, postBridgeFloors as postBridgeFloorsImpl,
  waitForStageReady as waitForStageReadyImpl, jumpWorkflowStep as jumpWorkflowStepImpl,
} from "./studio-app/functions/groups/pointer-input-and-tools";
import type { StudioAppRuntime } from "./studio-app/runtime/studio-app-runtime";
let planPainter: any = null,
  gardenGateItemType = "garden-gate",
  gardenGateSnapCandidate: any = null;
/**
 * 3D Studio 渲染性能模块（与 0.7.8 同名同义）。
 *
 * - `effectCache`：静态帧缓存，背景动画时只重绘动态体；
 * - `interactionBatches`：静态网格按楼层/几何/材质合并 InstancedMesh；
 * - `previewResources`：预览重建期间的资源延后回收；
 * - `shouldForceEffectFrame`：下一次渲染强制重建效果缓存；
 * - `shouldTrimSharedGeometry`：下一次渲染后修剪一次共享几何缓存。
 */
let effectCache: any = null,
  interactionBatches: any = null,
  previewResources: any = null,
  shouldForceEffectFrame = false,
  shouldTrimSharedGeometry = false,
  /** 启动阶段反射细节档位（0 = 入场中，1 = 就绪）；模块级便于渲染函数读取。 */
  studioReflectionDetailMode = 0;






import {
  materialStyleGroupFor,
  materialStyleLabel,
  normalizeMaterialStyle,
} from "../materials/studio-material-presets";


import { createLoadTiming as createLoadTiming2 } from "../../bridge/scene/load-timing";
import { stageStartup as stageStartup2 } from "../stage-startup";
import { createPreviewTransformCache } from "../studio-preview-transforms";


const stageLoadTiming = createLoadTiming2("stage");
stageLoadTiming("module-ready");








import {
  createRenderCache as createRenderCache2,
} from "../../bridge/scene/render-cache";
import { syncHtmlRangeProgress as syncHtmlRangeProgress2 } from "../../shared/util/range-progress";
import * as ns2 from "/static/vendor/three/0.186.1/three.module.min.js";
import { GLTFLoader as GLTFLoader2 } from "/static/vendor/three/0.186.1/GLTFLoader.js";
import { SameOriginDRACOLoader as SameOriginDRACOLoader2 } from "../export/draco-loader";
import { createModelAssetLoader as createModelAssetLoader2 } from "../loaders/model-asset-loader";


import {
  clamp as clamp2,
  distance as distance2,
} from "../plan/geometry";


import {
  normalizeActiveExportPresetSlot as normalizeActiveExportPresetSlot2,
  normalizeExportPresetSlots as normalizeExportPresetSlots2,
} from "../export/export-presets";
import {
  initializeNumberInputs as initializeNumberInputs2,
  initializeStudioSelects as initializeStudioSelects2,
} from "./ui/studio-widgets";
import {
  createExternalModelManager as createExternalModelManager2,
  ALL_ITEM_MODELS as ALL_ITEM_MODELS2,
} from "../loaders/studio-external-models";
import {
  createPlanDrawingTools as createPlanDrawingTools2,
} from "../plan/studio-plan-drawing";
import {
  DEFAULT_BASE_LIGHTING as DEFAULT_BASE_LIGHTING2,
  finite as finite2,
  normalizeBaseLighting as normalizeBaseLighting2,
  normalizeFullRotation as normalizeFullRotation2,
  normalizeLabelText as normalizeLabelText2,
} from "../loaders/studio-normalization";


import { itemTypeCatalog, lampItemTypeSet, stairItemTypeSet } from "./items/item-catalog";
import { installLibraryNameScroll } from "./items/studio-model-library";
import { defaultViewSettings } from "./scene/studio-view-settings";
window.__homeosStudioModuleVersion =
  "20260904-local-shadow-edge-v6-depth-precision-v1-model-load-state-v3-floor-scope-v1-ground-grid-v3-depth-fade-v2-local-shadow-depth-v1-export-shadow-quality-v1-base-light-entry-v1-auto-diagram-preview-hd-v1-auto-diagram-floor-v1-20260905-first-light-prewarm-v3-20260905-orbit-architecture-center-v1";
import { createLegacyScope } from '@/studio/platform/legacy-scope';
import { navigateInShell } from '@/studio/platform/shell-navigation';
import {
  patchStudioFacadeState,
  registerStudioCommandHandler,
  resetStudioFacade,
} from '../../../engine';
import type {
  StudioControlElement,
} from './types/studio-app-types';
import {
  generateId,
} from './ui/studio-app-helpers';
import {
  lightPropertyFields,
  normalizeLightPropertyValue,
  formatLightPropertyValue,
} from './lights/studio-app-light-data';
import { createStudioDocument } from "./scene/studio-scene-payload";
import { normalizeStudioDocument } from "./scene/studio-document-payload";


import { startupStudio } from "./boot/studio-boot";
import {
  StudioDocumentStore,
  applyDocumentPatch,
} from "./store/document-store";
import { StudioHistoryStore } from "./store/history-store";
import { StudioSceneSyncController } from "./store/scene-sync-controller";
import { StudioSaveStore } from "./store/save-store";
import { createStudioDraftRepository } from "./store/studio-draft-repository";


import { createStudioAppContext } from "./studio-app/studio-app-context";
import {
  type StudioStaticItemMeshesDeps,
} from "./items/studio-static-item-meshes";
import { addCylinderMesh } from "./studio-app/scene/cylinder-mesh";
import { doorPartThemeColor } from "./studio-app/materials/door-theme";
import { refreshStepChecklist } from "./studio-app/ui/step-checklist";


let disposeActiveStudio: (() => void) | null = null;
/** teardown 前置落盘钩子（boot 闭包内注册；dispose 在闭包外执行，必须经此暴露）。 */
let flushActiveStudioSave: (() => Promise<void>) | null = null;

/**
 * 引导户型图绘制（重复调用会先回收上一次）。
 *
 * 由 `StudioView.vue` 在 `onMounted` 调用、`onBeforeUnmount` 调 `teardownStudio()`。
 * 原实现以顶层 `startupStudio()` 收尾、顶层直读 DOM 契约 —— 一次性引导，视图只能整页
 * 跳转。现在整包搬入本函数内：DOM 契约、three.js 场景与全部模块状态按次重建，
 * 卸载时释放渲染器/缓存写入器/观察者与文档级残留。
 */
export function bootStudio(): void {
  const scope = createLegacyScope('studio-app');
  const innerCleanup = scope.executeInLegacyScope(() => {
  const studioRuntime: StudioAppRuntime = {
    get appCtx() { return appCtx; },
    get DRAWING_LIGHT_NOTICE_THRESHOLD() { return DRAWING_LIGHT_NOTICE_THRESHOLD; },
    get INSPECTOR_GROUP_STORAGE_KEY() { return INSPECTOR_GROUP_STORAGE_KEY; },
    get INSPECTOR_GROUP_TITLE_BY_ARCHITECTURE_KIND() { return INSPECTOR_GROUP_TITLE_BY_ARCHITECTURE_KIND; },
    get LIGHT_AREA_ORDER_STORAGE_KEY() { return LIGHT_AREA_ORDER_STORAGE_KEY; },
    get LIST_DRAG_START_DISTANCE() { return LIST_DRAG_START_DISTANCE; },
    get LIST_DRAG_TOUCH_GIVE_UP_DISTANCE() { return LIST_DRAG_TOUCH_GIVE_UP_DISTANCE; },
    get LIST_DRAG_TOUCH_HOLD_MS() { return LIST_DRAG_TOUCH_HOLD_MS; },
    get MATERIAL_STYLE_CUSTOM_STORAGE_KEY() { return MATERIAL_STYLE_CUSTOM_STORAGE_KEY; },
    get StudioApiError() { return StudioApiError; },
    get activateListDrag() { return activateListDrag; },
    get activeDoorType() { return activeDoorType as keyof typeof import("./scene/studio-scene-payload").doorTypeCatalog; },
    get activeToolLabel() { return activeToolLabel; },
    get addLightModel() { return addLightModel; },
    get adjustFrameSize() { return adjustFrameSize; },
    get alignFloorButton() { return alignFloorButton; },
    get applyAdaptiveQuality() { return applyAdaptiveQuality; },
    get applyBaseLighting() { return applyBaseLighting; },
    get applyCameraFocalLength() { return applyCameraFocalLength; },
    get applyCameraSnapshot() { return applyCameraSnapshot; },
    get applyCameraState() { return applyCameraState; },
    get applyDetailsRatio() { return applyDetailsRatio; },
    get applyExportPreset() { return applyExportPreset; },
    get applyListDragDropIndicator() { return applyListDragDropIndicator; },
    get applyLoadedDraft() { return applyLoadedDraft; },
    get applyOrthoFrame() { return applyOrthoFrame; },
    get applyPanelRatios() { return applyPanelRatios; },
    get applyPlacementChange() { return applyPlacementChange; },
    get applyPreviewTransforms() { return applyPreviewTransforms; },
    get applySavedLightAreaOrder() { return applySavedLightAreaOrder; },
    get applyStudioHistoryDirection() { return applyStudioHistoryDirection; },
    get applyStudioSaveState() { return applyStudioSaveState; },
    get applyWallHeightInput() { return applyWallHeightInput; },
    get applyWallOpacityInput() { return applyWallOpacityInput; },
    get applyWallThicknessInput() { return applyWallThicknessInput; },
    get areLightsEnabled() { return areLightsEnabled; },
    get assessRenderBudget() { return assessRenderBudget; },
    get assetCategoryButtons() { return assetCategoryButtons; },
    get assetGridElement() { return assetGridElement; },
    get assetHeadingCategoryControls() { return assetHeadingCategoryControls; },
    get assetLoaderState() { return assetLoaderState; },
    get assetSearchEmptyElement() { return assetSearchEmptyElement; },
    get assetSearchInput() { return assetSearchInput; },
    get autoDiagramComponentId() { return autoDiagramComponentId; },
    get axisLockedDistance() { return axisLockedDistance; },
    get backgroundSettings() { return backgroundSettings; },
    get baseLightControlInputs() { return baseLightControlInputs; },
    get baseLightControlsElement() { return baseLightControlsElement; },
    get batchSharedMeshes() { return batchSharedMeshes; },
    get beginLightingPreview() { return beginLightingPreview; },
    get beginListRowDrag() { return beginListRowDrag; },
    get boundsFromCorners() { return boundsFromCorners; },
    get buildArchitectureLayer() { return buildArchitectureLayer; },
    get buildCameraUpVector() { return buildCameraUpVector; },
    get buildCourtyardFoundation() { return buildCourtyardFoundation; },
    get buildExportPreset() { return buildExportPreset; },
    get buildFloorAtIndex() { return buildFloorAtIndex; },
    get buildFloorsAsync() { return buildFloorsAsync; },
    get buildHandleGeometry() { return buildHandleGeometry; },
    get buildInteriorScene() { return buildInteriorScene; },
    get buildItemModel() { return buildItemModel; },
    get buildItemsLayer() { return buildItemsLayer; },
    get buildLayerForFloor() { return buildLayerForFloor; },
    get buildLayerGroup() { return buildLayerGroup; },
    get buildLightCacheMap() { return buildLightCacheMap; },
    get buildLightsLayer() { return buildLightsLayer; },
    get buildRugGeometry() { return buildRugGeometry; },
    get buildSceneLayers() { return buildSceneLayers; },
    get buildShapesWithHoles() { return buildShapesWithHoles; },
    get buildSnapIndex() { return buildSnapIndex; },
    get buildStudioScene() { return buildStudioScene; },
    get cameraFocalLengthControls() { return cameraFocalLengthControls; },
    get cameraModeControls() { return cameraModeControls; },
    get cameraNearFactor() { return cameraNearFactor; },
    get cameraRotateTopControls() { return cameraRotateTopControls; },
    get cameraSettings() { return cameraSettings; },
    get cameraViewControls() { return cameraViewControls; },
    get canRenderScene() { return canRenderScene; },
    get cancelFloorAlign() { return cancelFloorAlign; },
    get cancelPointerDrag() { return cancelPointerDrag; },
    get canvasEmptyElement() { return canvasEmptyElement; },
    get canvasToBlob() { return canvasToBlob; },
    get captureCameraView() { return captureCameraView; },
    get captureLightSnapshot() { return captureLightSnapshot; },
    get captureOverviewCamera() { return captureOverviewCamera; },
    get capturePreviewTransforms() { return capturePreviewTransforms; },
    get captureStudioSnapshot() { return captureStudioSnapshot; },
    get captureUndoSnapshot() { return captureUndoSnapshot; },
    get classifySelectionScope() { return classifySelectionScope; },
    get clearDropIndicator() { return clearDropIndicator; },
    get clearLightGroupDropIndicator() { return clearLightGroupDropIndicator; },
    get closeDrawingToolGroups() { return closeDrawingToolGroups; },
    get closeFloorDeleteDialog() { return closeFloorDeleteDialog; },
    get closePresetDeleteDialog() { return closePresetDeleteDialog; },
    get closedWallLoops() { return closedWallLoops; },
    get collectActiveLightEntries() { return collectActiveLightEntries; },
    get collectActiveLightGroupKeys() { return collectActiveLightGroupKeys; },
    get collectLampEntries() { return collectLampEntries; },
    get collectLightSourceSpecs() { return collectLightSourceSpecs; },
    get collectLightTargetInputs() { return collectLightTargetInputs; },
    get collectListDragDropTargets() { return collectListDragDropTargets; },
    get collectPatchFloorIds() { return collectPatchFloorIds; },
    get collectScenePayload() { return collectScenePayload; },
    get collectSelectedExportFiles() { return collectSelectedExportFiles; },
    get collectSelectedFloors() { return collectSelectedFloors; },
    get collectSelectedPlanItems() { return collectSelectedPlanItems; },
    get collectShadowCandidates() { return collectShadowCandidates; },
    get collectSharedMaterials() { return collectSharedMaterials; },
    get commitItemMaterialEdit() { return commitItemMaterialEdit; },
    get composeLightGroupKey() { return composeLightGroupKey; },
    get computeCourtyardBounds() { return computeCourtyardBounds; },
    get computeFrameSize() { return computeFrameSize; },
    get computeOrthoFrameSize() { return computeOrthoFrameSize; },
    get computeRenderPixelRatio() { return computeRenderPixelRatio; },
    get computeSceneBounds() { return computeSceneBounds; },
    get computeSceneExtent() { return computeSceneExtent; },
    get computeVisibleHeight() { return computeVisibleHeight; },
    get computeWallIntersections() { return computeWallIntersections; },
    get configureLightSourcePreview() { return configureLightSourcePreview; },
    get countInspectorGroupFields() { return countInspectorGroupFields; },
    get countMaterialTextures() { return countMaterialTextures; },
    get createAreaSection() { return createAreaSection; },
    get createFloorMaterial() { return createFloorMaterial; },
    get createFloorWorldMapper() { return createFloorWorldMapper; },
    get createLightGroupRow() { return createLightGroupRow; },
    get createMaterialSlotRow() { return createMaterialSlotRow; },
    get createOrbitControls() { return createOrbitControls; },
    get createOutlinePath() { return createOutlinePath; },
    get createRugMaterial() { return createRugMaterial; },
    get createSceneItem() { return createSceneItem; },
    get createSelectionRef() { return createSelectionRef; },
    get cursorPositionElement() { return cursorPositionElement; },
    get defaultExportHeight() { return defaultExportHeight; },
    get defaultExportWidth() { return defaultExportWidth; },
    get deselectAll() { return deselectAll; },
    get detailsPanelElement() { return detailsPanelElement; },
    get detailsResizerElement() { return detailsResizerElement; },
    get diagnosticsState() { return diagnosticsState; },
    get dirtyFloorIdSet() { return dirtyFloorIdSet; },
    get disposeFloorScene() { return disposeFloorScene; },
    get disposeObjectTree() { return disposeObjectTree; },
    get disposeShadowAtlas() { return disposeShadowAtlas; },
    get disposedMaterialSet() { return disposedMaterialSet; },
    get doorMaterialPeerCount() { return doorMaterialPeerCount; },
    get downloadStudioLocalCopy() { return downloadStudioLocalCopy; },
    get drawGuideSegment() { return drawGuideSegment; },
    get drawLabelText() { return drawLabelText; },
    get drawPointMarker() { return drawPointMarker; },
    get drawingLightNoticeCountElement() { return drawingLightNoticeCountElement; },
    get drawingLightNoticeDialogElement() { return drawingLightNoticeDialogElement; },
    get drawingToolSections() { return drawingToolSections; },
    get effectCache() { return effectCache; },
    get emitRuntimeDiagnostic() { return emitRuntimeDiagnostic; },
    get endStudioGesture() { return endStudioGesture; },
    get ensureCalibrationReady() { return ensureCalibrationReady; },
    get ensureCustomMaterialStylesLoaded() { return ensureCustomMaterialStylesLoaded; },
    get ensureExternalModelLoaded() { return ensureExternalModelLoaded; },
    get ensureRenderReady() { return ensureRenderReady; },
    get ensureSceneRendered() { return ensureSceneRendered; },
    get eventToLocalPoint() { return eventToLocalPoint; },
    get exitWaiterResolvers() { return exitWaiterResolvers; },
    get expandPolygonOutward() { return expandPolygonOutward; },
    get exportAspectLabelElement() { return exportAspectLabelElement; },
    get exportCompleteDialogElement() { return exportCompleteDialogElement; },
    get exportCompleteMessageElement() { return exportCompleteMessageElement; },
    get exportCompletePathElement() { return exportCompletePathElement; },
    get exportCompleteTitleElement() { return exportCompleteTitleElement; },
    get exportDialogElement() { return exportDialogElement; },
    get exportFloorGapControlElement() { return exportFloorGapControlElement; },
    get exportFloorGapInput() { return exportFloorGapInput; },
    get exportFloorSelectElement() { return exportFloorSelectElement; },
    get exportFolderNameInput() { return exportFolderNameInput; },
    get exportHeightInput() { return exportHeightInput; },
    get exportLockRatioInput() { return exportLockRatioInput; },
    get exportOverwriteDialogElement() { return exportOverwriteDialogElement; },
    get exportOverwriteNameElement() { return exportOverwriteNameElement; },
    get exportPackageButton() { return exportPackageButton; },
    get exportPresetAddButton() { return exportPresetAddButton; },
    get exportPresetDeleteButton() { return exportPresetDeleteButton; },
    get exportPresetDeleteDialogElement() { return exportPresetDeleteDialogElement; },
    get exportPresetDeleteNameElement() { return exportPresetDeleteNameElement; },
    get exportPresetEmptyStateElement() { return exportPresetEmptyStateElement; },
    get exportPresetEmptyTitleElement() { return exportPresetEmptyTitleElement; },
    get exportPresetRenameButton() { return exportPresetRenameButton; },
    get exportPresetRenameDialogElement() { return exportPresetRenameDialogElement; },
    get exportPresetRenameInputElement() { return exportPresetRenameInputElement; },
    get exportPresetSlotsElement() { return exportPresetSlotsElement; },
    get exportPreviewFrameElement() { return exportPreviewFrameElement; },
    get exportPreviewStageElement() { return exportPreviewStageElement; },
    get exportResolutionLabelElement() { return exportResolutionLabelElement; },
    get exportSaveViewButton() { return exportSaveViewButton; },
    get exportStatusElement() { return exportStatusElement; },
    get exportVisibilityByObject() { return exportVisibilityByObject; },
    get exportWidthInput() { return exportWidthInput; },
    get externalModelRegistry() { return externalModelRegistry; },
    get fadeLightsIn() { return fadeLightsIn; },
    get fadeLightsOut() { return fadeLightsOut; },
    get fetchStudioApi() { return fetchStudioApi; },
    get filterAssetList() { return filterAssetList; },
    get finalizeAddedItem() { return finalizeAddedItem; },
    get findLightGroup() { return findLightGroup; },
    get findMaxMaterialTextures() { return findMaxMaterialTextures; },
    get finishListDrag() { return finishListDrag; },
    get finishModelLoad() { return finishModelLoad; },
    get finishPointerDrag() { return finishPointerDrag; },
    get finishWallButton() { return finishWallButton; },
    get fixedCameraViewButton() { return fixedCameraViewButton; },
    get fixedOverviewViewButton() { return fixedOverviewViewButton; },
    get floorActionMenuElement() { return floorActionMenuElement; },
    get floorCameraActionsElement() { return floorCameraActionsElement; },
    get floorDeleteDialogElement() { return floorDeleteDialogElement; },
    get floorDeleteNameElement() { return floorDeleteNameElement; },
    get floorElevationFor() { return floorElevationFor; },
    get floorGroupCacheByKey() { return floorGroupCacheByKey; },
    get floorListElement() { return floorListElement; },
    get floorRenameDialogElement() { return floorRenameDialogElement; },
    get floorRenameInputElement() { return floorRenameInputElement; },
    get flushAutosave() { return flushAutosave; },
    get flushGpuQueries() { return flushGpuQueries; },
    get flushPendingHistory() { return flushPendingHistory; },
    get formatMeasurement() { return formatMeasurement; },
    get formatPresetLabel() { return formatPresetLabel; },
    get gardenGateItemType() { return gardenGateItemType; },
    get gardenGateSnapCandidate() { return gardenGateSnapCandidate; },
    set gardenGateSnapCandidate(value: any) { gardenGateSnapCandidate = value; },
    get geometryCacheByKey() { return geometryCacheByKey; },
    get getActiveFloor() { return getActiveFloor; },
    get getActiveWalls() { return getActiveWalls; },
    get getCameraFocalLength() { return getCameraFocalLength; },
    get getCameraMode() { return getCameraMode; },
    get getCameraTopRotation() { return getCameraTopRotation; },
    get getCameraView() { return getCameraView; },
    get getCanvasSize() { return getCanvasSize; },
    get getChargingLightGroups() { return getChargingLightGroups; },
    get getCurrentPreviewScope() { return getCurrentPreviewScope; },
    get getDefaultSelectionScope() { return getDefaultSelectionScope; },
    get getLightGroups() { return getLightGroups; },
    get getLocalSaveRevision() { return getLocalSaveRevision; },
    get getMaxTextureUnits() { return getMaxTextureUnits; },
    get getOrderedFloorList() { return getOrderedFloorList; },
    get getPanelRatioLimits() { return getPanelRatioLimits; },
    get getPixelsPerMeter() { return getPixelsPerMeter; },
    get getPreviewFloorMode() { return getPreviewFloorMode; },
    get getPreviewScopeSelection() { return getPreviewScopeSelection; },
    get getPreviewSyncMode() { return getPreviewSyncMode; },
    get getSceneContentBounds() { return getSceneContentBounds; },
    get getScreenLightGroups() { return getScreenLightGroups; },
    get getSelectedObject() { return getSelectedObject; },
    get getStudioSaveStore() { return getStudioSaveStore; },
    get globalWallHeightInput() { return globalWallHeightInput; },
    get globalWallOpacityInput() { return globalWallOpacityInput; },
    get globalWallThicknessInput() { return globalWallThicknessInput; },
    get handleInteractionEnded() { return handleInteractionEnded; },
    get handleListDragPointerCancel() { return handleListDragPointerCancel; },
    get handleListDragPointerMove() { return handleListDragPointerMove; },
    get handleListDragPointerUp() { return handleListDragPointerUp; },
    get handleListDragTouchMove() { return handleListDragTouchMove; },
    get handleOrbitChange() { return handleOrbitChange; },
    get handleOrbitEnd() { return handleOrbitEnd; },
    get handleOrbitStart() { return handleOrbitStart; },
    get handlePointerUp() { return handlePointerUp; },
    get hasPendingSceneWork() { return hasPendingSceneWork; },
    get hasShownDrawingLightNotice() { return hasShownDrawingLightNotice; },
    set hasShownDrawingLightNotice(value: any) { hasShownDrawingLightNotice = value; },
    get hideLightGroupActionMenu() { return hideLightGroupActionMenu; },
    get hideStudioReadonlyBanner() { return hideStudioReadonlyBanner; },
    get historyFailureMessage() { return historyFailureMessage; },
    get historyRedoDepth() { return historyRedoDepth; },
    get historyUndoDepth() { return historyUndoDepth; },
    get hitTestHandle() { return hitTestHandle; },
    get importCameraPreset() { return importCameraPreset; },
    get importPlanButton() { return importPlanButton; },
    get inspectorGroupHasVisibleField() { return inspectorGroupHasVisibleField; },
    get inspectorGroupsElement() { return inspectorGroupsElement; },
    get instanceTestTypeSet() { return instanceTestTypeSet; },
    get isAutoDiagramEmbed() { return isAutoDiagramEmbed; },
    get isDescendantOfRoot() { return isDescendantOfRoot; },
    get isEffectCacheReady() { return isEffectCacheReady; },
    get isEmbedStageMode() { return isEmbedStageMode; },
    get isEmbeddedStage() { return isEmbeddedStage; },
    get isInteractionBusy() { return isInteractionBusy; },
    get isLampEnabled() { return isLampEnabled; },
    get isPerformanceDiagnostics() { return isPerformanceDiagnostics; },
    get isPlanItemVisible() { return isPlanItemVisible; },
    get isRenderStatsTest() { return isRenderStatsTest; },
    get isSelectionAllowed() { return isSelectionAllowed; },
    get isSnapEnabled() { return isSnapEnabled; },
    get isStudioDraftReadonly() { return isStudioDraftReadonly; },
    get itemTypeButtons() { return itemTypeButtons; },
    get lampsLayerIndex() { return lampsLayerIndex; },
    get libraryNameScroll() { return libraryNameScroll; },
    get lightAssetRowElement() { return lightAssetRowElement; },
    get lightGroupActionMenuElement() { return lightGroupActionMenuElement; },
    get lightGroupAreaDialogElement() { return lightGroupAreaDialogElement; },
    get lightGroupAreaNameElement() { return lightGroupAreaNameElement; },
    get lightGroupAreaSelectElement() { return lightGroupAreaSelectElement; },
    get lightGroupListElement() { return lightGroupListElement; },
    get lightGroupRenameDialogElement() { return lightGroupRenameDialogElement; },
    get lightLayerPanelElement() { return lightLayerPanelElement; },
    get lightPropertyApplyDialogElement() { return lightPropertyApplyDialogElement; },
    get lightPropertySelectionCountElement() { return lightPropertySelectionCountElement; },
    get lightPropertyTargetListElement() { return lightPropertyTargetListElement; },
    get lightPropertyToggleAllButton() { return lightPropertyToggleAllButton; },
    get lightTransitionMs() { return lightTransitionMs; },
    get listChargingRows() { return listChargingRows; },
    get listLightGroupRows() { return listLightGroupRows; },
    get listScreenRows() { return listScreenRows; },
    get loadBackgroundImage() { return loadBackgroundImage; },
    get loadCustomMaterialStyles() { return loadCustomMaterialStyles; },
    get loadModelsForTypes() { return loadModelsForTypes; },
    get makeUniquePresetName() { return makeUniquePresetName; },
    get markDocumentDirty() { return markDocumentDirty; },
    get marqueeDelta() { return marqueeDelta; },
    get materialApplySameButton() { return materialApplySameButton; },
    get materialCacheByKey() { return materialCacheByKey; },
    get materialCoverageSummary() { return materialCoverageSummary; },
    get materialEditModelType() { return materialEditModelType; },
    get materialFieldsElement() { return materialFieldsElement; },
    get materialLoadOptionsForItem() { return materialLoadOptionsForItem; },
    get materialResetAllButton() { return materialResetAllButton; },
    get materialSameModelPeerCount() { return materialSameModelPeerCount; },
    get materialSameModelPeerRecords() { return materialSameModelPeerRecords; },
    get materialSavePresetButton() { return materialSavePresetButton; },
    get materialSlotGroupsElement() { return materialSlotGroupsElement; },
    get materialSlotListElement() { return materialSlotListElement; },
    get materialSlotMetaText() { return materialSlotMetaText; },
    get materialSlotPanelSignatureFor() { return materialSlotPanelSignatureFor; },
    get materialStyleDeleteButton() { return materialStyleDeleteButton; },
    get materialStyleFieldElement() { return materialStyleFieldElement; },
    get materialStyleStripElement() { return materialStyleStripElement; },
    get materialStyleSwatchColors() { return materialStyleSwatchColors; },
    get materialSummaryElement() { return materialSummaryElement; },
    get maxCameraNear() { return maxCameraNear; },
    get maxFrameSampleCount() { return maxFrameSampleCount; },
    get maxPendingGpuQueries() { return maxPendingGpuQueries; },
    get maxPrecompileBatchSize() { return maxPrecompileBatchSize; },
    get maybeShowDrawingLightNotice() { return maybeShowDrawingLightNotice; },
    get mergeStaticItemMeshes() { return mergeStaticItemMeshes; },
    get minCameraNear() { return minCameraNear; },
    get modelLoadingStatusElement() { return modelLoadingStatusElement; },
    get modelPresentationState() { return modelPresentationState; },
    get modelTypeForItem() { return modelTypeForItem; },
    get moveAreaRow() { return moveAreaRow; },
    get moveFloorRow() { return moveFloorRow; },
    get moveLightGroupToArea() { return moveLightGroupToArea; },
    get needsMotionPresentation() { return needsMotionPresentation; },
    get notifyStudioDraftLoadFailure() { return notifyStudioDraftLoadFailure; },
    get openExportDialog() { return openExportDialog; },
    get openExportPanel() { return openExportPanel; },
    get openLightingDialog() { return openLightingDialog; },
    get optimizedItemKeySet() { return optimizedItemKeySet; },
    get overlayCanvasElement() { return overlayCanvasElement; },
    get overlayCanvasRenderer() { return overlayCanvasRenderer; },
    get overviewCameraActionsElement() { return overviewCameraActionsElement; },
    get pendingHistoryScene() { return pendingHistoryScene; },
    set pendingHistoryScene(value: any) { pendingHistoryScene = value; },
    get persistLightAreaOrder() { return persistLightAreaOrder; },
    get planCanvasElement() { return planCanvasElement; },
    get planCanvasRenderer() { return planCanvasRenderer; },
    get planLabelAccentColor() { return planLabelAccentColor; },
    get planLightPrecompileBatches() { return planLightPrecompileBatches; },
    get planPainter() { return planPainter; },
    get planStageElement() { return planStageElement; },
    get planToScreen() { return planToScreen; },
    get planToWorldPoint() { return planToWorldPoint; },
    get positionLightFromAngles() { return positionLightFromAngles; },
    get precompiledMaterialKeySet() { return precompiledMaterialKeySet; },
    get preloadDefaultModels() { return preloadDefaultModels; },
    get prepareExportRender() { return prepareExportRender; },
    get prepareFreeCameraCapture() { return prepareFreeCameraCapture; },
    get prepareShadowAtlas() { return prepareShadowAtlas; },
    get previewFloorControls() { return previewFloorControls; },
    get previewFloorGapControlElement() { return previewFloorGapControlElement; },
    get previewFloorGapInput() { return previewFloorGapInput; },
    get previewFloorUniformControlElement() { return previewFloorUniformControlElement; },
    get previewFloorUniformInput() { return previewFloorUniformInput; },
    get previewLightCacheCanvasElement() { return previewLightCacheCanvasElement; },
    get previewQualityStatusElement() { return previewQualityStatusElement; },
    get previewRenderShieldElement() { return previewRenderShieldElement; },
    get previewResources() { return previewResources; },
    get previewSyncControls() { return previewSyncControls; },
    get previewTransformCache() { return previewTransformCache; },
    get previewTransformContext() { return previewTransformContext; },
    get primeHistorySnapshot() { return primeHistorySnapshot; },
    get projectItemAnchor() { return projectItemAnchor; },
    get projectNameElement() { return projectNameElement; },
    get publishModelLoadState() { return publishModelLoadState; },
    get publishRenderStats() { return publishRenderStats; },
    get pushBoundedSample() { return pushBoundedSample; },
    get pushUndoEntry() { return pushUndoEntry; },
    get readSavedLightAreaOrder() { return readSavedLightAreaOrder; },
    get readStoredCustomMaterialStyles() { return readStoredCustomMaterialStyles; },
    get rebuildFloorLayers() { return rebuildFloorLayers; },
    get rebuildWallIndex() { return rebuildWallIndex; },
    get recordSaveConflict() { return recordSaveConflict; },
    get recordSaveConflictFromServer() { return recordSaveConflictFromServer; },
    get refreshAfterHistoryChange() { return refreshAfterHistoryChange; },
    get refreshBackground() { return refreshBackground; },
    get refreshBaseLighting() { return refreshBaseLighting; },
    get refreshCanvasSizeUi() { return refreshCanvasSizeUi; },
    get refreshExitDialogButtons() { return refreshExitDialogButtons; },
    get refreshFloorControls() { return refreshFloorControls; },
    get refreshLightPreviewButton() { return refreshLightPreviewButton; },
    get refreshPreviewButton() { return refreshPreviewButton; },
    get refreshPreviewScene() { return refreshPreviewScene; },
    get refreshPreviewSync() { return refreshPreviewSync; },
    get refreshSceneRender() { return refreshSceneRender; },
    get refreshSceneSyncLightingDerived() { return refreshSceneSyncLightingDerived; },
    get refreshScopeItems() { return refreshScopeItems; },
    get refreshSelection() { return refreshSelection; },
    get refreshStudioUi() { return refreshStudioUi; },
    get refreshStudioUiInner() { return refreshStudioUiInner; },
    get refreshStudioView() { return refreshStudioView; },
    get removePlanButton() { return removePlanButton; },
    get renderCacheWriter() { return renderCacheWriter; },
    get renderExportImage() { return renderExportImage; },
    get renderExportLayers() { return renderExportLayers; },
    get renderExportPresetSlots() { return renderExportPresetSlots; },
    get renderFloorList() { return renderFloorList; },
    get renderMaterialSlotGroupChips() { return renderMaterialSlotGroupChips; },
    get renderMaterialSlotPanel() { return renderMaterialSlotPanel; },
    get renderStudioFrame() { return renderStudioFrame; },
    get renderStudioReadonlyBanner() { return renderStudioReadonlyBanner; },
    get requestSceneRebuild() { return requestSceneRebuild; },
    get requestSceneRender() { return requestSceneRender; },
    get requestStudioRender() { return requestStudioRender; },
    get resetFrameSamples() { return resetFrameSamples; },
    get resetPlanInteraction() { return resetPlanInteraction; },
    get resetView() { return resetView; },
    get resizeRenderCanvas() { return resizeRenderCanvas; },
    get resizeStudioRenderer() { return resizeStudioRenderer; },
    get resolveFloorDefaultGroup() { return resolveFloorDefaultGroup; },
    get resolveFrameSize() { return resolveFrameSize; },
    get resolveLightGroup() { return resolveLightGroup; },
    get resolveOverwriteChoice() { return resolveOverwriteChoice; },
    get resolvePixelRatio() { return resolvePixelRatio; },
    get resolvePreviewScope() { return resolvePreviewScope; },
    get restoreLightVisibility() { return restoreLightVisibility; },
    get retryStudioDraftLoad() { return retryStudioDraftLoad; },
    get rotateLocalPoint() { return rotateLocalPoint; },
    get runStudioSaveOnce() { return flushStudioSaveOnce; },
    get saveConflictDialogElement() { return saveConflictDialogElement; },
    get saveExportPreset() { return saveExportPreset; },
    get saveStateElement() { return saveStateElement; },
    get saveWaiterResolvers() { return saveWaiterResolvers; },
    get sceneCountsElement() { return sceneCountsElement; },
    get sceneSyncSinceKey() { return sceneSyncSinceKey; },
    set sceneSyncSinceKey(value: any) { sceneSyncSinceKey = value; },
    get scheduleAutosave() { return scheduleAutosave; },
    get scheduleDragUpdate() { return scheduleDragUpdate; },
    get scheduleExternalPrecompile() { return scheduleExternalPrecompile; },
    get scheduleLightPrecompile() { return scheduleLightPrecompile; },
    get scheduleModelLoadFlush() { return scheduleModelLoadFlush; },
    get schedulePointerMove() { return schedulePointerMove; },
    get scheduleStudioRender() { return scheduleStudioRender; },
    get screenToPlan() { return screenToPlan; },
    get screenToPlanPoint() { return screenToPlanPoint; },
    get selectElement() { return selectElement; },
    get selectFloor() { return selectFloor; },
    get selectPreviewFloor() { return selectPreviewFloor; },
    get selectSceneObject() { return selectSceneObject; },
    get selectStudioTool() { return selectStudioTool; },
    get selectedMaterialEditTarget() { return selectedMaterialEditTarget; },
    get setAssetCategory() { return setAssetCategory; },
    get setCameraMode() { return setCameraMode; },
    get setCameraView() { return setCameraView; },
    get setDrawingToolGroupOpen() { return setDrawingToolGroupOpen; },
    get setFadeOverlay() { return setFadeOverlay; },
    get setItemMaterialStyle() { return setItemMaterialStyle; },
    get setMaterialSlotGroupFilter() { return setMaterialSlotGroupFilter; },
    get setPreviewScope() { return setPreviewScope; },
    get settleStudioSaveResult() { return settleStudioSaveResult; },
    get setupSceneShadows() { return setupSceneShadows; },
    get shouldDeferSceneWork() { return shouldDeferSceneWork; },
    get shouldForceEffectFrame() { return shouldForceEffectFrame; },
    set shouldForceEffectFrame(value: any) { shouldForceEffectFrame = value; },
    get shouldSuspendSceneWork() { return shouldSuspendSceneWork; },
    get shouldTrimSharedGeometry() { return shouldTrimSharedGeometry; },
    set shouldTrimSharedGeometry(value: any) { shouldTrimSharedGeometry = value; },
    get showConflictDialog() { return showConflictDialog; },
    get showFloorActionMenu() { return showFloorActionMenu; },
    get showLightGroupActionMenu() { return showLightGroupActionMenu; },
    get showSaveState() { return showSaveState; },
    get showToast() { return showToast; },
    get snapIndicatorElement() { return snapIndicatorElement; },
    get snapSettingControls() { return snapSettingControls; },
    get snapSettingsPanel() { return snapSettingsPanel; },
    get snapSettingsToggleButton() { return snapSettingsToggleButton; },
    get snapToggleButton() { return snapToggleButton; },
    get snapToggleStateElement() { return snapToggleStateElement; },
    get snapToleranceInput() { return snapToleranceInput; },
    get snapToleranceValueElement() { return snapToleranceValueElement; },
    get stageLoadTiming() { return stageLoadTiming; },
    get stateViewportAspectGetCanvasSize() { return stateViewportAspectGetCanvasSize; },
    get storeFixedCameraView() { return storeFixedCameraView; },
    get studioBackLinkElement() { return studioBackLinkElement; },
    get studioBoxMeshDeps() { return studioBoxMeshDeps; },
    get studioDocumentDeps() { return studioDocumentDeps; },
    get studioDocumentStore() { return studioDocumentStore; },
    get studioDraftReadonly() { return studioDraftReadonly; },
    set studioDraftReadonly(value: any) { studioDraftReadonly = value; },
    get studioDraftRepository() { return studioDraftRepository; },
    get studioExitDialogElement() { return studioExitDialogElement; },
    get studioExitDiscardButton() { return studioExitDiscardButton; },
    get studioExitSaveButton() { return studioExitSaveButton; },
    get studioExportLayerDeps() { return studioExportLayerDeps; },
    get studioHistoryStore() { return studioHistoryStore; },
    get studioItemModelDeps() { return studioItemModelDeps; },
    get studioPlanItemDrawingDeps() { return studioPlanItemDrawingDeps; },
    get studioReadonlyBannerElement() { return studioReadonlyBannerElement; },
    set studioReadonlyBannerElement(value: any) { studioReadonlyBannerElement = value; },
    get studioReflectionDetailMode() { return studioReflectionDetailMode; },
    get studioSaveStore() { return studioSaveStore; },
    set studioSaveStore(value: any) { studioSaveStore = value; },
    get studioShellElement() { return studioShellElement; },
    get studioStaticItemMeshesDeps() { return studioStaticItemMeshesDeps; },
    get studioWallsDeps() { return studioWallsDeps; },
    get syncAreaAssignOptions() { return syncAreaAssignOptions; },
    get syncBaseLightingControls() { return syncBaseLightingControls; },
    get syncCameraFocalLengthControl() { return syncCameraFocalLengthControl; },
    get syncCameraModeControls() { return syncCameraModeControls; },
    get syncCameraViewControls() { return syncCameraViewControls; },
    get syncCanvasSizeInputs() { return syncCanvasSizeInputs; },
    get syncChargingLayers() { return syncChargingLayers; },
    get syncDraftPayloadAfterSave() { return syncDraftPayloadAfterSave; },
    get syncDrawingToolGroupStates() { return syncDrawingToolGroupStates; },
    get syncExportControls() { return syncExportControls; },
    get syncFloorGroups() { return syncFloorGroups; },
    get syncGlobalControls() { return syncGlobalControls; },
    get syncInspectorGroups() { return syncInspectorGroups; },
    get syncLightCache() { return syncLightCache; },
    get syncLightGroupList() { return syncLightGroupList; },
    get syncLightTargetGroups() { return syncLightTargetGroups; },
    get syncMaterialStyleStrip() { return syncMaterialStyleStrip; },
    get syncScreenLayers() { return syncScreenLayers; },
    get syncSnapControls() { return syncSnapControls; },
    get syncStudioClipboardFacade() { return syncStudioClipboardFacade; },
    get syncStudioHistoryFacade() { return syncStudioHistoryFacade; },
    get toggleAreaExpanded() { return toggleAreaExpanded; },
    get toggleBackgroundButton() { return toggleBackgroundButton; },
    get toggleFloorEdgeButton() { return toggleFloorEdgeButton; },
    get toolButtons() { return toolButtons; },
    get toolHelpElement() { return toolHelpElement; },
    get toolHelpMessages() { return toolHelpMessages; },
    get transitionLightGroups() { return transitionLightGroups; },
    get undoStudioHistory() { return undoStudioHistory; },
    get uniqueFloorName() { return uniqueFloorName; },
    get uniqueLightGroupName() { return uniqueLightGroupName; },
    get updateCameraPlanes() { return updateCameraPlanes; },
    get updateCameraView() { return updateCameraView; },
    get updateExternalModelDataset() { return updateExternalModelDataset; },
    get updateFloorPreviewButtons() { return updateFloorPreviewButtons; },
    get updateLightCache() { return updateLightCache; },
    get updateModelLoadIndicator() { return updateModelLoadIndicator; },
    get updateRenderStatsHud() { return updateRenderStatsHud; },
    get updateShadowState() { return updateShadowState; },
    get updateSnapIndicator() { return updateSnapIndicator; },
    get validateSelectionChange() { return validateSelectionChange; },
    get waitForIdleFrame() { return waitForIdleFrame; },
    get waitForStudioInteractionIdle() { return waitForStudioInteractionIdle; },
    get wallJoinCacheByWall() { return wallJoinCacheByWall; },
    get wallWindowSpan() { return wallWindowSpan; },
    get worldPointForFloor() { return worldPointForFloor; },
    get worldToPlanPoint() { return worldToPlanPoint; },
    get writeInspectorGroupCollapseState() { return writeInspectorGroupCollapseState; },
    get writeStoredCustomMaterialStyles() { return writeStoredCustomMaterialStyles; },
    get zoomByScale() { return zoomByScale; },
  };

  const sceneCacheDescriptor = (...args: any[]): any => (sceneCacheDescriptorImpl as any)(studioRuntime, ...args);
  const checkModelInUse = (...args: any[]): any => (checkModelInUseImpl as any)(studioRuntime, ...args);
  const collectScenePayload = (...args: any[]): any => (collectScenePayloadImpl as any)(studioRuntime, ...args);
  const collectSelectedFloors = (...args: any[]): any => (collectSelectedFloorsImpl as any)(studioRuntime, ...args);
  const scheduleModelLoadFlush = (...args: any[]): any => (scheduleModelLoadFlushImpl as any)(studioRuntime, ...args);
  const loadModelsForTypes = (...args: any[]): any => (loadModelsForTypesImpl as any)(studioRuntime, ...args);
  const preloadDefaultModels = (...args: any[]): any => (preloadDefaultModelsImpl as any)(studioRuntime, ...args);
  const requestSceneRender = (...args: any[]): any => (requestSceneRenderImpl as any)(studioRuntime, ...args);
  const finishModelLoad = (...args: any[]): any => (finishModelLoadImpl as any)(studioRuntime, ...args);
  const publishModelLoadState = (...args: any[]): any => (publishModelLoadStateImpl as any)(studioRuntime, ...args);
  const emitRuntimeDiagnostic = (...args: any[]): any => (emitRuntimeDiagnosticImpl as any)(studioRuntime, ...args);
  const updateModelLoadIndicator = (...args: any[]): any => (updateModelLoadIndicatorImpl as any)(studioRuntime, ...args);
  const materialLoadOptionsForItem = (...args: any[]): any => (materialLoadOptionsForItemImpl as any)(studioRuntime, ...args);
  const applyItemOptimization = (...args: any[]): any => (applyItemOptimizationImpl as any)(studioRuntime, ...args);
  const getActiveFloor = (...args: any[]): any => (getActiveFloorImpl as any)(studioRuntime, ...args);
  const captureStudioSnapshot = (...args: any[]): any => (captureStudioSnapshotImpl as any)(studioRuntime, ...args);
  const getLocalSaveRevision = (...args: any[]): any => (getLocalSaveRevisionImpl as any)(studioRuntime, ...args);
  const uniqueFloorName = (...args: any[]): any => (uniqueFloorNameImpl as any)(studioRuntime, ...args);
  const hideFloorActionMenu = (...args: any[]): any => (hideFloorActionMenuImpl as any)(studioRuntime, ...args);
  const showFloorActionMenu = (...args: any[]): any => (showFloorActionMenuImpl as any)(studioRuntime, ...args);
  const floorActionHandler = (...args: any[]): any => (floorActionHandlerImpl as any)(studioRuntime, ...args);
  const closeFloorDeleteDialog = (...args: any[]): any => (closeFloorDeleteDialogImpl as any)(studioRuntime, ...args);
  const confirmFloorDelete = (...args: any[]): any => (confirmFloorDeleteImpl as any)(studioRuntime, ...args);
  const openFloorRenameDialog = (...args: any[]): any => (openFloorRenameDialogImpl as any)(studioRuntime, ...args);
  const syncGlobalControls = (...args: any[]): any => (syncGlobalControlsImpl as any)(studioRuntime, ...args);
  const clearDropIndicator = (...args: any[]): any => (clearDropIndicatorImpl as any)(studioRuntime, ...args);
  const moveFloorRow = (...args: any[]): any => (moveFloorRowImpl as any)(studioRuntime, ...args);
  const renderFloorList = (...args: any[]): any => (renderFloorListImpl as any)(studioRuntime, ...args);
  const selectFloor = (...args: any[]): any => (selectFloorImpl as any)(studioRuntime, ...args);
  const addNewFloor = (...args: any[]): any => (addNewFloorImpl as any)(studioRuntime, ...args);
  const planToWorldPoint = (...args: any[]): any => (planToWorldPointImpl as any)(studioRuntime, ...args);
  const worldToPlanPoint = (...args: any[]): any => (worldToPlanPointImpl as any)(studioRuntime, ...args);
  const worldPointForFloor = (...args: any[]): any => (worldPointForFloorImpl as any)(studioRuntime, ...args);
  const getActiveWalls = (...args: any[]): any => (getActiveWallsImpl as any)(studioRuntime, ...args);
  const startFloorAlign = (...args: any[]): any => (startFloorAlignImpl as any)(studioRuntime, ...args);
  const cancelFloorAlign = (...args: any[]): any => (cancelFloorAlignImpl as any)(studioRuntime, ...args);
  const isSameAlignmentFloor = (...args: any[]): any => (isSameAlignmentFloorImpl as any)(studioRuntime, ...args);
  const updatePreviewFloorGap = (...args: any[]): any => (updatePreviewFloorGapImpl as any)(studioRuntime, ...args);
  const updateUniformOverviewStack = (...args: any[]): any => (updateUniformOverviewStackImpl as any)(studioRuntime, ...args);
  const updateExportFloorGap = (...args: any[]): any => (updateExportFloorGapImpl as any)(studioRuntime, ...args);
  const captureUndoSnapshot = (...args: any[]): any => (captureUndoSnapshotImpl as any)(studioRuntime, ...args);
  const resolveLightGroup = (...args: any[]): any => (resolveLightGroupImpl as any)(studioRuntime, ...args);
  const resolveFloorDefaultGroup = (...args: any[]): any => (resolveFloorDefaultGroupImpl as any)(studioRuntime, ...args);
  const isLampEnabled = (...args: any[]): any => (isLampEnabledImpl as any)(studioRuntime, ...args);
  const getScreenLightGroups = (...args: any[]): any => (getScreenLightGroupsImpl as any)(studioRuntime, ...args);
  const getChargingLightGroups = (...args: any[]): any => (getChargingLightGroupsImpl as any)(studioRuntime, ...args);
  const getOrderedFloorList = (...args: any[]): any => (getOrderedFloorListImpl as any)(studioRuntime, ...args);
  const floorElevationFor = (...args: any[]): any => (floorElevationForImpl as any)(studioRuntime, ...args);
  const composeLightGroupKey = (...args: any[]): any => (composeLightGroupKeyImpl as any)(studioRuntime, ...args);
  const collectLampEntries = (...args: any[]): any => (collectLampEntriesImpl as any)(studioRuntime, ...args);
  const listLightGroupRows = (...args: any[]): any => (listLightGroupRowsImpl as any)(studioRuntime, ...args);
  const listScreenRows = (...args: any[]): any => (listScreenRowsImpl as any)(studioRuntime, ...args);
  const listChargingRows = (...args: any[]): any => (listChargingRowsImpl as any)(studioRuntime, ...args);
  const syncScreenLayers = (...args: any[]): any => (syncScreenLayersImpl as any)(studioRuntime, ...args);
  const syncChargingLayers = (...args: any[]): any => (syncChargingLayersImpl as any)(studioRuntime, ...args);
  const pushUndoEntry = (...args: any[]): any => (pushUndoEntryImpl as any)(studioRuntime, ...args);
  const getLightGroups = (...args: any[]): any => (getLightGroupsImpl as any)(studioRuntime, ...args);
  const syncLightGroupSelect = (...args: any[]): any => (syncLightGroupSelectImpl as any)(studioRuntime, ...args);
  const hideLightGroupActionMenu = (...args: any[]): any => (hideLightGroupActionMenuImpl as any)(studioRuntime, ...args);
  const showLightGroupActionMenu = (...args: any[]): any => (showLightGroupActionMenuImpl as any)(studioRuntime, ...args);
  const deleteLightGroup = (...args: any[]): any => (deleteLightGroupImpl as any)(studioRuntime, ...args);
  const uniqueLightGroupName = (...args: any[]): any => (uniqueLightGroupNameImpl as any)(studioRuntime, ...args);
  const duplicateLightGroup = (...args: any[]): any => (duplicateLightGroupImpl as any)(studioRuntime, ...args);
  const clearLightGroupDropIndicator = (...args: any[]): any => (clearLightGroupDropIndicatorImpl as any)(studioRuntime, ...args);
  const collectListDragDropTargets = (...args: any[]): any => (collectListDragDropTargetsImpl as any)(studioRuntime, ...args);
  const applyListDragDropIndicator = (...args: any[]): any => (applyListDragDropIndicatorImpl as any)(studioRuntime, ...args);
  const activateListDrag = (...args: any[]): any => (activateListDragImpl as any)(studioRuntime, ...args);
  const handleListDragPointerMove = (...args: any[]): any => (handleListDragPointerMoveImpl as any)(studioRuntime, ...args);
  const handleListDragPointerUp = (...args: any[]): any => (handleListDragPointerUpImpl as any)(studioRuntime, ...args);
  const handleListDragPointerCancel = (...args: any[]): any => (handleListDragPointerCancelImpl as any)(studioRuntime, ...args);
  const handleListDragTouchMove = (...args: any[]): any => (handleListDragTouchMoveImpl as any)(studioRuntime, ...args);
  const finishListDrag = (...args: any[]): any => (finishListDragImpl as any)(studioRuntime, ...args);
  const beginListRowDrag = (...args: any[]): any => (beginListRowDragImpl as any)(studioRuntime, ...args);
  const moveAreaRow = (...args: any[]): any => (moveAreaRowImpl as any)(studioRuntime, ...args);
  const moveLightGroupToArea = (...args: any[]): any => (moveLightGroupToAreaImpl as any)(studioRuntime, ...args);
  const refreshLightAreasFromHa = (...args: any[]): any => (refreshLightAreasFromHaImpl as any)(studioRuntime, ...args);
  const readSavedLightAreaOrder = (...args: any[]): any => (readSavedLightAreaOrderImpl as any)(studioRuntime, ...args);
  const persistLightAreaOrder = (...args: any[]): any => (persistLightAreaOrderImpl as any)(studioRuntime, ...args);
  const applySavedLightAreaOrder = (...args: any[]): any => (applySavedLightAreaOrderImpl as any)(studioRuntime, ...args);
  const isKnownLightAreaId = (...args: any[]): any => (isKnownLightAreaIdImpl as any)(studioRuntime, ...args);
  const syncAreaAssignOptions = (...args: any[]): any => (syncAreaAssignOptionsImpl as any)(studioRuntime, ...args);
  const openLightGroupAreaDialog = (...args: any[]): any => (openLightGroupAreaDialogImpl as any)(studioRuntime, ...args);
  const closeLightGroupAreaDialog = (...args: any[]): any => (closeLightGroupAreaDialogImpl as any)(studioRuntime, ...args);
  const toggleAreaExpanded = (...args: any[]): any => (toggleAreaExpandedImpl as any)(studioRuntime, ...args);
  const createLightGroupRow = (...args: any[]): any => (createLightGroupRowImpl as any)(studioRuntime, ...args);
  const createAreaSection = (...args: any[]): any => (createAreaSectionImpl as any)(studioRuntime, ...args);
  const maybeShowDrawingLightNotice = (...args: any[]): any => (maybeShowDrawingLightNoticeImpl as any)(studioRuntime, ...args);
  const syncLightGroupList = (...args: any[]): any => (syncLightGroupListImpl as any)(studioRuntime, ...args);
  const setAllLightGroupsEnabled = (...args: any[]): any => (setAllLightGroupsEnabledImpl as any)(studioRuntime, ...args);
  const createSelectionRef = (...args: any[]): any => (createSelectionRefImpl as any)(studioRuntime, ...args);
  const refreshSelection = (...args: any[]): any => (refreshSelectionImpl as any)(studioRuntime, ...args);
  const isPlanItemVisible = (...args: any[]): any => (isPlanItemVisibleImpl as any)(studioRuntime, ...args);
  const isSelectionAllowed = (...args: any[]): any => (isSelectionAllowedImpl as any)(studioRuntime, ...args);
  const selectSceneObject = (...args: any[]): any => (selectSceneObjectImpl as any)(studioRuntime, ...args);
  const getDefaultSelectionScope = (...args: any[]): any => (getDefaultSelectionScopeImpl as any)(studioRuntime, ...args);
  const resolvePreviewScope = (...args: any[]): any => (resolvePreviewScopeImpl as any)(studioRuntime, ...args);
  const classifySelectionScope = (...args: any[]): any => (classifySelectionScopeImpl as any)(studioRuntime, ...args);
  const getCurrentPreviewScope = (...args: any[]): any => (getCurrentPreviewScopeImpl as any)(studioRuntime, ...args);
  const getPreviewScopeSelection = (...args: any[]): any => (getPreviewScopeSelectionImpl as any)(studioRuntime, ...args);
  const setPreviewScope = (...args: any[]): any => (setPreviewScopeImpl as any)(studioRuntime, ...args);
  const markWallsChanged = (...args: any[]): any => (markWallsChangedImpl as any)(studioRuntime, ...args);
  const rebuildWallIndex = (...args: any[]): any => (rebuildWallIndexImpl as any)(studioRuntime, ...args);
  const getPixelsPerMeter = (...args: any[]): any => (getPixelsPerMeterImpl as any)(studioRuntime, ...args);
  const historyUndoDepth = (...args: any[]): any => (historyUndoDepthImpl as any)(studioRuntime, ...args);
  const historyRedoDepth = (...args: any[]): any => (historyRedoDepthImpl as any)(studioRuntime, ...args);
  const isStudioDraftReadonly = (...args: any[]): any => (isStudioDraftReadonlyImpl as any)(studioRuntime, ...args);
  const downloadStudioLocalCopy = (...args: any[]): any => (downloadStudioLocalCopyImpl as any)(studioRuntime, ...args);
  const renderStudioReadonlyBanner = (...args: any[]): any => (renderStudioReadonlyBannerImpl as any)(studioRuntime, ...args);
  const hideStudioReadonlyBanner = (...args: any[]): any => (hideStudioReadonlyBannerImpl as any)(studioRuntime, ...args);
  const applyStudioSaveState = (...args: any[]): any => (applyStudioSaveStateImpl as any)(studioRuntime, ...args);
  const getStudioSaveStore = (...args: any[]): any => (getStudioSaveStoreImpl as any)(studioRuntime, ...args);
  const syncDraftPayloadAfterSave = (...args: any[]): any => (syncDraftPayloadAfterSaveImpl as any)(studioRuntime, ...args);
  const recordSaveConflictFromServer = (...args: any[]): any => (recordSaveConflictFromServerImpl as any)(studioRuntime, ...args);
  const settleStudioSaveResult = (...args: any[]): any => (settleStudioSaveResultImpl as any)(studioRuntime, ...args);
  const waitForStudioInteractionIdle = (...args: any[]): any => (waitForStudioInteractionIdleImpl as any)(studioRuntime, ...args);
  const flushStudioSaveOnce = (...args: any[]): any => (runStudioSaveOnceImpl as any)(studioRuntime, ...args);
  const notifyStudioDraftLoadFailure = (...args: any[]): any => (notifyStudioDraftLoadFailureImpl as any)(studioRuntime, ...args);
  const retryStudioDraftLoad = (...args: any[]): any => (retryStudioDraftLoadImpl as any)(studioRuntime, ...args);
  const flushStudioSaveBeforeTeardown = (...args: any[]): any => (flushStudioSaveBeforeTeardownImpl as any)(studioRuntime, ...args);
  const sceneSyncFlushIsDirty = (...args: any[]): any => (sceneSyncFlushIsDirtyImpl as any)(studioRuntime, ...args);
  const flushSceneSyncRuntime = (...args: any[]): any => (flushSceneSyncRuntimeImpl as any)(studioRuntime, ...args);
  const currentSceneSyncSinceKey = (...args: any[]): any => (currentSceneSyncSinceKeyImpl as any)(studioRuntime, ...args);
  const rememberSceneSyncKey = (...args: any[]): any => (rememberSceneSyncKeyImpl as any)(studioRuntime, ...args);
  const refreshAfterSceneSyncOutcome = (...args: any[]): any => (refreshAfterSceneSyncOutcomeImpl as any)(studioRuntime, ...args);
  const fetchStudioApi = (...args: any[]): any => (fetchStudioApiImpl as any)(studioRuntime, ...args);
  const showToast = (...args: any[]): any => (showToastImpl as any)(studioRuntime, ...args);
  const showSaveState = (...args: any[]): any => (showSaveStateImpl as any)(studioRuntime, ...args);
  const syncStudioHistoryFacade = (...args: any[]): any => (syncStudioHistoryFacadeImpl as any)(studioRuntime, ...args);
  /* 剪贴板可用性没有参数，直接收敛成无参方法，不给类型豁免棘轮添新条目。 */
  const syncStudioClipboardFacade = (): void => { syncStudioClipboardFacadeImpl(studioRuntime); };
  const historyFailureMessage = (...args: any[]): any => (historyFailureMessageImpl as any)(studioRuntime, ...args);
  const undoStudioHistory = (...args: any[]): any => (undoStudioHistoryImpl as any)(studioRuntime, ...args);
  const redoStudioHistory = (...args: any[]): any => (redoStudioHistoryImpl as any)(studioRuntime, ...args);
  const applyStudioHistoryDirection = (...args: any[]): any => (applyStudioHistoryDirectionImpl as any)(studioRuntime, ...args);
  const collectPatchFloorIds = (...args: any[]): any => (collectPatchFloorIdsImpl as any)(studioRuntime, ...args);
  const canApplyHistoryPatch = (...args: any[]): any => (canApplyHistoryPatchImpl as any)(studioRuntime, ...args);
  const refreshAfterHistoryChange = (...args: any[]): any => (refreshAfterHistoryChangeImpl as any)(studioRuntime, ...args);
  const validateSelectionChange = (...args: any[]): any => (validateSelectionChangeImpl as any)(studioRuntime, ...args);
  const primeHistorySnapshot = (...args: any[]): any => (primeHistorySnapshotImpl as any)(studioRuntime, ...args);
  const deselectAll = (...args: any[]): any => (deselectAllImpl as any)(studioRuntime, ...args);
  const applyPlacementChange = (...args: any[]): any => (applyPlacementChangeImpl as any)(studioRuntime, ...args);
  const flushPendingHistory = (...args: any[]): any => (flushPendingHistoryImpl as any)(studioRuntime, ...args);
  const restoreSnapshot = (...args: any[]): any => (restoreSnapshotImpl as any)(studioRuntime, ...args);
  const markDocumentDirty = (...args: any[]): any => (markDocumentDirtyImpl as any)(studioRuntime, ...args);
  const recordSaveConflict = (...args: any[]): any => (recordSaveConflictImpl as any)(studioRuntime, ...args);
  const resetSaveRetryState = (...args: any[]): any => (resetSaveRetryStateImpl as any)(studioRuntime, ...args);
  const scheduleAutosave = (...args: any[]): any => (scheduleAutosaveImpl as any)(studioRuntime, ...args);
  const handleInteractionEnded = (...args: any[]): any => (handleInteractionEndedImpl as any)(studioRuntime, ...args);
  const isInteractionBusy = (...args: any[]): any => (isInteractionBusyImpl as any)(studioRuntime, ...args);
  const hasUnsavedChanges = (...args: any[]): any => (hasUnsavedChangesImpl as any)(studioRuntime, ...args);
  const refreshExitDialogButtons = (...args: any[]): any => (refreshExitDialogButtonsImpl as any)(studioRuntime, ...args);
  const closeExitDialog = (...args: any[]): any => (closeExitDialogImpl as any)(studioRuntime, ...args);
  const leaveStudio = (...args: any[]): any => (leaveStudioImpl as any)(studioRuntime, ...args);
  const flushAutosave = (...args: any[]): any => (flushAutosaveImpl as any)(studioRuntime, ...args);
  const planToScreen = (...args: any[]): any => (planToScreenImpl as any)(studioRuntime, ...args);
  const screenToPlanPoint = (...args: any[]): any => (screenToPlanPointImpl as any)(studioRuntime, ...args);
  const screenToPlan = (...args: any[]): any => (screenToPlanImpl as any)(studioRuntime, ...args);
  const eventToLocalPoint = (...args: any[]): any => (eventToLocalPointImpl as any)(studioRuntime, ...args);
  const getCanvasSize = (...args: any[]): any => (getCanvasSizeImpl as any)(studioRuntime, ...args);
  const resetView = (...args: any[]): any => (resetViewImpl as any)(studioRuntime, ...args);
  const zoomByScale = (...args: any[]): any => (zoomByScaleImpl as any)(studioRuntime, ...args);
  const rotatePlanView = (...args: any[]): any => (rotatePlanViewImpl as any)(studioRuntime, ...args);
  const resizePlanStage = (...args: any[]): any => (resizePlanStageImpl as any)(studioRuntime, ...args);
  const buildSnapIndex = (...args: any[]): any => (buildSnapIndexImpl as any)(studioRuntime, ...args);
  const closedWallLoops = (...args: any[]): any => (closedWallLoopsImpl as any)(studioRuntime, ...args);
  const computeWallIntersections = (...args: any[]): any => (computeWallIntersectionsImpl as any)(studioRuntime, ...args);
  const computeSurfaceExclusions = (...args: any[]): any => (computeSurfaceExclusionsImpl as any)(studioRuntime, ...args);
  const computeWallPolygons = (...args: any[]): any => (computeWallPolygonsImpl as any)(studioRuntime, ...args);
  const wallWindowSpan = (...args: any[]): any => (wallWindowSpanImpl as any)(studioRuntime, ...args);
  const drawRailing = (...args: any[]): any => (drawRailingImpl as any)(studioRuntime, ...args);
  const rotateLocalPoint = (...args: any[]): any => (rotateLocalPointImpl as any)(studioRuntime, ...args);
  const buildHandleGeometry = (...args: any[]): any => (buildHandleGeometryImpl as any)(studioRuntime, ...args);
  const hitTestHandle = (...args: any[]): any => (hitTestHandleImpl as any)(studioRuntime, ...args);
  const boundsFromCorners = (...args: any[]): any => (boundsFromCornersImpl as any)(studioRuntime, ...args);
  const marqueeDelta = (...args: any[]): any => (marqueeDeltaImpl as any)(studioRuntime, ...args);
  const updateMarqueeOverlay = (...args: any[]): any => (updateMarqueeOverlayImpl as any)(studioRuntime, ...args);
  const drawMarqueeOverlay = (...args: any[]): any => (drawMarqueeOverlayImpl as any)(studioRuntime, ...args);
  const renderPlanScene = (...args: any[]): any => (renderPlanSceneImpl as any)(studioRuntime, ...args);
  const getSelectedObject = (...args: any[]): any => (getSelectedObjectImpl as any)(studioRuntime, ...args);
  const getPanelRatioLimits = (...args: any[]): any => (getPanelRatioLimitsImpl as any)(studioRuntime, ...args);
  const applyPanelRatios = (...args: any[]): any => (applyPanelRatiosImpl as any)(studioRuntime, ...args);
  const applyDetailsRatio = (...args: any[]): any => (applyDetailsRatioImpl as any)(studioRuntime, ...args);
  const isSnapEnabled = (...args: any[]): any => (isSnapEnabledImpl as any)(studioRuntime, ...args);
  const setSnapSettingsOpen = (...args: any[]): any => (setSnapSettingsOpenImpl as any)(studioRuntime, ...args);
  const syncSnapControls = (...args: any[]): any => (syncSnapControlsImpl as any)(studioRuntime, ...args);
  const applySnapTolerance = (...args: any[]): any => (applySnapToleranceImpl as any)(studioRuntime, ...args);
  const refreshBackground = (...args: any[]): any => (refreshBackgroundImpl as any)(studioRuntime, ...args);
  const refreshStudioUi = (...args: any[]): any => (refreshStudioUiImpl as any)(studioRuntime, ...args);
  const readInspectorGroupCollapseState = (...args: any[]): any => (readInspectorGroupCollapseStateImpl as any)(studioRuntime, ...args);
  const writeInspectorGroupCollapseState = (...args: any[]): any => (writeInspectorGroupCollapseStateImpl as any)(studioRuntime, ...args);
  const inspectorGroupHasVisibleField = (...args: any[]): any => (inspectorGroupHasVisibleFieldImpl as any)(studioRuntime, ...args);
  const countInspectorGroupFields = (...args: any[]): any => (countInspectorGroupFieldsImpl as any)(studioRuntime, ...args);
  const syncInspectorGroups = (...args: any[]): any => (syncInspectorGroupsImpl as any)(studioRuntime, ...args);
  const toggleInspectorGroup = (...args: any[]): any => (toggleInspectorGroupImpl as any)(studioRuntime, ...args);
  const materialSlotPanelSignatureFor = (...args: any[]): any => (materialSlotPanelSignatureForImpl as any)(studioRuntime, ...args);
  const materialStyleSwatchColors = (...args: any[]): any => (materialStyleSwatchColorsImpl as any)(studioRuntime, ...args);
  const syncMaterialStyleStrip = (...args: any[]): any => (syncMaterialStyleStripImpl as any)(studioRuntime, ...args);
  const renderMaterialSlotGroupChips = (...args: any[]): any => (renderMaterialSlotGroupChipsImpl as any)(studioRuntime, ...args);
  const setMaterialSlotGroupFilter = (...args: any[]): any => (setMaterialSlotGroupFilterImpl as any)(studioRuntime, ...args);
  const materialSlotMetaText = (...args: any[]): any => (materialSlotMetaTextImpl as any)(studioRuntime, ...args);
  const doorPartDisplayColor = (...args: any[]): any => (doorPartDisplayColorImpl as any)(studioRuntime, ...args);
  const doorPartMeshOptions = (...args: any[]): any => (doorPartMeshOptionsImpl as any)(studioRuntime, ...args);
  const doorMaterialPeerCount = (...args: any[]): any => (doorMaterialPeerCountImpl as any)(studioRuntime, ...args);
  const renderDoorMaterialPanel = (...args: any[]): any => (renderDoorMaterialPanelImpl as any)(studioRuntime, ...args);
  const renderMaterialSlotPanel = (...args: any[]): any => (renderMaterialSlotPanelImpl as any)(studioRuntime, ...args);
  const materialCoverageSummary = (...args: any[]): any => (materialCoverageSummaryImpl as any)(studioRuntime, ...args);
  const createMaterialSlotRow = (...args: any[]): any => (createMaterialSlotRowImpl as any)(studioRuntime, ...args);
  const materialSameModelPeerCount = (...args: any[]): any => (materialSameModelPeerCountImpl as any)(studioRuntime, ...args);
  const materialEditModelType = (...args: any[]): any => (materialEditModelTypeImpl as any)(studioRuntime, ...args);
  const selectedMaterialEditTarget = (...args: any[]): any => (selectedMaterialEditTargetImpl as any)(studioRuntime, ...args);
  const materialSameModelPeerRecords = (...args: any[]): any => (materialSameModelPeerRecordsImpl as any)(studioRuntime, ...args);
  const commitItemMaterialEdit = (...args: any[]): any => (commitItemMaterialEditImpl as any)(studioRuntime, ...args);
  const setItemMaterialOverride = (...args: any[]): any => (setItemMaterialOverrideImpl as any)(studioRuntime, ...args);
  const setItemMaterialStyle = (...args: any[]): any => (setItemMaterialStyleImpl as any)(studioRuntime, ...args);
  const resetItemMaterialAll = (...args: any[]): any => (resetItemMaterialAllImpl as any)(studioRuntime, ...args);
  const setItemMaterialSurfaceOverride = (...args: any[]): any => (setItemMaterialSurfaceOverrideImpl as any)(studioRuntime, ...args);
  const readStoredCustomMaterialStyles = (...args: any[]): any => (readStoredCustomMaterialStylesImpl as any)(studioRuntime, ...args);
  const loadCustomMaterialStyles = (...args: any[]): any => (loadCustomMaterialStylesImpl as any)(studioRuntime, ...args);
  const ensureCustomMaterialStylesLoaded = (...args: any[]): any => (ensureCustomMaterialStylesLoadedImpl as any)(studioRuntime, ...args);
  const writeStoredCustomMaterialStyles = (...args: any[]): any => (writeStoredCustomMaterialStylesImpl as any)(studioRuntime, ...args);
  const saveCurrentItemMaterialStyle = (...args: any[]): any => (saveCurrentItemMaterialStyleImpl as any)(studioRuntime, ...args);
  const deleteCustomMaterialStyle = (...args: any[]): any => (deleteCustomMaterialStyleImpl as any)(studioRuntime, ...args);
  const applyMaterialToSameModelItems = (...args: any[]): any => (applyMaterialToSameModelItemsImpl as any)(studioRuntime, ...args);
  const refreshScopeItems = (...args: any[]): any => (refreshScopeItemsImpl as any)(studioRuntime, ...args);
  const setDrawingToolGroupOpen = (...args: any[]): any => (setDrawingToolGroupOpenImpl as any)(studioRuntime, ...args);
  const closeDrawingToolGroups = (...args: any[]): any => (closeDrawingToolGroupsImpl as any)(studioRuntime, ...args);
  const syncDrawingToolGroupStates = (...args: any[]): any => (syncDrawingToolGroupStatesImpl as any)(studioRuntime, ...args);
  const selectStudioTool = (...args: any[]): any => (selectStudioToolImpl as any)(studioRuntime, ...args);
  const ensureCalibrationReady = (...args: any[]): any => (ensureCalibrationReadyImpl as any)(studioRuntime, ...args);
  const clearSelection = (...args: any[]): any => (clearSelectionImpl as any)(studioRuntime, ...args);
  const finalizeAddedItem = (...args: any[]): any => (finalizeAddedItemImpl as any)(studioRuntime, ...args);
  const duplicateSelection = (...args: any[]): any => (duplicateSelectionImpl as any)(studioRuntime, ...args);
  const collectSelectedPlanItems = (...args: any[]): any => (collectSelectedPlanItemsImpl as any)(studioRuntime, ...args);
  const mirrorSelection = (...args: any[]): any => (mirrorSelectionImpl as any)(studioRuntime, ...args);
  const rotateSelection = (...args: any[]): any => (rotateSelectionImpl as any)(studioRuntime, ...args);
  const loadBackgroundImage = (...args: any[]): any => (loadBackgroundImageImpl as any)(studioRuntime, ...args);
  const importBackgroundFile = (...args: any[]): any => (importBackgroundFileImpl as any)(studioRuntime, ...args);
  const backgroundSettings = (...args: any[]): any => (backgroundSettingsImpl as any)(studioRuntime, ...args);
  const positionLightFromAngles = (...args: any[]): any => (positionLightFromAnglesImpl as any)(studioRuntime, ...args);
  const refreshBaseLighting = (...args: any[]): any => (refreshBaseLightingImpl as any)(studioRuntime, ...args);
  const setShadowQualityHigh = (...args: any[]): any => (setShadowQualityHighImpl as any)(studioRuntime, ...args);
  const clampShadowMapSize = (...args: any[]): any => (clampShadowMapSizeImpl as any)(studioRuntime, ...args);
  const syncBaseLightingControls = (...args: any[]): any => (syncBaseLightingControlsImpl as any)(studioRuntime, ...args);
  const applyBaseLighting = (...args: any[]): any => (applyBaseLightingImpl as any)(studioRuntime, ...args);
  const saveBaseLightingEdit = (...args: any[]): any => (saveBaseLightingEditImpl as any)(studioRuntime, ...args);
  const openLightingDialog = (...args: any[]): any => (openLightingDialogImpl as any)(studioRuntime, ...args);
  const confirmLightingDialog = (...args: any[]): any => (confirmLightingDialogImpl as any)(studioRuntime, ...args);
  const updateBaseLightingFromInput = (...args: any[]): any => (updateBaseLightingFromInputImpl as any)(studioRuntime, ...args);
  const cameraSettings = (...args: any[]): any => (cameraSettingsImpl as any)(studioRuntime, ...args);
  const getCameraMode = (...args: any[]): any => (getCameraModeImpl as any)(studioRuntime, ...args);
  const getCameraView = (...args: any[]): any => (getCameraViewImpl as any)(studioRuntime, ...args);
  const getCameraTopRotation = (...args: any[]): any => (getCameraTopRotationImpl as any)(studioRuntime, ...args);
  const buildCameraUpVector = (...args: any[]): any => (buildCameraUpVectorImpl as any)(studioRuntime, ...args);
  const getCameraFocalLength = (...args: any[]): any => (getCameraFocalLengthImpl as any)(studioRuntime, ...args);
  const collectActiveLightEntries = (...args: any[]): any => (collectActiveLightEntriesImpl as any)(studioRuntime, ...args);
  const assessRenderBudget = (...args: any[]): any => (assessRenderBudgetImpl as any)(studioRuntime, ...args);
  const canRenderScene = (...args: any[]): any => (canRenderSceneImpl as any)(studioRuntime, ...args);
  const areLightsEnabled = (...args: any[]): any => (areLightsEnabledImpl as any)(studioRuntime, ...args);
  const applyAdaptiveQuality = (...args: any[]): any => (applyAdaptiveQualityImpl as any)(studioRuntime, ...args);
  const resetFrameSamples = (...args: any[]): any => (resetFrameSamplesImpl as any)(studioRuntime, ...args);
  const recordFrameTime = (...args: any[]): any => (recordFrameTimeImpl as any)(studioRuntime, ...args);
  const getPreviewSyncMode = (...args: any[]): any => (getPreviewSyncModeImpl as any)(studioRuntime, ...args);
  const refreshPreviewSync = (...args: any[]): any => (refreshPreviewSyncImpl as any)(studioRuntime, ...args);
  const syncCameraModeControls = (...args: any[]): any => (syncCameraModeControlsImpl as any)(studioRuntime, ...args);
  const syncCameraViewControls = (...args: any[]): any => (syncCameraViewControlsImpl as any)(studioRuntime, ...args);
  const syncCameraFocalLengthControl = (...args: any[]): any => (syncCameraFocalLengthControlImpl as any)(studioRuntime, ...args);
  const applyCameraFocalLength = (...args: any[]): any => (applyCameraFocalLengthImpl as any)(studioRuntime, ...args);
  const requestStudioRender = (...args: any[]): any => (requestStudioRenderImpl as any)(studioRuntime, ...args);
  const computeRenderPixelRatio = (...args: any[]): any => (computeRenderPixelRatioImpl as any)(studioRuntime, ...args);
  const updateRenderStatsHud = (...args: any[]): any => (updateRenderStatsHudImpl as any)(studioRuntime, ...args);
  const pushBoundedSample = (...args: any[]): any => (pushBoundedSampleImpl as any)(studioRuntime, ...args);
  const computeAverage = (...args: any[]): any => (computeAverageImpl as any)(studioRuntime, ...args);
  const computePercentile = (...args: any[]): any => (computePercentileImpl as any)(studioRuntime, ...args);
  const roundToDigits = (...args: any[]): any => (roundToDigitsImpl as any)(studioRuntime, ...args);
  const ensureDiagnosticsHud = (...args: any[]): any => (ensureDiagnosticsHudImpl as any)(studioRuntime, ...args);
  const beginMotionMeasurement = (...args: any[]): any => (beginMotionMeasurementImpl as any)(studioRuntime, ...args);
  const endMotionMeasurement = (...args: any[]): any => (endMotionMeasurementImpl as any)(studioRuntime, ...args);
  const flushGpuQueries = (...args: any[]): any => (flushGpuQueriesImpl as any)(studioRuntime, ...args);
  const measureFloorSwitchPhase = (...args: any[]): any => (measureFloorSwitchPhaseImpl as any)(studioRuntime, ...args);
  const recordFloorSwitchTick = (...args: any[]): any => (recordFloorSwitchTickImpl as any)(studioRuntime, ...args);
  const recordRenderTiming = (...args: any[]): any => (recordRenderTimingImpl as any)(studioRuntime, ...args);
  const snapshotRenderStats = (...args: any[]): any => (snapshotRenderStatsImpl as any)(studioRuntime, ...args);
  const updateMotionStats = (...args: any[]): any => (updateMotionStatsImpl as any)(studioRuntime, ...args);
  const renderStudioFrame = (...args: any[]): any => (renderStudioFrameImpl as any)(studioRuntime, ...args);
  const needsMotionPresentation = (...args: any[]): any => (needsMotionPresentationImpl as any)(studioRuntime, ...args);
  const bindFrameDriver = (...args: any[]): any => (bindFrameDriverImpl as any)(studioRuntime, ...args);
  const setFadeOverlay = (...args: any[]): any => (setFadeOverlayImpl as any)(studioRuntime, ...args);
  const hasPendingSceneWork = (...args: any[]): any => (hasPendingSceneWorkImpl as any)(studioRuntime, ...args);
  const canBuildScene = (...args: any[]): any => (canBuildSceneImpl as any)(studioRuntime, ...args);
  const drawToActiveSurface = (...args: any[]): any => (drawToActiveSurfaceImpl as any)(studioRuntime, ...args);
  const restoreLightVisibility = (...args: any[]): any => (restoreLightVisibilityImpl as any)(studioRuntime, ...args);
  const fadeLightsIn = (...args: any[]): any => (fadeLightsInImpl as any)(studioRuntime, ...args);
  const findLightGroup = (...args: any[]): any => (findLightGroupImpl as any)(studioRuntime, ...args);
  const fadeLightsOut = (...args: any[]): any => (fadeLightsOutImpl as any)(studioRuntime, ...args);
  const transitionLightGroups = (...args: any[]): any => (transitionLightGroupsImpl as any)(studioRuntime, ...args);
  const refreshSceneRender = (...args: any[]): any => (refreshSceneRenderImpl as any)(studioRuntime, ...args);
  const syncLightCache = (...args: any[]): any => (syncLightCacheImpl as any)(studioRuntime, ...args);
  const buildLightCacheMap = (...args: any[]): any => (buildLightCacheMapImpl as any)(studioRuntime, ...args);
  const ensureLightCache = (...args: any[]): any => (ensureLightCacheImpl as any)(studioRuntime, ...args);
  const updateLightCache = (...args: any[]): any => (updateLightCacheImpl as any)(studioRuntime, ...args);
  const showLightCacheFor = (...args: any[]): any => (showLightCacheForImpl as any)(studioRuntime, ...args);
  const collectActiveLightGroupKeys = (...args: any[]): any => (collectActiveLightGroupKeysImpl as any)(studioRuntime, ...args);
  const showCachedLights = (...args: any[]): any => (showCachedLightsImpl as any)(studioRuntime, ...args);
  const captureLightSnapshot = (...args: any[]): any => (captureLightSnapshotImpl as any)(studioRuntime, ...args);
  const restorePreviewAfterFade = (...args: any[]): any => (restorePreviewAfterFadeImpl as any)(studioRuntime, ...args);
  const awaitNextFramePair = (...args: any[]): any => (awaitNextFramePairImpl as any)(studioRuntime, ...args);
  const captureFramePixels = (...args: any[]): any => (captureFramePixelsImpl as any)(studioRuntime, ...args);
  const rerenderScene = (...args: any[]): any => (rerenderSceneImpl as any)(studioRuntime, ...args);
  const ensureRenderReady = (...args: any[]): any => (ensureRenderReadyImpl as any)(studioRuntime, ...args);
  const waitForIdleFrame = (...args: any[]): any => (waitForIdleFrameImpl as any)(studioRuntime, ...args);
  const scheduleStudioRender = (...args: any[]): any => (scheduleStudioRenderImpl as any)(studioRuntime, ...args);
  const discardLightingEdit = (...args: any[]): any => (discardLightingEditImpl as any)(studioRuntime, ...args);
  const resetPlanInteraction = (...args: any[]): any => (resetPlanInteractionImpl as any)(studioRuntime, ...args);
  const endStudioGesture = (...args: any[]): any => (endStudioGestureImpl as any)(studioRuntime, ...args);
  const disposeShadowAtlas = (...args: any[]): any => (disposeShadowAtlasImpl as any)(studioRuntime, ...args);
  const prepareShadowAtlas = (...args: any[]): any => (prepareShadowAtlasImpl as any)(studioRuntime, ...args);
  const isEffectCacheReady = (...args: any[]): any => (isEffectCacheReadyImpl as any)(studioRuntime, ...args);
  const setShadowFreeze = (...args: any[]): any => (setShadowFreezeImpl as any)(studioRuntime, ...args);
  const updateShadowState = (...args: any[]): any => (updateShadowStateImpl as any)(studioRuntime, ...args);
  const handleOrbitStart = (...args: any[]): any => (handleOrbitStartImpl as any)(studioRuntime, ...args);
  const handleOrbitChange = (...args: any[]): any => (handleOrbitChangeImpl as any)(studioRuntime, ...args);
  const handleOrbitEnd = (...args: any[]): any => (handleOrbitEndImpl as any)(studioRuntime, ...args);
  const refreshFloorControls = (...args: any[]): any => (refreshFloorControlsImpl as any)(studioRuntime, ...args);
  const captureCameraView = (...args: any[]): any => (captureCameraViewImpl as any)(studioRuntime, ...args);
  const storeFixedCameraView = (...args: any[]): any => (storeFixedCameraViewImpl as any)(studioRuntime, ...args);
  const createOrbitControls = (...args: any[]): any => (createOrbitControlsImpl as any)(studioRuntime, ...args);
  const updateCameraPlanes = (...args: any[]): any => (updateCameraPlanesImpl as any)(studioRuntime, ...args);
  const computeVisibleHeight = (...args: any[]): any => (computeVisibleHeightImpl as any)(studioRuntime, ...args);
  const adjustFrameSize = (...args: any[]): any => (adjustFrameSizeImpl as any)(studioRuntime, ...args);
  const computeFrameSize = (...args: any[]): any => (computeFrameSizeImpl as any)(studioRuntime, ...args);
  const computeOrthoFrameSize = (...args: any[]): any => (computeOrthoFrameSizeImpl as any)(studioRuntime, ...args);
  const resolveFrameSize = (...args: any[]): any => (resolveFrameSizeImpl as any)(studioRuntime, ...args);
  const saveCameraView = (...args: any[]): any => (saveCameraViewImpl as any)(studioRuntime, ...args);
  const applyCameraSnapshot = (...args: any[]): any => (applyCameraSnapshotImpl as any)(studioRuntime, ...args);
  const setCameraView = (...args: any[]): any => (setCameraViewImpl as any)(studioRuntime, ...args);
  const setCameraMode = (...args: any[]): any => (setCameraModeImpl as any)(studioRuntime, ...args);
  const applyOrthoFrame = (...args: any[]): any => (applyOrthoFrameImpl as any)(studioRuntime, ...args);
  const resizeStudioRenderer = (...args: any[]): any => (resizeStudioRendererImpl as any)(studioRuntime, ...args);
  const captureOverviewCamera = (...args: any[]): any => (captureOverviewCameraImpl as any)(studioRuntime, ...args);
  const applyCameraState = (...args: any[]): any => (applyCameraStateImpl as any)(studioRuntime, ...args);
  const stateViewportAspectGetCanvasSize = (...args: any[]): any => (stateViewportAspectGetCanvasSizeImpl as any)(studioRuntime, ...args);
  const refreshCanvasSizeUi = (...args: any[]): any => (refreshCanvasSizeUiImpl as any)(studioRuntime, ...args);
  const resolvePixelRatio = (...args: any[]): any => (resolvePixelRatioImpl as any)(studioRuntime, ...args);
  const resizeRenderCanvas = (...args: any[]): any => (resizeRenderCanvasImpl as any)(studioRuntime, ...args);
  const syncCanvasSizeInputs = (...args: any[]): any => (syncCanvasSizeInputsImpl as any)(studioRuntime, ...args);
  const handleCanvasSizeInput = (...args: any[]): any => (handleCanvasSizeInputImpl as any)(studioRuntime, ...args);
  const openExportDialog = (...args: any[]): any => (openExportDialogImpl as any)(studioRuntime, ...args);
  const renderExportPresetSlots = (...args: any[]): any => (renderExportPresetSlotsImpl as any)(studioRuntime, ...args);
  const buildExportPreset = (...args: any[]): any => (buildExportPresetImpl as any)(studioRuntime, ...args);
  const importCameraPreset = (...args: any[]): any => (importCameraPresetImpl as any)(studioRuntime, ...args);
  const applyExportPreset = (...args: any[]): any => (applyExportPresetImpl as any)(studioRuntime, ...args);
  const selectExportPresetSlot = (...args: any[]): any => (selectExportPresetSlotImpl as any)(studioRuntime, ...args);
  const saveExportPreset = (...args: any[]): any => (saveExportPresetImpl as any)(studioRuntime, ...args);
  const syncExportControls = (...args: any[]): any => (syncExportControlsImpl as any)(studioRuntime, ...args);
  const formatPresetLabel = (...args: any[]): any => (formatPresetLabelImpl as any)(studioRuntime, ...args);
  const makeUniquePresetName = (...args: any[]): any => (makeUniquePresetNameImpl as any)(studioRuntime, ...args);
  const saveAsNewPreset = (...args: any[]): any => (saveAsNewPresetImpl as any)(studioRuntime, ...args);
  const closePresetRenameDialog = (...args: any[]): any => (closePresetRenameDialogImpl as any)(studioRuntime, ...args);
  const openPresetRenameDialog = (...args: any[]): any => (openPresetRenameDialogImpl as any)(studioRuntime, ...args);
  const closePresetDeleteDialog = (...args: any[]): any => (closePresetDeleteDialogImpl as any)(studioRuntime, ...args);
  const openPresetDeleteDialog = (...args: any[]): any => (openPresetDeleteDialogImpl as any)(studioRuntime, ...args);
  const confirmDeletePreset = (...args: any[]): any => (confirmDeletePresetImpl as any)(studioRuntime, ...args);
  const ensureSceneRendered = (...args: any[]): any => (ensureSceneRenderedImpl as any)(studioRuntime, ...args);
  const prepareFreeCameraCapture = (...args: any[]): any => (prepareFreeCameraCaptureImpl as any)(studioRuntime, ...args);
  const selectPreviewFloor = (...args: any[]): any => (selectPreviewFloorImpl as any)(studioRuntime, ...args);
  const collectSelectedExportFiles = (...args: any[]): any => (collectSelectedExportFilesImpl as any)(studioRuntime, ...args);
  const restorePreviewAfterExport = (...args: any[]): any => (restorePreviewAfterExportImpl as any)(studioRuntime, ...args);
  const setExportBusy = (...args: any[]): any => (setExportBusyImpl as any)(studioRuntime, ...args);
  const prepareExportRender = (...args: any[]): any => (prepareExportRenderImpl as any)(studioRuntime, ...args);
  const canvasToBlob = (...args: any[]): any => (canvasToBlobImpl as any)(studioRuntime, ...args);
  const renderExportImage = (...args: any[]): any => (renderExportImageImpl as any)(studioRuntime, ...args);
  const renderLightDeltaLayer = (...args: any[]): any => (renderLightDeltaLayerImpl as any)(studioRuntime, ...args);
  const renderLightShadowLayer = (...args: any[]): any => (renderLightShadowLayerImpl as any)(studioRuntime, ...args);
  const renderBackgroundLayer = (...args: any[]): any => (renderBackgroundLayerImpl as any)(studioRuntime, ...args);
  const makeUniqueFileName = (...args: any[]): any => (makeUniqueFileNameImpl as any)(studioRuntime, ...args);
  const buildExportCamera = (...args: any[]): any => (buildExportCameraImpl as any)(studioRuntime, ...args);
  const buildLightExportEntry = (...args: any[]): any => (buildLightExportEntryImpl as any)(studioRuntime, ...args);
  const projectItemAnchor = (...args: any[]): any => (projectItemAnchorImpl as any)(studioRuntime, ...args);
  const projectLightGroupAnchor = (...args: any[]): any => (projectLightGroupAnchorImpl as any)(studioRuntime, ...args);
  const blobToBytes = (...args: any[]): any => (blobToBytesImpl as any)(studioRuntime, ...args);
  const applyExportVisibility = (...args: any[]): any => (applyExportVisibilityImpl as any)(studioRuntime, ...args);
  const setExportRoleVisibility = (...args: any[]): any => (setExportRoleVisibilityImpl as any)(studioRuntime, ...args);
  const resolveOverwriteChoice = (...args: any[]): any => (resolveOverwriteChoiceImpl as any)(studioRuntime, ...args);
  const showConflictDialog = (...args: any[]): any => (showConflictDialogImpl as any)(studioRuntime, ...args);
  const beginExportFlow = (...args: any[]): any => (beginExportFlowImpl as any)(studioRuntime, ...args);
  const reportExportFailure = (...args: any[]): any => (reportExportFailureImpl as any)(studioRuntime, ...args);
  const showExportResult = (...args: any[]): any => (showExportResultImpl as any)(studioRuntime, ...args);
  const disposeObjectTree = (...args: any[]): any => (disposeObjectTreeImpl as any)(studioRuntime, ...args);
  const disposeFloorScene = (...args: any[]): any => (disposeFloorSceneImpl as any)(studioRuntime, ...args);
  const createOutlinePath = (...args: any[]): any => (createOutlinePathImpl as any)(studioRuntime, ...args);
  const buildShapesWithHoles = (...args: any[]): any => (buildShapesWithHolesImpl as any)(studioRuntime, ...args);
  const createWallSideMaterial = (...args: any[]): any => (createWallSideMaterialImpl as any)(studioRuntime, ...args);
  const createWallTopMaterial = (...args: any[]): any => (createWallTopMaterialImpl as any)(studioRuntime, ...args);
  const expandPolygonOutward = (...args: any[]): any => (expandPolygonOutwardImpl as any)(studioRuntime, ...args);
  const buildInteriorScene = (...args: any[]): any => (buildInteriorSceneImpl as any)(studioRuntime, ...args);
  const buildItemModel = (...args: any[]): any => (buildItemModelImpl as any)(studioRuntime, ...args);
  const drawDoor = (...args: any[]): any => (drawDoorImpl as any)(studioRuntime, ...args);
  const drawCourtyardArea = (...args: any[]): any => (drawCourtyardAreaImpl as any)(studioRuntime, ...args);
  const renderExportLayers = (...args: any[]): any => (renderExportLayersImpl as any)(studioRuntime, ...args);
  const addArchitectureMesh = (...args: any[]): any => (addArchitectureMeshImpl as any)(studioRuntime, ...args);
  const addWindowFrames = (...args: any[]): any => (addWindowFramesImpl as any)(studioRuntime, ...args);
  const buildRugGeometry = (...args: any[]): any => (buildRugGeometryImpl as any)(studioRuntime, ...args);
  const createRugMaterial = (...args: any[]): any => (createRugMaterialImpl as any)(studioRuntime, ...args);
  const addRugMeshes = (...args: any[]): any => (addRugMeshesImpl as any)(studioRuntime, ...args);
  const mergeMeshesByType = (...args: any[]): any => (mergeMeshesByTypeImpl as any)(studioRuntime, ...args);
  const configureLightSourcePreview = (...args: any[]): any => (configureLightSourcePreviewImpl as any)(studioRuntime, ...args);
  const addStripLightPreview = (...args: any[]): any => (addStripLightPreviewImpl as any)(studioRuntime, ...args);
  const applyAccentEmissive = (...args: any[]): any => (applyAccentEmissiveImpl as any)(studioRuntime, ...args);
  const planLabelAccentColor = (...args: any[]): any => (planLabelAccentColorImpl as any)(studioRuntime, ...args);
  const createPlanLabel = (...args: any[]): any => (createPlanLabelImpl as any)(studioRuntime, ...args);
  const collectLightSourceSpecs = (...args: any[]): any => (collectLightSourceSpecsImpl as any)(studioRuntime, ...args);
  const countMaterialTextures = (...args: any[]): any => (countMaterialTexturesImpl as any)(studioRuntime, ...args);
  const findMaxMaterialTextures = (...args: any[]): any => (findMaxMaterialTexturesImpl as any)(studioRuntime, ...args);
  const getMaxTextureUnits = (...args: any[]): any => (getMaxTextureUnitsImpl as any)(studioRuntime, ...args);
  const collectShadowCandidates = (...args: any[]): any => (collectShadowCandidatesImpl as any)(studioRuntime, ...args);
  const setupSceneShadows = (...args: any[]): any => (setupSceneShadowsImpl as any)(studioRuntime, ...args);
  const batchSharedMeshes = (...args: any[]): any => (batchSharedMeshesImpl as any)(studioRuntime, ...args);
  const mergeStaticItemMeshes = (...args: any[]): any => (mergeStaticItemMeshesImpl as any)(studioRuntime, ...args);
  const collectSharedMaterials = (...args: any[]): any => (collectSharedMaterialsImpl as any)(studioRuntime, ...args);
  const updateExternalModelDataset = (...args: any[]): any => (updateExternalModelDatasetImpl as any)(studioRuntime, ...args);
  const planLightPrecompileBatches = (...args: any[]): any => (planLightPrecompileBatchesImpl as any)(studioRuntime, ...args);
  const shouldSuspendSceneWork = (...args: any[]): any => (shouldSuspendSceneWorkImpl as any)(studioRuntime, ...args);
  const shouldDeferSceneWork = (...args: any[]): any => (shouldDeferSceneWorkImpl as any)(studioRuntime, ...args);
  const scheduleLightPrecompile = (...args: any[]): any => (scheduleLightPrecompileImpl as any)(studioRuntime, ...args);
  const scheduleExternalPrecompile = (...args: any[]): any => (scheduleExternalPrecompileImpl as any)(studioRuntime, ...args);
  const requestSceneRebuild = (...args: any[]): any => (requestSceneRebuildImpl as any)(studioRuntime, ...args);
  const getSceneContentBounds = (...args: any[]): any => (getSceneContentBoundsImpl as any)(studioRuntime, ...args);
  const computeCourtyardBounds = (...args: any[]): any => (computeCourtyardBoundsImpl as any)(studioRuntime, ...args);
  const createFloorMaterial = (...args: any[]): any => (createFloorMaterialImpl as any)(studioRuntime, ...args);
  const buildCourtyardFoundation = (...args: any[]): any => (buildCourtyardFoundationImpl as any)(studioRuntime, ...args);
  const buildGroundShadow = (...args: any[]): any => (buildGroundShadowImpl as any)(studioRuntime, ...args);
  const getPreviewFloorMode = (...args: any[]): any => (getPreviewFloorModeImpl as any)(studioRuntime, ...args);
  const updateFloorPreviewButtons = (...args: any[]): any => (updateFloorPreviewButtonsImpl as any)(studioRuntime, ...args);
  const setPreviewFloor = (...args: any[]): any => (setPreviewFloorImpl as any)(studioRuntime, ...args);
  const rebuildFloorLayers = (...args: any[]): any => (rebuildFloorLayersImpl as any)(studioRuntime, ...args);
  const waitForSceneRevision = (...args: any[]): any => (waitForSceneRevisionImpl as any)(studioRuntime, ...args);
  const waitForSceneReady = (...args: any[]): any => (waitForSceneReadyImpl as any)(studioRuntime, ...args);
  const buildFloorsAsync = (...args: any[]): any => (buildFloorsAsyncImpl as any)(studioRuntime, ...args);
  const syncFloorGroups = (...args: any[]): any => (syncFloorGroupsImpl as any)(studioRuntime, ...args);
  const createFloorWorldMapper = (...args: any[]): any => (createFloorWorldMapperImpl as any)(studioRuntime, ...args);
  const previewTransformContext = (...args: any[]): any => (previewTransformContextImpl as any)(studioRuntime, ...args);
  const capturePreviewTransforms = (...args: any[]): any => (capturePreviewTransformsImpl as any)(studioRuntime, ...args);
  const applyPreviewTransforms = (...args: any[]): any => (applyPreviewTransformsImpl as any)(studioRuntime, ...args);
  const buildSceneLayers = (...args: any[]): any => (buildSceneLayersImpl as any)(studioRuntime, ...args);
  const buildLayerGroup = (...args: any[]): any => (buildLayerGroupImpl as any)(studioRuntime, ...args);
  const buildArchitectureLayer = (...args: any[]): any => (buildArchitectureLayerImpl as any)(studioRuntime, ...args);
  const buildItemsLayer = (...args: any[]): any => (buildItemsLayerImpl as any)(studioRuntime, ...args);
  const buildLightsLayer = (...args: any[]): any => (buildLightsLayerImpl as any)(studioRuntime, ...args);
  const buildFloorAtIndex = (...args: any[]): any => (buildFloorAtIndexImpl as any)(studioRuntime, ...args);
  const buildLayerForFloor = (...args: any[]): any => (buildLayerForFloorImpl as any)(studioRuntime, ...args);
  const isDescendantOfRoot = (...args: any[]): any => (isDescendantOfRootImpl as any)(studioRuntime, ...args);
  const computeSceneBounds = (...args: any[]): any => (computeSceneBoundsImpl as any)(studioRuntime, ...args);
  const computeSceneExtent = (...args: any[]): any => (computeSceneExtentImpl as any)(studioRuntime, ...args);
  const updateCameraView = (...args: any[]): any => (updateCameraViewImpl as any)(studioRuntime, ...args);
  const axisLockedDistance = (...args: any[]): any => (axisLockedDistanceImpl as any)(studioRuntime, ...args);
  const formatMeasurement = (...args: any[]): any => (formatMeasurementImpl as any)(studioRuntime, ...args);
  const updateSnapIndicator = (...args: any[]): any => (updateSnapIndicatorImpl as any)(studioRuntime, ...args);
  const toggleSnapSetting = (...args: any[]): any => (toggleSnapSettingImpl as any)(studioRuntime, ...args);
  const schedulePointerMove = (...args: any[]): any => (schedulePointerMoveImpl as any)(studioRuntime, ...args);
  const handlePointerMove = (...args: any[]): any => (handlePointerMoveImpl as any)(studioRuntime, ...args);
  const cancelPointerDrag = (...args: any[]): any => (cancelPointerDragImpl as any)(studioRuntime, ...args);
  const scheduleDragUpdate = (...args: any[]): any => (scheduleDragUpdateImpl as any)(studioRuntime, ...args);
  const handleCanvasWheel = (...args: any[]): any => (handleCanvasWheelImpl as any)(studioRuntime, ...args);
  const finishPointerDrag = (...args: any[]): any => (finishPointerDragImpl as any)(studioRuntime, ...args);
  const handlePointerRelease = (...args: any[]): any => (handlePointerReleaseImpl as any)(studioRuntime, ...args);
  const refreshPreviewScene = (...args: any[]): any => (refreshPreviewSceneImpl as any)(studioRuntime, ...args);
  const resetCameraView = (...args: any[]): any => (resetCameraViewImpl as any)(studioRuntime, ...args);
  const applyWallHeightInput = (...args: any[]): any => (applyWallHeightInputImpl as any)(studioRuntime, ...args);
  const applyWallThicknessInput = (...args: any[]): any => (applyWallThicknessInputImpl as any)(studioRuntime, ...args);
  const applyWallOpacityInput = (...args: any[]): any => (applyWallOpacityInputImpl as any)(studioRuntime, ...args);
  const scheduleWallApply = (...args: any[]): any => (scheduleWallApplyImpl as any)(studioRuntime, ...args);
  const commitWallHeight = (...args: any[]): any => (commitWallHeightImpl as any)(studioRuntime, ...args);
  const commitWallThickness = (...args: any[]): any => (commitWallThicknessImpl as any)(studioRuntime, ...args);
  const commitWallOpacity = (...args: any[]): any => (commitWallOpacityImpl as any)(studioRuntime, ...args);
  const filterAssetList = (...args: any[]): any => (filterAssetListImpl as any)(studioRuntime, ...args);
  const toggleAssetGroup = (...args: any[]): any => (toggleAssetGroupImpl as any)(studioRuntime, ...args);
  const setAssetCategory = (...args: any[]): any => (setAssetCategoryImpl as any)(studioRuntime, ...args);
  const closeOpenPopovers = (...args: any[]): any => (closeOpenPopoversImpl as any)(studioRuntime, ...args);
  const applyLightGroupRename = (...args: any[]): any => (applyLightGroupRenameImpl as any)(studioRuntime, ...args);
  const createLightGroup = (...args: any[]): any => (createLightGroupImpl as any)(studioRuntime, ...args);
  const collectLightTargetInputs = (...args: any[]): any => (collectLightTargetInputsImpl as any)(studioRuntime, ...args);
  const syncLightTargetGroups = (...args: any[]): any => (syncLightTargetGroupsImpl as any)(studioRuntime, ...args);
  const buildLightGroupList = (...args: any[]): any => (buildLightGroupListImpl as any)(studioRuntime, ...args);
  const postBridgeState = (...args: any[]): any => (postBridgeStateImpl as any)(studioRuntime, ...args);
  const postBridgeFloors = (...args: any[]): any => (postBridgeFloorsImpl as any)(studioRuntime, ...args);
  const waitForStageReady = (...args: any[]): any => (waitForStageReadyImpl as any)(studioRuntime, ...args);
  const jumpWorkflowStep = (...args: any[]): any => (jumpWorkflowStepImpl as any)(studioRuntime, ...args);

  const appCtx = createStudioAppContext();

// 路由 fade 过渡期间编辑器与户型页会短暂共存；必须限定在本页根节点内查询，
  // 否则 #inspector-empty / #backup-open 等撞 id 会拿到对方 DOM（例如编辑器空态没有 <strong>）。
  const studioRootElement =
    document.querySelector(".studio-chrome-root") || document;
  const selectElement = (selectorText: any) =>
    studioRootElement.querySelector(selectorText),
  isEmbeddedStage =
    window.location.pathname ===
    "/api/v1/modules/interaction3d/stage.html",
  geometryCacheHandle: any = isEmbeddedStage ? stageStartup2?.geometryCache : null,
  isEmbedStageMode =
    isEmbeddedStage &&
    new URLSearchParams(window.location.search).get("lighting") === "region",
  defaultWallRuntimeProfile = "shader";
window.__homeosWallRuntimeProfile = defaultWallRuntimeProfile || "baseline";
const renderCacheWriter = isEmbeddedStage
  ? createRenderCache2({
      sceneId: new URLSearchParams(window.location.search).get("sceneId"),
      projectId: new URLSearchParams(window.location.search).get("projectId"),
      report: (reportPayload) => {
        document.documentElement.dataset.lightRenderCache = JSON.stringify(reportPayload);
      },
    })
  : null;
window.addEventListener("pagehide", () => renderCacheWriter?.close(), {
  once: true,
});
const autoDiagramComponentId =
    new URLSearchParams(window.location.search).get("auto-diagram-component") || "",
  isAutoDiagramEmbed =
    new URLSearchParams(window.location.search).get("auto-diagram-embed") === "1",
  exportFolderQueryValue = new URLSearchParams(window.location.search).get("export-folder") || "",
  floorSelectionId = new URLSearchParams(window.location.search).has("floor-selection")
    ? new URLSearchParams(window.location.search).get("floor-selection")
    : null;
isAutoDiagramEmbed && document.body.classList.add("auto-diagram-embedded");
// 嵌入舞台（总览 / 展示 iframe）默认透明底：等父页 config 再决定是否显示网格/星空。
// 否则场景 JSON 默认 backgroundVisible:true 会先铺一层不透明背景，房子周围看起来「没铺满」。
if (isEmbeddedStage) {
  document.body.classList.add("is-background-hidden");
}
const planCanvasElement = selectElement("#plan-canvas"),
  planStageElement = selectElement("#plan-stage"),
  canvasEmptyElement = selectElement("#canvas-empty"),
  projectNameElement = selectElement("#project-name"),
  saveStateElement = selectElement("#save-state"),
  importPlanButton = selectElement("#import-plan"),
  planFileInput = selectElement("#plan-file"),
  toggleBackgroundButton = selectElement("#toggle-background"),
  removePlanButton = selectElement("#remove-plan"),
  addFloorButton = selectElement("#add-floor"),
  floorListElement = selectElement("#floor-list"),
  alignFloorButton = selectElement("#align-floor"),
  floorActionMenuElement = selectElement("#floor-context-menu"),
  floorRenameDialogElement = selectElement("#floor-rename-dialog"),
  floorRenameFormElement = selectElement("#floor-rename-form"),
  floorRenameInputElement = selectElement("#floor-rename-input"),
  floorDeleteDialogElement = selectElement("#floor-delete-dialog"),
  floorDeleteFormElement = selectElement("#floor-delete-form"),
  floorDeleteNameElement = selectElement("#floor-delete-name"),
  saveConflictDialogElement = selectElement("#save-conflict-dialog"),
  saveConflictLoadButton = selectElement("#save-conflict-load"),
  saveConflictOverwriteButton = selectElement("#save-conflict-overwrite"),
  studioBackLinkElement = selectElement("#studio-back-link"),
  studioExitDialogElement = selectElement("#studio-exit-dialog"),
  studioExitMessageElement = selectElement("#studio-exit-message"),
  studioExitSaveButton = selectElement("#studio-exit-save"),
  studioExitDiscardButton = selectElement("#studio-exit-discard"),
  studioExitContinueButton = selectElement("#studio-exit-continue"),
  globalWallHeightInput = selectElement("#global-wall-height"),
  globalWallThicknessInput = selectElement("#global-wall-thickness"),
  globalWallOpacityInput = selectElement("#global-wall-opacity"),
  toggleFloorEdgeButton = selectElement("#toggle-floor-edge"),
  toolButtons = [...document.querySelectorAll<StudioControlElement>("[data-tool]")],
  drawingToolSections = [...document.querySelectorAll<StudioControlElement>(".drawing-tool-section")],
    finishWallButton = selectElement("#finish-wall"),
  deleteSelectionButton = selectElement("#delete-selection"),
  activeToolLabel = selectElement("#active-tool-label"),
  toolHelpElement = selectElement("#tool-help"),
  cursorPositionElement = selectElement("#cursor-position"),
  snapIndicatorElement = selectElement("#snap-indicator"),
  snapToggleButton = selectElement("#snap-toggle"),
  snapToggleStateElement = selectElement("#snap-toggle-state"),
  snapSettingsToggleButton = selectElement("#snap-settings-toggle"),
  snapSettingsPanel = selectElement("#snap-settings-panel"),
  snapSettingControls = [...document.querySelectorAll<StudioControlElement>("[data-snap-setting]")],
  snapToleranceInput = selectElement("#snap-tolerance"),
  snapToleranceValueElement = selectElement("#snap-tolerance-value"),
  zoomValueElement = selectElement("#zoom-value"),
  scaleDialogElement = selectElement("#scale-dialog"),
  scaleFormElement = selectElement("#scale-form"),
  referencePixelsElement = selectElement("#reference-pixels"),
  referenceMetersInput = selectElement("#reference-meters"),
  lightGroupRenameDialogElement = selectElement("#light-group-rename-dialog"),
  lightGroupRenameFormElement = selectElement("#light-group-rename-form"),
  lightGroupRenameInputElement = selectElement("#light-group-rename-input"),
  lightPropertyApplyDialogElement = selectElement("#light-property-apply-dialog"),
  lightPropertyApplyFormElement = selectElement("#light-property-apply-form"),
  lightPropertyTargetListElement = selectElement("#light-property-target-list"),
  lightPropertySelectionCountElement = selectElement("#light-property-selection-count"),
  lightPropertyToggleAllButton = selectElement("#light-property-toggle-all"),
  lightPropertyApplyTitleElement = selectElement("#light-property-apply-title"),
  lightPropertyApplyValueElement = selectElement("#light-property-apply-value"),
  applyLightPropertyControls = [...document.querySelectorAll<StudioControlElement>("[data-apply-light-property]")],
  toastElement = selectElement("#toast"),
  inspectorEmptyElement = selectElement("#inspector-empty"),
  selectionInspectorElement = selectElement("#selection-inspector"),
  selectionHeadingElement = selectElement(".selection-heading"),
  selectionIdElement = selectElement("#selection-id"),
  lightPreviewNoteElement = selectElement("#light-preview-note"),
  wallFieldsElement = selectElement("#wall-fields"),
  windowFieldsElement = selectElement("#window-fields"),
  doorFieldsElement = selectElement("#door-fields"),
  railingFieldsElement = selectElement("#railing-fields"),
  itemFieldsElement = selectElement("#item-fields"),
  labelTextFieldsElement = selectElement("#label-text-fields"),
  lightFieldsElement = selectElement("#light-fields"),
  itemHeightFieldElement = selectElement("#item-height-field"),
  itemElevationFieldElement = selectElement("#item-elevation-field"),
  itemRotationFieldElement = selectElement("#item-rotation-field"),
  itemRotationActionsElement = selectElement("#item-rotation-actions"),
  itemVerticalRotationFieldElement = selectElement("#item-vertical-rotation-field"),
  itemVerticalRotationLabelElement = selectElement("#item-vertical-rotation-label"),
  itemStripOrientationHeadingElement = selectElement("#item-strip-orientation-heading"),
  itemStripRollFieldElement = selectElement("#item-strip-roll-field"),
  itemStripRollInput = selectElement("#item-strip-roll"),
  itemLightSourceVisibilityFieldElement = selectElement("#item-light-source-visibility-field"),
  itemLightSourceVisibleInput = selectElement("#item-light-source-visible"),
  curtainPositionFieldElement = selectElement("#curtain-position-field"),
  roundTableTurntableFieldElement = selectElement("#round-table-turntable-field"),
  stairDirectionFieldElement = selectElement("#stair-direction-field"),
  tvMountStyleFieldElement = selectElement("#tv-mount-style-field"),
  shoeCabinetActionsElement = selectElement("#shoe-cabinet-actions"),
  shoeCabinetMirrorButton = selectElement("#shoe-cabinet-mirror"),
  itemWidthLabelElement = selectElement("#item-width-label"),
  itemDepthLabelElement = selectElement("#item-depth-label"),
  itemHeightLabelElement = selectElement("#item-height-label"),
  pillarShapeFieldElement = selectElement("#pillar-shape-field"),
  pillarAxisFieldElement = selectElement("#pillar-axis-field"),
  stripAxisFieldElement = selectElement("#strip-axis-field"),
  materialFieldsElement = selectElement("#material-fields"),
  materialSlotListElement = selectElement("#material-slot-list"),
  materialSlotGroupsElement = selectElement("#material-slot-groups"),
  materialResetAllButton = selectElement("#material-reset-all"),
  materialSavePresetButton = selectElement("#material-save-preset"),
  materialApplySameButton = selectElement("#material-apply-same"),
  materialSummaryElement = selectElement("#material-summary"),
  materialStyleFieldElement = selectElement("#material-style-field"),
  materialStyleStripElement = selectElement("#material-style-strip"),
  materialStyleDeleteButton = selectElement("#material-style-delete"),
  materialPresetDialogElement = selectElement("#material-preset-dialog"),
  materialPresetFormElement = selectElement("#material-preset-form"),
  materialPresetNameInput = selectElement("#material-preset-name"),
  materialPresetCancelButton = selectElement("#material-preset-cancel"),
  materialApplyDialogElement = selectElement("#material-apply-dialog"),
  materialApplyFormElement = selectElement("#material-apply-form"),
  materialApplyCountElement = selectElement("#material-apply-count"),
  materialApplyCancelButton = selectElement("#material-apply-cancel"),
  inspectorGroupsElement = document.querySelectorAll<HTMLElement>(".inspector-group"),
  sceneCountsElement = selectElement("#scene-counts"),
  previewSyncControls = [...document.querySelectorAll<StudioControlElement>("[data-preview-sync]")],
  previewFloorControls = [...document.querySelectorAll<StudioControlElement>("[data-preview-floor]")],
  refreshPreviewButton = selectElement("#refresh-preview"),
  refreshLightPreviewButton = selectElement("#refresh-light-preview"),
  previewQualityStatusElement = selectElement("#preview-quality-status"),
  modelLoadingStatusElement = selectElement("#model-loading-status");
const previewLightCacheCanvasElement = selectElement("#preview-light-cache"),
  previewRenderShieldElement = selectElement("#preview-render-shield");
const cameraViewControls = [...document.querySelectorAll<StudioControlElement>("[data-camera-view]")],
  cameraRotateTopControls = [...document.querySelectorAll<StudioControlElement>("[data-camera-rotate-top]")],
  cameraModeControls = [...document.querySelectorAll<StudioControlElement>("[data-camera-mode]")],
  cameraFocalLengthControls = [...document.querySelectorAll<StudioControlElement>("[data-camera-focal-length]")],
  baseLightControlInputs = [...document.querySelectorAll<StudioControlElement>("[data-base-light-control]")],
  baseLightControlsElement = selectElement("#base-light-controls"),
  baseLightHeaderElement = baseLightControlsElement?.querySelector(".base-light-controls-header"),
  resetBaseLightingButton = selectElement("#reset-base-lighting"),
  saveBaseLightingButton = selectElement("#save-base-lighting"),
  closeBaseLightingButton = selectElement("#close-base-lighting"),
  openBaseLightingButtons = [
    selectElement("#open-base-lighting"),
    selectElement("#export-open-base-lighting"),
  ].filter(Boolean);
baseLightControlsElement &&
  baseLightControlsElement.parentElement !== document.body &&
  document.body.append(baseLightControlsElement);
const saveCameraViewButton = selectElement("#save-camera-view"),
  fixedCameraViewButton = selectElement("#fixed-camera-view"),
  floorCameraActionsElement = selectElement("#floor-camera-actions"),
  overviewCameraActionsElement = selectElement("#overview-camera-actions"),
  saveOverviewViewButton = selectElement("#save-overview-view"),
  fixedOverviewViewButton = selectElement("#fixed-overview-view"),
  previewFloorGapControlElement = selectElement("#preview-floor-gap-control"),
  previewFloorGapInput = selectElement("#preview-floor-gap"),
  previewFloorUniformControlElement = selectElement("#preview-floor-uniform-control"),
  previewFloorUniformInput = selectElement("#preview-floor-uniform"),
  exportDialogElement = selectElement("#export-dialog"),
  exportPreviewFrameElement = selectElement("#export-preview-frame"),
  exportPreviewStageElement = selectElement("#export-preview-stage"),
  exportPresetEmptyStateElement = selectElement("#export-preset-empty-state"),
  exportPresetEmptyTitleElement = selectElement("#export-preset-empty-title"),
  exportWidthInput = selectElement("#export-width"),
  exportHeightInput = selectElement("#export-height"),
  exportLockRatioInput = selectElement("#export-lock-ratio"),
  exportAspectLabelElement = selectElement("#export-aspect-label"),
  exportResolutionLabelElement = selectElement("#export-resolution-label"),
  exportStatusElement = selectElement("#export-status"),
  exportPackageButton = selectElement("#export-package"),
  exportFolderNameInput = selectElement("#export-folder-name"),
  exportSaveViewButton = selectElement("#export-save-view"),
  exportGroupFilesElement = selectElement("#export-group-files"),
  exportFloorSelectElement = selectElement("#export-floor-select"),
  exportFloorGapControlElement = selectElement("#export-floor-gap-control"),
  exportFloorGapInput = selectElement("#export-floor-gap"),
  exportPresetSlotsElement = selectElement("#export-preset-slots"),
  exportPresetAddButton = selectElement("#export-preset-add"),
  exportPresetRenameButton = selectElement("#export-preset-rename"),
  exportPresetDeleteButton = selectElement("#export-preset-delete"),
  exportPresetRenameDialogElement = selectElement("#export-preset-rename-dialog"),
  exportPresetRenameFormElement = selectElement("#export-preset-rename-form"),
  exportPresetRenameInputElement = selectElement("#export-preset-rename-input"),
  exportPresetDeleteDialogElement = selectElement("#export-preset-delete-dialog"),
  exportPresetDeleteFormElement = selectElement("#export-preset-delete-form"),
  exportPresetDeleteNameElement = selectElement("#export-preset-delete-name"),
  exportOverwriteDialogElement = selectElement("#export-overwrite-dialog"),
  exportOverwriteNameElement = selectElement("#export-overwrite-name"),
  exportCompleteDialogElement = selectElement("#export-complete-dialog"),
  exportCompleteTitleElement = selectElement("#export-complete-title"),
  exportCompleteMessageElement = selectElement("#export-complete-message"),
  exportCompletePathElement = selectElement("#export-complete-path"),
  studioShellElement = selectElement(".studio-shell"),
  detailsPanelElement = selectElement(".details-panel"),
  detailsResizerElement = selectElement("#details-resizer"),
  assetCategoryButtons = [...document.querySelectorAll<StudioControlElement>("[data-asset-category]")],
  assetHeadingCategoryControls = [...document.querySelectorAll<StudioControlElement>("[data-asset-heading-category]")],
  itemTypeButtons = [...document.querySelectorAll<StudioControlElement>("[data-item-type]")],
  assetGridElement = selectElement("#asset-grid"),
  assetSearchInput = selectElement("#asset-search"),
  assetSearchEmptyElement = selectElement("#asset-search-empty"),
  /** 模型名溢出时循环滚动（灯具模板卡由模块内部跳过）。 */
  libraryNameScroll = installLibraryNameScroll(itemTypeButtons),
  lightAssetRowElement = selectElement("#light-asset-row"),
  lightLayerPanelElement = selectElement("#light-layer-panel"),
  lightGroupListElement = selectElement("#light-group-list"),
  addLightGroupButton = selectElement("#add-light-group"),
  lightGroupsOffButton = selectElement("#light-groups-off"),
  drawingLightNoticeDialogElement = selectElement("#drawing-light-notice-dialog"),
  drawingLightNoticeCountElement = selectElement("#drawing-light-notice-count"),
  lightGroupActionMenuElement = selectElement("#light-group-context-menu"),
  lightGroupAreaDialogElement = selectElement("#light-group-area-dialog"),
  lightGroupAreaFormElement = selectElement("#light-group-area-form"),
  lightGroupAreaSelectElement = selectElement("#light-group-area-select"),
  lightGroupAreaNameElement = selectElement("#light-group-area-name"),
  lampsLayerIndex = 2;
const modelAssetLoader = createModelAssetLoader2({
  THREE: ns2,
  GLTFLoader: GLTFLoader2,
  createDracoLoader(loaderConfig: any) {
    const dracoLoader = new SameOriginDRACOLoader2(
      "/static/3d-studio/export/draco-decoder-worker.js",
      loaderConfig,
    );
    return (
      dracoLoader.setDecoderPath("/static/vendor/three/0.186.1/draco/"),
      dracoLoader.setDecoderConfig({
        type: "wasm",
      }),
      dracoLoader.setWorkerLimit(1),
      dracoLoader
    );
  },
});
const modelPresentationState = {
  presented: false,
  pending: false,
};
const assetLoaderState = {
  revision: 0,
  disposed: false,
};
window.addEventListener(
  "pagehide",
  () => {
    assetLoaderState.disposed = true;
  },
  {
    once: true,
  },
);
((window.externalModelLoadsDeferred = false),
  (window.__homeosDeferExternalModel = (modelTypeName) => {
    modelTypeName &&
      (appCtx.deferredModelTypes.includes(modelTypeName) || appCtx.deferredModelTypes.push(modelTypeName),
      scheduleModelLoadFlush());
  }));
const externalModelRegistry = createExternalModelManager2({
    THREE: ns2,
    geometryCache: isEmbeddedStage ? stageStartup2?.furnitureCache : null,
    loader: modelAssetLoader,
    stairItemTypes: stairItemTypeSet,
    isModelInUse: checkModelInUse,
    requestRender: requestSceneRender,
    onLoadStateChange: publishModelLoadState,
    maxConcurrentLoads: 2,
  }),
  {
    loadExternalItemModel: ensureExternalModelLoaded,
    preloadPersistentModels: preloadPersistentModels,
    modelTypeForItem: modelTypeForItem,
  } = externalModelRegistry;
/** 楼层文档净化需要的外部状态（见 `scene/studio-document-payload`）：注册表 + 当前项目（只读默认层高）。 */
// `studioProject` 用 getter 转发：它在 `let` 声明（约 1222 行）之前就可能被这里**构造** deps，
// 取值必须推迟到目标函数真正读它的那一刻，否则会把「只读一次」变成「构造即读」，
// 在声明的 TDZ 里炸（原实现只有 createFloorRecord 那一支会读它）。
const studioDocumentDeps = () => ({
  externalModelRegistry,
  get studioProject() {
    return appCtx.studioProject;
  },
});
/** 「材质属性」检查面板的运行态。 */
appCtx.expandedMaterialSurfaceSlots = new Set();
const floorGroupCacheByKey = new Map(),
  materialCacheByKey = new Map(),
  geometryCacheByKey = new Map(),
  textureCacheByKey = new Map(),
  instanceTestTypeSet = new Set([
    "airer",
    "fan",
    "speaker",
    "tv",
    "smallcar",
    "suv",
    "scooter",
    "planlabel",
    "downlight",
    "ceilinglight",
    "striplight",
  ]),
  optimizedItemKeySet = new Set(),
  nextTenItemTypeSet = new Set([
    "aquarium",
    "bed",
    "nightstand",
    "curtain",
    "vanity",
    "desk",
    "bookcase",
    "piano",
    "table",
    "rounddiningtable",
  ]),
  optimizationItemTypeSet = new Set([
    "drawer-chest",
    "wardrobe",
    "office-chair",
    "bunk-bed",
    "pool-table",
    "tea-table-set",
    "coffeetable",
    "squarecoffeetable",
    "tvstand",
    "rug",
    "plant",
    "bed",
    "nightstand",
    "vanity",
    "desk",
    "bookcase",
    "aquarium",
    "curtain",
    "table",
    "rounddiningtable",
    "rounddiningtableturntable",
    "chair",
    "bar",
    "sideboard",
    "shoecabinet",
    "cabinet",
    "glasscabinet",
    "shelf",
    "wallcabinet",
    "kitchenbase",
    "kitchensink",
    "kitchencooktop",
    "kitchenisland",
    "basin",
    "toilet",
    "squattoilet",
    "urinal",
    "shower",
    "bathtub",
    "glasspartition",
    "stairs",
    "pillar",
  ]),
  applianceOptimizationTypeSet = new Set([
    "smart-socket-86",
    "router",
    "humidifier",
    "dehumidifier",
    "heater",
    "tv",
    "wallac",
    "floorac",
    "airpurifier",
    "robotvacuum",
    "floorlamp",
    "walllamp",
    "fridge",
    "freezer",
    "rangehood",
    "dishwasher",
    "steamoven",
    "microwave",
    "ricecooker",
    "washer",
    "dryer",
    "storagewaterheater",
    "gaswaterheater",
    "desktop",
    "laptop",
    "nas",
    "printer",
  ]);
const toolHelpMessages = {
    "courtyard-area": [
      "庭院地面",
      "圈出区域或拖画矩形，选择草坪、木平台、铺装；靠近墙面吸附，Enter 完成",
    ],
    "courtyard-path": ["汀步路径", "逐点画路线，自动排列汀步；Enter 完成，Esc 取消"],
    "courtyard-gate": ["庭院门", "靠近围挡预览门洞，点击放置；门款在右侧属性栏选择，Esc 退出"],
    "courtyard-fence": ["庭院围挡", "逐点画路线，选择矮墙、木栅或绿篱；Enter 完成"],
    flooropening: [
      "楼板洞口",
      "拖出矩形洞口；仅切除当前层楼板，楼梯通往上层时请在上层开洞。Esc 取消",
    ],
    select: [
      "选择工具",
      "移动时 Shift 锁轴；缩放时 Shift 等比例；Option/Alt 拖动复制；⌘/Ctrl+C、V 复制粘贴",
    ],
    pan: ["平移画布", "按住左键拖动即可平移画布；滚轮缩放；中键或按住空格拖动同样可平移"],
    scale: ["参考线工具", "依次单击两个端点；按住 Shift 强制锁定水平或垂直轴线"],
    wall: ["连续画墙", "逐点绘制并回到起点闭合空间；未闭合不会生成地面，按住 Shift 锁轴，Esc 结束"],
    window: ["窗户工具", "靠近墙体单击，窗户会自动吸附并生成真实窗洞"],
    door: ["门工具", "靠近墙体单击，门会自动吸附并生成门洞；选中后可翻转开启方向"],
    railing: ["玻璃栏杆", "靠近墙体单击，栏杆会吸附到墙段并替换对应的实体墙"],
    label: ["户型铭牌", "单击画布放置；选中后可修改文字、拖动、缩放和旋转"],
  },
  isStudioEntry =
    isEmbeddedStage ||
    /^\/3d-studio\/?$/.test(window.location.pathname),
  planCanvasRenderer = planCanvasElement.getContext("2d"),
  overlayCanvasElement = document.createElement("canvas"),
  overlayCanvasRenderer = overlayCanvasElement.getContext("2d"),
  {
    drawMetricGrid: drawSelectionRect,
    drawLine: drawGuideSegment,
    drawPoint: drawPointMarker,
    drawOpenEndpointWarning: drawPolygonPath,
    drawFloatingLabel: drawLabelText,
  } = createPlanDrawingTools2({
    context: planCanvasRenderer,
    planToScreen: planToScreen,
    screenToPlan: screenToPlan,
    pixelsPerMeter: getPixelsPerMeter,
    getCanvasSize: () => ({
      width: appCtx.planViewWidth,
      height: appCtx.planViewHeight,
    }),
    getViewZoom: () => appCtx.planView.zoom,
  });
appCtx.studioState = createStudioDocument();
const activeDoorType = "solid";
appCtx.expandedAreaIds = new Set();
/** 灯光面板的区域改为只读，唯一来源是 HA 区域注册表（后端 /ha/areas 已同步的数据）。 */
const dirtyFloorIdSet = new Set();
const wallJoinCacheByWall = new WeakMap();
const defaultExportWidth = 1852,
  defaultExportHeight = 1293;
appCtx.exportAspectRatio = defaultExportWidth / defaultExportHeight;
appCtx.baseLightingSettings = normalizeBaseLighting2(DEFAULT_BASE_LIGHTING2);
try {
  typeof BroadcastChannel == "function" &&
    (appCtx.lightPreviewWorker = new BroadcastChannel("homeos-studio3d-base-lighting-v1"));
} catch { /* Worker / 广播通道不可用（环境不支持或扩展未加载）：功能降级为单通道，不影响主流程 */ }
appCtx.lightGroupCacheByFloor = new Map();
appCtx.lightGainByFloor = new Map();
const disposedMaterialSet = new WeakSet();
const precompiledMaterialKeySet = new Set(),
  maxPrecompileBatchSize = 16;
const LIST_DRAG_TOUCH_HOLD_MS = 280,
  LIST_DRAG_START_DISTANCE = 6,
  LIST_DRAG_TOUCH_GIVE_UP_DISTANCE = 8,
  LIST_DRAG_CLICK_SUPPRESS_MS = 240;
/** 灯光面板区域顺序的本地记录：HA 提供区域集合，顺序只是前端展示偏好，不写回 HA / 文档。 */
const LIGHT_AREA_ORDER_STORAGE_KEY = "homeos3d.studio.light-area-order";
const DRAWING_LIGHT_NOTICE_THRESHOLD = 6;
/** 灯光性能提示每次进入绘制页只弹一次（0.7.8 的 `Wh` 语义）。 */
let hasShownDrawingLightNotice = false;
/* ===== C2/C3 接线（task-8）：文档版本权威 + 保存状态机 =====
 * 版本权威从 appCtx.localSaveRevision/remoteSaveRevision（UI 派生值）迁到 StudioDocumentStore；
 * 保存流程（防抖 / 退避重试 / 409 / 428 / 退出 / pagehide）迁到 StudioSaveStore，
 * 本文件只保留 DOM 闸门、状态文案与冲突三出口的交互。
 */
const studioDocumentStore = new StudioDocumentStore();
const studioDraftRepository = createStudioDraftRepository();
let studioSaveStore: StudioSaveStore | null = null;
let studioDraftReadonly = false;
let studioReadonlyBannerElement: HTMLElement | null = null;

/* ===== C5 接线（task-11）：撤销 / 重做改走文档补丁历史栈 =====
 * 历史条目是 DocumentPatch（跨楼层 add/remove/update/move 或 batch），选择、相机、
 * 切楼层不产生补丁因此不入栈；编辑前快照先挂在 pendingHistoryScene，直到
 * markDocumentDirty（= 一次操作真正落地）才 diff 入栈，于是纯选择 / 切换工具不留条目。
 */
let studioHistoryStore: StudioHistoryStore | null = null;
let pendingHistoryScene: { floorId: string; scene: any } | null = null;

studioHistoryStore = new StudioHistoryStore({
  apply: (documentPatch) => applyDocumentPatch(appCtx.studioProject, documentPatch),
  canApply: canApplyHistoryPatch,
  onApplyFailure: (failedEntry) => showToast("撤销/重做未能应用：" + failedEntry.label, "error"),
});

/** SPA teardown 前置：有未保存改动或正在保存时先等待一次保存（不阻塞渲染回收）。 */
flushActiveStudioSave = flushStudioSaveBeforeTeardown;

const studioSceneSyncController = new StudioSceneSyncController({
  getRuntimeScene: () => appCtx.studioProject,
  isDirty: sceneSyncFlushIsDirty,
  flush: flushSceneSyncRuntime,
  // 全量重建由 stage adopt 流程负责（见 readSceneUpdate 注释），编辑器侧不重复实现：
  // 因此**不注入** `replaceScene`（缺省时控制器返回 reload-unavailable，而不是假装重建完成）。
  isEmbedded: () => isEmbeddedStage,
  isPageSuspended: () => !!appCtx.isPageSuspended,
});

/** 灯光派生刷新钩子：`ctx` / `trimRetainedFloors` 只存在于渲染循环作用域，由循环内注册。 */
let refreshSceneSyncLightingDerived: (() => void) | null = null;

/**
 * 轮询游标（服务端 `syncKey`）：仅用于让服务端在无变化时回 204，**不进入**保存文档 /
 * 版本线（因此不写 `loadedDraft.syncKey`，避免把同步载荷当成保存基线）。
 */
let sceneSyncSinceKey: string | null = null;
class StudioApiError extends Error {
  /** HTTP 状态码，调用方按它分支（409 冲突 / 428 需要交互确认）。 */
  status: number;
  /** 服务端返回的错误体，detail.code 用来细分失败原因。 */
  payload: any;
  constructor(errorMessage: any, errorStatus: any, errorPayload: any) {
    (super(errorMessage), (this.status = errorStatus), (this.payload = errorPayload));
  }
}
function applyLoadedDraft(...args: any[]): any {
  return (applyLoadedDraftImpl as any)(applyLoadedDraftDeps(), ...args);
}
function applyLoadedDraftDeps(): ApplyLoadedDraftDeps {
  return {

    appCtx,
    applyBaseLighting,
    applyCameraSnapshot,
    captureCameraView,
    collectScenePayload,
    collectSelectedFloors,
    ensureExternalModelLoaded,
    finishModelLoad,
    floorSelectionId,
    getActiveFloor,
    getCameraMode,
    getStudioSaveStore,
    hideStudioReadonlyBanner,
    isAutoDiagramEmbed,
    isEmbeddedStage,
    loadBackgroundImage,
    loadModelsForTypes,
    get pendingHistoryScene() { return pendingHistoryScene; },
    set pendingHistoryScene(value: any) { pendingHistoryScene = value; },
    preloadPersistentModels,
    publishModelLoadState,
    refreshLightAreasFromHa,
    refreshPreviewScene,
    refreshScopeItems,
    refreshSelection,
    renderFloorList,
    requestSceneRebuild,
    resetView,
    resizePlanStage,
    scheduleLightPrecompile,
    scheduleModelLoadFlush,
    setCameraMode,
    stageLoadTiming,
    studioDocumentDeps,
    studioDocumentStore,
    get studioDraftReadonly() { return studioDraftReadonly; },
    set studioDraftReadonly(value: any) { studioDraftReadonly = value; },
    studioHistoryStore,
    syncStudioHistoryFacade,
    updateCameraView,
    updateFloorPreviewButtons,
  };
}
/** 退出保护：非重试性保存失败后锁定的版本；自动保存重试状态与退出请求状态。 */
/** 自动保存节奏：最后一次修改后 3s 合并保存，首次修改后最多 15s 兜底。 */
const AUTOSAVE_DEBOUNCE_MS = 3000,
  AUTOSAVE_MAX_DELAY_MS = 15000;
/** 等待进行中保存完成的解析器；等待交互结束再落盘的解析器（退出「保存并退出」用）。 */
const saveWaiterResolvers = new Set<() => void>(),
  exitWaiterResolvers = new Set<() => void>();
// 409 三出口：加载服务器版本（先导出本地副本）/ 覆盖服务器（显式 currentRevision PUT）/ 导出本地副本。
const saveConflictExportButton = document.createElement("button");
saveConflictExportButton.id = "save-conflict-export";
saveConflictExportButton.type = "button";
saveConflictExportButton.textContent = "导出本地副本";
saveConflictDialogElement.querySelector(".dialog-actions")?.appendChild(saveConflictExportButton);
(saveConflictDialogElement.addEventListener("cancel", (dialogCancelEvent: any) =>
  dialogCancelEvent.preventDefault(),
),
  saveConflictLoadButton.addEventListener("click", async () => {
    const pendingConflictSnapshot = appCtx.pendingConflict;
    if (!pendingConflictSnapshot) return;
    (window.clearTimeout(appCtx.autosaveTimeoutId),
      (appCtx.autosaveTimeoutId = null),
      (appCtx.pendingConflict = null),
      (appCtx.blockedSaveRevision = -1),
      (appCtx.firstLocalChangeAt = appCtx.lastLocalChangeAt = null),
      saveConflictDialogElement.close());
    // 出口一硬约束：先导出本地副本，再载入服务器版本（本地改动绝不静默丢失）。
    downloadStudioLocalCopy(pendingConflictSnapshot.localScene);
    try {
      const latestConflictPayload =
        pendingConflictSnapshot.latest || (await fetchStudioApi("/studio3d"));
      await applyLoadedDraft(latestConflictPayload);
      showSaveState("已加载服务器版本", "saved");
      showToast("已加载另一页面保存的户型，本地副本已导出。", "success");
    } catch (loadFailure: any) {
      (showSaveState("载入失败", "error"),
        showToast(loadFailure?.message || "服务器版本载入失败。", "error"));
    }
  }),
  saveConflictOverwriteButton.addEventListener("click", async () => {
    if (!appCtx.pendingConflict) return;
    (window.clearTimeout(appCtx.autosaveTimeoutId),
      (appCtx.autosaveTimeoutId = null),
      (appCtx.pendingConflict = null),
      saveConflictDialogElement.close(),
      showSaveState("正在确认覆盖…", "saving"));
    // 出口二：显式带 currentRevision 覆盖；local === remote 也必须发一次（markWholeDocumentDirty）。
    studioDocumentStore.markWholeDocumentDirty();
    appCtx.localSaveRevision += 1;
    await flushStudioSaveOnce("overwrite");
  }),
  saveConflictExportButton.addEventListener("click", () => {
    downloadStudioLocalCopy();
  }));
// 退出保护三态对话框：返回编辑器前的未保存拦截、等待保存完成后再退出、不保存直接退出。
studioBackLinkElement.addEventListener("click", (studioBackLinkEvent: any) => {
  if (
    studioBackLinkEvent.button ||
    studioBackLinkEvent.ctrlKey ||
    studioBackLinkEvent.metaKey ||
    studioBackLinkEvent.shiftKey ||
    studioBackLinkEvent.altKey
  )
    return;
  // 已保存：交给外壳路由同文档内切回总览（该链接是普通 <a>，不拦截就会整页跳转）。
  if (!hasUnsavedChanges()) {
    (studioBackLinkEvent.preventDefault(), navigateInShell(studioBackLinkElement.href));
    return;
  }
  (studioBackLinkEvent.preventDefault(),
    window.clearTimeout(appCtx.autosaveTimeoutId),
    (appCtx.autosaveTimeoutId = null),
    (studioExitMessageElement.textContent = appCtx.isSaveInFlight
      ? "户型正在保存。可以等待保存完成后退出，或继续编辑。"
      : "户型还有未保存的修改。保存成功后再退出，或不保存本次待提交的修改。已保存的内容会保留。"),
    refreshExitDialogButtons(),
    studioExitDialogElement.open || studioExitDialogElement.showModal());
});
studioExitContinueButton.addEventListener("click", closeExitDialog);
studioExitDialogElement.addEventListener("keydown", (studioExitKeyEvent: any) =>
  studioExitKeyEvent.stopPropagation(),
);
studioExitDialogElement.addEventListener("cancel", (studioExitCancelEvent: any) => {
  (studioExitCancelEvent.preventDefault(), closeExitDialog());
});
studioExitDiscardButton.addEventListener("click", () => {
  if (!appCtx.isSaveInFlight && !appCtx.isExitSaveInFlight) leaveStudio();
});
studioExitSaveButton.addEventListener("click", async () => {
  if (appCtx.isExitSaveInFlight) return;
  const exitSaveRequestToken = ++appCtx.exitSaveRequestId;
  ((appCtx.isExitSaveInFlight = true),
    refreshExitDialogButtons(),
    (studioExitMessageElement.textContent = "正在保存，成功后将返回编辑器。你也可以继续编辑。"));
  try {
    saveExportPreset();
    // 退出必须真正 await 保存：save-store 会对在途 PUT 去重，requestExit 遇到可重试失败会立刻再试一次。
    const exitSaveResult = await flushStudioSaveOnce("exit");
    if (exitSaveRequestToken !== appCtx.exitSaveRequestId) return;
    if (exitSaveResult.reason === "conflict") {
      (closeExitDialog(), showToast("请先处理保存冲突，再返回编辑器。", "error"));
      return;
    }
    if (exitSaveResult.ok) {
      if (hasUnsavedChanges()) {
        (closeExitDialog(), leaveStudio());
        return;
      }
      leaveStudio();
      return;
    }
    studioExitMessageElement.textContent =
      navigator.onLine === false
        ? "当前网络不可用，修改还未保存。请恢复连接后重试，或继续编辑。"
        : "修改尚未全部保存，已留在当前页面。请重试保存，或继续编辑处理提示。";
  } catch (exitSaveFailure: any) {
    (exitSaveRequestToken === appCtx.exitSaveRequestId &&
      (studioExitMessageElement.textContent = "保存未完成，已留在当前页面。请重试或继续编辑。"),
      window.HomeOSLog?.error!(exitSaveFailure, {
        phase: "studio-exit-save",
      })!);
  } finally {
    exitSaveRequestToken === appCtx.exitSaveRequestId &&
      ((appCtx.isExitSaveInFlight = false), refreshExitDialogButtons());
  }
});
function refreshStudioView(...args: any[]): any {
  return (refreshStudioViewImpl as any)(refreshStudioViewDeps(), ...args);
}
function refreshStudioViewDeps(): RefreshStudioViewDeps {
  return {

    activeDoorType,
    appCtx,
    computeWallPolygons,
    createSelectionRef,
    drawCourtyardArea,
    drawDoor,
    drawGuideSegment,
    drawLabelText,
    drawPointMarker,
    drawPolygonPath,
    drawRailing,
    drawSelectionRect,
    formatMeasurement,
    gardenGateSnapCandidate,
    getActiveFloor,
    getActiveWalls,
    getPixelsPerMeter,
    planCanvasRenderer,
    planPainter,
    planToScreen,
    renderPlanScene,
    wallWindowSpan,
    worldPointForFloor,
    zoomValueElement,
  };
}
function hitTestPlanItem(...args: any[]): any {
  return (hitTestPlanItemImpl as any)(hitTestPlanItemDeps(), ...args);
}
function hitTestPlanItemDeps(): HitTestPlanItemDeps {
  return {

    appCtx,
    closedWallLoops,
    getPixelsPerMeter,
    isPlanItemVisible,
    wallWindowSpan,
  };
}
function refreshStudioUiInner(...args: any[]): any {
  return (refreshStudioUiInnerImpl as any)(refreshStudioUiInnerDeps(), ...args);
}
function refreshStudioUiInnerDeps(): RefreshStudioUiInnerDeps {
  return {

    appCtx,
    applyLightPropertyControls,
    curtainPositionFieldElement,
    deleteSelectionButton,
    doorFieldsElement,
    getLightGroups,
    getPixelsPerMeter,
    getSelectedObject,
    inspectorEmptyElement,
    itemDepthLabelElement,
    itemElevationFieldElement,
    itemFieldsElement,
    itemHeightFieldElement,
    itemHeightLabelElement,
    itemLightSourceVisibilityFieldElement,
    itemLightSourceVisibleInput,
    itemRotationActionsElement,
    itemRotationFieldElement,
    itemStripOrientationHeadingElement,
    itemStripRollFieldElement,
    itemStripRollInput,
    itemVerticalRotationFieldElement,
    itemVerticalRotationLabelElement,
    itemWidthLabelElement,
    labelTextFieldsElement,
    lightFieldsElement,
    lightPreviewNoteElement,
    pillarAxisFieldElement,
    pillarShapeFieldElement,
    planPainter,
    railingFieldsElement,
    renderDoorMaterialPanel,
    renderMaterialSlotPanel,
    resolveLightGroup,
    roundTableTurntableFieldElement,
    selectElement,
    selectionHeadingElement,
    selectionIdElement,
    selectionInspectorElement,
    shoeCabinetActionsElement,
    shoeCabinetMirrorButton,
    stairDirectionFieldElement,
    stripAxisFieldElement,
    syncLightGroupList,
    syncLightGroupSelect,
    tvMountStyleFieldElement,
    wallFieldsElement,
    windowFieldsElement,
  };
}
/** 分组折叠状态：`{ [分组名]: true }` = 该组被折叠，跨会话保留。 */
const INSPECTOR_GROUP_STORAGE_KEY = "homeos3d.studio.inspector-groups";
/** 架构选中项 → 「尺寸与开口」组的标题（同一组在不同选中类型下换个说法）。 */
const INSPECTOR_GROUP_TITLE_BY_ARCHITECTURE_KIND = {
  wall: "墙体尺寸",
  window: "窗户尺寸",
  door: "门尺寸",
  railing: "栏杆尺寸",
};
appCtx.inspectorGroupCollapseState = readInspectorGroupCollapseState();


/** 个人预设落在 localStorage：跨项目、跨会话复用，但**不进**户型文档（换台机器就没了）。 */
const MATERIAL_STYLE_CUSTOM_STORAGE_KEY = "homeos3d.studio.material-styles";
function createSceneItem(...args: any[]): any {
  return (createSceneItemImpl as any)(createSceneItemDeps(), ...args);
}
function createSceneItemDeps(): CreateSceneItemDeps {
  return {
    appCtx,
    applyPlacementChange,
    captureUndoSnapshot,
    ensureCalibrationReady,
    finalizeAddedItem,
    getChargingLightGroups,
    getLightGroups,
    getPixelsPerMeter,
    getScreenLightGroups,
    markDocumentDirty,
    pushUndoEntry,
    refreshScopeItems,
    resolvePreviewScope,
    selectSceneObject,
    selectStudioTool,
    showToast,
    validateSelectionChange,
  };
}
/** 当前主题下的视图 / 光照设置：默认值再叠 WARM_WOOD_STYLE（含 warmWood 标记）。 */
const isRenderStatsTest = new URLSearchParams(window.location.search).has("render-stats-test"),
  isPerformanceDiagnostics =
    new URLSearchParams(window.location.search).get("performance-diagnostics") === "1",
  meshStatsByType = new Map(),
  maxFrameSampleCount = 240,
  publishIntervalMs = 750,
  maxPendingGpuQueries = 4,
  diagnosticsState = {
    hud: null as any,
    frameIntervals: [] as any[],
    cpuRenderTimes: [] as any[],
    gpuRenderTimes: [] as any[],
    lastMotionRenderAt: 0,
    floorSwitch: null as any,
    lastPublishAt: 0,
    motionActive: false,
    gpuContext: null as any,
    gpuExtension: null as any,
    gpuQueryActive: null as any,
    gpuQueriesPending: [] as any[],
    gpuStatus: "未初始化",
  };
function publishRenderStats(...args: any[]): any {
  return (publishRenderStatsImpl as any)(publishRenderStatsDeps(), ...args);
}
function publishRenderStatsDeps(): PublishRenderStatsDeps {
  return {

    appCtx,
    computeAverage,
    computePercentile,
    diagnosticsState,
    externalModelRegistry,
    isPerformanceDiagnostics,
    meshStatsByType,
    publishIntervalMs,
    roundToDigits,
    snapshotRenderStats,
  };
}
const lightTransitionMs = 150;
function acquireRenderSurface(...args: any[]): any {
  return (acquireRenderSurfaceImpl as any)(acquireRenderSurfaceDeps(), ...args);
}
function acquireRenderSurfaceDeps(): AcquireRenderSurfaceDeps {
  return {

    appCtx,
    collectLampEntries,
    drawToActiveSurface,
    ensureLightCache,
    hasPendingSceneWork,
    previewLightCacheCanvasElement,
    renderCacheWriter,
    requestStudioRender,
    sceneCacheDescriptor,
    scheduleStudioRender,
    setFadeOverlay,
    showCachedLights,
  };
}
function beginLightingPreview(...args: any[]): any {
  return (beginLightingPreviewImpl as any)(beginLightingPreviewDeps(), ...args);
}
function beginLightingPreviewDeps(): BeginLightingPreviewDeps {
  return {

    acquireRenderSurface,
    appCtx,
    areLightsEnabled,
    awaitNextFramePair,
    buildLightCacheMap,
    captureFramePixels,
    collectLampEntries,
    ensureLightCache,
    ensureRenderReady,
    isEmbeddedStage,
    previewLightCacheCanvasElement,
    requestStudioRender,
    rerenderScene,
    restoreLightVisibility,
    restorePreviewAfterFade,
    scheduleStudioRender,
    setFadeOverlay,
    showCachedLights,
    showLightCacheFor,
    waitForIdleFrame,
  };
}
const minCameraNear = 0.02,
  maxCameraNear = 0.6,
  cameraNearFactor = 0.01;
function createStudioRenderer(...args: any[]): any {
  return (createStudioRendererImpl as any)(createStudioRendererDeps(), ...args);
}
function createStudioRendererDeps(): CreateStudioRendererDeps {
  return {

    appCtx,
    beginMotionMeasurement,
    bindFrameDriver,
    canBuildScene,
    computeRenderPixelRatio,
    createOrbitControls,
    disposeShadowAtlas,
    get effectCache() { return effectCache; },
    set effectCache(value: any) { effectCache = value; },
    endMotionMeasurement,
    ensureDiagnosticsHud,
    getPreviewFloorMode,
    hasPendingSceneWork,
    isEmbedStageMode,
    isEmbeddedStage,
    isPerformanceDiagnostics,
    isRenderStatsTest,
    lampsLayerIndex,
    needsMotionPresentation,
    planToWorldPoint,
    get previewResources() { return previewResources; },
    set previewResources(value: any) { previewResources = value; },
    publishModelLoadState,
    publishRenderStats,
    recordFrameTime,
    recordRenderTiming,
    refreshBaseLighting,
    renderStudioFrame,
    resizeStudioRenderer,
    scheduleLightPrecompile,
    scheduleStudioRender,
    selectElement,
    setShadowFreeze,
    syncCameraModeControls,
    syncCameraViewControls,
    updateCameraView,
    updateMotionStats,
    updateRenderStatsHud,
  };
}
function openExportPanel(...args: any[]): any {
  return (openExportPanelImpl as any)(openExportPanelDeps(), ...args);
}
function openExportPanelDeps(): OpenExportPanelDeps {
  return {

    appCtx,
    applyExportPreset,
    captureCameraView,
    captureOverviewCamera,
    ensureSceneRendered,
    exportDialogElement,
    exportFolderNameInput,
    exportFolderQueryValue,
    exportHeightInput,
    exportLockRatioInput,
    exportPackageButton,
    exportPreviewStageElement,
    exportStatusElement,
    exportWidthInput,
    floorSelectionId,
    getActiveFloor,
    getCameraFocalLength,
    getCameraMode,
    getCameraTopRotation,
    getCameraView,
    getPreviewFloorMode,
    isAutoDiagramEmbed,
    listChargingRows,
    listLightGroupRows,
    listScreenRows,
    openExportDialog,
    prepareFreeCameraCapture,
    rebuildFloorLayers,
    refreshCanvasSizeUi,
    refreshFloorControls,
    refreshSelection,
    renderExportLayers,
    renderExportPresetSlots,
    selectPreviewFloor,
    setCameraMode,
    stateViewportAspectGetCanvasSize,
    syncCanvasSizeInputs,
    updateCameraView,
  };
}
const exportVisibilityByObject = new WeakMap();
function generateExportBundle(...args: any[]): any {
  return (generateExportBundleImpl as any)(generateExportBundleDeps(), ...args);
}
function generateExportBundleDeps(): GenerateExportBundleDeps {
  return {

    appCtx,
    applyCameraState,
    applyExportVisibility,
    autoDiagramComponentId,
    beginExportFlow,
    blobToBytes,
    buildExportCamera,
    buildLightExportEntry,
    captureOverviewCamera,
    captureStudioSnapshot,
    captureUndoSnapshot,
    collectSelectedExportFiles,
    exportFolderNameInput,
    exportStatusElement,
    fetchStudioApi,
    floorElevationFor,
    getOrderedFloorList,
    getPreviewFloorMode,
    isAutoDiagramEmbed,
    listChargingRows,
    listLightGroupRows,
    listScreenRows,
    makeUniqueFileName,
    projectItemAnchor,
    projectLightGroupAnchor,
    rebuildFloorLayers,
    renderBackgroundLayer,
    renderExportImage,
    renderLightDeltaLayer,
    renderLightShadowLayer,
    reportExportFailure,
    saveExportPreset,
    setExportBusy,
    setExportRoleVisibility,
    setShadowQualityHigh,
    showExportResult,
    showToast,
    stateViewportAspectGetCanvasSize,
    syncCanvasSizeInputs,
  };
}
/** 盒子网格构件的外部状态（见 `scene/studio-box-mesh`）：两个缓存 + 主题视图设置。 */
const studioBoxMeshDeps = () => ({ geometryCacheByKey, textureCacheByKey, backgroundSettings });
/** 电视模型构件的外部状态（见 `items/studio-television-model`）：嵌入舞台标记 + 渲染器（只读）+ 主题视图设置。 */
const studioTelevisionDeps = () => ({ isEmbeddedStage, threeRenderer: appCtx.threeRenderer, backgroundSettings });
/**
 * 物品模型总装的外部句柄（见 `items/studio-item-model`）：13 个宿主兄弟构件
 * （圆柱网格 / 灯具 / 铭牌 / 墙面材质 / 释放 / 合批 / 优化 …）+ 12 项只读状态
 * （项目文档 / 当前楼层 / 诊断统计表 / 主题视图 / 类型集合）。
 *
 * 这些都是 `let`／函数声明，全部在**本行之前**已就位，且本工厂只在 `buildItemModel`
 * 被调用时才求值（16200 / 16664 / 20036 三处，都在更深的内层函数里），所以不像
 * `studioDocumentDeps` 那样需要 getter 转发。
 */
/** 墙体构件族的外部状态（见 `scene/studio-walls`）。 */
const studioWallsDeps = () => ({
  activeFloorId: appCtx.activeFloorId,
  addArchitectureMesh,
  addWindowFrames,
  backgroundSettings,
  computeSurfaceExclusions,
  createSelectionRef,
  defaultWallRuntimeProfile,
  doorPartDisplayColor,
  doorPartMeshOptions,
  doorPartThemeColor,
  geometryCacheHandle,
  isEmbedStageMode,
  isEmbeddedStage,
  lampsLayerIndex,
  resolveDoorPartMaterials,
  sceneRootNode: appCtx.sceneRootNode,
  sceneStyle: appCtx.sceneStyle,
  studioState: appCtx.studioState,
  wallOpacityValue: appCtx.wallOpacityValue,
});

const studioItemModelDeps = () => ({
  addCylinderMesh,
  applyAccentEmissive,
  createSelectionRef,
  createPlanLabel,
  addLightModel,
  addRugMeshes,
  addStripLightPreview,
  disposeObjectTree,
  mergeMeshesByType,
  createWallSideMaterial,
  createWallTopMaterial,
  applyItemOptimization,
  getPixelsPerMeter,
  closedWallLoops,
  backgroundSettings,
  studioState: appCtx.studioState,
  studioTelevisionDeps,
  activeFloorId: appCtx.activeFloorId,
  isEmbeddedStage,
  isPerformanceDiagnostics,
  lampsLayerIndex,
  meshStatsByType,
  nextTenItemTypeSet,
  optimizationItemTypeSet,
  applianceOptimizationTypeSet,
});
/**
 * 平面图物品绘制的外部句柄（见 `plan/studio-plan-item-drawing`）：平面画布与坐标换算
 * （`planCanvasRenderer` / `planView` / `planToScreen` / `getPixelsPerMeter`）+ 宿主从
 * `createPlanDrawingTools` 解构出的三个画笔别名 + 灯具判据 / 铭牌配色 / 门部件材质通道。
 *
 * 引用的 `let`（画布、视图、三个画笔别名，约 1183~1196 行）都在**本行之前**，且工厂只在
 * `drawDoor` / `drawCourtyardArea` 被调用时求值（7 处调用点都在更深的内层函数里）。
 */
const studioPlanItemDrawingDeps = () => ({
  planCanvasRenderer,
  planView: appCtx.planView,
  planPainter,
  drawGuideSegment,
  drawPointMarker,
  drawLabelText,
  planToScreen,
  getPixelsPerMeter,
  createSelectionRef,
  wallWindowSpan,
  isLampEnabled,
  planLabelAccentColor,
  resolveDoorPartMaterials,
  doorPartDisplayColor,
  backgroundSettings,
});
/** 导出图层清单渲染的外部状态（见 `ui/studio-export-layers`）：容器元素 + 三个取数助手。 */
const studioExportLayerDeps = () => ({
  exportGroupFilesElement,
  getOrderedFloorList,
  listScreenRows,
  listChargingRows,
  listLightGroupRows,
});
/** 引导序列的外部状态（见 `boot/studio-boot`）：入口判定 / 取数 / 渲染器与舞台挂载 / 状态提示 / 嵌入契约。 */
const studioBootDeps = () => ({
  isStudioEntry,
  isEmbeddedStage,
  isAutoDiagramEmbed,
  autoDiagramComponentId,
  projectNameElement,
  stageLoadTiming,
  showSaveState,
  showToast,
  fetchStudioApi: (apiPath: any, options: any, response: any) => {
    const pendingDraftFetch = fetchStudioApi(apiPath, options, response);
    const requestedMethod = options && options.method ? options.method : "GET";
    if (
      !isEmbeddedStage &&
      requestedMethod === "GET" &&
      (!apiPath || String(apiPath).startsWith("/studio3d"))
    ) {
      // 初载 GET 抛错：进入 blocked-readonly（横幅 + 重试 + 导出本地副本），不再谎报可保存。
      pendingDraftFetch.catch((draftLoadError: any) => notifyStudioDraftLoadFailure(draftLoadError));
    }
    return pendingDraftFetch;
  },
  createStudioRenderer,
  resizePlanStage,
  applyLoadedDraft,
  runStudioRenderLoop,
  openExportPanel,
  normalizeDocument: (rawDocument: any) => normalizeStudioDocument(rawDocument, studioDocumentDeps()),
});
function addLightModel(...args: any[]): any {
  return (addLightModelImpl as any)(addLightModelDeps(), ...args);
}
function addLightModelDeps(): AddLightModelDeps {
  return {

    appCtx,
    areLightsEnabled,
    clampShadowMapSize,
    isEmbedStageMode,
    isEmbeddedStage,
    isLampEnabled,
    lampsLayerIndex,
    resolveLightGroup,
  };
}
/**
 * 静态合批句柄（同族转发见 `items/studio-static-item-meshes`）：`appCtx` 按引用传（本族只读它的
 * `threeRenderer`），其余三项是宿主闭包里的常量与判定句柄。工厂每次调用现取，快照不外溢。
 */
const studioStaticItemMeshesDeps = (): StudioStaticItemMeshesDeps => ({
  appCtx,
  isEmbeddedStage,
  instanceTestTypeSet,
  createSelectionRef,
});
(document.addEventListener("visibilitychange", () => {
  !document.hidden && appCtx.isEnvironmentLoading && scheduleLightPrecompile();
}),
  window.addEventListener(
    "pagehide",
    () => {
      ((appCtx.isPageHidden = true), window.clearTimeout(appCtx.precompileDebounceId));
    },
    {
      once: true,
    },
  ));
function buildStudioScene(...args: any[]): any {
  return (buildStudioSceneImpl as any)(buildStudioSceneDeps(), ...args);
}
function buildStudioSceneDeps(): BuildStudioSceneDeps {
  return {

    appCtx,
    backgroundSettings,
    batchSharedMeshes,
    buildCourtyardFoundation,
    buildGroundShadow,
    buildInteriorScene,
    buildItemModel,
    buildShapesWithHoles,
    closedWallLoops,
    collectLightSourceSpecs,
    createFloorMaterial,
    createSelectionRef,
    defaultWallRuntimeProfile,
    disposeFloorScene,
    geometryCacheHandle,
    getActiveFloor,
    getPixelsPerMeter,
    getSceneContentBounds,
    isEmbedStageMode,
    isEmbeddedStage,
    mergeStaticItemMeshes,
    refreshBaseLighting,
    refreshSceneRender,
    setupSceneShadows,
  };
}
const previewTransformCache = createPreviewTransformCache();
function handlePointerDown(...args: any[]): any {
  return (handlePointerDownImpl as any)(handlePointerDownDeps(), ...args);
}
function handlePointerDownDeps(): HandlePointerDownDeps {
  return {

    activeDoorType,
    appCtx,
    applyPlacementChange,
    axisLockedDistance,
    captureUndoSnapshot,
    createSceneItem,
    createSelectionRef,
    deselectAll,
    endStudioGesture,
    ensureCalibrationReady,
    eventToLocalPoint,
    finishWallButton,
    gardenGateItemType,
    getCurrentPreviewScope,
    getPixelsPerMeter,
    getPreviewScopeSelection,
    hitTestHandle,
    hitTestPlanItem,
    isSameAlignmentFloor,
    markDocumentDirty,
    markWallsChanged,
    planCanvasElement,
    pushUndoEntry,
    referenceMetersInput,
    referencePixelsElement,
    refreshPreviewScene,
    refreshScopeItems,
    refreshSelection,
    refreshStudioUi,
    refreshStudioView,
    resetPlanInteraction,
    scaleDialogElement,
    screenToPlan,
    screenToPlanPoint,
    selectSceneObject,
    setPreviewScope,
    showToast,
    updateMarqueeOverlay,
    validateSelectionChange,
  };
}
function handlePointerUp(...args: any[]): any {
  return (handlePointerUpImpl as any)(handlePointerUpDeps(), ...args);
}
function handlePointerUpDeps(): HandlePointerUpDeps {
  return {

    appCtx,
    drawMarqueeOverlay,
    eventToLocalPoint,
    getPixelsPerMeter,
    getSelectedObject,
    isSnapEnabled,
    refreshStudioView,
    renderPlanScene,
    screenToPlan,
    screenToPlanPoint,
    toggleSnapSetting,
  };
}
function applyToolSetting(...args: any[]): any {
  return (applyToolSettingImpl as any)(applyToolSettingDeps(), ...args);
}
function applyToolSettingDeps(): ApplyToolSettingDeps {
  return {

    appCtx,
    applyPlacementChange,
    captureUndoSnapshot,
    getLightGroups,
    getPixelsPerMeter,
    getSelectedObject,
    isSelectionAllowed,
    itemLightSourceVisibleInput,
    itemStripRollInput,
    markDocumentDirty,
    refreshScopeItems,
    refreshStudioUi,
    resolvePreviewScope,
    selectElement,
    validateSelectionChange,
  };
}
(toolButtons.forEach((toolClickButton) =>
  toolClickButton.addEventListener("click", () => selectStudioTool(toolClickButton.dataset.tool)),
),
  addFloorButton.addEventListener("click", () => {
    addNewFloor();
  }),
  alignFloorButton.addEventListener("click", startFloorAlign),
  previewFloorGapInput.addEventListener("change", updatePreviewFloorGap),
  previewFloorUniformInput.addEventListener("change", updateUniformOverviewStack),
  exportFloorGapInput.addEventListener("change", updateExportFloorGap));
for (const drawingToolSection of drawingToolSections) {
  const drawingToolToggle = drawingToolSection.querySelector(".drawing-tool-toggle");
  if (!drawingToolToggle) continue;
  drawingToolToggle.addEventListener("click", (drawingToolToggleClickEvent) => {
    (drawingToolToggleClickEvent.stopPropagation(),
      closeDrawingToolGroups(drawingToolSection),
      setDrawingToolGroupOpen(
        drawingToolSection,
        !drawingToolSection.classList.contains("open"),
      ));
  });
}
for (const previewFloorButton of previewFloorControls)
  previewFloorButton.addEventListener("click", () =>
    setPreviewFloor(previewFloorButton.dataset.previewFloor),
  );
(importPlanButton.addEventListener("click", () => planFileInput.click()),
  selectElement("#background-import-copy").addEventListener("click", async () => {
    const backgroundImportDetailsField = selectElement("#background-import-details");
    try {
      (await navigator.clipboard.writeText(backgroundImportDetailsField.value),
        showToast("诊断信息已复制。"));
    } catch {
      ((backgroundImportDetailsField.closest("details").open = true),
        backgroundImportDetailsField.focus(),
        backgroundImportDetailsField.select(),
        showToast("请长按或按 Ctrl/Cmd+C 复制选中的诊断信息。", "warning"));
    }
  }),
  planFileInput.addEventListener("change", async () => {
    (await importBackgroundFile(planFileInput.files?.[0]), (planFileInput.value = ""));
  }),
  toggleBackgroundButton.addEventListener("click", () => {
    appCtx.studioState.background &&
      (deselectAll(),
      (appCtx.studioState.settings.backgroundVisible = !appCtx.studioState.settings.backgroundVisible),
      refreshBackground(),
      refreshStudioView(),
      markDocumentDirty());
  }),
  removePlanButton.addEventListener("click", () => {
    appCtx.studioState.background &&
      (deselectAll(),
      (appCtx.studioState.background = null),
      (appCtx.backgroundImageSource = null),
      refreshScopeItems(),
      resetView(),
      markDocumentDirty(),
      showToast("底图引用已移除，现在可以在编辑器中删除这张图片。", "success"));
  }));
for (const [wallOpacityInput, wallOpacitySetting] of [
  [globalWallHeightInput, commitWallHeight],
  [globalWallThicknessInput, commitWallThickness],
  [globalWallOpacityInput, commitWallOpacity],
])
  (wallOpacityInput.addEventListener("input", wallOpacitySetting),
    wallOpacityInput.addEventListener("change", () => {
      (wallOpacitySetting(), scheduleWallApply());
    }),
    wallOpacityInput.addEventListener("blur", () => scheduleWallApply(0)));
toggleFloorEdgeButton.addEventListener("click", () => {
  (deselectAll(),
    (appCtx.studioState.settings.floorEdgeVisible = appCtx.studioState.settings.floorEdgeVisible === false),
    refreshScopeItems(),
    markDocumentDirty());
});
// 分组标题在标记里是普通 div：这里补上按钮语义，点标题或按 Enter / 空格都能展开整组。
// 展开态默认全收起（`data-asset-expanded="false"`），且一次只展开一个分组。
for (const assetGroupHeadingControl of assetHeadingCategoryControls)
  (assetGroupHeadingControl.setAttribute("role", "button"),
    (assetGroupHeadingControl.tabIndex = 0),
    (assetGroupHeadingControl.dataset.assetExpanded = "false"),
    assetGroupHeadingControl.setAttribute("aria-expanded", "false"),
    assetGroupHeadingControl.addEventListener("click", () => toggleAssetGroup(assetGroupHeadingControl)),
    assetGroupHeadingControl.addEventListener("keydown", (event) => {
      (event.key !== "Enter" && event.key !== " ") ||
        (event.preventDefault(), toggleAssetGroup(assetGroupHeadingControl));
    }));
for (const assetCategoryClickButton of assetCategoryButtons)
  assetCategoryClickButton.addEventListener("click", () =>
    setAssetCategory(assetCategoryClickButton.dataset.assetCategory),
  );
(assetSearchInput?.addEventListener("input", filterAssetList),
  assetSearchInput?.addEventListener("search", filterAssetList),
  setAssetCategory("home"),
  addLightGroupButton.addEventListener("click", () => {
    deselectAll();
    const assetCategoryClickButtonLightGroupNameSet = new Set(
      appCtx.studioState.lightGroups.map(
        (lightGroupNameSetExistingLightGroup) => lightGroupNameSetExistingLightGroup.name,
      ),
    );
    let nextLightGroupIndex = appCtx.studioState.lightGroups.length + 1;
    for (; assetCategoryClickButtonLightGroupNameSet.has("灯组 " + nextLightGroupIndex);)
      nextLightGroupIndex += 1;
    const nextLightGroupIndexNewLightGroupRecord = {
      id: generateId("light-group"),
      name: "灯组 " + nextLightGroupIndex,
      enabled: true,
      areaId: null as any,
    };
    (appCtx.studioState.lightGroups.push(nextLightGroupIndexNewLightGroupRecord),
      (appCtx.activeLightGroupId = nextLightGroupIndexNewLightGroupRecord.id),
      syncLightGroupList(),
      refreshStudioUi(),
      markDocumentDirty());
  }),
  lightGroupsOffButton.addEventListener("click", () => setAllLightGroupsEnabled(false)));
for (const lightGroupActionButton of lightGroupActionMenuElement.querySelectorAll(
  "[data-light-group-action]",
))
  lightGroupActionButton.addEventListener("click", () => {
    const selectedLightGroup = appCtx.studioState.lightGroups.find(
        (targetLightGroup) => targetLightGroup.id === appCtx.pendingLightGroupId,
      ),
      lightGroupAction = lightGroupActionButton.dataset.lightGroupAction;
    (hideLightGroupActionMenu(),
      selectedLightGroup &&
        (lightGroupAction === "area"
          ? openLightGroupAreaDialog(selectedLightGroup)
          : lightGroupAction === "rename"
            ? ((appCtx.renamingLightGroupId = selectedLightGroup.id),
              (lightGroupRenameInputElement.value = selectedLightGroup.name),
              lightGroupRenameDialogElement.showModal(),
              requestAnimationFrame(() => lightGroupRenameInputElement.select()))
            : lightGroupAction === "duplicate"
              ? duplicateLightGroup(selectedLightGroup)
              : lightGroupAction === "delete" && deleteLightGroup(selectedLightGroup)));
  });


lightGroupListElement.addEventListener(
  "click",
  (listClickEvent: any) => {
    Date.now() - appCtx.listDragEndedAt < LIST_DRAG_CLICK_SUPPRESS_MS &&
      (listClickEvent.stopPropagation(), listClickEvent.preventDefault());
  },
  true,
);
lightGroupAreaFormElement.addEventListener("submit", (lightGroupAreaSubmitEvent: any) => {
  lightGroupAreaSubmitEvent.preventDefault();

  const assignTargetGroup = (appCtx.studioState.lightGroups || []).find(
    (groupLookupEntry) => groupLookupEntry.id === appCtx.areaAssignGroupId,
  );
  if (assignTargetGroup) {
    const nextAreaId = lightGroupAreaSelectElement.value || null;
    if (nextAreaId === null || isKnownLightAreaId(nextAreaId))
      (assignTargetGroup.areaId || null) !== nextAreaId &&
        (deselectAll(),
        (assignTargetGroup.areaId = nextAreaId),
        nextAreaId && appCtx.expandedAreaIds.add(nextAreaId),
        syncLightGroupList(),
        markDocumentDirty());
  }
  closeLightGroupAreaDialog();
});
selectElement("#light-group-area-close").addEventListener("click", closeLightGroupAreaDialog);
selectElement("#light-group-area-cancel").addEventListener("click", closeLightGroupAreaDialog);
lightGroupAreaDialogElement.addEventListener("cancel", () => {
  appCtx.areaAssignGroupId = "";
});
for (const floorActionButton of floorActionMenuElement.querySelectorAll("[data-floor-action]"))
  floorActionButton.addEventListener("click", () => {
    const floorActionButtonSelectedFloor = appCtx.studioProject.floors.find(
        (selectedFloorTargetFloor: any) => selectedFloorTargetFloor.id === appCtx.pendingFloorMenuId,
      ),
      floorAction = floorActionButton.dataset.floorAction;
    (hideFloorActionMenu(),
      floorActionButtonSelectedFloor &&
        (floorAction === "rename"
          ? openFloorRenameDialog(floorActionButtonSelectedFloor)
          : floorAction === "delete" && floorActionHandler(floorActionButtonSelectedFloor)));
  });
document.addEventListener("pointerdown", (documentPointerDownEvent) => {
  (!lightGroupActionMenuElement.hidden &&
    !lightGroupActionMenuElement.contains(documentPointerDownEvent.target) &&
    hideLightGroupActionMenu(),
    !floorActionMenuElement.hidden &&
      !floorActionMenuElement.contains(documentPointerDownEvent.target) &&
      hideFloorActionMenu(),
    !snapSettingsPanel.hidden &&
      !(documentPointerDownEvent.target as Element).closest(".snap-control") &&
      setSnapSettingsOpen(false),
    !(documentPointerDownEvent.target as Element).closest(".drawing-tool-section") &&
      closeDrawingToolGroups());
});
(selectElement("#floor-rename-close").addEventListener("click", closeOpenPopovers),
  selectElement("#floor-rename-cancel").addEventListener("click", closeOpenPopovers),
  floorRenameDialogElement.addEventListener("cancel", () => {
    appCtx.pendingFloorMenuId = "";
  }),
  floorRenameFormElement.addEventListener("submit", (floorRenameSubmitEvent: any) => {
    floorRenameSubmitEvent.preventDefault();
    const renamedFloor = appCtx.studioProject.floors.find(
      (renameFloorTarget: any) => renameFloorTarget.id === appCtx.pendingFloorMenuId,
    );
    if (!renamedFloor) {
      closeOpenPopovers();
      return;
    }
    const floorRenamePayload = uniqueFloorName(
      normalizeLabelText2(floorRenameInputElement.value, renamedFloor.name, 24),
      renamedFloor.id,
    );
    (floorRenamePayload !== renamedFloor.name &&
      ((renamedFloor.name = floorRenamePayload),
      syncGlobalControls(),
      renderExportLayers(),
      markDocumentDirty(),
      showToast("已重命名为“" + floorRenamePayload + "”。", "success")),
      closeOpenPopovers());
  }),
  selectElement("#floor-delete-close").addEventListener("click", closeFloorDeleteDialog),
  selectElement("#floor-delete-cancel").addEventListener("click", closeFloorDeleteDialog),
  floorDeleteDialogElement.addEventListener("cancel", (floorRenameCancelEvent: any) => {
    (floorRenameCancelEvent.preventDefault(), closeFloorDeleteDialog());
  }),
  floorDeleteFormElement.addEventListener("submit", (lightGroupRenameSubmitEvent: any) => {
    (lightGroupRenameSubmitEvent.preventDefault(), confirmFloorDelete());
  }));
(selectElement("#light-group-rename-close").addEventListener("click", applyLightGroupRename),
  selectElement("#light-group-rename-cancel").addEventListener("click", applyLightGroupRename),
  lightGroupRenameDialogElement.addEventListener("cancel", () => {
    appCtx.renamingLightGroupId = "";
  }),
  lightGroupRenameFormElement.addEventListener("submit", (lightGroupCreateSubmitEvent: any) => {
    lightGroupCreateSubmitEvent.preventDefault();
    const createdLightGroup = appCtx.studioState.lightGroups.find(
      (createLightGroupTarget) => createLightGroupTarget.id === appCtx.renamingLightGroupId,
    );
    if (!createdLightGroup) {
      applyLightGroupRename();
      return;
    }
    const normalizedLightGroupName = normalizeLabelText2(
      lightGroupRenameInputElement.value,
      createdLightGroup.name,
      24,
    );
    (normalizedLightGroupName !== createdLightGroup.name &&
      (deselectAll(),
      (createdLightGroup.name = normalizedLightGroupName),
      refreshScopeItems("none"),
      markDocumentDirty()),
      applyLightGroupRename());
  }));
for (const lightTargetToggleRow of applyLightPropertyControls)
  lightTargetToggleRow.addEventListener("click", () => {
    const lightTargetPlacedElement = getSelectedObject(),
      applyLightProperty = lightTargetToggleRow.dataset.applyLightProperty,
      lightPropertyBinding = (lightPropertyFields as any)[applyLightProperty!];
    if (
      !lightTargetPlacedElement ||
      appCtx.selectedItem?.kind !== "item" ||
      !lampItemTypeSet.has(lightTargetPlacedElement.type) ||
      !lightPropertyBinding
    )
      return;
    const kd4 = normalizeLightPropertyValue(
      applyLightProperty,
      selectElement(lightPropertyBinding.input).value,
      lightTargetPlacedElement.type,
    );
    ((appCtx.pendingLightPropertyApply = {
      property: applyLightProperty,
      label: lightPropertyBinding.label,
      value: kd4,
    }),
      (lightPropertyApplyTitleElement.textContent = "应用" + lightPropertyBinding.label),
      (lightPropertyApplyValueElement.textContent = formatLightPropertyValue(
        applyLightProperty,
        kd4,
      )),
      buildLightGroupList(applyLightProperty),
      lightPropertyApplyDialogElement.showModal(),
      requestAnimationFrame(() => lightPropertyToggleAllButton.focus()));
  });
(lightPropertyToggleAllButton.addEventListener("click", () => {
  const ys4 = collectLightTargetInputs(),
    shouldCheckAllTargets =
      !ys4.length || !ys4.every((partialToggleInput: any) => partialToggleInput.checked);
  for (const synchronizedToggleInput of ys4)
    synchronizedToggleInput.checked = shouldCheckAllTargets;
  syncLightTargetGroups();
}),
  lightPropertyTargetListElement.addEventListener("click", (lightTargetClickEvent: any) => {
    const closest = lightTargetClickEvent.target.closest("[data-light-target-group-toggle]");
    if (!closest) return;
    const closestLightTargetRow = closest.closest("[data-light-target-group-id]"),
      ys5 = collectLightTargetInputs(closestLightTargetRow),
      isAllTargetsChecked = !ys5.every((allTargetsInput: any) => allTargetsInput.checked);
    for (const bulkToggleInput of ys5) bulkToggleInput.checked = isAllTargetsChecked;
    syncLightTargetGroups();
  }),
  lightPropertyTargetListElement.addEventListener("change", syncLightTargetGroups),
  selectElement("#light-property-apply-close").addEventListener("click", createLightGroup),
  selectElement("#light-property-apply-cancel").addEventListener("click", createLightGroup),
  lightPropertyApplyDialogElement.addEventListener("cancel", () => {
    appCtx.pendingLightPropertyApply = null;
  }),
  lightPropertyApplyFormElement.addEventListener("submit", (lightTargetSubmitEvent: any) => {
    if ((lightTargetSubmitEvent.preventDefault(), !appCtx.pendingLightPropertyApply)) {
      createLightGroup();
      return;
    }
    const { property: Oi2, label: Oi3, value: Oi4 } = appCtx.pendingLightPropertyApply,
      lightTargetItemIdSet = new Set(
        collectLightTargetInputs()
          .filter((checkedTargetInput: any) => checkedTargetInput.checked)
          .map((targetItemInput: any) => targetItemInput.dataset.lightTargetItemId),
      ),
      lightTargetItems = appCtx.studioState.items.filter(
        (lightTargetItem) =>
          lampItemTypeSet.has(lightTargetItem.type) && lightTargetItemIdSet.has(lightTargetItem.id),
      );
    if (!lightTargetItems.length) {
      showToast("请至少选择一盏灯。", "error");
      return;
    }
    const lightTargetChanges = lightTargetItems
      .map((lightTargetChangeItem) => ({
        item: lightTargetChangeItem,
        value: normalizeLightPropertyValue(Oi2, Oi4, lightTargetChangeItem.type),
      }))
      .filter(
        (lightTargetChange) =>
          Math.abs(finite2(lightTargetChange.item[Oi2]) - lightTargetChange.value) > 0.000001,
      );
    if (lightTargetChanges.length) {
      deselectAll();
      for (const appliedLightTargetChange of lightTargetChanges)
        appliedLightTargetChange.item[Oi2] = appliedLightTargetChange.value;
      (refreshScopeItems("lights"), markDocumentDirty());
    }
    (createLightGroup(),
      showToast("已将" + Oi3 + "应用到 " + lightTargetItems.length + " 盏灯。", "success"));
  }),
  selectElement("#courtyard-gate-style").addEventListener("change", () => {
    const gatePlacedElement = getSelectedObject(),
      courtyardGateStyle = selectElement("#courtyard-gate-style").value;
    !isCourtyardGate2(gatePlacedElement) ||
      !isCourtyardGate2({
        type: courtyardGateStyle,
      }) ||
      (deselectAll(),
      (gatePlacedElement.type = courtyardGateStyle),
      (gardenGateItemType = courtyardGateStyle),
      refreshScopeItems(resolvePreviewScope(gatePlacedElement)),
      markDocumentDirty());
  }));
for (const assetToolbarDragButton of itemTypeButtons)
  (assetToolbarDragButton.addEventListener("dragstart", (assetDragStartEvent) => {
    ((assetDragStartEvent.dataTransfer!.effectAllowed = "copy"),
      assetDragStartEvent.dataTransfer!.setData(
        "application/x-homeos-item",
        assetToolbarDragButton.dataset.itemType!,
      ));
  }),
    assetToolbarDragButton.addEventListener("click", () => {
      if (
        isCourtyardGate2({
          type: assetToolbarDragButton.dataset.itemType,
        })
      ) {
        ((gardenGateItemType = assetToolbarDragButton.dataset.itemType!),
          selectStudioTool("courtyard-gate"));
        return;
      }
      const pr5 = screenToPlan({
        x: appCtx.planViewWidth / 2,
        y: appCtx.planViewHeight / 2,
      });
      createSceneItem(assetToolbarDragButton.dataset.itemType, pr5);
    }));
(planStageElement.addEventListener("dragenter", (assetDragEnterEvent: any) => {
  [...assetDragEnterEvent.dataTransfer.types].includes("application/x-homeos-item") &&
    planStageElement.classList.add("dragging-item");
}),
  planStageElement.addEventListener("dragover", (assetDragOverEvent: any) => {
    [...assetDragOverEvent.dataTransfer.types].includes("application/x-homeos-item") &&
      (assetDragOverEvent.preventDefault(),
      (assetDragOverEvent.dataTransfer.dropEffect = "copy"),
      planStageElement.classList.add("dragging-item"));
  }),
  planStageElement.addEventListener("dragleave", (assetDragLeaveEvent: any) => {
    planStageElement.contains(assetDragLeaveEvent.relatedTarget) ||
      planStageElement.classList.remove("dragging-item");
  }),
  planStageElement.addEventListener("drop", (assetDropEvent: any) => {
    (assetDropEvent.preventDefault(), planStageElement.classList.remove("dragging-item"));
    const data = assetDropEvent.dataTransfer.getData("application/x-homeos-item");
    data && createSceneItem(data, screenToPlan(eventToLocalPoint(assetDropEvent)));
  }),
  (planPainter = createCourtyardDrawingEditor2({
    canvas: planCanvasElement,
    toolbar: document.querySelector(".plan-toolbar"),
    inspector: selectionInspectorElement,
    scene: () => appCtx.studioState,
    selected: () => (appCtx.selectedItem?.kind === "item" ? getSelectedObject() : null),
    point: (pointerPlanPoint: any) => screenToPlan(eventToLocalPoint(pointerPlanPoint)),
    screen: planToScreen,
    ppm: () => getPixelsPerMeter() || 100,
    zoom: () => appCtx.planView.zoom,
    feedback: (toolFeedback: any) => {
      ((snapIndicatorElement.textContent = toolFeedback?.kind
        ? "吸附：" + toolFeedback.label
        : isSnapEnabled()
          ? "吸附：自由"
          : "吸附：关闭"),
        toolFeedback?.point &&
          (cursorPositionElement.textContent =
            "X " +
            (toolFeedback.point.x / (getPixelsPerMeter() || 100)).toFixed(2) +
            " m · Y " +
            (toolFeedback.point.y / (getPixelsPerMeter() || 100)).toFixed(2) +
            " m"));
    },
    snap: axisLockedDistance,
    snapping: isSnapEnabled,
    calibrated: ensureCalibrationReady,
    panning: () => appCtx.isMiddleButtonPanning,
    planColor: (courtyardPlanColor: any) => courtyardPlanColor2(courtyardPlanColor, itemTypeCatalog),
    buildings: () =>
      buildingFootprints2(
        appCtx.studioState.walls,
        closedWallLoops(getPixelsPerMeter()),
        getPixelsPerMeter(),
      ),
    clone: captureUndoSnapshot,
    snapshot: deselectAll,
    push: applyPlacementChange,
    changed: markDocumentDirty,
    refresh: () => refreshScopeItems(getDefaultSelectionScope()),
    draw: refreshStudioView,
    interactionEnded: handleInteractionEnded,
    select: (selectedToolItem: any) => selectSceneObject("item", selectedToolItem),
    isSelected: (toolSelectionItem: any) => createSelectionRef("item", toolSelectionItem),
    id: () => generateId("courtyard"),
    setTool: selectStudioTool,
    toast: showToast,
  })),
  planCanvasElement.addEventListener("pointerdown", handlePointerDown),
  planCanvasElement.addEventListener("pointermove", handlePointerMove),
  planCanvasElement.addEventListener("pointerup", handlePointerRelease),
  planCanvasElement.addEventListener("pointercancel", handlePointerRelease),
  planCanvasElement.addEventListener("contextmenu", (canvasMenuEvent: any) =>
    canvasMenuEvent.preventDefault(),
  ),
  planCanvasElement.addEventListener(
    "wheel",
    (canvasPointerEvent: any) => {
      (canvasPointerEvent.preventDefault(), handleCanvasWheel(canvasPointerEvent));
    },
    {
      passive: false,
    },
  ),
  selectElement("#fit-view").addEventListener("click", resetView),
  selectElement("#rotate-plan-view").addEventListener("click", rotatePlanView),
  selectElement("#zoom-in").addEventListener("click", () => zoomByScale(1.18)),
  selectElement("#zoom-out").addEventListener("click", () => zoomByScale(1 / 1.18)),
  selectElement("#reset-camera").addEventListener("click", updateCameraView),
  saveCameraViewButton.addEventListener("click", saveCameraView),
  fixedCameraViewButton.addEventListener("click", applyCameraSnapshot),
  saveOverviewViewButton.addEventListener("click", saveCameraView),
  fixedOverviewViewButton.addEventListener("click", applyCameraSnapshot),
  exportSaveViewButton.addEventListener("click", saveCameraView),
  selectElement("#open-export").addEventListener("click", openExportPanel),
  selectElement("#export-close").addEventListener("click", () => {
    appCtx.isInteractionLocked || exportDialogElement.close();
  }),
  exportDialogElement.addEventListener("cancel", (exportDialogCancelEvent: any) => {
    (exportDialogCancelEvent.preventDefault(), appCtx.isInteractionLocked || exportDialogElement.close());
  }),
  exportDialogElement.addEventListener("close", restorePreviewAfterExport),
  selectElement("#export-overwrite-close").addEventListener("click", () =>
    resolveOverwriteChoice("cancel"),
  ),
  selectElement("#export-overwrite-cancel").addEventListener("click", () =>
    resolveOverwriteChoice("cancel"),
  ),
  selectElement("#export-overwrite-rename").addEventListener("click", () =>
    resolveOverwriteChoice("rename"),
  ),
  selectElement("#export-overwrite-confirm").addEventListener("click", () =>
    resolveOverwriteChoice("overwrite"),
  ),
  exportOverwriteDialogElement.addEventListener("cancel", (overwriteDialogCancelEvent: any) => {
    (overwriteDialogCancelEvent.preventDefault(), resolveOverwriteChoice("cancel"));
  }));
const closeExportCompleteDialog = () => {
  exportCompleteDialogElement.open && exportCompleteDialogElement.close();
};
(selectElement("#export-complete-close").addEventListener("click", closeExportCompleteDialog),
  selectElement("#export-complete-confirm").addEventListener("click", closeExportCompleteDialog),
  exportPresetSlotsElement.addEventListener("click", (presetSlotClickEvent: any) => {
    const closestPresetSlotButton = presetSlotClickEvent.target.closest(
      "[data-export-preset-slot]",
    );
    closestPresetSlotButton &&
      selectExportPresetSlot(Number(closestPresetSlotButton.dataset.exportPresetSlot));
  }),
  exportPresetAddButton.addEventListener("click", saveAsNewPreset),
  exportPresetRenameButton.addEventListener("click", openPresetRenameDialog),
  exportPresetDeleteButton.addEventListener("click", openPresetDeleteDialog),
  selectElement("#export-preset-rename-close").addEventListener("click", closePresetRenameDialog),
  selectElement("#export-preset-rename-cancel").addEventListener("click", closePresetRenameDialog),
  exportPresetRenameDialogElement.addEventListener("cancel", (presetRenameDialogCancelEvent: any) => {
    (presetRenameDialogCancelEvent.preventDefault(), closePresetRenameDialog());
  }),
  exportPresetRenameFormElement.addEventListener("submit", (presetRenameSubmitEvent: any) => {
    presetRenameSubmitEvent.preventDefault();
    const presetRenameSubmitEventExportPresetSlots = normalizeExportPresetSlots2(
        appCtx.studioProject?.exportPresets,
      ),
      activePresetSlotIndex = normalizeActiveExportPresetSlot2(
        appCtx.studioProject?.activeExportPresetSlot,
        presetRenameSubmitEventExportPresetSlots.length,
      ),
      activePresetSlotIndexActivePresetSlot =
        presetRenameSubmitEventExportPresetSlots[activePresetSlotIndex];
    if (!activePresetSlotIndexActivePresetSlot) {
      closePresetRenameDialog();
      return;
    }
    const ja7 = formatPresetLabel(activePresetSlotIndexActivePresetSlot, activePresetSlotIndex),
      hf3 = makeUniquePresetName(exportPresetRenameInputElement.value, activePresetSlotIndex);
    ((activePresetSlotIndexActivePresetSlot.name = hf3),
      (appCtx.studioProject.exportPresets = presetRenameSubmitEventExportPresetSlots),
      closePresetRenameDialog(),
      renderExportPresetSlots(),
      markDocumentDirty(),
      hf3 !== ja7 && showToast("已重命名为“" + hf3 + "”。", "success"));
  }),
  selectElement("#export-preset-delete-close").addEventListener("click", closePresetDeleteDialog),
  selectElement("#export-preset-delete-cancel").addEventListener("click", closePresetDeleteDialog),
  exportPresetDeleteDialogElement.addEventListener("cancel", (presetDeleteDialogCancelEvent: any) => {
    (presetDeleteDialogCancelEvent.preventDefault(), closePresetDeleteDialog());
  }),
  exportPresetDeleteFormElement.addEventListener("submit", (exportDeleteSubmitEvent: any) => {
    (exportDeleteSubmitEvent.preventDefault(), confirmDeletePreset());
  }),
  exportDialogElement.addEventListener("input", (exportDialogInputEvent: any) => {
    exportDialogInputEvent.target?.closest?.("#export-preset-slots") || syncExportControls();
  }),
  exportDialogElement.addEventListener("change", (exportDialogChangeEvent: any) => {
    exportDialogChangeEvent.target?.closest?.("#export-preset-slots") || syncExportControls();
  }),
  exportDialogElement.addEventListener("click", (exportDialogClickEvent: any) => {
    exportDialogClickEvent.target?.closest?.(
      "[data-camera-view], [data-camera-mode], [data-camera-rotate-top]",
    ) && syncExportControls();
  }),
  exportWidthInput.addEventListener("input", () => handleCanvasSizeInput("width")),
  exportHeightInput.addEventListener("input", () => handleCanvasSizeInput("height")),
  exportWidthInput.addEventListener("change", () => handleCanvasSizeInput("width", true)),
  exportHeightInput.addEventListener("change", () => handleCanvasSizeInput("height", true)),
  exportLockRatioInput.addEventListener("change", () => {
    const { width: viewportPixelWidth, height: viewportPixelHeight } =
      stateViewportAspectGetCanvasSize();
    (exportLockRatioInput.checked && (appCtx.exportAspectRatio = viewportPixelWidth / viewportPixelHeight),
      refreshCanvasSizeUi());
  }),
  selectElement("#export-use-fixed").addEventListener("click", openExportDialog),
  exportFloorSelectElement.addEventListener("change", () =>
    selectPreviewFloor(exportFloorSelectElement.value),
  ),
  exportPackageButton.addEventListener("click", generateExportBundle));
window.addEventListener("message", (bridgeMessageEvent) => {
  if (
    !isAutoDiagramEmbed ||
    bridgeMessageEvent.origin !== window.location.origin ||
    bridgeMessageEvent.source !== window.parent
  )
    return;
  const data2 = bridgeMessageEvent.data;
  if (!(!data2 || data2.componentId !== autoDiagramComponentId)) {
    if (data2.type === "homeos-floorplan-auto-diagram-floor") {
      if (data2.command === "set-floor") {
        const bridgeFloorRecord = appCtx.studioProject.floors.find(
            (bridgeFloor: any) => bridgeFloor.id === data2.value,
          ),
          bridgeFloorId =
            data2.value === "all" && appCtx.studioProject.floors.length > 1
              ? "all"
              : bridgeFloorRecord?.id || getActiveFloor()?.id || appCtx.activeFloorId;
        (selectPreviewFloor(bridgeFloorId), postBridgeFloors());
      }
      return;
    }
    if (data2.type === "homeos-floorplan-auto-diagram-base-lighting") {
      data2.command === "request-state"
        ? ((baseLightControlsElement.hidden = true),
          applyBaseLighting(appCtx.studioProject.baseLighting),
          postBridgeState("ready"))
        : data2.command === "preview"
          ? ((baseLightControlsElement.hidden = true),
            applyBaseLighting(data2.lighting),
            postBridgeState("preview"))
          : data2.command === "reset"
            ? ((baseLightControlsElement.hidden = true),
              applyBaseLighting(DEFAULT_BASE_LIGHTING2),
              postBridgeState("preview"))
            : data2.command === "save"
              ? ((baseLightControlsElement.hidden = true),
                applyBaseLighting(data2.lighting),
                confirmLightingDialog(),
                postBridgeState("saved"))
              : data2.command === "cancel" || data2.command === "close"
                ? (openLightingDialog(), postBridgeState("cancelled"))
                : saveBaseLightingEdit();
      return;
    }
    if (data2.type === "homeos-floorplan-auto-diagram-camera") {
      const ut6 = cameraSettings();
      if (data2.command === "restore") {
        const bridgeCameraState = data2.value || {};
        ((ut6.cameraMode =
          bridgeCameraState.mode === "perspective" ? "perspective" : "orthographic"),
          (ut6.cameraView = bridgeCameraState.view === "top" ? "top" : "free"),
          (ut6.cameraTopRotation =
            (((Math.round(finite2(bridgeCameraState.topRotation, 0) / 90) * 90) % 360) + 360) %
            360),
          (ut6.cameraFocalLength = clamp2(finite2(bridgeCameraState.focalLength, 50), 18, 120)),
          bridgeCameraState.snapshot
            ? applyCameraState(
                bridgeCameraState.snapshot,
                bridgeCameraState.snapshot.viewportAspect,
              )
            : (setCameraMode(ut6.cameraMode, {
                preserveView: true,
              }),
              setCameraView(ut6.cameraView, {
                force: true,
              }),
              applyCameraFocalLength()));
      } else
        data2.command === "set-view"
          ? ((ut6.cameraView = data2.value === "top" ? "top" : "free"),
            setCameraView(ut6.cameraView))
          : data2.command === "set-mode"
            ? ((ut6.cameraMode = data2.value === "perspective" ? "perspective" : "orthographic"),
              setCameraMode(ut6.cameraMode))
            : data2.command === "rotate-top"
              ? ((ut6.cameraView = "top"),
                (ut6.cameraTopRotation = (getCameraTopRotation() + 90) % 360),
                setCameraView("top", {
                  force: true,
                }))
              : data2.command === "set-focal-length" &&
                ((ut6.cameraFocalLength = clamp2(
                  finite2(data2.value, getCameraFocalLength()),
                  18,
                  120,
                )),
                applyCameraFocalLength());
      refreshSceneRender();
      return;
    }
    if (data2.type === "homeos-floorplan-auto-diagram-generate" && !appCtx.isInteractionLocked) {
      for (const bridgeCameraStateExportFileCheckbox of exportDialogElement.querySelectorAll(
        "input[data-export-file]",
      ))
        bridgeCameraStateExportFileCheckbox.checked = true;
      ((exportFolderNameInput.value = String(data2.folderName || "").trim()),
        (exportWidthInput.value = String(
          Math.round(clamp2(finite2(data2.width, exportWidthInput.value), 320, 4096)),
        )),
        (exportHeightInput.value = String(
          Math.round(clamp2(finite2(data2.height, exportHeightInput.value), 320, 4096)),
        )),
        (exportLockRatioInput.checked = true),
        refreshCanvasSizeUi(),
        generateExportBundle());
    }
  }
});
for (const previewSyncMenuRow of previewSyncControls)
  previewSyncMenuRow.addEventListener("click", () => {
    const isPreviewSyncEnabled = previewSyncMenuRow.dataset.previewSync !== "manual";
    isPreviewSyncEnabled !== getPreviewSyncMode() &&
      (deselectAll(),
      (appCtx.studioState.settings.livePreviewEnabled = isPreviewSyncEnabled),
      markDocumentDirty(),
      refreshPreviewSync(),
      isPreviewSyncEnabled
        ? requestSceneRebuild({
            force: true,
          })
        : discardLightingEdit());
  });
(refreshPreviewButton.addEventListener("click", () =>
  requestSceneRebuild({
    force: true,
  }),
),
  refreshLightPreviewButton?.addEventListener("click", discardLightingEdit),
  detailsResizerElement.addEventListener("pointerdown", (panelPointerDownEvent: any) => {
    panelPointerDownEvent.button === 0 &&
      ((appCtx.dragStart = {
        pointerId: panelPointerDownEvent.pointerId,
        startX: panelPointerDownEvent.clientX,
        startY: panelPointerDownEvent.clientY,
        startPreviewRatio: appCtx.studioState.settings.previewPanelRatio,
        startWidthRatio: appCtx.studioState.settings.detailsPanelWidthRatio,
      }),
      detailsPanelElement.classList.add("resizing"),
      studioShellElement.classList.add("resizing"),
      (detailsResizerElement.dataset.resizeAxis = "pending"),
      detailsResizerElement.setPointerCapture(panelPointerDownEvent.pointerId));
  }),
  detailsResizerElement.addEventListener("pointermove", (panelPointerMoveEvent: any) => {
    if (appCtx.dragStart?.pointerId === panelPointerMoveEvent.pointerId) {
      if ((panelPointerMoveEvent.buttons & 1) === 0) {
        finishPanelResize(panelPointerMoveEvent);
        return;
      }
      applySnapTolerance(panelPointerMoveEvent);
    }
  }));
const finishPanelResize = (panelPointerUpEvent: any = null, shouldPersistPanelSize = true) => {
  if (
    !appCtx.dragStart ||
    (panelPointerUpEvent?.pointerId !== undefined &&
      appCtx.dragStart.pointerId !== panelPointerUpEvent.pointerId)
  )
    return;
  const qn4 = appCtx.dragStart;
  appCtx.dragStart = null;
  const didPanelSizeChange =
    Math.abs(appCtx.studioState.settings.previewPanelRatio - qn4.startPreviewRatio) > 0.0001 ||
    Math.abs(appCtx.studioState.settings.detailsPanelWidthRatio - qn4.startWidthRatio) > 0.0001;
  if (
    (detailsPanelElement.classList.remove("resizing"),
    studioShellElement.classList.remove("resizing"),
    delete detailsResizerElement.dataset.resizeAxis,
    shouldPersistPanelSize)
  )
    try {
      detailsResizerElement.hasPointerCapture(qn4.pointerId) &&
        detailsResizerElement.releasePointerCapture(qn4.pointerId);
    } catch { /* 指针捕获：指针已失效（pointercancel / 元素已卸载）时规范要求抛错，忽略即可 */ }
  didPanelSizeChange && markDocumentDirty();
};
(detailsResizerElement.addEventListener("pointerup", finishPanelResize),
  detailsResizerElement.addEventListener("pointercancel", finishPanelResize),
  detailsResizerElement.addEventListener("lostpointercapture", (panelLostCaptureEvent: any) =>
    finishPanelResize(panelLostCaptureEvent, false),
  ),
  window.addEventListener("pointerup", finishPanelResize, true),
  window.addEventListener("pointercancel", finishPanelResize, true),
  window.addEventListener("blur", () => finishPanelResize()),
  detailsResizerElement.addEventListener("keydown", (panelKeyDownEvent: any) => {
    const panelVerticalDelta =
        panelKeyDownEvent.key === "ArrowUp"
          ? -0.03
          : panelKeyDownEvent.key === "ArrowDown"
            ? 0.03
            : 0,
      panelHorizontalDelta =
        panelKeyDownEvent.key === "ArrowLeft"
          ? 0.03
          : panelKeyDownEvent.key === "ArrowRight"
            ? -0.03
            : 0;
    if (!panelVerticalDelta && !panelHorizontalDelta) return;
    panelKeyDownEvent.preventDefault();
    const yl6 = getPanelRatioLimits();
    ((appCtx.studioState.settings.previewPanelRatio = clamp2(
      appCtx.studioState.settings.previewPanelRatio + panelVerticalDelta,
      yl6.minimumHeightRatio,
      yl6.maximumHeightRatio,
    )),
      (appCtx.studioState.settings.detailsPanelWidthRatio = clamp2(
        appCtx.studioState.settings.detailsPanelWidthRatio + panelHorizontalDelta,
        yl6.minimumWidthRatio,
        yl6.maximumWidthRatio,
      )),
      applyPanelRatios(),
      applyDetailsRatio(),
      markDocumentDirty());
  }));
for (const cameraModeOptionRow of cameraModeControls)
  cameraModeOptionRow.addEventListener("click", () => {
    const cameraProjectionMode =
      cameraModeOptionRow.dataset.cameraMode === "perspective" ? "perspective" : "orthographic";
    cameraProjectionMode !== getCameraMode() &&
      (appCtx.pendingRuntimeSettings || deselectAll(),
      (cameraSettings().cameraMode = cameraProjectionMode),
      setCameraMode(cameraProjectionMode),
      appCtx.pendingRuntimeSettings
        ? (exportStatusElement.textContent =
            cameraProjectionMode === "perspective" ? "已切换为透视构图" : "已切换为正交构图")
        : markDocumentDirty());
  });
for (const cameraViewOptionRow of cameraViewControls)
  cameraViewOptionRow.addEventListener("click", () => {
    const cameraViewDirection = cameraViewOptionRow.dataset.cameraView === "top" ? "top" : "free";
    cameraViewDirection !== getCameraView() &&
      (appCtx.pendingRuntimeSettings || deselectAll(),
      (cameraSettings().cameraView = cameraViewDirection),
      setCameraView(cameraViewDirection),
      appCtx.pendingRuntimeSettings
        ? (exportStatusElement.textContent =
            cameraViewDirection === "top" ? "已切换为顶视构图" : "已切换为自由构图")
        : markDocumentDirty());
  });
for (const cameraPresetButton of cameraRotateTopControls)
  cameraPresetButton.addEventListener("click", () => {
    getCameraView() === "top" &&
      (appCtx.pendingRuntimeSettings || deselectAll(),
      (cameraSettings().cameraTopRotation = (getCameraTopRotation() + 90) % 360),
      setCameraView("top", {
        force: true,
      }),
      appCtx.pendingRuntimeSettings
        ? (exportStatusElement.textContent = "顶视已旋转 " + getCameraTopRotation() + "°")
        : markDocumentDirty());
  });
for (const cameraPresetButtonFocalLengthInput of cameraFocalLengthControls)
  cameraPresetButtonFocalLengthInput.addEventListener("change", () => {
    const clampedFocalLength = clamp2(
      finite2(cameraPresetButtonFocalLengthInput.value, getCameraFocalLength()),
      18,
      120,
    );
    for (const focalLengthInputField of cameraFocalLengthControls)
      focalLengthInputField.value = String(Math.round(clampedFocalLength));
    Math.abs(clampedFocalLength - getCameraFocalLength()) < 1e-8 ||
      (appCtx.pendingRuntimeSettings || deselectAll(),
      (cameraSettings().cameraFocalLength = clampedFocalLength),
      applyCameraFocalLength(),
      appCtx.pendingRuntimeSettings
        ? (exportStatusElement.textContent = "焦段已设为 " + Math.round(clampedFocalLength) + " mm")
        : markDocumentDirty());
  });
for (const resetCameraButton of baseLightControlInputs)
  (resetCameraButton.addEventListener("input", () =>
    updateBaseLightingFromInput(resetCameraButton),
  ),
    resetCameraButton.addEventListener("change", () => {
      (updateBaseLightingFromInput(resetCameraButton), syncBaseLightingControls());
    }));
for (const cameraActionButton of openBaseLightingButtons)
  cameraActionButton.addEventListener("click", saveBaseLightingEdit);
(closeBaseLightingButton?.addEventListener("click", openLightingDialog),
  saveBaseLightingButton?.addEventListener("click", confirmLightingDialog),
  resetBaseLightingButton?.addEventListener("click", () => {
    applyBaseLighting(DEFAULT_BASE_LIGHTING2);
  }),
  baseLightHeaderElement?.addEventListener("pointerdown", (viewportPointerDownEvent: any) => {
    if (viewportPointerDownEvent.button !== 0 || viewportPointerDownEvent.target.closest("button"))
      return;
    const viewportRectBox = baseLightControlsElement.getBoundingClientRect();
    appCtx.pointerDragState = {
      pointerId: viewportPointerDownEvent.pointerId,
      startX: viewportPointerDownEvent.clientX,
      startY: viewportPointerDownEvent.clientY,
      startLeft: viewportRectBox.left,
      startTop: viewportRectBox.top,
      moved: false,
    };
    try {
      baseLightHeaderElement.setPointerCapture(viewportPointerDownEvent.pointerId);
    } catch { /* 指针捕获：指针已失效（pointercancel / 元素已卸载）时规范要求抛错，忽略即可 */ }
  }),
  baseLightHeaderElement?.addEventListener("pointermove", (viewportPointerMoveEvent: any) => {
    if (!appCtx.pointerDragState || viewportPointerMoveEvent.pointerId !== appCtx.pointerDragState.pointerId)
      return;
    const viewportDragDeltaX = viewportPointerMoveEvent.clientX - appCtx.pointerDragState.startX,
      viewportDragDeltaY = viewportPointerMoveEvent.clientY - appCtx.pointerDragState.startY;
    if (!appCtx.pointerDragState.moved && Math.hypot(viewportDragDeltaX, viewportDragDeltaY) < 4) return;
    ((appCtx.pointerDragState.moved = true), viewportPointerMoveEvent.preventDefault());
    const dragViewportRectBox = baseLightControlsElement.getBoundingClientRect(),
      maxViewportLeft = Math.max(8, window.innerWidth - dragViewportRectBox.width - 8),
      maxViewportTop = Math.max(8, window.innerHeight - dragViewportRectBox.height - 8);
    ((baseLightControlsElement.style.right = "auto"),
      (baseLightControlsElement.style.left =
        clamp2(appCtx.pointerDragState.startLeft + viewportDragDeltaX, 8, maxViewportLeft) + "px"),
      (baseLightControlsElement.style.top =
        clamp2(appCtx.pointerDragState.startTop + viewportDragDeltaY, 8, maxViewportTop) + "px"));
  }));
const finishViewportDrag = (viewportPointerUpEvent: any) => {
  !appCtx.pointerDragState ||
    viewportPointerUpEvent.pointerId !== appCtx.pointerDragState.pointerId ||
    (appCtx.pointerDragState = null);
};
(baseLightHeaderElement?.addEventListener("pointerup", finishViewportDrag),
  baseLightHeaderElement?.addEventListener("pointercancel", finishViewportDrag),
  appCtx.lightPreviewWorker?.addEventListener("message", (lightingMessageEvent: any) => {
    if (lightingMessageEvent.data?.type !== "base-lighting-saved") return;
    const lightingMessageEventNormalizedBaseLighting = normalizeBaseLighting2(
      lightingMessageEvent.data.lighting,
    );
    (appCtx.studioProject && (appCtx.studioProject.baseLighting = lightingMessageEventNormalizedBaseLighting),
      applyBaseLighting(lightingMessageEventNormalizedBaseLighting));
  }),
  snapToggleButton.addEventListener("click", () => {
    (deselectAll(),
      (appCtx.studioState.settings.snapEnabled = appCtx.studioState.settings.snapEnabled === false),
      syncSnapControls(),
      updateSnapIndicator(),
      refreshStudioView(),
      markDocumentDirty());
  }),
  snapSettingsToggleButton.addEventListener("click", (settingsPanelClickEvent: any) => {
    (settingsPanelClickEvent.stopPropagation(), setSnapSettingsOpen(snapSettingsPanel.hidden));
  }),
  snapSettingsPanel.addEventListener("pointerdown", (settingsPanelPointerDownEvent: any) =>
    settingsPanelPointerDownEvent.stopPropagation(),
  ));
for (const settingsPanelPointerDownEventSnapSettingInput of snapSettingControls)
  settingsPanelPointerDownEventSnapSettingInput.addEventListener("change", () => {
    (deselectAll(),
      ((appCtx.studioState.settings as any)[settingsPanelPointerDownEventSnapSettingInput.dataset.snapSetting!] =
        settingsPanelPointerDownEventSnapSettingInput.checked),
      updateSnapIndicator(),
      refreshStudioView(),
      markDocumentDirty());
  });
(snapToleranceInput.addEventListener("input", () => {
  (snapToleranceValueElement.textContent = snapToleranceInput.value + " px"),
    syncHtmlRangeProgress2(snapToleranceInput);
}),
  snapToleranceInput.addEventListener("change", () => {
    const snapToleranceValue = clamp2(Math.round(finite2(snapToleranceInput.value, 13)), 6, 24);
    snapToleranceValue !== appCtx.studioState.settings.snapTolerance &&
      (deselectAll(),
      (appCtx.studioState.settings.snapTolerance = snapToleranceValue),
      syncSnapControls(),
      updateSnapIndicator(),
      refreshStudioView(),
      markDocumentDirty());
  }),
  finishWallButton.addEventListener("click", () => resetCameraView()),
  deleteSelectionButton.addEventListener("click", clearSelection),
  selectElement("#scale-close").addEventListener("click", () => {
    ((appCtx.measureSpan = null), scaleDialogElement.close(), refreshStudioView());
  }),
  selectElement("#scale-cancel").addEventListener("click", () => {
    ((appCtx.measureSpan = null), scaleDialogElement.close(), selectStudioTool("scale"));
  }),
  scaleFormElement.addEventListener("submit", (alignmentSubmitEvent: any) => {
    if ((alignmentSubmitEvent.preventDefault(), !appCtx.measureSpan)) return;
    const floorOffsetValue = finite2(referenceMetersInput.value, 0),
      floorReferenceDistance = distance2(appCtx.measureSpan.start, appCtx.measureSpan.end);
    if (floorOffsetValue <= 0 || floorReferenceDistance <= 0) {
      showToast("请输入有效的真实长度。", "error");
      return;
    }
    (deselectAll(),
      (appCtx.studioState.calibration = {
        pixelsPerMeter: floorReferenceDistance / floorOffsetValue,
        reference: {
          ...appCtx.measureSpan,
          meters: floorOffsetValue,
        },
      }),
      (appCtx.measureSpan = null),
      scaleDialogElement.close(),
      selectStudioTool("wall"),
      refreshScopeItems(),
      updateCameraView(),
      markDocumentDirty());
    const floorReferenceDistanceActiveFloorRecord = getActiveFloor();
    appCtx.studioProject.floors.findIndex(
      (alignmentCandidateFloor: any) =>
        alignmentCandidateFloor.id === floorReferenceDistanceActiveFloorRecord?.id,
    ) > 0 && floorReferenceDistanceActiveFloorRecord?.alignmentPending
      ? (requestAnimationFrame(() => startFloorAlign()),
        showToast("比例已标定，接下来设置上下楼层的参照点。"))
      : showToast("比例已标定，可以沿着底图连续描墙了。");
  }));
for (const doorOptionInput of [
  selectElement("#wall-height"),
  selectElement("#wall-thickness"),
  selectElement("#wall-opacity-mode"),
  selectElement("#wall-opacity"),
  selectElement("#wall-open-end-mode"),
])
  doorOptionInput.addEventListener("change", () => applyToolSetting("wall"));
for (const windowOptionInput of [
  selectElement("#window-width"),
  selectElement("#window-height"),
  selectElement("#window-sill"),
  selectElement("#window-divider"),
])
  windowOptionInput.addEventListener("change", () => applyToolSetting("window"));
for (const doorTypeOptionInput of [
  selectElement("#door-type"),
  selectElement("#door-width"),
  selectElement("#door-height"),
])
  doorTypeOptionInput.addEventListener("change", () => applyToolSetting("door"));
for (const railingOptionInput of [
  selectElement("#railing-width"),
  selectElement("#railing-height"),
])
  railingOptionInput.addEventListener("change", () => applyToolSetting("railing"));
for (const furnitureOptionInput of [
  selectElement("#airer-style"),
  selectElement("#airer-extension"),
  selectElement("#airer-preview"),
  selectElement("#fan-model-scale"),
  selectElement("#fan-model-height"),
  selectElement("#item-x"),
  selectElement("#item-y"),
  selectElement("#item-width"),
  selectElement("#item-height"),
  selectElement("#item-depth"),
  selectElement("#item-elevation"),
  selectElement("#item-rotation"),
  selectElement("#item-vertical-rotation"),
  itemStripRollInput,
])
  furnitureOptionInput.addEventListener("change", () => applyToolSetting("item"));
itemLightSourceVisibleInput.addEventListener("change", () => applyToolSetting("item"));
for (const applianceOptionInput of [
  selectElement("#label-title"),
  selectElement("#label-title-spacing"),
  selectElement("#label-subtitle"),
  selectElement("#label-subtitle-spacing"),
  selectElement("#label-line-length"),
  selectElement("#label-color"),
])
  applianceOptionInput.addEventListener("change", () => applyToolSetting("item"));
for (const courtyardOptionInput of [
  selectElement("#light-group"),
  selectElement("#light-temperature"),
  selectElement("#light-brightness"),
  selectElement("#light-range"),
  selectElement("#light-angle"),
])
  courtyardOptionInput.addEventListener("change", () => applyToolSetting("item"));
selectElement("#curtain-position").addEventListener("change", () => applyToolSetting("item"));
for (const lightingOptionInput of [
  "curtain-form",
  "curtain-track",
  "curtain-corner",
  "curtain-left-length",
  "curtain-right-length",
  "curtain-meet",
  "curtain-fabric",
  "curtain-preview",
])
  selectElement("#" + lightingOptionInput).addEventListener("change", () =>
    applyToolSetting("item"),
  );
(selectElement("#round-table-turntable").addEventListener("change", () => applyToolSetting("item")),
  selectElement("#sofa-chaise-side").addEventListener("change", () => applyToolSetting("item")));
for (const lightingOptionInputFridgeStyleInput of document.querySelectorAll(
  'input[name="fridge-style"]',
))
  lightingOptionInputFridgeStyleInput.addEventListener("change", () => applyToolSetting("item"));
(selectElement("#stair-direction").addEventListener("change", () => applyToolSetting("item")),
  selectElement("#tv-mount-style").addEventListener("change", () => applyToolSetting("item")),
  selectElement("#storage-section").addEventListener("change", () => applyToolSetting("item")),
  selectElement("#pillar-shape").addEventListener("change", () => applyToolSetting("item")),
  selectElement("#pillar-axis").addEventListener("change", () => applyToolSetting("item")),
  selectElement("#pipeline-dispenser-style").addEventListener("change", () =>
    applyToolSetting("item"),
  ),
  selectElement("#strip-axis").addEventListener("change", () => applyToolSetting("item")),
  selectElement("#mural-style").addEventListener("change", () => applyToolSetting("item")),
  selectElement("#featurewall-style").addEventListener("change", () => applyToolSetting("item")),

  materialSlotListElement.addEventListener("input", (materialColorInputEvent: any) => {
    const materialColorInput = materialColorInputEvent.target.closest("[data-material-slot-color]"),
      materialSlotRow = materialColorInput?.closest(".material-slot"),
      materialHexInput = materialSlotRow?.querySelector("[data-material-slot-hex]");
    materialHexInput &&
      materialColorInput &&
      ((materialHexInput.value = String(materialColorInput.value).toLowerCase()),
      materialHexInput.classList.remove("is-invalid"));

    const materialSurfaceRange = materialColorInputEvent.target.closest(
      "[data-material-slot-surface-key]",
    );
    if (materialSurfaceRange) {
      const materialSurfaceOutput = materialSurfaceRange
        .closest(".material-slot-surface-field")
        ?.querySelector("output");
      materialSurfaceOutput &&
        (materialSurfaceOutput.textContent = Number(materialSurfaceRange.value).toFixed(2));
      /* 拖拽时轨道上的金色段要跟着圆点走，否则读数变了、填充还停在旧位置。 */
      syncHtmlRangeProgress2(materialSurfaceRange);
    }
  }),
  materialSlotListElement.addEventListener("change", (materialSlotChangeEvent: any) => {
    const materialColorInput = materialSlotChangeEvent.target.closest(
      "[data-material-slot-color]",
    );
    if (materialColorInput) {
      setItemMaterialOverride(
        materialColorInput.dataset.materialSlotColor,
        materialColorInput.value,
      );
      return;
    }

    const materialHexInput = materialSlotChangeEvent.target.closest("[data-material-slot-hex]");
    if (materialHexInput) {
      const hexColorValue = String(materialHexInput.value).trim().toLowerCase(),
        normalizedHexValue = /^[0-9a-f]{6}$/.test(hexColorValue)
          ? "#" + hexColorValue
          : hexColorValue;
      if (!/^#[0-9a-f]{6}$/.test(normalizedHexValue)) {

        const materialRowColorInput =
          materialHexInput
            .closest(".material-slot-variant")
            ?.querySelector("[data-material-slot-color]") ||
          materialHexInput
            .closest(".material-slot")
            ?.querySelector("[data-material-slot-color]");
        (materialHexInput.classList.add("is-invalid"),
          materialRowColorInput &&
            (materialHexInput.value = String(materialRowColorInput.value).toLowerCase()));
        return;
      }
      (materialHexInput.classList.remove("is-invalid"),
        (materialHexInput.value = normalizedHexValue),
        setItemMaterialOverride(materialHexInput.dataset.materialSlotHex, normalizedHexValue));
      return;
    }
    const materialSurfaceRange = materialSlotChangeEvent.target.closest(
      "[data-material-slot-surface-key]",
    );
    materialSurfaceRange &&
      setItemMaterialSurfaceOverride(
        materialSurfaceRange.dataset.materialSlotSurfaceName,
        materialSurfaceRange.dataset.materialSlotSurfaceKey,
        Number(materialSurfaceRange.value),
      );
  }),
  materialSlotListElement.addEventListener("click", (materialSlotClickEvent: any) => {
    const materialResetButton = materialSlotClickEvent.target.closest("[data-material-slot-reset]");
    if (materialResetButton) {
      setItemMaterialOverride(materialResetButton.dataset.materialSlotReset, "");
      return;
    }
    const materialSurfaceResetButton = materialSlotClickEvent.target.closest(
      "[data-material-slot-surface-reset]",
    );
    if (materialSurfaceResetButton) {

      const surfaceResetSlotName = materialSurfaceResetButton.dataset.materialSlotSurfaceReset;
      setItemMaterialSurfaceOverride(surfaceResetSlotName, "roughness", null);
      setItemMaterialSurfaceOverride(surfaceResetSlotName, "metalness", null);
      return;
    }
    const materialSurfaceToggle = materialSlotClickEvent.target.closest(
      "[data-material-slot-surface-toggle]",
    );
    if (!materialSurfaceToggle) return;

    const surfaceToggleSlotName = materialSurfaceToggle.dataset.materialSlotSurfaceToggle;
    appCtx.expandedMaterialSurfaceSlots.has(surfaceToggleSlotName)
      ? appCtx.expandedMaterialSurfaceSlots.delete(surfaceToggleSlotName)
      : appCtx.expandedMaterialSurfaceSlots.add(surfaceToggleSlotName);
    const materialSlotRow = materialSurfaceToggle.closest(".material-slot"),
      materialSurfacePanel = materialSlotRow?.querySelector("[data-material-slot-surface]"),
      isSurfaceExpanded = appCtx.expandedMaterialSurfaceSlots.has(surfaceToggleSlotName);
    (materialSurfaceToggle.setAttribute("aria-expanded", String(isSurfaceExpanded)),
      materialSurfacePanel && (materialSurfacePanel.hidden = !isSurfaceExpanded));
  }),
  materialStyleStripElement.addEventListener("click", (materialStyleClickEvent: any) => {
    const materialStyleChip = materialStyleClickEvent.target.closest("[data-material-style-id]");
    materialStyleChip &&
      setItemMaterialStyle(materialStyleChip.dataset.materialStyleId);
  }),
  materialStyleDeleteButton.addEventListener("click", () => {
    const materialEditTarget = selectedMaterialEditTarget(),
      selectedModelType = materialEditModelType(
        materialEditTarget?.record,
        materialEditTarget?.kind,
      ),
      selectedStyle = normalizeMaterialStyle(
        selectedModelType,
        materialEditTarget?.record?.materialStyle,
      );
    selectedStyle.startsWith("custom:") && deleteCustomMaterialStyle(selectedStyle);
  }),
  materialResetAllButton.addEventListener("click", () => resetItemMaterialAll()),

  materialSavePresetButton.addEventListener("click", () => {
    const materialEditTarget = selectedMaterialEditTarget(),
      modelType = materialEditModelType(materialEditTarget?.record, materialEditTarget?.kind);
    if (!materialEditTarget || !materialStyleGroupFor(modelType)) return;
    (materialPresetNameInput &&
      (materialPresetNameInput.value = materialStyleLabel(
        modelType,
        materialEditTarget.record.materialStyle,
      )),
      materialPresetDialogElement?.showModal(),
      materialPresetNameInput?.focus(),
      materialPresetNameInput?.select());
  }),
  materialPresetFormElement.addEventListener("submit", () => {
    const presetLabel = String(materialPresetNameInput?.value || "").trim();
    presetLabel && saveCurrentItemMaterialStyle(presetLabel.slice(0, 16));
  }),
  materialPresetCancelButton.addEventListener("click", () =>
    materialPresetDialogElement?.close(),
  ),
  materialApplySameButton.addEventListener("click", () => {
    const peerCount = materialSameModelPeerCount(selectedMaterialEditTarget());
    if (!peerCount) return;
    (materialApplyCountElement &&
      (materialApplyCountElement.textContent = peerCount + " 件同类物件"),
      materialApplyDialogElement?.showModal());
  }),
  materialApplyFormElement.addEventListener("submit", () => {
    materialApplyDialogElement?.close();
    applyMaterialToSameModelItems();
  }),
  materialApplyCancelButton.addEventListener("click", () => materialApplyDialogElement?.close()),
  inspectorGroupsElement.forEach((inspectorGroupElement) => {
    const inspectorGroupHeader = inspectorGroupElement.querySelector(
      ".inspector-group-header",
    );
    inspectorGroupHeader?.addEventListener("click", () =>
      toggleInspectorGroup(inspectorGroupElement),
    );
  }),
  shoeCabinetMirrorButton.addEventListener("click", () => {
    const shoeCabinetElement = getSelectedObject();
    !shoeCabinetElement ||
      appCtx.selectedItem?.kind !== "item" ||
      shoeCabinetElement.type !== "shoecabinet" ||
      (deselectAll(),
      (shoeCabinetElement.shoeCabinetMirrored = shoeCabinetElement.shoeCabinetMirrored !== true),
      refreshScopeItems(resolvePreviewScope(shoeCabinetElement)),
      markDocumentDirty());
  }),
  selectionInspectorElement.addEventListener("submit", (optionsSubmitEvent: any) =>
    optionsSubmitEvent.preventDefault(),
  ),
  selectElement("#door-hinge").addEventListener("click", () => {
    const doorElement = getSelectedObject();
    !doorElement ||
      appCtx.selectedItem?.kind !== "door" ||
      ["double", "roller-shutter", "frame-only"].includes(doorElement.doorType) ||
      (deselectAll(),
      (doorElement.hinge = doorElement.hinge === "right" ? "left" : "right"),
      refreshScopeItems("architecture"),
      markDocumentDirty());
  }),
  selectElement("#door-swing").addEventListener("click", () => {
    const swingDoorElement = getSelectedObject();
    !swingDoorElement ||
      appCtx.selectedItem?.kind !== "door" ||
      ["sliding-glass", "frame-only"].includes(swingDoorElement.doorType) ||
      (deselectAll(),
      (swingDoorElement.swing = swingDoorElement.swing === -1 ? 1 : -1),
      refreshScopeItems("architecture"),
      markDocumentDirty());
  }));
for (const rotateControlButton of document.querySelectorAll<StudioControlElement>("[data-rotate]"))
  rotateControlButton.addEventListener("click", () => {
    const rotatePlacedElement = getSelectedObject();
    if (!rotatePlacedElement || appCtx.selectedItem?.kind !== "item") return;
    const elementSnapshot = captureUndoSnapshot(),
      nextRotation = rotatePlacedElement.rotation + Number(rotateControlButton.dataset.rotate);
    if (
      ((rotatePlacedElement.rotation =
        rotatePlacedElement.type === "striplight"
          ? normalizeFullRotation2(nextRotation)
          : nextRotation % 360),
      !validateSelectionChange(elementSnapshot))
    ) {
      refreshScopeItems(resolvePreviewScope(rotatePlacedElement));
      return;
    }
    (applyPlacementChange(elementSnapshot),
      refreshScopeItems(resolvePreviewScope(rotatePlacedElement)),
      markDocumentDirty());
  });
if (
  (window.addEventListener("keydown", (windowKeyDownEvent) => {
    if (isEmbeddedStage || windowKeyDownEvent.defaultPrevented || exportDialogElement.open) return;
    if (windowKeyDownEvent.key === "Escape" && !snapSettingsPanel.hidden) {
      setSnapSettingsOpen(false);
      return;
    }
    if (
      windowKeyDownEvent.key === "Escape" &&
      drawingToolSections.some((drawingToolSection) => drawingToolSection.classList.contains("open"))
    ) {
      closeDrawingToolGroups();
      return;
    }
    const open =
      windowKeyDownEvent.target instanceof HTMLInputElement ||
      windowKeyDownEvent.target instanceof HTMLTextAreaElement ||
      scaleDialogElement.open;
    if (
      (windowKeyDownEvent.code === "Space" &&
        !open &&
        ((appCtx.isMiddleButtonPanning = true), windowKeyDownEvent.preventDefault()),
      windowKeyDownEvent.key.toLowerCase() === "s" &&
        !open &&
        ((appCtx.isSnapTemporarilyOff = true), updateSnapIndicator(), refreshStudioView()),
      open)
    )
      return;
    windowKeyDownEvent.key === "Shift" &&
      !appCtx.marqueeBox &&
      (appCtx.activeToolName === "scale" || appCtx.activeToolName === "wall") &&
      ((appCtx.isForceSnapDisabled = true), updateSnapIndicator(), refreshStudioView());
    const ctrlKey = windowKeyDownEvent.metaKey || windowKeyDownEvent.ctrlKey;
    const keyLowerStudio = windowKeyDownEvent.key.toLowerCase();
    if (ctrlKey && keyLowerStudio === "z") {
      (windowKeyDownEvent.preventDefault(),
        windowKeyDownEvent.shiftKey ? void redoStudioHistory() : void undoStudioHistory());
      return;
    }
    if (ctrlKey && keyLowerStudio === "y" && !windowKeyDownEvent.shiftKey) {
      (windowKeyDownEvent.preventDefault(), void redoStudioHistory());
      return;
    }
    if (ctrlKey && keyLowerStudio === "d") {
      (windowKeyDownEvent.preventDefault(), duplicateSelection());
      return;
    }
    // mirrorSelection / rotateSelection 虽名误导，语义实为 copy / paste
    if (ctrlKey && keyLowerStudio === "c" && !windowKeyDownEvent.shiftKey) {
      (windowKeyDownEvent.preventDefault(), mirrorSelection());
      return;
    }
    if (ctrlKey && keyLowerStudio === "v" && !windowKeyDownEvent.shiftKey) {
      (windowKeyDownEvent.preventDefault(), rotateSelection());
      return;
    }
    if (windowKeyDownEvent.key === "Delete" || windowKeyDownEvent.key === "Backspace") {
      (windowKeyDownEvent.preventDefault(), clearSelection());
      return;
    }
    const arrowKeyDirections = {
      ArrowLeft: {
        x: -1,
        y: 0,
      },
      ArrowRight: {
        x: 1,
        y: 0,
      },
      ArrowUp: {
        x: 0,
        y: -1,
      },
      ArrowDown: {
        x: 0,
        y: 1,
      },
    }[windowKeyDownEvent.key];
    if (arrowKeyDirections && !ctrlKey) {
      const selectedItemIds =
        appCtx.selectedItem?.kind === "item"
          ? [appCtx.selectedItem.id]
          : appCtx.selectedItems
              .filter((selectedHistoryEntry: any) => selectedHistoryEntry.kind === "item")
              .map((selectedItemEntry: any) => selectedItemEntry.id);
      if (selectedItemIds.length) {
        windowKeyDownEvent.preventDefault();
        const elementSnapshotBeforeMove = captureUndoSnapshot(),
          nudgeStep =
            moveStepMeters2(windowKeyDownEvent) * (getPixelsPerMeter() || 1),
          selectedItemIdSet = new Set(selectedItemIds);
        for (const movedSceneItem of appCtx.studioState.items)
          selectedItemIdSet.has(movedSceneItem.id) &&
            ((movedSceneItem.x += arrowKeyDirections.x * nudgeStep),
            (movedSceneItem.y += arrowKeyDirections.y * nudgeStep),
            selectedItemIds.length === 1 &&
              isCourtyardGate2(movedSceneItem) &&
              anchorGate2(
                movedSceneItem,
                appCtx.studioState.items,
                getPixelsPerMeter(),
                24 / appCtx.planView.zoom,
              ));
        if (!validateSelectionChange(elementSnapshotBeforeMove)) {
          refreshScopeItems(getCurrentPreviewScope());
          return;
        }
        (applyPlacementChange(elementSnapshotBeforeMove),
          refreshScopeItems(getCurrentPreviewScope()),
          markDocumentDirty());
        return;
      }
    }
    if (windowKeyDownEvent.key === "Escape") {
      if (
        appCtx.activeToolName === "courtyard-gate" ||
        appCtx.activeToolName === "flooropening" ||
        appCtx.marqueeBox?.type === "draw-flooropening"
      ) {
        if ((windowKeyDownEvent.preventDefault(), appCtx.marqueeBox?.type === "draw-flooropening")) {
          try {
            planCanvasElement.releasePointerCapture(appCtx.marqueeBox.pointerId);
          } catch { /* 指针捕获：指针已失效（pointercancel / 元素已卸载）时规范要求抛错，忽略即可 */ }
          ((appCtx.marqueeBox = null), endStudioGesture());
        }
        selectStudioTool("select");
        return;
      }
      if (appCtx.alignmentState) {
        (windowKeyDownEvent.preventDefault(), cancelFloorAlign());
        return;
      }
      (hideLightGroupActionMenu(), resetCameraView());
      const ao8 = getPreviewScopeSelection();
      (refreshSelection(), refreshStudioUi(), refreshStudioView(), setPreviewScope(ao8));
    }
  }),
  window.addEventListener("keyup", (windowKeyUpEvent) => {
    (windowKeyUpEvent.code === "Space" && (appCtx.isMiddleButtonPanning = false),
      windowKeyUpEvent.key.toLowerCase() === "s" &&
        ((appCtx.isSnapTemporarilyOff = false), updateSnapIndicator(), refreshStudioView()),
      windowKeyUpEvent.key === "Shift" &&
        ((appCtx.isForceSnapDisabled = false), updateSnapIndicator(), refreshStudioView()));
  }),
  window.addEventListener("blur", () => {
    ((appCtx.isMiddleButtonPanning = false),
      (appCtx.isForceSnapDisabled = false),
      (appCtx.isSnapTemporarilyOff = false));
  }),
  window.addEventListener("online", () => {
    ((appCtx.saveRetryDueAt = 0), studioSaveStore?.setOnline(true), scheduleAutosave(0));
  }),
  window.addEventListener("offline", () => {
    (studioSaveStore?.setOnline(false),
      window.clearTimeout(appCtx.autosaveTimeoutId),
      (appCtx.autosaveTimeoutId = null));
  }),
  window.addEventListener("pagehide", () => {
    ((appCtx.isPageSuspended = true),
      window.clearTimeout(appCtx.autosaveTimeoutId),
      (appCtx.autosaveTimeoutId = null),
      // pagehide 用 keepalive PUT 尽力而为；不乐观推进 revision，下次 GET 为准。
      !isEmbeddedStage && !appCtx.isLeavingStudio && studioSaveStore?.flushOnPageHide());
  }),
  window.addEventListener("pageshow", () => {
    ((appCtx.isPageSuspended = false), (appCtx.isLeavingStudio = false), scheduleAutosave());
  }),
  window.addEventListener("beforeunload", (beforeUnloadEvent) => {
    isEmbeddedStage ||
      appCtx.isLeavingStudio ||
      !hasUnsavedChanges() ||
      (beforeUnloadEvent.preventDefault(), (beforeUnloadEvent.returnValue = ""));
  }),
  document.addEventListener("visibilitychange", () => {
    (document.hidden || refreshSceneRender(), scheduleAutosave());
  }),
  new URLSearchParams(window.location.search).has("model-export"))
) {
  window.__homeosExportFurnitureJson = (furnitureExportType, exportOverrides: Record<string, any> = {}) => {
    const furnitureDefinition = (itemTypeCatalog as any)[furnitureExportType];
    if (!furnitureDefinition) throw new Error("Unknown furniture type: " + furnitureExportType);
    const furnitureExportItem = {
        id: "offline-export-" + furnitureExportType,
        type: furnitureExportType,
        width: furnitureDefinition.width,
        height: furnitureDefinition.height,
        depth: furnitureDefinition.depth,
        elevation: furnitureDefinition.elevation || 0,
        rotation: 0,
        curtainPosition: "split",
        roundTableTurntable: false,
        stairDirection: "right",
        shoeCabinetMirrored: false,
        tvMountStyle: "standard",
        screenEnabled: true,
        offlineModelExport: true,
        ...exportOverrides,
      },
      vu4 = buildItemModel(furnitureExportItem);
    ((vu4.name = "homeos-v1-" + furnitureExportType), vu4.updateMatrixWorld(true));
    const jSON = vu4.toJSON();
    return (disposeObjectTree(vu4), jSON);
  };
  const modelExportType = new URLSearchParams(window.location.search).get("model-export");
  if (modelExportType && modelExportType !== "1") {
    const modelExportPresets =
        {
          curtain_left: {
            type: "curtain",
            curtainPosition: "left",
          },
          curtain_right: {
            type: "curtain",
            curtainPosition: "right",
          },
          curtain_split: {
            type: "curtain",
            curtainPosition: "split",
          },
          rounddiningtable_turntable: {
            type: "rounddiningtable",
            roundTableTurntable: true,
          },
          tv_standard: {
            type: "tv",
            tvMountStyle: "standard",
          },
          tv_tabletop: {
            type: "tv",
            tvMountStyle: "tabletop",
          },
          tv_mobile: {
            type: "tv",
            tvMountStyle: "mobile",
          },
        }[modelExportType] || {},
      resolvedExportType = modelExportPresets.type || modelExportType;
    requestAnimationFrame(() => {
      try {
        const exportPayloadField = document.createElement("textarea");
        ((exportPayloadField.id = "homeos-model-export"), (exportPayloadField.hidden = true));
        const exportPayloadJson = JSON.stringify(
          window.__homeosExportFurnitureJson!(resolvedExportType, modelExportPresets),
        );
        ((exportPayloadField.value = exportPayloadJson),
          (exportPayloadField.textContent = exportPayloadJson),
          document.body.append(exportPayloadField),
          (document.documentElement.dataset.modelExportReady = modelExportType));
      } catch (exportError: any) {
        document.documentElement.dataset.modelExportError =
          exportError?.message || String(exportError);
      }
    });
  }
}
const materialTestType = new URLSearchParams(window.location.search).get("material-test");
materialTestType &&
  (async () => {
    const materialTestGroup = new ns2.Group();
    try {
      document.documentElement.dataset.materialTestStage = "loading";
      const materialTestDefinition = (itemTypeCatalog as any)[materialTestType];
      if (!materialTestDefinition || !(ALL_ITEM_MODELS2 as any)[materialTestType])
        throw new Error("Unsupported material test type: " + materialTestType);
      if (!(await ensureExternalModelLoaded(materialTestType)))
        throw new Error("Material test model failed to load: " + materialTestType);
      document.documentElement.dataset.materialTestStage = "renderer";
      for (
        let materialLoadFrameIndex = 0;
        !appCtx.threeRenderer && materialLoadFrameIndex < 120;
        materialLoadFrameIndex += 1
      )
        await ensureRenderReady();
      if (!appCtx.threeRenderer || !appCtx.threeCamera || !appCtx.threeScene)
        throw new Error("Material test renderer was not initialized");
      const materialTestResults: any = [];
      for (let materialTestIndex = 0; materialTestIndex < 3; materialTestIndex += 1) {
        const materialTestItem = {
            id: "material-test-" + materialTestType + "-" + (materialTestIndex + 1),
            type: materialTestType,
            width: materialTestDefinition.width,
            height: materialTestDefinition.height,
            depth: materialTestDefinition.depth,
            elevation: 0,
            rotation: 0,
          },
          materialTestNode = new ns2.Group();
        if (!applyItemOptimization(materialTestNode, materialTestItem))
          throw new Error("Material test model was not mounted: " + materialTestType);
        (materialTestNode.traverse((materialTestMesh: any) => {
          if (!materialTestMesh.isMesh) return;
          const meshMaterialList = Array.isArray(materialTestMesh.material)
            ? materialTestMesh.material
            : [materialTestMesh.material];
          materialTestResults.push(...meshMaterialList.filter(Boolean));
        }),
          materialTestGroup.add(materialTestNode));
      }
      ((document.documentElement.dataset.materialTestStage = "compiling"),
        appCtx.threeRenderer.compile(materialTestGroup, appCtx.threeCamera, appCtx.threeScene));
      const size3 = new Set(materialTestResults).size;
      for (
        let materialWaitFrameIndex = 0;
        materialWaitFrameIndex < 600;
        materialWaitFrameIndex += 1
      ) {
        const modelLoadState5 = externalModelRegistry.modelLoadState();
        if (modelLoadState5.active === 0 && modelLoadState5.queued === 0) break;
        await ensureRenderReady();
      }
      const modelLoadState6 = externalModelRegistry.modelLoadState(),
        materialTestStats = {
          models: 3,
          slots: materialTestResults.length,
          unique: size3,
          shared: materialTestResults.length - size3,
          cacheMaterials: modelLoadState6.materials,
          cacheReuses: modelLoadState6.materialReuses,
        };
      document.documentElement.dataset.materialTestStats = JSON.stringify(materialTestStats);
      const materialTestStatusElement = document.createElement("output");
      ((materialTestStatusElement.id = "homeos-material-test-output"),
        materialTestStatusElement.setAttribute("aria-live", "polite"),
        (materialTestStatusElement.textContent =
          "材质测试 " +
          materialTestType +
          "：" +
          materialTestStats.models +
          " 个模型，" +
          materialTestStats.slots +
          " 个材质槽，" +
          materialTestStats.unique +
          " 种唯一材质，" +
          materialTestStats.shared +
          " 个槽复用；当前缓存 " +
          materialTestStats.cacheMaterials +
          " 种，累计复用 " +
          materialTestStats.cacheReuses +
          " 次。"),
        document.body.append(materialTestStatusElement),
        (document.documentElement.dataset.materialTestReady = materialTestType),
        (document.documentElement.dataset.materialTestStage = "ready"));
    } catch (materialTestError: any) {
      ((document.documentElement.dataset.materialTestError =
        materialTestError?.message || String(materialTestError)),
        (document.documentElement.dataset.materialTestStage = "error"));
    } finally {
      disposeObjectTree(materialTestGroup);
    }
  })();
const instanceTestType = new URLSearchParams(window.location.search).get("instance-test");
if (instanceTestType) {
  const instanceTestGroup = new ns2.Group(),
    instanceTestGeometry = new ns2.BoxGeometry(0.5, 0.86, 0.5);
  try {
    if (instanceTestTypeSet.has(instanceTestType))
      throw new Error("Unsupported instance test type: " + instanceTestType);
    const instanceTestEntries: any[] = [];
    for (let instanceTestIndex = 0; instanceTestIndex < 3; instanceTestIndex += 1) {
      const instanceTestItem = {
          id: "instance-test-" + instanceTestType + "-" + (instanceTestIndex + 1),
          type: instanceTestType,
        },
        instanceTestItemGroup = new ns2.Group(),
        instanceTestMesh = new ns2.Mesh(
          instanceTestGeometry,
          new ns2.MeshStandardMaterial({
            color: defaultViewSettings.furniture,
            roughness: 0.72,
          }),
        );
      ((instanceTestMesh.position.y = 0.43),
        (instanceTestMesh.userData.externalModelSharedGeometry = true),
        (instanceTestItemGroup.position.x = instanceTestIndex * 0.9),
        (instanceTestItemGroup.rotation.y = ns2.MathUtils.degToRad(instanceTestIndex * 30)),
        instanceTestItemGroup.add(instanceTestMesh),
        instanceTestGroup.add(instanceTestItemGroup),
        instanceTestEntries.push({
          item: instanceTestItem,
          group: instanceTestItemGroup,
        }));
    }
    const instanceTestStats = batchSharedMeshes(instanceTestGroup, instanceTestEntries);
    ((document.documentElement.dataset.instanceTestStats = JSON.stringify(instanceTestStats)),
      (document.documentElement.dataset.instanceTestReady = instanceTestType));
  } catch (instanceTestError: any) {
    document.documentElement.dataset.instanceTestError =
      instanceTestError?.message || String(instanceTestError);
  } finally {
    (disposeObjectTree(instanceTestGroup), instanceTestGeometry.dispose());
  }
}
(new ResizeObserver(resizePlanStage).observe(planStageElement),
  initializeStudioSelects2(),
  initializeNumberInputs2(),
  syncBaseLightingControls());
function runStudioRenderLoop(): any {
  return runStudioRenderLoopImpl(renderLoopDeps());
}
function renderLoopDeps(): StudioRenderDeps {
  return {
    appCtx,
    get interactionBatches() { return interactionBatches; },
    set interactionBatches(value: any) { interactionBatches = value; },
    get shouldForceEffectFrame() { return shouldForceEffectFrame; },
    set shouldForceEffectFrame(value: any) { shouldForceEffectFrame = value; },
    get studioReflectionDetailMode() { return studioReflectionDetailMode; },
    set studioReflectionDetailMode(value: any) { studioReflectionDetailMode = value; },
    effectCache,
    stageLoadTiming,
    applyBaseLighting,
    applyCameraFocalLength,
    applyLoadedDraft,
    applyOrthoFrame,
    areLightsEnabled,
    assetLoaderState,
    buildLightCacheMap,
    cameraSettings,
    canBuildScene,
    collectLampEntries,
    composeLightGroupKey,
    computeCourtyardBounds,
    computeRenderPixelRatio,
    computeSceneBounds,
    computeSceneExtent,
    computeVisibleHeight,
    createOrbitControls,
    currentSceneSyncSinceKey,
    diagnosticsState,
    disposeObjectTree,
    emitRuntimeDiagnostic,
    ensureLightCache,
    finishModelLoad,
    flushSceneSyncRuntime,
    geometryCacheHandle,
    getActiveFloor,
    getCameraFocalLength,
    getCameraMode,
    getCameraTopRotation,
    getCameraView,
    getPreviewFloorMode,
    handleOrbitChange,
    handleOrbitEnd,
    handleOrbitStart,
    isEmbedStageMode,
    isEmbeddedStage,
    isPerformanceDiagnostics,
    isRenderStatsTest,
    measureFloorSwitchPhase,
    modelPresentationState,
    planToWorldPoint,
    preloadDefaultModels,
    previewLightCacheCanvasElement,
    rebuildFloorLayers,
    recordFloorSwitchTick,
    refreshAfterSceneSyncOutcome,
    refreshFloorControls,
    refreshSceneRender,
    get refreshSceneSyncLightingDerived() { return refreshSceneSyncLightingDerived; },
    set refreshSceneSyncLightingDerived(value: any) { refreshSceneSyncLightingDerived = value; },
    rememberSceneSyncKey,
    renderStudioFrame,
    requestSceneRebuild,
    requestSceneRender,
    requestStudioRender,
    resetFrameSamples,
    resizeStudioRenderer,
    resolveFrameSize,
    restoreLightVisibility,
    restorePreviewAfterFade,
    scheduleLightPrecompile,
    scheduleStudioRender,
    selectElement,
    setCameraMode,
    setCameraView,
    setFadeOverlay,
    setPreviewFloor,
    setupSceneShadows,
    studioDocumentDeps,
    studioSceneSyncController,
    syncFloorGroups,
    updateCameraPlanes,
    updateCameraView,
    updateFloorPreviewButtons,
    updateShadowState,
    waitForSceneReady,
    waitForSceneRevision,
    waitForStageReady,
  };
}

startupStudio(studioBootDeps());

    registerStudioCommandHandler((command) => {
    switch (command.type) {
      case "undo":
        void undoStudioHistory();
        break;
      case "redo":
        void redoStudioHistory();
        break;
      case "delete":
        clearSelection();
        break;
      case "copy":
        mirrorSelection();
        break;
      case "paste":
        rotateSelection();
        break;
      case "setTool":
        selectStudioTool(command.tool);
        break;
      case "setWorkflowStep":
        jumpWorkflowStep(command.step);
        break;
      case "setPlanFocus":
        document.querySelector(".studio-chrome-root")?.classList.toggle(
          "sc-shell--plan-focus",
          !!command.focus,
        );
        patchStudioFacadeState({ planFocus: !!command.focus });
        window.dispatchEvent(new Event("resize"));
        break;
      case "setLibraryCollapsed":
        document.querySelector(".studio-chrome-root")?.classList.toggle(
          "sc-shell--library-rail",
          !!command.collapsed,
        );
        patchStudioFacadeState({ libraryCollapsed: !!command.collapsed });
        window.dispatchEvent(new Event("resize"));
        break;
      default:
        break;
    }
  });
  refreshStepChecklist(appCtx);
  syncStudioHistoryFacade();

  // ── 显式回收：需要访问引导体内作用域的资源 ──────────────────────────────
  return () => {
    registerStudioCommandHandler(null);
    // SPA 内路由不会触发 pagehide / beforeunload（那是整页导航的路径），所以在拆场景之前
    // 尽力提交一次未保存修改；「不保存并退出」（isLeavingStudio）时按用户意愿跳过。
    if (!isEmbeddedStage && !appCtx.isLeavingStudio && hasUnsavedChanges()) {
      try {
        void flushAutosave()
      } catch { /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */ }
    }
    // 灯光渲染缓存写入器（嵌入式 stage 的 WebSocket 通道）
    try {
      renderCacheWriter?.close?.()
    } catch { /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */ }
    // 渲染循环：取消当前长任务（其内部会摘掉 pagehide/pointerdown/wheel 与控制器监听）
    try {
      appCtx.activeLongTask?.cancel?.()
    } catch { /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */ }
    appCtx.activeLongTask = null
    if (appCtx.renderLoopFrameId) cancelAnimationFrame(appCtx.renderLoopFrameId)
    appCtx.renderLoopFrameId = 0
    window.clearTimeout(appCtx.renderLoopTimeoutId)
    window.clearTimeout(appCtx.pointerReleaseTimeoutId)
    window.clearTimeout(appCtx.exportPreviewTimeoutId)
    window.clearTimeout(appCtx.previewShieldTimeoutId)
    window.clearTimeout(appCtx.modelLoadTimeoutId)
    // 尺寸观察者与 three.js 资源
    try {
      appCtx.resizeObserverInstance?.disconnect?.()
    } catch { /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */ }
    try {
      appCtx.lightPreviewWorker?.close?.()
    } catch { /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */ }
    try {
      appCtx.lightPrecompileController?.dispose?.()
    } catch { /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */ }
    try {
      appCtx.backgroundController?.dispose?.()
    } catch { /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */ }
    try {
      appCtx.lightingScheduler?.dispose?.()
    } catch { /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */ }
    try {
      planPainter?.dispose?.()
    } catch { /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */ }
    try {
      (interactionBatches?.dispose?.(), (interactionBatches = null))
    } catch { /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */ }
    try {
      (effectCache?.dispose?.(), (effectCache = null))
    } catch { /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */ }
    try {
      (previewResources?.release?.(), (previewResources = null))
    } catch { /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */ }
    // 模块级状态声明在引导函数之外（跨次引导存活），这里复位到声明时的默认值，
    // 避免下一次进入 /3d-studio 时带着上一次的画笔/围栏选择与渲染缓存。
    planPainter = null
    gardenGateItemType = "garden-gate"
    gardenGateSnapCandidate = null
    shouldForceEffectFrame = false
    shouldTrimSharedGeometry = false
    try {
      appCtx.orbitControls?.dispose?.()
    } catch { /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */ }
    try {
      appCtx.threeRenderer?.dispose?.()
    } catch { /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */ }
    try {
      appCtx.threeRenderer?.forceContextLoss?.()
    } catch { /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */ }
    appCtx.threeRenderer = null
    appCtx.threeScene = null
    appCtx.threeCamera = null
    appCtx.orbitControls = null
    appCtx.sceneRootNode = null
    // 文档级残留（嵌入式 stage 的 body 类与诊断用 dataset）
    document.body.classList.remove('auto-diagram-embedded')
    document.documentElement.classList.remove('list-drag-active')
    const documentDataset = document.documentElement.dataset
    for (const datasetKey of [
      'lightRenderCache',
      'renderStatsTest',
      'performanceDiagnostics',
      'modelExportReady',
      'modelExportError',
      'materialTestStage',
      'materialTestStats',
      'materialTestReady',
      'materialTestError',
      'instanceTestStats',
      'instanceTestReady',
      'instanceTestError',
      'effectCacheStats',
      'interactionBatchStats',
      'shadowReceiverTrial',
    ]) {
      delete documentDataset[datasetKey]
    }
    // 挂在 window 上的内部契约（`__homeosStudioModuleVersion` 是模块求值期写入的
    // 版本标记，不随本次引导产生，因此这里不动它）。
    const windowContract: any = window
    delete windowContract.__homeosWallRuntimeProfile
    delete windowContract.__homeosDeferExternalModel
    delete windowContract.__homeosReleasingDeferredModels
    delete windowContract.__homeosExportFurnitureJson
    delete windowContract.externalModelLoadsDeferred
  };
  });

  disposeActiveStudio = async () => {
    try {
      // SPA teardown 前置：可等待地落盘一次（不丢未保存改动）；失败不阻塞回收。
      await flushActiveStudioSave?.();
    } finally {
      try {
        innerCleanup?.();
      } finally {
        // 无论显式回收是否成功，登记过的全局监听/定时器/观察器都必须释放
        scope.dispose();
        resetStudioFacade();
      }
    }
  };
}

/** 回收户型图绘制（`/3d-studio`、`/stage`）：释放渲染器、观察者与引导期登记的全局副作用。 */
export async function teardownStudio(): Promise<void> {
  const dispose = disposeActiveStudio;
  disposeActiveStudio = null;
  const flushBeforeTeardown = flushActiveStudioSave;
  flushActiveStudioSave = null;
  await flushBeforeTeardown?.();
  await dispose?.();
}
