import type { StudioAppRuntime } from "../../runtime/studio-app-runtime";
import { courtyardSurfaceRise as courtyardSurfaceRise2, sceneModelOrigin as sceneModelOrigin2 } from "../../../../plan/courtyard-drawing";
import * as ns2 from "/static/vendor/three/0.186.1/three.module.min.js";
import { RoundedBoxGeometry as RoundedBoxGeometry2 } from "/static/vendor/three/0.186.1/RoundedBoxGeometry.js";
import { clamp as clamp2 } from "../../../../plan/geometry";
import { buildLightDeltaPixels as buildLightDeltaPixels2, EXPORT_IMAGE_EXTENSION as EXPORT_IMAGE_EXTENSION2, EXPORT_IMAGE_MIME_TYPE as EXPORT_IMAGE_MIME_TYPE2, EXPORT_IMAGE_QUALITY as EXPORT_IMAGE_QUALITY2 } from "../../../../export/export-utils";
import { MAX_EXPORT_PRESET_COUNT as MAX_EXPORT_PRESET_COUNT2, normalizeActiveExportPresetSlot as normalizeActiveExportPresetSlot2, normalizeExportPresetSlots as normalizeExportPresetSlots2 } from "../../../../export/export-presets";
import { syncControlValue as syncControlValue2 } from "../../../ui/ui-controls";
import { syncStudioSelect as syncStudioSelect2 } from "../../../ui/studio-widgets";
import { finite as finite2 } from "../../../../loaders/studio-normalization";
import type { ArchitectureMeshOptions, ExportImageOptions, ExportImageResult, PlanEditPreviewFlags } from "../../../types/studio-app-types";
import { collectChildMeshes } from "../../../items/studio-furniture-batching";
import { buildMaterialSignature } from "../../../items/studio-shared-mesh-records";
import { addArchitectureMesh as addArchitectureMeshCore, addWindowFrames as addWindowFramesCore } from "../../../scene/studio-box-mesh";
import { renderExportLayers as renderExportLayersCore, sanitizeExportName } from "../../../ui/studio-export-layers";
import { buildItemModel as buildItemModelCore } from "../../../items/studio-item-model";
import { drawDoor as drawDoorCore, drawCourtyardArea as drawCourtyardAreaCore } from "../../../../plan/studio-plan-item-drawing";
import { createOutlinePath as createOutlinePathCore, buildShapesWithHoles as buildShapesWithHolesCore, createSceneWallSideMaterial as createWallSideMaterialCore, createWallTopMaterial as createWallTopMaterialCore, expandPolygonOutward as expandPolygonOutwardCore, buildInteriorScene as buildInteriorSceneCore } from "../../../scene/studio-walls";

export function saveAsNewPreset(runtime: StudioAppRuntime, ) {
  if (!runtime.appCtx.pendingRuntimeSettings || runtime.appCtx.isInteractionLocked) return;
  if (
    (runtime.saveExportPreset(),
    (runtime.appCtx.studioProject.exportPresets = normalizeExportPresetSlots2(runtime.appCtx.studioProject.exportPresets)),
    runtime.appCtx.studioProject.exportPresets.length >= MAX_EXPORT_PRESET_COUNT2)
  ) {
    runtime.showToast("最多可以保存 8 个导出存档。");
    return;
  }
  const nextPresetSlotIndex = runtime.appCtx.studioProject.exportPresets.length,
    newPresetName =
      runtime.getPreviewFloorMode() === "all"
        ? "全楼"
        : runtime.getActiveFloor()?.name || "存档 " + (nextPresetSlotIndex + 1),
    hf2 = runtime.makeUniquePresetName(newPresetName + "视角"),
    lastExportPreset = runtime.appCtx.studioProject.exportPresets
      .slice(0, nextPresetSlotIndex)
      .reverse()
      .find(Boolean),
    vf2 = runtime.buildExportPreset({
      name: hf2,
    });
  (lastExportPreset &&
    ((vf2!.width = lastExportPreset.width),
    (vf2!.height = lastExportPreset.height),
    (vf2!.lockRatio = lastExportPreset.lockRatio)),
    runtime.appCtx.studioProject.exportPresets.push(vf2),
    (runtime.appCtx.studioProject.activeExportPresetSlot = nextPresetSlotIndex),
    (runtime.appCtx.isExportPresetDirty = false),
    runtime.renderExportPresetSlots(),
    runtime.markDocumentDirty(),
    (runtime.exportStatusElement.textContent = "已新增“" + hf2 + "”"),
    runtime.showToast("已新增“" + hf2 + "”，可以继续调整楼层和视角。", "success"));
}

export function closePresetRenameDialog(runtime: StudioAppRuntime, ) {
  runtime.exportPresetRenameDialogElement.open && runtime.exportPresetRenameDialogElement.close();
}

export function openPresetRenameDialog(runtime: StudioAppRuntime, ) {
  if (runtime.appCtx.isInteractionLocked) return;
  runtime.saveExportPreset();
  const renamePresetSlots = normalizeExportPresetSlots2(runtime.appCtx.studioProject?.exportPresets),
    renameActiveSlot = normalizeActiveExportPresetSlot2(
      runtime.appCtx.studioProject?.activeExportPresetSlot,
      renamePresetSlots.length,
    );
  renamePresetSlots[renameActiveSlot] &&
    ((runtime.exportPresetRenameInputElement.value = runtime.formatPresetLabel(
      renamePresetSlots[renameActiveSlot],
      renameActiveSlot,
    )),
    runtime.exportPresetRenameDialogElement.showModal(),
    requestAnimationFrame(() => runtime.exportPresetRenameInputElement.select()));
}

export function closePresetDeleteDialog(runtime: StudioAppRuntime, ) {
  runtime.exportPresetDeleteDialogElement.open && runtime.exportPresetDeleteDialogElement.close();
}

export function openPresetDeleteDialog(runtime: StudioAppRuntime, ) {
  if (runtime.appCtx.isInteractionLocked) return;
  const deletePresetSlots = normalizeExportPresetSlots2(runtime.appCtx.studioProject?.exportPresets);
  if (deletePresetSlots.length <= 1) return;
  const deleteActiveSlot = normalizeActiveExportPresetSlot2(
    runtime.appCtx.studioProject?.activeExportPresetSlot,
    deletePresetSlots.length,
  );
  ((runtime.exportPresetDeleteNameElement.textContent = runtime.formatPresetLabel(
    deletePresetSlots[deleteActiveSlot],
    deleteActiveSlot,
  )),
    runtime.exportPresetDeleteDialogElement.showModal());
}

