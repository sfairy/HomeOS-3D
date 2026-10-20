



























import {
  buildStoredZip as buildStoredZip2,
  EXPORT_IMAGE_EXTENSION as EXPORT_IMAGE_EXTENSION2,
  EXPORT_IMAGE_MIME_TYPE as EXPORT_IMAGE_MIME_TYPE2,
  EXPORT_IMAGE_QUALITY as EXPORT_IMAGE_QUALITY2,
  EXPORT_RENDER_SCALE as EXPORT_RENDER_SCALE2,
  scaledExportResolution as scaledExportResolution2,
} from "../../../export/export-utils";








import {
  finite as finite2,
} from "../../../loaders/studio-normalization";


import { lampItemTypeSet } from "../../items/item-catalog";
















import { refreshStepChecklist } from "../../studio-app/ui/step-checklist";

import type { StudioAppContext } from "../studio-app-context";
export interface GenerateExportBundleDeps { appCtx: StudioAppContext; applyCameraState: any; applyExportVisibility: any; autoDiagramComponentId: any; beginExportFlow: any; blobToBytes: any; buildExportCamera: any; buildLightExportEntry: any; captureOverviewCamera: any; captureStudioSnapshot: any; captureUndoSnapshot: any; collectSelectedExportFiles: any; exportFolderNameInput: any; exportStatusElement: any; fetchStudioApi: any; floorElevationFor: any; getOrderedFloorList: any; getPreviewFloorMode: any; isAutoDiagramEmbed: any; listChargingRows: any; listLightGroupRows: any; listScreenRows: any; makeUniqueFileName: any; projectItemAnchor: any; projectLightGroupAnchor: any; rebuildFloorLayers: any; renderBackgroundLayer: any; renderExportImage: any; renderLightDeltaLayer: any; renderLightShadowLayer: any; reportExportFailure: any; saveExportPreset: any; setExportBusy: any; setExportRoleVisibility: any; setShadowQualityHigh: any; showExportResult: any; showToast: any; stateViewportAspectGetCanvasSize: any; syncCanvasSizeInputs: any; }

