

























import {
  clamp as clamp2,
} from "../../../plan/geometry";


import {
  normalizeActiveExportPresetSlot as normalizeActiveExportPresetSlot2,
} from "../../../export/export-presets";






import {
  finite as finite2,
} from "../../../loaders/studio-normalization";



















import type { StudioAppContext } from "../studio-app-context";
export interface OpenExportPanelDeps { appCtx: StudioAppContext; applyExportPreset: any; captureCameraView: any; captureOverviewCamera: any; ensureSceneRendered: any; exportDialogElement: any; exportFolderNameInput: any; exportFolderQueryValue: any; exportHeightInput: any; exportLockRatioInput: any; exportPackageButton: any; exportPreviewStageElement: any; exportStatusElement: any; exportWidthInput: any; floorSelectionId: any; getActiveFloor: any; getCameraFocalLength: any; getCameraMode: any; getCameraTopRotation: any; getCameraView: any; getPreviewFloorMode: any; isAutoDiagramEmbed: any; listChargingRows: any; listLightGroupRows: any; listScreenRows: any; openExportDialog: any; prepareFreeCameraCapture: any; rebuildFloorLayers: any; refreshCanvasSizeUi: any; refreshFloorControls: any; refreshSelection: any; renderExportLayers: any; renderExportPresetSlots: any; selectPreviewFloor: any; setCameraMode: any; stateViewportAspectGetCanvasSize: any; syncCanvasSizeInputs: any; updateCameraView: any; }