export function confirmDeletePreset(runtime: StudioAppRuntime, ) {
  const updatedPresetSlots = normalizeExportPresetSlots2(runtime.appCtx.studioProject?.exportPresets);
  if (updatedPresetSlots.length <= 1) return;
  const deletedSlotIndex = normalizeActiveExportPresetSlot2(
      runtime.appCtx.studioProject?.activeExportPresetSlot,
      updatedPresetSlots.length,
    ),
    ja2 = runtime.formatPresetLabel(updatedPresetSlots[deletedSlotIndex], deletedSlotIndex);
  (window.clearTimeout(runtime.appCtx.exportPreviewTimeoutId),
    (runtime.appCtx.exportPreviewTimeoutId = null),
    (runtime.appCtx.isExportPresetDirty = false),
    updatedPresetSlots.splice(deletedSlotIndex, 1),
    (runtime.appCtx.studioProject.exportPresets = updatedPresetSlots),
    (runtime.appCtx.studioProject.activeExportPresetSlot = Math.min(
      deletedSlotIndex,
      updatedPresetSlots.length - 1,
    )),
    runtime.closePresetDeleteDialog());
  const du3 = runtime.applyExportPreset(runtime.appCtx.studioProject.activeExportPresetSlot, {
    silent: true,
  });
  (runtime.renderExportPresetSlots(),
    runtime.markDocumentDirty(),
    (runtime.exportStatusElement.textContent = du3 ? "已切换到相邻存档" : "当前存档尚未设置"),
    runtime.showToast("已删除“" + ja2 + "”，楼层和户型未受影响。", "success"));
}

export function ensureSceneRendered(runtime: StudioAppRuntime, renderAttempt = 0) {
  !runtime.isAutoDiagramEmbed ||
    !runtime.autoDiagramComponentId ||
    window.parent === window ||
    requestAnimationFrame(() => {
      if (
        !runtime.appCtx.pendingRuntimeSettings ||
        !runtime.appCtx.threeRenderer ||
        !runtime.appCtx.threeScene ||
        !runtime.appCtx.threeCamera ||
        !runtime.appCtx.orbitControls
      )
        return;
      (runtime.resizeRenderCanvas(), runtime.appCtx.sceneRootNode?.children?.length || runtime.rebuildFloorLayers());
      const hasUsableViewport =
          runtime.exportPreviewStageElement.clientWidth > 1 && runtime.exportPreviewStageElement.clientHeight > 1,
        hasSceneChildren = !!runtime.appCtx.sceneRootNode?.children?.length;
      let isSceneReady = false;
      if (hasUsableViewport && hasSceneChildren) {
        (runtime.refreshSceneRender({
          shadows: true,
        }),
          runtime.appCtx.orbitControls.update());
        for (let renderRetryIndex = 0; renderRetryIndex < 2; renderRetryIndex += 1)
          runtime.appCtx.threeRenderer.render(runtime.appCtx.threeScene, runtime.appCtx.threeCamera);
        const render2 = runtime.appCtx.threeRenderer.info.render;
        ((isSceneReady = render2.calls > 0 && render2.triangles > 0),
          (runtime.appCtx.threeRenderer.domElement.dataset.renderCalls = String(render2.calls)),
          (runtime.appCtx.threeRenderer.domElement.dataset.renderTriangles = String(render2.triangles)),
          (runtime.appCtx.threeRenderer.domElement.dataset.renderLines = String(render2.lines)),
          (runtime.appCtx.isLightCacheReady = false),
          (runtime.appCtx.isLightCachePending = isSceneReady),
          runtime.updateRenderStatsHud());
      }
      if (!isSceneReady && renderAttempt < 7) {
        runtime.ensureSceneRendered(renderAttempt + 1);
        return;
      }
      if (!isSceneReady) {
        window.parent.postMessage(
          {
            type: "homeos-floorplan-auto-diagram-error",
            componentId: runtime.autoDiagramComponentId,
            message: "3D户型首帧渲染失败，请刷新后重试。",
          },
          window.location.origin,
        );
        return;
      }
      window.parent.postMessage(
        {
          type: "homeos-floorplan-auto-diagram-ready",
          componentId: runtime.autoDiagramComponentId,
          floors: runtime.appCtx.studioProject.floors.map((exportFloorEntry: any) => ({
            id: exportFloorEntry.id,
            name: exportFloorEntry.name,
          })),
          floorSelection:
            runtime.getPreviewFloorMode() === "all" ? "all" : runtime.getActiveFloor()?.id || runtime.appCtx.activeFloorId,
        },
        window.location.origin,
      );
    });
}

export function prepareFreeCameraCapture(runtime: StudioAppRuntime, ) {
  const isExportAllFloors = runtime.getPreviewFloorMode() === "all",
    captureFloorId = isExportAllFloors ? "all" : runtime.getActiveFloor()?.id || runtime.appCtx.activeFloorId;
  (runtime.exportFloorSelectElement.replaceChildren(
    ...runtime.appCtx.studioProject.floors.map((captureFloor: any) => {
      const floorOptionElement = document.createElement("option");
      return (
        (floorOptionElement.value = captureFloor.id),
        (floorOptionElement.textContent = captureFloor.name),
        floorOptionElement
      );
    }),
    ...(runtime.appCtx.studioProject.floors.length > 1
      ? [
          Object.assign(document.createElement("option"), {
            value: "all",
            textContent: "全楼合并",
          }),
        ]
      : []),
  ),
    (runtime.exportFloorSelectElement.value = captureFloorId),
    syncStudioSelect2(runtime.exportFloorSelectElement),
    (runtime.exportFloorGapControlElement.hidden = !isExportAllFloors || runtime.appCtx.studioProject.floors.length <= 1),
    syncControlValue2(runtime.exportFloorGapInput, finite2(runtime.appCtx.studioProject.exportFloorGap, 3).toFixed(1)),
    runtime.refreshFloorControls());
}