export async function generateExportBundle(deps: GenerateExportBundleDeps, ) {
  const { appCtx, applyCameraState, applyExportVisibility, autoDiagramComponentId, beginExportFlow, blobToBytes, buildExportCamera, buildLightExportEntry, captureOverviewCamera, captureStudioSnapshot, captureUndoSnapshot, collectSelectedExportFiles, exportFolderNameInput, exportStatusElement, fetchStudioApi, floorElevationFor, getOrderedFloorList, getPreviewFloorMode, isAutoDiagramEmbed, listChargingRows, listLightGroupRows, listScreenRows, makeUniqueFileName, projectItemAnchor, projectLightGroupAnchor, rebuildFloorLayers, renderBackgroundLayer, renderExportImage, renderLightDeltaLayer, renderLightShadowLayer, reportExportFailure, saveExportPreset, setExportBusy, setExportRoleVisibility, setShadowQualityHigh, showExportResult, showToast, stateViewportAspectGetCanvasSize, syncCanvasSizeInputs } = deps;

  if (!appCtx.pendingRuntimeSettings || appCtx.isInteractionLocked) return;
  saveExportPreset();
  const trim = exportFolderNameInput.value.trim();
  if (
    !trim ||
    /[<>:\"/\\|?*\x00-\x1f\x7f]/.test(trim) ||
    trim.startsWith(".") ||
    /[. ]$/.test(trim)
  ) {
    (exportFolderNameInput.classList.add("invalid"),
      exportFolderNameInput.focus(),
      (exportStatusElement.textContent = "请输入有效的文件夹名"));
    return;
  }
  exportFolderNameInput.classList.remove("invalid");
  const qf2 = collectSelectedExportFiles();
  if (!qf2.size) {
    exportStatusElement.textContent = "请至少勾选一项图片";
    return;
  }
  const exportBaseSize = stateViewportAspectGetCanvasSize(),
    { width: exportTargetWidth, height: exportTargetHeight } = scaledExportResolution2(
      exportBaseSize.width,
      exportBaseSize.height,
      EXPORT_RENDER_SCALE2,
    ),
    tu3 = captureOverviewCamera(),
    exportFileNames = {
      background: "00底图." + EXPORT_IMAGE_EXTENSION2,
      backgroundWithPlan: "00底图带户型." + EXPORT_IMAGE_EXTENSION2,
      floorPlan: "00户型图." + EXPORT_IMAGE_EXTENSION2,
    },
    usedExportNameSet = new Set(
      Object.values(exportFileNames).map((exportNameValue) => exportNameValue.toLocaleLowerCase()),
    ),
    wl3 = getOrderedFloorList(),
    exportGroups = listLightGroupRows(wl3)
      .map(
        ({
          floor: exportGroupFloor,
          group: exportGroup,
          index: exportGroupIndex,
          key: exportGroupKey,
        }: any) => ({
          id: exportGroupKey,
          groupId: exportGroup.id,
          floor: exportGroupFloor,
          name: wl3.length > 1 ? exportGroupFloor.name + "-" + exportGroup.name : exportGroup.name,
          enabledInEditor: appCtx.pendingRuntimeSettings.groupStates.get(exportGroupKey) !== false,
          file: makeUniqueFileName(
            wl3.length > 1 ? exportGroupFloor.name + "-" + exportGroup.name : exportGroup.name,
            exportGroupIndex,
            usedExportNameSet,
          ),
          lights: exportGroupFloor.scene.items.filter(
            (groupLightItem: any) =>
              lampItemTypeSet.has(groupLightItem.type) &&
              groupLightItem.lightGroupId === exportGroup.id,
          ),
        }),
      )
      .filter((filteredGroup: any) => qf2.has("group:" + filteredGroup.id)),
    exportScreenEntries = listScreenRows(wl3).map(
      ({
        floor: generateExportBundleScreenFloor,
        item: screenEntryItem,
        index: screenEntryIndex,
        key: screenEntryKey,
      }: any) => ({
        id: "screen-" + screenEntryKey,
        key: screenEntryKey,
        floorId: generateExportBundleScreenFloor.id,
        itemId: screenEntryItem.id,
        name:
          "" +
          (wl3.length > 1 ? generateExportBundleScreenFloor.name + "-" : "") +
          (screenEntryItem.screenLayerName || "电视画面 " + (screenEntryIndex + 1)),
        enabledInEditor: appCtx.pendingRuntimeSettings.tvStates.get(screenEntryKey) !== false,
        floor: generateExportBundleScreenFloor,
        item: screenEntryItem,
        file: null as any,
      }),
    ),
    exportVehicleEntries = listChargingRows(wl3).map(
      ({
        floor: vehicleFloor,
        item: vehicleEntryItem,
        index: vehicleEntryIndex,
        key: vehicleEntryKey,
      }: any) => ({
        id: "vehicle-" + vehicleEntryKey,
        key: vehicleEntryKey,
        floorId: vehicleFloor.id,
        itemId: vehicleEntryItem.id,
        name:
          "" +
          (wl3.length > 1 ? vehicleFloor.name + "-" : "") +
          (vehicleEntryItem.chargingLayerName || "汽车充电 " + (vehicleEntryIndex + 1)),
        chargingInEditor: appCtx.pendingRuntimeSettings.carChargingStates.get(vehicleEntryKey) === true,
        floor: vehicleFloor,
        item: vehicleEntryItem,
        file: null as any,
      }),
    );
  for (
    let screenFileIndex = 0;
    screenFileIndex < exportScreenEntries.length;
    screenFileIndex += 1
  ) {
    const screenFileEntry = exportScreenEntries[screenFileIndex];
    screenFileEntry.file = makeUniqueFileName(
      screenFileEntry.name,
      screenFileIndex,
      usedExportNameSet,
    );
  }
  for (
    let vehicleFileIndex = 0;
    vehicleFileIndex < exportVehicleEntries.length;
    vehicleFileIndex += 1
  ) {
    const vehicleFileEntry = exportVehicleEntries[vehicleFileIndex];
    vehicleFileEntry.file = makeUniqueFileName(
      vehicleFileEntry.name,
      vehicleFileIndex,
      usedExportNameSet,
    );
  }
  const selectedScreenEntries = exportScreenEntries.filter((selectedScreenEntry: any) =>
      qf2.has("screen:" + selectedScreenEntry.key),
    ),
    selectedVehicleEntries = exportVehicleEntries.filter((selectedVehicleEntry: any) =>
      qf2.has("vehicle:" + selectedVehicleEntry.key),
    ),
    hasAnyLayer =
      qf2.has("backgroundWithPlan") ||
      qf2.has("floorPlan") ||
      selectedScreenEntries.length > 0 ||
      selectedVehicleEntries.length > 0 ||
      exportGroups.length > 0;
  let isOverwriting = false;
  setExportBusy(true);
  try {
    if (
      ((exportStatusElement.textContent = "正在检查文件夹名…"),
      (
        await fetchStudioApi("/studio3d/exports/check", {
          headers: {
            "X-Export-Folder": encodeURIComponent(trim),
          },
        })
      )?.exists)
    ) {
      exportStatusElement.textContent = "同名导图“" + trim + "”已经存在";
      const zf2 = await beginExportFlow(trim);
      if (zf2 === "rename") {
        ((exportStatusElement.textContent = "请修改文件夹名后重新保存"),
          window.setTimeout(() => {
            (exportFolderNameInput.focus(), exportFolderNameInput.select());
          }, 0),
          reportExportFailure("rename", "请在属性中修改文件夹名称后重新生成。"));
        return;
      }
      if (zf2 !== "overwrite") {
        ((exportStatusElement.textContent = "已取消覆盖，原导图保持不变"),
          reportExportFailure("cancel", "已取消覆盖，原导图保持不变。"));
        return;
      }
      isOverwriting = true;
    }
    (appCtx.threeRenderer.setPixelRatio(1),
      appCtx.threeRenderer.setSize(exportTargetWidth, exportTargetHeight, false),
      applyCameraState(tu3, exportTargetWidth / exportTargetHeight),
      setShadowQualityHigh(true),
      (exportStatusElement.textContent = "正在生成精细阴影导出图层…"),
      applyExportVisibility());
    let onStateImage: any = null,
      baseStateImage: any = null;
    (qf2.has("background") &&
      (setExportRoleVisibility("plan", false),
      setExportRoleVisibility("label", false),
      setExportRoleVisibility("outline", false),
      (onStateImage = await renderExportImage(exportTargetWidth, exportTargetHeight, {
        pixels: true,
      })),
      setExportRoleVisibility("plan", true),
      setExportRoleVisibility("label", true),
      setExportRoleVisibility("outline", true)),
      hasAnyLayer &&
        (baseStateImage = await renderExportImage(exportTargetWidth, exportTargetHeight, {
          pixels: true,
        })));
    const generatedFileEntries: any[] = [];
    if (onStateImage) {
      const yf2 = await renderBackgroundLayer(
        exportTargetWidth,
        exportTargetHeight,
        onStateImage.imageData,
      );
      generatedFileEntries.push({
        name: exportFileNames.background,
        data: await blobToBytes(yf2),
      });
    }
    if (qf2.has("backgroundWithPlan")) {
      const yf3 = await renderBackgroundLayer(
        exportTargetWidth,
        exportTargetHeight,
        baseStateImage.imageData,
      );
      generatedFileEntries.push({
        name: exportFileNames.backgroundWithPlan,
        data: await blobToBytes(yf3),
      });
    }
    if (qf2.has("floorPlan")) {
      (setExportRoleVisibility("background", false), setExportRoleVisibility("grid", false));
      const ja4 = await renderExportImage(exportTargetWidth, exportTargetHeight, {
        blob: true,
      });
      (setExportRoleVisibility("background", true),
        setExportRoleVisibility("grid", true),
        generatedFileEntries.push({
          name: exportFileNames.floorPlan,
          data: await blobToBytes(ja4.blob),
        }));
    }
    for (let groupFileIndex = 0; groupFileIndex < exportGroups.length; groupFileIndex += 1) {
      const generatedGroupEntry = exportGroups[groupFileIndex],
        lv2 = await renderLightShadowLayer(
          baseStateImage.imageData,
          generatedGroupEntry,
          exportTargetWidth,
          exportTargetHeight,
          groupFileIndex,
          exportGroups.length,
        );
      generatedFileEntries.push({
        name: generatedGroupEntry.file,
        data: await blobToBytes(lv2),
      });
    }
    for (
      let screenLayerIndex = 0;
      screenLayerIndex < selectedScreenEntries.length;
      screenLayerIndex += 1
    ) {
      const generatedScreenEntry = selectedScreenEntries[screenLayerIndex];
      ((exportStatusElement.textContent =
        "正在生成电视图层 " +
        (screenLayerIndex + 1) +
        "/" +
        selectedScreenEntries.length +
        "：" +
        generatedScreenEntry.name),
        applyExportVisibility("", generatedScreenEntry.key));
      const ja5 = await renderExportImage(exportTargetWidth, exportTargetHeight, {
          pixels: true,
        }),
        uf2 = await renderLightDeltaLayer(baseStateImage.imageData, ja5.imageData);
      generatedFileEntries.push({
        name: generatedScreenEntry.file,
        data: await blobToBytes(uf2),
      });
    }
    for (
      let vehicleLayerIndex = 0;
      vehicleLayerIndex < selectedVehicleEntries.length;
      vehicleLayerIndex += 1
    ) {
      const generatedVehicleEntry = selectedVehicleEntries[vehicleLayerIndex];
      ((exportStatusElement.textContent =
        "正在生成汽车图层 " +
        (vehicleLayerIndex + 1) +
        "/" +
        selectedVehicleEntries.length +
        "：" +
        generatedVehicleEntry.name),
        applyExportVisibility("", "", generatedVehicleEntry.key));
      const ja6 = await renderExportImage(exportTargetWidth, exportTargetHeight, {
          pixels: true,
        }),
        uf3 = await renderLightDeltaLayer(baseStateImage.imageData, ja6.imageData);
      generatedFileEntries.push({
        name: generatedVehicleEntry.file,
        data: await blobToBytes(uf3),
      });
    }
    const exportManifest = {
      schemaVersion: 3,
      exportName: trim,
      floorMode: getPreviewFloorMode(),
      floorPresentationGap:
        getPreviewFloorMode() === "all" ? finite2(appCtx.studioProject.exportFloorGap, 3) : 0,
      floors: wl3.map((manifestFloor: any) => ({
        id: manifestFloor.id,
        name: manifestFloor.name,
        elevation: floorElevationFor(manifestFloor),
        offsetX: manifestFloor.offsetX,
        offsetZ: manifestFloor.offsetZ,
        rotation: manifestFloor.rotation,
      })),
      generatedAt: new Date().toISOString(),
      resolution: {
        width: exportTargetWidth,
        height: exportTargetHeight,
      },
      sourceResolution: exportBaseSize,
      renderScale: EXPORT_RENDER_SCALE2,
      imageFormat: {
        extension: EXPORT_IMAGE_EXTENSION2,
        mimeType: EXPORT_IMAGE_MIME_TYPE2,
        quality: EXPORT_IMAGE_QUALITY2,
      },
      camera: buildExportCamera(exportTargetWidth, exportTargetHeight),
      backgroundImage: qf2.has("background") ? exportFileNames.background : null,
      baseImage: qf2.has("backgroundWithPlan") ? exportFileNames.backgroundWithPlan : null,
      floorPlanImage: qf2.has("floorPlan") ? exportFileNames.floorPlan : null,
      televisionOnImage: selectedScreenEntries.length === 1 ? selectedScreenEntries[0].file : null,
      televisionOnImages: selectedScreenEntries.map((manifestScreen: any) => manifestScreen.file),
      vehicleChargingImage:
        selectedVehicleEntries.length === 1 ? selectedVehicleEntries[0].file : null,
      vehicleChargingImages: selectedVehicleEntries.map((manifestVehicle: any) => manifestVehicle.file),
      exportedFiles: generatedFileEntries.map((manifestFile) => manifestFile.name),
      groups: exportGroups.map((manifestGroup: any) => ({
        id: manifestGroup.id,
        groupId: manifestGroup.groupId,
        floorId: manifestGroup.floor.id,
        name: manifestGroup.name,
        file: manifestGroup.file,
        anchor: projectLightGroupAnchor(manifestGroup.lights, manifestGroup.floor, wl3),
        enabledInEditor: manifestGroup.enabledInEditor,
        lights: manifestGroup.lights.map((manifestLight: any) =>
          buildLightExportEntry(manifestLight, manifestGroup.floor),
        ),
      })),
      screens: exportScreenEntries.map(
        ({
          key: manifestScreenKey,
          floor: manifestScreenFloor,
          item: manifestScreenItem,
          ...manifestScreenRest
        }: any) => ({
          ...manifestScreenRest,
          anchor: projectItemAnchor(manifestScreenItem, manifestScreenFloor, wl3),
          file: qf2.has("screen:" + manifestScreenKey) ? manifestScreenRest.file : null,
        }),
      ),
      vehicles: exportVehicleEntries.map(
        ({
          key: manifestVehicleKey,
          floor: manifestVehicleFloor,
          item: manifestVehicleItem,
          ...manifestVehicleRest
        }: any) => ({
          ...manifestVehicleRest,
          anchor: projectItemAnchor(manifestVehicleItem, manifestVehicleFloor, wl3),
          file: qf2.has("vehicle:" + manifestVehicleKey) ? manifestVehicleRest.file : null,
        }),
      ),
    };
    if (
      (qf2.has("dataLights") &&
        generatedFileEntries.push({
          name: "lights.json",
          data: new TextEncoder().encode(JSON.stringify(exportManifest, null, 2) + "\n"),
        }),
      qf2.has("dataScene"))
    ) {
      const exportScenePayload =
        getPreviewFloorMode() === "all" ? captureStudioSnapshot() : captureUndoSnapshot();
      generatedFileEntries.push({
        name: "scene.json",
        data: new TextEncoder().encode(JSON.stringify(exportScenePayload, null, 2) + "\n"),
      });
    }
    exportStatusElement.textContent = "正在打包 ZIP…";
    const zipBytes = buildStoredZip2(generatedFileEntries);
    exportStatusElement.textContent = "正在保存到 NAS data…";
    const blob = new Blob([zipBytes], {
        type: "application/zip",
      }),
      saveExportBundle = (shouldOverwrite = false) =>
        fetchStudioApi("/studio3d/exports", {
          method: "POST",
          body: blob,
          headers: {
            "Content-Type": "application/zip",
            "X-Export-Folder": encodeURIComponent(trim),
            ...(shouldOverwrite
              ? {
                  "X-Export-Overwrite": "true",
                }
              : {}),
          },
        });
    let saveResult;
    try {
      saveResult = await saveExportBundle(isOverwriting);
    } catch (saveConflictError: any) {
      if (
        saveConflictError?.status !== 409 ||
        saveConflictError?.payload?.detail?.code !== "STUDIO3D_EXPORT_EXISTS"
      )
        throw saveConflictError;
      exportStatusElement.textContent = "同名导图“" + trim + "”已经存在";
      const zf3 = await beginExportFlow(trim);
      if (zf3 === "rename") {
        ((exportStatusElement.textContent = "请修改文件夹名后重新保存"),
          window.setTimeout(() => {
            (exportFolderNameInput.focus(), exportFolderNameInput.select());
          }, 0),
          reportExportFailure("rename", "请在属性中修改文件夹名称后重新生成。"));
        return;
      }
      if (zf3 !== "overwrite") {
        ((exportStatusElement.textContent = "已取消覆盖，原导图保持不变"),
          reportExportFailure("cancel", "已取消覆盖，原导图保持不变。"));
        return;
      }
      ((exportStatusElement.textContent = "正在安全覆盖原导图…"),
        (saveResult = await saveExportBundle(true)));
    }
    ((exportStatusElement.textContent = "已保存到 data/" + saveResult.relativePath),
      showToast("导图已保存到 data/" + saveResult.relativePath, "success"));
    const parent = isAutoDiagramEmbed ? window.parent : window.opener;
    (autoDiagramComponentId &&
      parent &&
      (isAutoDiagramEmbed || !parent.closed) &&
      parent.postMessage(
        {
          type: "homeos-floorplan-auto-diagram-export",
          componentId: autoDiagramComponentId,
          folderName: trim,
          manifest: exportManifest,
          saved: {
            relativePath: String(saveResult?.relativePath || "exports/" + trim),
            overwritten: saveResult?.overwritten === true,
          },
        },
        window.location.origin,
      ),
      (appCtx.isExporting = true),
      refreshStepChecklist(appCtx),
      showExportResult(saveResult));
  } catch (exportFlowError: any) {
    (window.HomeOSLog?.error!(exportFlowError, {
      phase: "studio-export",
      componentId: autoDiagramComponentId || "",
    }),
      console.error(exportFlowError),
      (exportStatusElement.textContent = exportFlowError?.message || "导出失败，请重试。"),
      showToast(exportFlowError?.message || "导图失败。", "error"),
      isAutoDiagramEmbed &&
        autoDiagramComponentId &&
        window.parent !== window &&
        window.parent.postMessage(
          {
            type: "homeos-floorplan-auto-diagram-error",
            componentId: autoDiagramComponentId,
            message: exportFlowError?.message || "后台生成失败，请重试。",
          },
          window.location.origin,
        ));
  } finally {
    setShadowQualityHigh(false);
    for (const { key: restoreGroupKey, group: restoreGroup } of listLightGroupRows())
      appCtx.pendingRuntimeSettings?.groupStates.has(restoreGroupKey) &&
        (restoreGroup.enabled = appCtx.pendingRuntimeSettings.groupStates.get(restoreGroupKey));
    for (const { key: restoreScreenKey, item: restoreScreenItem } of listScreenRows())
      appCtx.pendingRuntimeSettings?.tvStates.has(restoreScreenKey) &&
        (restoreScreenItem.screenEnabled = appCtx.pendingRuntimeSettings.tvStates.get(restoreScreenKey));
    for (const { key: restoreVehicleKey, item: restoreVehicleItem } of listChargingRows())
      appCtx.pendingRuntimeSettings?.carChargingStates.has(restoreVehicleKey) &&
        (restoreVehicleItem.chargingEnabled =
          appCtx.pendingRuntimeSettings.carChargingStates.get(restoreVehicleKey));
    (rebuildFloorLayers(),
      applyCameraState(tu3, exportTargetWidth / exportTargetHeight),
      setExportBusy(false),
      syncCanvasSizeInputs());
  }

}