export function openExportPanel(deps: OpenExportPanelDeps, ) {
  const { appCtx, applyExportPreset, captureCameraView, captureOverviewCamera, ensureSceneRendered, exportDialogElement, exportFolderNameInput, exportFolderQueryValue, exportHeightInput, exportLockRatioInput, exportPackageButton, exportPreviewStageElement, exportStatusElement, exportWidthInput, floorSelectionId, getActiveFloor, getCameraFocalLength, getCameraMode, getCameraTopRotation, getCameraView, getPreviewFloorMode, isAutoDiagramEmbed, listChargingRows, listLightGroupRows, listScreenRows, openExportDialog, prepareFreeCameraCapture, rebuildFloorLayers, refreshCanvasSizeUi, refreshFloorControls, refreshSelection, renderExportLayers, renderExportPresetSlots, selectPreviewFloor, setCameraMode, stateViewportAspectGetCanvasSize, syncCanvasSizeInputs, updateCameraView } = deps;

  if (appCtx.pendingRuntimeSettings || !appCtx.threeRenderer || !appCtx.threeCamera || !appCtx.orbitControls) return;
  (window.clearTimeout(appCtx.exportPreviewTimeoutId),
    (appCtx.exportPreviewTimeoutId = null),
    (appCtx.isExportPresetDirty = false));
  const va2 = listLightGroupRows(),
    televisionEntries = listScreenRows(),
    na2 = listChargingRows();
  ((appCtx.pendingRuntimeSettings = {
    canvasParent: appCtx.threeRenderer.domElement.parentElement,
    camera: captureOverviewCamera(),
    selected: appCtx.selectedItem
      ? {
          ...appCtx.selectedItem,
        }
      : null,
    selectedMany: appCtx.selectedItems.map((selectedSceneItem: any) => ({
      ...selectedSceneItem,
    })),
    floorMode: getPreviewFloorMode(),
    selectedFloorId: appCtx.activeFloorId,
    floorCameraSettings: new Map(
      appCtx.studioProject.floors.map((floorCameraEntry: any) => [
        floorCameraEntry.id,
        {
          mode: floorCameraEntry.scene.settings.cameraMode,
          view: floorCameraEntry.scene.settings.cameraView,
          topRotation: floorCameraEntry.scene.settings.cameraTopRotation,
          focalLength: floorCameraEntry.scene.settings.cameraFocalLength,
        },
      ]),
    ),
    combinedCameraSettings: {
      ...appCtx.studioProject.combinedCameraSettings,
    },
    groupStates: new Map(
      va2.map(({ key: groupStateKey, group: groupStateGroup }: any) => [
        groupStateKey,
        groupStateGroup.enabled,
      ]),
    ),
    tvStates: new Map(
      televisionEntries.map(({ key: televisionStateKey, item: televisionStateItem }: any) => [
        televisionStateKey,
        televisionStateItem.screenEnabled !== false,
      ]),
    ),
    carChargingStates: new Map(
      na2.map(({ key: chargingStateKey, item: chargingStateItem }: any) => [
        chargingStateKey,
        chargingStateItem.chargingEnabled === true,
      ]),
    ),
    cameraSettings: {
      mode: getCameraMode(),
      view: getCameraView(),
      topRotation: getCameraTopRotation(),
      focalLength: getCameraFocalLength(),
    },
    pixelRatio: appCtx.threeRenderer.getPixelRatio(),
  }),
    appCtx.lightPrecompileController?.setEnabled(false));
  for (const { group: disabledGroup } of va2) disabledGroup.enabled = false;
  if (
    (refreshSelection(),
    (exportStatusElement.textContent = "准备保存到 NAS"),
    exportFolderNameInput.classList.remove("invalid"),
    renderExportLayers(),
    prepareFreeCameraCapture(),
    refreshFloorControls(),
    renderExportPresetSlots(),
    (exportPackageButton.disabled = false),
    isAutoDiagramEmbed)
  ) {
    document.body.classList.add("auto-diagram-embedded");
    const uRLSearchParams = new URLSearchParams(window.location.search),
      exportWidth = clamp2(
        finite2(
          uRLSearchParams.get("dashboard-width"),
          finite2(uRLSearchParams.get("component-width"), exportWidthInput.value),
        ),
        320,
        4096,
      ),
      exportHeight = clamp2(
        finite2(
          uRLSearchParams.get("dashboard-height"),
          finite2(uRLSearchParams.get("component-height"), exportHeightInput.value),
        ),
        320,
        4096,
      );
    ((exportWidthInput.value = String(Math.round(exportWidth))),
      (exportHeightInput.value = String(Math.round(exportHeight))),
      (exportLockRatioInput.checked = true),
      exportFolderQueryValue && (exportFolderNameInput.value = exportFolderQueryValue),
      refreshCanvasSizeUi());
  }
  (exportDialogElement.showModal(), exportPreviewStageElement.append(appCtx.threeRenderer.domElement));
  const resolvedPresetSlot = normalizeActiveExportPresetSlot2(
      appCtx.studioProject.activeExportPresetSlot,
      appCtx.studioProject.exportPresets.length,
    ),
    du4 =
      resolvedPresetSlot !== null &&
      applyExportPreset(resolvedPresetSlot, {
        silent: true,
      });
  if (isAutoDiagramEmbed && floorSelectionId !== null) {
    const exportFloorMatch = appCtx.studioProject.floors.find(
        (exportFloorCandidate: any) => exportFloorCandidate.id === floorSelectionId,
      ),
      exportFloorId =
        floorSelectionId === "all" && appCtx.studioProject.floors.length > 1
          ? "all"
          : exportFloorMatch?.id || getActiveFloor()?.id || appCtx.activeFloorId;
    selectPreviewFloor(exportFloorId);
  }
  (du4 ||
    (rebuildFloorLayers(),
    captureCameraView()
      ? openExportDialog({
          silent: true,
        })
      : isAutoDiagramEmbed &&
        (setCameraMode(getCameraMode(), {
          preserveView: false,
        }),
        updateCameraView())),
    (appCtx.exportAspectRatio =
      stateViewportAspectGetCanvasSize().width / stateViewportAspectGetCanvasSize().height),
    renderExportPresetSlots(),
    syncCanvasSizeInputs(),
    ensureSceneRendered());

}