export function selectPreviewFloor(runtime: StudioAppRuntime, selectedFloorId: any) {
  if (!runtime.appCtx.pendingRuntimeSettings || runtime.appCtx.isInteractionLocked) return;
  const isAllFloorsPreview = selectedFloorId === "all" && runtime.appCtx.studioProject.floors.length > 1;
  if (!isAllFloorsPreview) {
    const selectedFloor = runtime.appCtx.studioProject.floors.find(
      (floorCandidate: any) => floorCandidate.id === selectedFloorId,
    );
    if (!selectedFloor) return;
    ((runtime.appCtx.pendingRuntimeSettings.selectedFloorId = selectedFloor.id),
      (runtime.appCtx.studioState = selectedFloor.scene));
  }
  ((runtime.appCtx.studioProject.previewFloorMode = isAllFloorsPreview ? "all" : "active"),
    runtime.prepareFreeCameraCapture(),
    runtime.updateFloorPreviewButtons(),
    runtime.refreshFloorControls(),
    runtime.rebuildFloorLayers(),
    runtime.captureCameraView()
      ? runtime.openExportDialog({
          silent: true,
        })
      : (runtime.setCameraMode(runtime.getCameraMode(), {
          preserveView: false,
        }),
        runtime.updateCameraView()),
    runtime.renderExportLayers(),
    (runtime.exportStatusElement.textContent =
      runtime.getPreviewFloorMode() === "all"
        ? "正在构图：全楼合并"
        : "正在构图：" + (runtime.getActiveFloor()?.name || "当前层")),
    runtime.syncCanvasSizeInputs());
}

export function collectSelectedExportFiles(runtime: StudioAppRuntime, ) {
  return new Set(
    [...runtime.exportDialogElement.querySelectorAll("input[data-export-file]:checked")].map(
      (exportFileCheckbox) => exportFileCheckbox.dataset.exportFile,
    ),
  );
}

export function restorePreviewAfterExport(runtime: StudioAppRuntime, ) {
  if (!runtime.appCtx.pendingRuntimeSettings || runtime.appCtx.isInteractionLocked) return;
  (runtime.openLightingDialog(),
    runtime.baseLightControlsElement?.parentElement !== document.body &&
      document.body.append(runtime.baseLightControlsElement),
    runtime.saveExportPreset());
  const exportSessionState = runtime.appCtx.pendingRuntimeSettings;
  for (const sessionFloor of runtime.appCtx.studioProject.floors) {
    const floorCameraSettings = exportSessionState.floorCameraSettings.get(sessionFloor.id);
    floorCameraSettings &&
      ((sessionFloor.scene.settings.cameraMode = floorCameraSettings.mode),
      (sessionFloor.scene.settings.cameraView = floorCameraSettings.view),
      (sessionFloor.scene.settings.cameraTopRotation = floorCameraSettings.topRotation),
      (sessionFloor.scene.settings.cameraFocalLength = floorCameraSettings.focalLength));
  }
  ((runtime.appCtx.studioProject.combinedCameraSettings = {
    ...exportSessionState.combinedCameraSettings,
  }),
    (runtime.appCtx.pendingRuntimeSettings = null),
    (runtime.appCtx.studioProject.previewFloorMode = exportSessionState.floorMode),
    (runtime.appCtx.studioState =
      runtime.appCtx.studioProject.floors.find(
        (sessionFloorCandidate: any) => sessionFloorCandidate.id === runtime.appCtx.activeFloorId,
      )?.scene || runtime.appCtx.studioProject.floors[0].scene),
    exportSessionState.canvasParent?.append(runtime.appCtx.threeRenderer.domElement));
  const ut5 = runtime.cameraSettings();
  ((ut5.cameraMode = exportSessionState.cameraSettings.mode),
    (ut5.cameraView = exportSessionState.cameraSettings.view),
    (ut5.cameraTopRotation = exportSessionState.cameraSettings.topRotation),
    (ut5.cameraFocalLength = exportSessionState.cameraSettings.focalLength),
    runtime.applyCameraState(exportSessionState.camera, exportSessionState.camera.viewportAspect),
    runtime.syncCameraModeControls(exportSessionState.cameraSettings.mode),
    runtime.syncCameraViewControls(exportSessionState.cameraSettings.view),
    (runtime.appCtx.selectedItem = exportSessionState.selected),
    (runtime.appCtx.selectedItems = exportSessionState.selectedMany));
  for (const { key: sessionGroupKey, group: sessionGroup } of runtime.listLightGroupRows())
    exportSessionState.groupStates.has(sessionGroupKey) &&
      (sessionGroup.enabled = exportSessionState.groupStates.get(sessionGroupKey));
  for (const { key: sessionTelevisionKey, item: sessionTelevisionItem } of runtime.listScreenRows())
    exportSessionState.tvStates.has(sessionTelevisionKey) &&
      (sessionTelevisionItem.screenEnabled = exportSessionState.tvStates.get(sessionTelevisionKey));
  for (const { key: sessionChargingKey, item: sessionChargingItem } of runtime.listChargingRows())
    exportSessionState.carChargingStates.has(sessionChargingKey) &&
      (sessionChargingItem.chargingEnabled =
        exportSessionState.carChargingStates.get(sessionChargingKey));
  (runtime.appCtx.threeRenderer.setPixelRatio(exportSessionState.pixelRatio),
    runtime.rebuildFloorLayers(),
    runtime.requestStudioRender(),
    runtime.resizeStudioRenderer(),
    runtime.refreshStudioUi(),
    runtime.refreshStudioView());
}

export function setExportBusy(runtime: StudioAppRuntime, isBusy: any) {
  runtime.appCtx.isInteractionLocked = isBusy;
  const exportBusyNoticeElement = runtime.selectElement("#export-busy-notice");
  (exportBusyNoticeElement && (exportBusyNoticeElement.hidden = !isBusy),
    (runtime.exportPackageButton.disabled = isBusy),
    (runtime.selectElement("#export-close").disabled = isBusy));
  for (const exportControl of runtime.exportDialogElement.querySelectorAll("input, button"))
    exportControl.id !== "export-close" &&
      exportControl.id !== "export-package" &&
      (exportControl.disabled = isBusy);
  (isBusy || (runtime.refreshFloorControls(), runtime.renderExportPresetSlots()),
    (runtime.appCtx.orbitControls.enabled = !isBusy));
}

export function prepareExportRender(runtime: StudioAppRuntime, ) {
  runtime.appCtx.orbitControls.update();
  for (let exportRenderPassIndex = 0; exportRenderPassIndex < 3; exportRenderPassIndex += 1)
    runtime.appCtx.threeRenderer.render(runtime.appCtx.threeScene, runtime.appCtx.threeCamera);
}

export function canvasToBlob(runtime: StudioAppRuntime, blobCanvas: any): Promise<Blob> {
  return new Promise((resolveBlob, rejectBlob) => {
    blobCanvas.toBlob(
      (resultBlob: any) => {
        resultBlob ? resolveBlob(resultBlob) : rejectBlob(new Error("无法生成导出图像。"));
      },
      EXPORT_IMAGE_MIME_TYPE2,
      EXPORT_IMAGE_QUALITY2,
    );
  });
}

export async function renderExportImage(runtime: StudioAppRuntime, 
  imageWidth: any,
  imageHeight: any,
  renderImageOptions: ExportImageOptions = {},
): Promise<ExportImageResult> {
  runtime.prepareExportRender();
  const exportCanvas = document.createElement("canvas");
  ((exportCanvas.width = imageWidth), (exportCanvas.height = imageHeight));
  const exportCanvasPainter = exportCanvas.getContext("2d", {
    willReadFrequently: renderImageOptions.pixels === true,
  });
  if (!exportCanvasPainter) throw new Error("当前浏览器无法创建导出画布。");
  exportCanvasPainter.drawImage(runtime.appCtx.threeRenderer.domElement, 0, 0, imageWidth, imageHeight);
  const exportImageResult: ExportImageResult = {};
  return (
    renderImageOptions.pixels &&
      (exportImageResult.imageData = exportCanvasPainter.getImageData(
        0,
        0,
        imageWidth,
        imageHeight,
      )),
    renderImageOptions.blob && (exportImageResult.blob = await runtime.canvasToBlob(exportCanvas)),
    exportImageResult
  );
}

export async function renderLightDeltaLayer(runtime: StudioAppRuntime, basePixelBuffer: any, litPixelBuffer: any) {
  const shadowDeltaCanvas = document.createElement("canvas");
  ((shadowDeltaCanvas.width = basePixelBuffer.width),
    (shadowDeltaCanvas.height = basePixelBuffer.height));
  const shadowDeltaPainter = shadowDeltaCanvas.getContext("2d");
  if (!shadowDeltaPainter) throw new Error("当前浏览器无法创建透明灯光层。");
  const deltaPixels = buildLightDeltaPixels2(basePixelBuffer.data, litPixelBuffer.data);
  return (
    shadowDeltaPainter.putImageData(
      new ImageData(deltaPixels, basePixelBuffer.width, basePixelBuffer.height),
      0,
      0,
    ),
    runtime.canvasToBlob(shadowDeltaCanvas)
  );
}

export async function renderLightShadowLayer(runtime: StudioAppRuntime, 
  shadowBasePixels: any,
  shadowLightGroup: any,
  shadowWidth: any,
  shadowHeight: any,
  shadowLightIndex: any,
  shadowLightTotal: any,
) {
  const lightShadowCanvas = document.createElement("canvas");
  ((lightShadowCanvas.width = shadowWidth), (lightShadowCanvas.height = shadowHeight));
  const lightShadowPainter = lightShadowCanvas.getContext("2d"),
    shadowMaskCanvas = document.createElement("canvas");
  ((shadowMaskCanvas.width = shadowWidth), (shadowMaskCanvas.height = shadowHeight));
  const shadowMaskPainter = shadowMaskCanvas.getContext("2d");
  if (!lightShadowPainter || !shadowMaskPainter) throw new Error("当前浏览器无法合成逐灯阴影。");
  const shadowLightList = shadowLightGroup.lights.filter(
    (shadowLightEntry: any) => finite2(shadowLightEntry.lightBrightness, 0) > 0,
  );
  try {
    for (
      let shadowLightListIndex = 0;
      shadowLightListIndex < shadowLightList.length;
      shadowLightListIndex += 1
    ) {
      const shadowLightItem = shadowLightList[shadowLightListIndex];
      ((runtime.exportStatusElement.textContent =
        "正在渲染灯组 " +
        (shadowLightIndex + 1) +
        "/" +
        shadowLightTotal +
        "：" +
        shadowLightGroup.name +
        "（" +
        (shadowLightListIndex + 1) +
        "/" +
        shadowLightList.length +
        "）"),
        (runtime.appCtx.overriddenFloorIds = new Set([shadowLightItem.id])),
        runtime.getPreviewFloorMode() === "all"
          ? runtime.rebuildFloorLayers({
              preserveLightCache: true,
            })
          : runtime.buildLightsLayer({
              preserveLightCache: true,
            }));
      const ja3 = await runtime.renderExportImage(shadowWidth, shadowHeight, {
          pixels: true,
        }),
        shadowDeltaPixels = buildLightDeltaPixels2(shadowBasePixels.data, ja3.imageData!.data);
      (shadowMaskPainter.clearRect(0, 0, shadowWidth, shadowHeight),
        shadowMaskPainter.putImageData(
          new ImageData(shadowDeltaPixels, shadowWidth, shadowHeight),
          0,
          0,
        ),
        lightShadowPainter.drawImage(shadowMaskCanvas, 0, 0),
        await runtime.ensureRenderReady());
    }
  } finally {
    runtime.appCtx.overriddenFloorIds = null;
  }
  return runtime.canvasToBlob(lightShadowCanvas);
}

export async function renderBackgroundLayer(runtime: StudioAppRuntime, 
  backgroundWidth: any,
  backgroundHeight: any,
  backgroundPixelBuffer: any = null,
) {
  const backgroundCanvas = document.createElement("canvas");
  ((backgroundCanvas.width = backgroundWidth), (backgroundCanvas.height = backgroundHeight));
  const backgroundPainter = backgroundCanvas.getContext("2d");
  if (!backgroundPainter) throw new Error("当前浏览器无法创建导出底图。");
  if (
    ((backgroundPainter.fillStyle =
      "#" + runtime.backgroundSettings().background.toString(16).padStart(6, "0")),
    backgroundPainter.fillRect(0, 0, backgroundWidth, backgroundHeight),
    backgroundPixelBuffer)
  ) {
    const backgroundPlanCanvas = document.createElement("canvas");
    ((backgroundPlanCanvas.width = backgroundWidth),
      (backgroundPlanCanvas.height = backgroundHeight));
    const backgroundPlanPainter = backgroundPlanCanvas.getContext("2d");
    if (!backgroundPlanPainter) throw new Error("当前浏览器无法合成户型底图。");
    (backgroundPlanPainter.putImageData(backgroundPixelBuffer, 0, 0),
      backgroundPainter.drawImage(backgroundPlanCanvas, 0, 0));
  }
  return runtime.canvasToBlob(backgroundCanvas);
}

export function makeUniqueFileName(runtime: StudioAppRuntime, 
  fileBaseName: any,
  fileNameIndex: any,
  usedFileNameSet: any,
  fileExtension = EXPORT_IMAGE_EXTENSION2,
) {
  const dc2 = sanitizeExportName(fileBaseName, "灯组-" + (fileNameIndex + 1)),
    replace = String(fileExtension).replace(/^\./, "");
  let fileNameSuffix = 1,
    candidateFileName = dc2 + "." + replace;
  for (; usedFileNameSet.has(candidateFileName.toLocaleLowerCase());)
    ((fileNameSuffix += 1), (candidateFileName = dc2 + "-" + fileNameSuffix + "." + replace));
  return (usedFileNameSet.add(candidateFileName.toLocaleLowerCase()), candidateFileName);
}

export function buildExportCamera(runtime: StudioAppRuntime, cameraWidth: any, cameraHeight: any) {
  const exportTargetVector = runtime.appCtx.orbitControls.target;
  return {
    mode: runtime.appCtx.threeCamera.isPerspectiveCamera ? "perspective" : "orthographic",
    position: {
      x: runtime.appCtx.threeCamera.position.x,
      y: runtime.appCtx.threeCamera.position.y,
      z: runtime.appCtx.threeCamera.position.z,
    },
    target: {
      x: exportTargetVector.x,
      y: exportTargetVector.y,
      z: exportTargetVector.z,
    },
    aspect: cameraWidth / cameraHeight,
    visibleHeight: runtime.computeVisibleHeight(runtime.appCtx.threeCamera, exportTargetVector),
    frameSize: runtime.computeOrthoFrameSize(runtime.appCtx.threeCamera, exportTargetVector),
    fov: runtime.appCtx.threeCamera.isPerspectiveCamera ? runtime.appCtx.threeCamera.fov : null,
  };
}

export function buildLightExportEntry(runtime: StudioAppRuntime, exportLightItem: any, exportLightFloor = runtime.getActiveFloor()) {
  const floorPixelsPerMeter = exportLightFloor?.scene?.calibration?.pixelsPerMeter || 1;
  return {
    id: exportLightItem.id,
    floorId: exportLightFloor?.id || null,
    type: exportLightItem.type,
    position: {
      x: exportLightItem.x / floorPixelsPerMeter,
      z: exportLightItem.y / floorPixelsPerMeter,
      elevation: runtime.floorElevationFor(exportLightFloor) + (exportLightItem.elevation || 0),
    },
    rotation: exportLightItem.rotation || 0,
    verticalRotation: exportLightItem.verticalRotation || 0,
    stripRollRotation:
      (exportLightItem.type === "striplight" && exportLightItem.stripRollRotation) || 0,
    size: {
      width: exportLightItem.width,
      depth: exportLightItem.depth,
    },
    temperature: exportLightItem.lightTemperature,
    ...(exportLightItem.lightColorRgb
      ? {
          color: exportLightItem.lightColorRgb,
        }
      : {}),
    brightness: exportLightItem.lightBrightness,
    range: exportLightItem.lightRange,
    angle: exportLightItem.lightAngle,
  };
}

export function projectItemAnchor(runtime: StudioAppRuntime, anchorItem: any, anchorFloor: any, anchorFloors = runtime.getOrderedFloorList()) {
  if (!anchorItem || !anchorFloor || !runtime.appCtx.threeCamera) return null;
  const anchorPixelsPerMeter = anchorFloor.scene?.calibration?.pixelsPerMeter || 1;
  let anchorLocalX = 0,
    anchorElevationY =
      Math.max(0, finite2(anchorItem.elevation, 0)) +
      ((anchorItem.type === "airer" ? -1 : 1) * Math.max(0.02, finite2(anchorItem.height, 0.1))) /
        2;
  anchorItem.type === "courtyard-area" &&
    (anchorElevationY =
      Math.max(0, finite2(anchorItem.elevation, 0)) + courtyardSurfaceRise2(anchorItem) - 0.006);
  let anchorLocalZ = 0;
  if (runtime.getPreviewFloorMode() === "all") {
    const itemRelativeX =
        (finite2(anchorItem.x, 0) - finite2(anchorFloor.originX, 0)) / anchorPixelsPerMeter,
      itemRelativeY =
        (finite2(anchorItem.y, 0) - finite2(anchorFloor.originY, 0)) / anchorPixelsPerMeter,
      anchorFloorsItemRotationRad = -ns2.MathUtils.degToRad(finite2(anchorFloor.rotation, 0));
    ((anchorLocalX =
      itemRelativeX * Math.cos(anchorFloorsItemRotationRad) +
      itemRelativeY * Math.sin(anchorFloorsItemRotationRad) +
      finite2(anchorFloor.offsetX, 0)),
      (anchorLocalZ =
        -itemRelativeX * Math.sin(anchorFloorsItemRotationRad) +
        itemRelativeY * Math.cos(anchorFloorsItemRotationRad) +
        finite2(anchorFloor.offsetZ, 0)));
    const sort2 = [...anchorFloors].sort(
        (sortLeftItem, sortRightItem) => sortLeftItem.elevation - sortRightItem.elevation,
      ),
      floorGapOffset = Math.max(
        0,
        sort2.findIndex((indexItem) => indexItem.id === anchorFloor.id),
      );
    anchorElevationY += floorGapOffset * finite2(runtime.appCtx.studioProject.exportFloorGap, 3);
  } else {
    const anchorModelOrigin = sceneModelOrigin2(anchorFloor.scene, anchorFloor);
    ((anchorLocalX = (finite2(anchorItem.x, 0) - anchorModelOrigin.x) / anchorPixelsPerMeter),
      (anchorLocalZ = (finite2(anchorItem.y, 0) - anchorModelOrigin.y) / anchorPixelsPerMeter));
  }
  runtime.appCtx.threeCamera.updateMatrixWorld(true);
  const project = new ns2.Vector3(anchorLocalX, anchorElevationY, anchorLocalZ).project(
    runtime.appCtx.threeCamera,
  );
  return ![project.x, project.y, project.z].every(Number.isFinite) ||
    project.z < -1 ||
    project.z > 1
    ? null
    : {
        x: clamp2((project.x + 1) / 2, 0, 1),
        y: clamp2((1 - project.y) / 2, 0, 1),
      };
}

export function projectLightGroupAnchor(runtime: StudioAppRuntime, 
  anchorLights: any,
  anchorGroupFloor: any,
  anchorGroupFloors = runtime.getOrderedFloorList(),
) {
  for (const anchorLightItem of anchorLights || []) {
    const zu2 = runtime.projectItemAnchor(anchorLightItem, anchorGroupFloor, anchorGroupFloors);
    if (zu2) return zu2;
  }
  return null;
}

export async function blobToBytes(runtime: StudioAppRuntime, sourceBlob: any) {
  return new Uint8Array(await sourceBlob.arrayBuffer());
}

export function applyExportVisibility(runtime: StudioAppRuntime, groupKeyFilter = "", screenKeyFilter = "", vehicleKeyFilter = "") {
  for (const { key: visibleGroupKey, group: visibleGroup } of runtime.listLightGroupRows())
    visibleGroup.enabled = groupKeyFilter === "*" || visibleGroupKey === groupKeyFilter;
  for (const { key: visibleScreenKey, item: visibleScreenItem } of runtime.listScreenRows())
    visibleScreenItem.screenEnabled =
      screenKeyFilter === "*" || visibleScreenKey === screenKeyFilter;
  for (const { key: visibleVehicleKey, item: visibleVehicleItem } of runtime.listChargingRows())
    visibleVehicleItem.chargingEnabled =
      vehicleKeyFilter === "*" || visibleVehicleKey === vehicleKeyFilter;
  runtime.rebuildFloorLayers();
}

export function setExportRoleVisibility(runtime: StudioAppRuntime, exportRole: any, isRoleVisible: any) {
  runtime.appCtx.sceneRootNode &&
    (runtime.appCtx.sceneRootNode.traverse((roleObject: any) => {
      roleObject.userData?.exportRole === exportRole &&
        (isRoleVisible
          ? runtime.exportVisibilityByObject.has(roleObject) &&
            ((roleObject.visible = runtime.exportVisibilityByObject.get(roleObject)),
            runtime.exportVisibilityByObject.delete(roleObject))
          : (runtime.exportVisibilityByObject.has(roleObject) ||
              runtime.exportVisibilityByObject.set(roleObject, roleObject.visible),
            (roleObject.visible = false)));
    }),
    runtime.refreshSceneRender({
      shadows: exportRole === "plan",
    }));
}

export function resolveOverwriteChoice(runtime: StudioAppRuntime, overwriteChoice = "cancel") {
  const bl3 = runtime.appCtx.overwriteResolver;
  ((runtime.appCtx.overwriteResolver = null),
    runtime.exportOverwriteDialogElement.open && runtime.exportOverwriteDialogElement.close(),
    bl3?.(overwriteChoice));
}

export function showConflictDialog(runtime: StudioAppRuntime, dialogWindowHost: any, conflictFolderName: any) {
  const document2 = dialogWindowHost.document,
    conflictDialogElement = document2.createElement("dialog");
  return (
    (conflictDialogElement.className = "settings-dialog floorplan-auto-diagram-dialog"),
    conflictDialogElement.setAttribute("aria-label", "同名导图已经存在"),
    (conflictDialogElement.innerHTML =
      '<div class="dialog-heading"><div><span>EXPORT EXISTS</span><h2>同名导图已经存在</h2></div></div>\n    <div class="floorplan-auto-diagram-guide">\n      <p>文件夹“<strong data-export-folder></strong>”已经存在。覆盖会整体替换原文件夹，原来存在但本次未导出的文件也会删除，已有仪表盘引用的同名图片会更新。</p>\n      <div class="dialog-actions"><button type="button" data-export-choice="cancel">不覆盖</button><button type="button" class="primary" data-export-choice="overwrite">覆盖更新</button></div>\n    </div>'),
    (conflictDialogElement.querySelector("[data-export-folder]").textContent = conflictFolderName),
    new Promise((resolveConflict, rejectConflict) => {
      let isConflictSettled = false;
      const settleConflictChoice = (chosenExportChoice: any) => {
          isConflictSettled ||
            ((isConflictSettled = true),
            window.removeEventListener("pagehide", cancelConflictDialog),
            dialogWindowHost.removeEventListener("pagehide", cancelConflictDialog),
            conflictDialogElement.open && conflictDialogElement.close(),
            conflictDialogElement.remove(),
            resolveConflict(chosenExportChoice));
        },
        cancelConflictDialog = () => settleConflictChoice("cancel");
      (conflictDialogElement.addEventListener("cancel", (conflictFolderNameDialogCancelEvent: any) => {
        (conflictFolderNameDialogCancelEvent.preventDefault(), cancelConflictDialog());
      }),
        conflictDialogElement.addEventListener("close", cancelConflictDialog));
      for (const conflictChoiceButton of conflictDialogElement.querySelectorAll(
        "[data-export-choice]",
      ))
        conflictChoiceButton.addEventListener("click", () =>
          settleConflictChoice(conflictChoiceButton.dataset.exportChoice),
        );
      (window.addEventListener("pagehide", cancelConflictDialog),
        dialogWindowHost.addEventListener("pagehide", cancelConflictDialog));
      try {
        (document2.body.append(conflictDialogElement),
          conflictDialogElement.showModal(),
          conflictDialogElement.querySelector('[data-export-choice="cancel"]').focus());
      } catch (conflictDialogError: any) {
        (window.removeEventListener("pagehide", cancelConflictDialog),
          dialogWindowHost.removeEventListener("pagehide", cancelConflictDialog),
          conflictDialogElement.remove(),
          rejectConflict(conflictDialogError));
      }
    })
  );
}

export function beginExportFlow(runtime: StudioAppRuntime, exportFolderName: any) {
  return (
    runtime.appCtx.overwriteResolver && runtime.resolveOverwriteChoice("cancel"),
    runtime.isAutoDiagramEmbed && runtime.autoDiagramComponentId && window.parent !== window
      ? runtime.showConflictDialog(window.parent, exportFolderName)
      : ((runtime.exportOverwriteNameElement.textContent = exportFolderName),
        runtime.exportOverwriteDialogElement.showModal(),
        new Promise((resolveOverwrite) => {
          runtime.appCtx.overwriteResolver = resolveOverwrite;
        }))
  );
}

export function reportExportFailure(runtime: StudioAppRuntime, failureReason: any, failureMessage: any) {
  !runtime.isAutoDiagramEmbed ||
    !runtime.autoDiagramComponentId ||
    window.parent === window ||
    window.parent.postMessage(
      {
        type: "homeos-floorplan-auto-diagram-stopped",
        componentId: runtime.autoDiagramComponentId,
        reason: failureReason,
        message: failureMessage,
      },
      window.location.origin,
    );
}

export function showExportResult(runtime: StudioAppRuntime, exportResult: any) {
  if (runtime.isAutoDiagramEmbed && runtime.autoDiagramComponentId && window.parent !== window) return;
  const isOverwritten = exportResult?.overwritten === true;
  ((runtime.exportCompleteTitleElement.textContent = isOverwritten ? "导图覆盖完成" : "导图保存完成"),
    (runtime.exportCompleteMessageElement.textContent = isOverwritten
      ? "新导图已经安全替换原文件夹，已有仪表盘中的同名图片会自动更新。"
      : "导出的图片和数据已经保存到 NAS，可以在编辑器素材中继续使用。"),
    (runtime.exportCompletePathElement.textContent = "data/" + (exportResult?.relativePath || "exports")),
    runtime.exportCompleteDialogElement.open || runtime.exportCompleteDialogElement.showModal());
}

export function disposeObjectTree(runtime: StudioAppRuntime, disposedRoot: any) {
  const geometrySet = new Set(),
    materialDisposeSet = new Set(),
    textureSet = new Set();
  disposedRoot.traverse((traversedNode: any) => {
    (traversedNode.userData.architectureSharedGeometry && (runtime.shouldTrimSharedGeometry = true),
      traversedNode.shadow?.dispose?.(),
      traversedNode.geometry &&
        !geometrySet.has(traversedNode.geometry) &&
        !traversedNode.userData.externalModelSharedGeometry &&
        !traversedNode.userData.sofaSharedGeometry &&
        !traversedNode.userData.rugSharedGeometry &&
        !traversedNode.userData.architectureSharedGeometry &&
        (geometrySet.add(traversedNode.geometry), traversedNode.geometry.dispose?.()));
    const nodeMaterials = Array.isArray(traversedNode.material)
      ? traversedNode.material
      : traversedNode.material
        ? [traversedNode.material]
        : [];
    for (const nodeMaterial of nodeMaterials)
      if (!materialDisposeSet.has(nodeMaterial)) {
        if (
          (materialDisposeSet.add(nodeMaterial),
          !traversedNode.userData.externalModelSharedTextures &&
            !traversedNode.userData.externalModelSharedMaterial &&
            !traversedNode.userData.sofaSharedMaterial &&
            !traversedNode.userData.rugSharedMaterial &&
            !traversedNode.userData.architectureSharedMaterial)
        ) {
          for (const [materialPropertyKey, materialPropertyValue] of Object.entries(
            nodeMaterial,
          ) as [string, any][])
            materialPropertyKey === "envMap" ||
              !materialPropertyValue?.isTexture ||
              materialPropertyValue.isRenderTargetTexture ||
              textureSet.has(materialPropertyValue) ||
              (textureSet.add(materialPropertyValue), materialPropertyValue.dispose());
        }
        !traversedNode.userData.sofaSharedMaterial &&
          !traversedNode.userData.rugSharedMaterial &&
          !traversedNode.userData.architectureSharedMaterial &&
          !traversedNode.userData.externalModelSharedMaterial &&
          !runtime.previewResources?.retire(nodeMaterial) &&
          nodeMaterial.dispose?.();
      }
  });
}

export function disposeFloorScene(runtime: StudioAppRuntime, ) {
  if (runtime.appCtx.sceneRootNode) {
    for (const floorChildObject of [...runtime.appCtx.sceneRootNode.children])
      (runtime.appCtx.sceneRootNode.remove(floorChildObject), runtime.disposeObjectTree(floorChildObject));
  }
}

/** 墙体构件（原 studio-app 直系声明，P4 搬进 `scene/studio-walls`，此处绑定外部状态）。 */
export function createOutlinePath(runtime: StudioAppRuntime, outlineShapeConstructor: any, outlinePointList: any) {
  return createOutlinePathCore(runtime.studioWallsDeps(), outlineShapeConstructor, outlinePointList);
}

/** 墙体构件（同族，转发见 `scene/studio-walls`）。 */
export function buildShapesWithHoles(runtime: StudioAppRuntime, polygonLoopList: any) {
  return buildShapesWithHolesCore(runtime.studioWallsDeps(), polygonLoopList);
}

/** 墙体构件（同族，转发见 `scene/studio-walls`）。 */
export function createWallSideMaterial(runtime: StudioAppRuntime, wallSideColor: any, wallSideOpacity: any, wallSideOptions: any = {}) {
  return createWallSideMaterialCore(runtime.studioWallsDeps(), wallSideColor, wallSideOpacity, wallSideOptions);
}

/** 墙体构件（同族，转发见 `scene/studio-walls`）。 */
export function createWallTopMaterial(runtime: StudioAppRuntime, wallTopBaseColor: any, wallTopOpacity: any, wallTopOptions: any = {}) {
  return createWallTopMaterialCore(runtime.studioWallsDeps(), wallTopBaseColor, wallTopOpacity, wallTopOptions);
}

/** 墙体构件（同族，转发见 `scene/studio-walls`）。 */
export function expandPolygonOutward(runtime: StudioAppRuntime, polygonPointList: any, outwardOffset: any) {
  return expandPolygonOutwardCore(runtime.studioWallsDeps(), polygonPointList, outwardOffset);
}

/** 墙体构件（同族，转发见 `scene/studio-walls`）。 */
export function buildInteriorScene(runtime: StudioAppRuntime, interiorDeps: { ppm: any; toWorld: any; floorSurfaceY: any }) {
  return buildInteriorSceneCore(runtime.studioWallsDeps(), interiorDeps);
}

/** 物品模型总装（原 studio-app 直系声明，P4 搬进 `items/studio-item-model`，此处只转发句柄）。 */
export function buildItemModel(runtime: StudioAppRuntime, modelItem: any, modelShadowIds: any = null) {
  return buildItemModelCore(runtime.studioItemModelDeps(), modelItem, modelShadowIds);
}

/** 门平面符号（原 studio-app 直系声明，P4 搬进 `plan/studio-plan-item-drawing`，此处只转发句柄）。 */
export function drawDoor(runtime: StudioAppRuntime, doorRecord: any, doorView: PlanEditPreviewFlags = {}) {
  return drawDoorCore(runtime.studioPlanItemDrawingDeps(), doorRecord, doorView);
}

/** 庭院区 / 部件的平面绘制（同上）。 */
export function drawCourtyardArea(runtime: StudioAppRuntime, planItem: any) {
  return drawCourtyardAreaCore(runtime.studioPlanItemDrawingDeps(), planItem);
}

/** 导出图层清单渲染（原 studio-app 直系声明，P4 搬进 `ui/studio-export-layers`，此处绑定容器与取数助手）。 */
export function renderExportLayers(runtime: StudioAppRuntime, ) {
  return renderExportLayersCore(runtime.studioExportLayerDeps());
}

/** 盒子网格构件（原 studio-app 直系声明，P4 搬进 `scene/studio-box-mesh`，此处绑定外部状态）。 */
export function addArchitectureMesh(runtime: StudioAppRuntime, 
  architectureParent: any,
  architectureSpecs: any,
  architectureColor: any,
  architectureOptions: ArchitectureMeshOptions = {},
) {
  return addArchitectureMeshCore(
    runtime.studioBoxMeshDeps(),
    architectureParent,
    architectureSpecs,
    architectureColor,
    architectureOptions,
  );
}

export function addWindowFrames(runtime: StudioAppRuntime, 
  windowParent: any,
  windowOpenings: any,
  windowFrameColor: any,
  windowGlassColor: any,
) {
  return addWindowFramesCore(
    runtime.studioBoxMeshDeps(),
    windowParent,
    windowOpenings,
    windowFrameColor,
    windowGlassColor,
  );
}

export function buildRugGeometry(runtime: StudioAppRuntime, rugWidth: any, rugThickness: any, rugDepth: any) {
  const clampedRugThickness = clamp2(rugThickness, 0.004, 0.018),
    rugGeometryKey = rugWidth + ":" + clampedRugThickness + ":" + rugDepth;
  if (!runtime.floorGroupCacheByKey.has(rugGeometryKey)) {
    const rugMinDimension = Math.max(Math.min(rugWidth, clampedRugThickness, rugDepth), 0.001),
      rugCornerRadius = Math.min(
        Math.min(rugWidth, rugDepth) * 0.018,
        rugMinDimension * 0.45,
        0.08,
      ),
      rugBaseGeometry = new RoundedBoxGeometry2(
        rugWidth,
        clampedRugThickness,
        rugDepth,
        2,
        rugCornerRadius,
      ),
      rugInsetGeometry = new ns2.PlaneGeometry(rugWidth * 0.88, rugDepth * 0.84);
    runtime.floorGroupCacheByKey.set(rugGeometryKey, {
      base: rugBaseGeometry,
      inset: rugInsetGeometry,
      rugThickness: clampedRugThickness,
    });
  }
  return runtime.floorGroupCacheByKey.get(rugGeometryKey);
}

export function createRugMaterial(runtime: StudioAppRuntime, rugColor: any, isInsetMaterial = false) {
  const rugMaterialKey = (isInsetMaterial ? "inset" : "base") + ":" + rugColor;
  return (
    runtime.materialCacheByKey.has(rugMaterialKey) ||
      runtime.materialCacheByKey.set(
        rugMaterialKey,
        new ns2.MeshStandardMaterial({
          color: rugColor,
          roughness: 1,
          metalness: 0,
          ...(isInsetMaterial
            ? {
                polygonOffset: true,
                polygonOffsetFactor: -2,
                polygonOffsetUnits: -4,
              }
            : {}),
        }),
      ),
    runtime.materialCacheByKey.get(rugMaterialKey)
  );
}

export function addRugMeshes(runtime: StudioAppRuntime, rugParent: any, rugItem: any, rugBaseColor: any, rugInsetColor: any) {
  const bv2 = runtime.buildRugGeometry(rugItem.width, rugItem.height, rugItem.depth);
  if (!bv2) return false;
  const ne7 = runtime.createSelectionRef("item", rugItem.id),
    clone3 = ne7 ? runtime.createRugMaterial(rugBaseColor).clone() : runtime.createRugMaterial(rugBaseColor),
    rugBaseMesh = new ns2.Mesh(bv2.base, clone3);
  ((rugBaseMesh.position.y = bv2.rugThickness * 0.5),
    (rugBaseMesh.castShadow = false),
    (rugBaseMesh.receiveShadow = true),
    (rugBaseMesh.userData.rugSharedGeometry = true),
    (rugBaseMesh.userData.rugSharedMaterial = !ne7),
    rugParent.add(rugBaseMesh));
  const clone4 = ne7
      ? runtime.createRugMaterial(rugInsetColor, true).clone()
      : runtime.createRugMaterial(rugInsetColor, true),
    rugInsetMesh = new ns2.Mesh(bv2.inset, clone4);
  return (
    (rugInsetMesh.rotation.x = -Math.PI / 2),
    (rugInsetMesh.position.y = bv2.rugThickness + 0.001),
    (rugInsetMesh.castShadow = false),
    (rugInsetMesh.receiveShadow = true),
    (rugInsetMesh.renderOrder = 1),
    (rugInsetMesh.userData.rugSharedGeometry = true),
    (rugInsetMesh.userData.rugSharedMaterial = !ne7),
    rugParent.add(rugInsetMesh),
    (rugParent.userData.optimizationStats = {
      type: "rug",
      before: 2,
      after: 2,
      sharedResources: true,
    }),
    true
  );
}

export function mergeMeshesByType(runtime: StudioAppRuntime, mergeRoot: any, mergeItemType: any) {
  if (!runtime.optimizedItemKeySet.has(mergeItemType)) return;
  const gu4 = collectChildMeshes(mergeRoot),
    geometryByKey = new Map(),
    materialBySignature = new Map();
  for (const mergeMesh of gu4) {
    const geometryParameters = mergeMesh.geometry?.parameters,
      meshGeometryKey = geometryParameters
        ? mergeMesh.geometry.type + ":" + JSON.stringify(geometryParameters)
        : "";
    meshGeometryKey && geometryByKey.has(meshGeometryKey)
      ? (mergeMesh.geometry.dispose(), (mergeMesh.geometry = geometryByKey.get(meshGeometryKey)))
      : meshGeometryKey && geometryByKey.set(meshGeometryKey, mergeMesh.geometry);
    const tg2 = buildMaterialSignature(mergeMesh);
    tg2 && materialBySignature.has(tg2)
      ? (mergeMesh.material.dispose(), (mergeMesh.material = materialBySignature.get(tg2)))
      : tg2 && materialBySignature.set(tg2, mergeMesh.material);
  }
  mergeRoot.userData.optimizationStats = {
    type: mergeItemType,
    before: gu4.length,
    after: gu4.length,
    uniqueGeometries: new Set(gu4.map((uniqueGeometryMesh: any) => uniqueGeometryMesh.geometry)).size,
    uniqueMaterials: new Set(gu4.map((uniqueMaterialMesh: any) => uniqueMaterialMesh.material)).size,
  };
}

export function configureLightSourcePreview(runtime: StudioAppRuntime, previewSourceMesh: any) {
  return (
    (previewSourceMesh.userData.exportRole = "light-source-preview"),
    (previewSourceMesh.castShadow = false),
    (previewSourceMesh.receiveShadow = false),
    (previewSourceMesh.renderOrder = 20),
    previewSourceMesh
  );
}
