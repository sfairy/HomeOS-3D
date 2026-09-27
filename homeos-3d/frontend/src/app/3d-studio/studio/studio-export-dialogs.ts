/**
 * 自 studio-app.ts 外提的独立单元（Phase A：安全外提）。
 * 对本模块之外的 studio-app.ts 内部零依赖：只引用 import 与自身成员，故不存在循环引用。
 */
import {
  currentPreviewFloorMode,
  floorGroupKey,
  getCurrentFloor,
  selectElement
} from "./studio-plan-render.js";
import { state } from "./studio-state.js";
import {
  applyFocalLength,
  currentFocalLength,
  currentTopRotationDeg,
  exportDialogElement,
  exportFolderNameInput,
  exportLockRatioInput,
  exportPresetLabel,
  renderExportPresetSlots,
  saveActiveExportPreset
} from "./studio-camera-presets.js";
import {
  normalizeActiveExportPresetSlot,
  normalizeExportPreset,
  normalizeExportPresetSlots
} from "../export/export-presets.js";
import {
  markDocumentDirty,
  showToast
} from "./studio-document-save.js";
import {
  exportDimensions,
  exportHeightInput,
  exportPixelRatio,
  exportPreviewStageElement,
  exportWidthInput
} from "./studio-render-quality.js";
import { syncCameraViewControls } from "./studio-control-sync.js";
import {
  applyBaseLighting,
  applyRenderQualityMode,
  cameraSettingsSource,
  currentCameraView,
  invalidateRender,
  isAutoDiagramEmbed,
  refreshPreviewScene
} from "./studio-render-pipeline.js";
import {
  applyCameraMode,
  applyOrthographicFrame,
  currentCameraMode,
  resetCameraView,
  savedCameraView,
  syncCameraModeButtons,
  syncCameraViewButtons,
  topViewUpVector
} from "./studio-camera-mode.js";
import * as threeModuleMin from "/static/vendor/three/0.186.0/three.module.min.js";
import {
  applyCameraSnapshot,
  captureCameraSnapshot
} from "./studio-camera-snapshot.js";
import {
  clearSelection,
  renderInspector,
  syncPreviewFloorButtons
} from "./studio-ui-refresh.js";
import { EXPORT_IMAGE_EXTENSION } from "../export/export-utils.js";
import { LIGHT_ITEM_TYPES } from "./studio-item-types.js";
import { syncStudioSelect } from "./studio-widgets.js";
import { syncControlValue } from "./ui-controls.js";
import {
  DEFAULT_BASE_LIGHTING,
  finite,
  normalizeBaseLighting
} from "../loaders/studio-normalization.js";
import { clamp } from "../plan/geometry.js";
import { renderPlanView } from "./studio-plan-draw.js";
import { isStageViewerMode } from "./studio-architecture.js";

export const autoDiagramComponentId =
  new URLSearchParams(window.location.search).get("auto-diagram-component") || "";

export const exportFolderName = new URLSearchParams(window.location.search).get("export-folder") || "";

export const floorSelectionParam = new URLSearchParams(window.location.search).has("floor-selection")
  ? new URLSearchParams(window.location.search).get("floor-selection")
  : null;

export const baseLightControlInputs: any[] = [...document.querySelectorAll("[data-base-light-control]")];

export const baseLightControlsElement = selectElement("#base-light-controls");

export const exportPreviewFrameElement = selectElement("#export-preview-frame");

export const exportAspectLabelElement = selectElement("#export-aspect-label");

export const exportResolutionLabelElement = selectElement("#export-resolution-label");

export const exportStatusElement = selectElement("#export-status");

export const exportPackageButton = selectElement("#export-package");

export const exportGroupFilesInput = selectElement("#export-group-files");

export const exportFloorSelectElement = selectElement("#export-floor-select");

export const exportFloorGapControlElement = selectElement("#export-floor-gap-control");

export const exportFloorGapInput = selectElement("#export-floor-gap");

export const exportPresetRenameDialogElement = selectElement("#export-preset-rename-dialog");

export const exportPresetRenameInputElement = selectElement("#export-preset-rename-input");

export const exportPresetDeleteDialogElement = selectElement("#export-preset-delete-dialog");

export const exportPresetDeleteNameElement = selectElement("#export-preset-delete-name");

/**
 * 取当前预览范围内的楼层列表：整景（all）给全部楼层，单层只给当前层。单层分支用
 */
export function previewFloors() {
  if (currentPreviewFloorMode() === "all") {
    return state.studioDocument.floors;
  } else {
    return [getCurrentFloor()].filter(Boolean);
  }
}

/**
 * 收集楼层里的灯组，并算出每组内的灯具。
 */
export function collectLightGroups(groupSourceFloors = state.studioDocument?.floors || []) {
  return groupSourceFloors.flatMap((groupFloor: any) =>
    groupFloor.scene.lightGroups.map((listedGroup: any, groupPosition: any) => ({
      floor: groupFloor,
      group: listedGroup,
      index: groupPosition,
      key: floorGroupKey(groupFloor.id, listedGroup.id),
      lights: groupFloor.scene.items.filter(
        (groupLight: any) =>
          LIGHT_ITEM_TYPES.has(groupLight.type) && groupLight.lightGroupId === listedGroup.id
      )
    }))
  );
}

/**
 * 收集楼层里的电视，位置下标用于给「电视画面 N」图层编号。
 */
export function collectTelevisions(televisionSourceFloors = state.studioDocument?.floors || []) {
  return televisionSourceFloors.flatMap((televisionFloor: any) =>
    televisionFloor.scene.items
      .filter((televisionCandidate: any) => televisionCandidate.type === "tv")
      .map((televisionEntry: any, televisionPosition: any) => ({
        floor: televisionFloor,
        item: televisionEntry,
        index: televisionPosition,
        key: televisionFloor.id + ":" + televisionEntry.id
      }))
  );
}

/**
 * 收集楼层里的小汽车，位置下标用于给「汽车充电 N」图层编号。与 collectTelevisions /
 */
export function collectCars(carSourceFloors = state.studioDocument?.floors || []) {
  return carSourceFloors.flatMap((carFloor: any) =>
    carFloor.scene.items
      .filter((carCandidate: any) => carCandidate.type === "smallcar")
      .map((carEntry: any, carPosition: any) => ({
        floor: carFloor,
        item: carEntry,
        index: carPosition,
        key: carFloor.id + ":" + carEntry.id
      }))
  );
}

/**
 * 把 baseLighting 的当前值回填到「基础照明」面板的各个输入框上（模型 → 视图）。整数档位
 */
export function syncBaseLightControlInputs() {
  for (const controlInput of baseLightControlInputs) {
    const controlValue = (state.baseLighting as any)[(controlInput as any).dataset.baseLightControl];
    const isIntegerStep = (controlInput as any).step === "5";
    syncControlValue(
      controlInput,
      isIntegerStep ? Math.round(controlValue) : Number(controlValue.toFixed(2))
    );
  }
}

/**
 * 应用一份基础光配置：归一化 → 回填控件 → 重设灯光 → 失效渲染。先 normalizeBaseLighting
 */
export function applyBaseLightingSettings(lightingConfig: any) {
  const previousLighting = state.baseLighting;
  state.baseLighting = normalizeBaseLighting(lightingConfig);
  syncBaseLightControlInputs();
  applyBaseLighting();
  invalidateRender({
    shadows: Object.keys(DEFAULT_BASE_LIGHTING).some(
      configField => (previousLighting as any)[configField] !== (state.baseLighting as any)[configField]
    )
  });
}

export function closeBaseLightingPanel() {
  if (baseLightControlsElement) {
    if (state.studioDocument) {
      applyBaseLightingSettings(state.studioDocument.baseLighting);
    }
    baseLightControlsElement.hidden = true;
  }
}

export function handleStageResize() {
  if (!state.renderer) {
    return;
  }
  if (state.exportRenderState) {
    resizeExportStage();
    return;
  }
  const resizeContainer = selectElement("#preview-3d");
  const resizeStageWidthPx = Math.max(resizeContainer.clientWidth, 1);
  const resizeStageHeightPx = Math.max(resizeContainer.clientHeight, 1);
  const currentCanvasSize = isStageViewerMode
    ? state.renderer.getSize(new threeModuleMin.Vector2())
    : null;
  const isCanvasSizeCurrent =
    currentCanvasSize?.x === resizeStageWidthPx && currentCanvasSize?.y === resizeStageHeightPx;
  const projectionSignature = isStageViewerMode
    ? state.previewCamera.projectionMatrix.elements.join(",")
    : "";
  if (!isCanvasSizeCurrent) {
    state.renderer.setSize(resizeStageWidthPx, resizeStageHeightPx, false);
  }
  state.previewCamera.userData.viewportAspect = resizeStageWidthPx / resizeStageHeightPx;
  if (state.previewCamera.isOrthographicCamera) {
    applyOrthographicFrame(
      state.previewCamera.userData.frameSize || 10,
      state.previewCamera.userData.viewportAspect
    );
  } else {
    state.previewCamera.aspect = state.previewCamera.userData.viewportAspect;
    applyFocalLength();
  }
  if (
    !isCanvasSizeCurrent ||
    projectionSignature !== state.previewCamera.projectionMatrix.elements.join(",")
  ) {
    invalidateRender();
  }
}

/**
 * 刷新导出面板的分辨率与比例文案，并用宽高比驱动预览框形状。宽高比用内联的最大公约数（辗转相除）约分，得到
 */
export function syncExportResolutionLabels() {
  const { width: exportWidthPx, height: exportHeightPx } = exportDimensions();
  exportResolutionLabelElement.textContent = exportWidthPx + " × " + exportHeightPx + " px";
  const aspectDivisor = ((dividend, divisor) => {
    while (divisor) {
      [dividend, divisor] = [divisor, dividend % divisor];
    }
    return dividend;
  })(exportWidthPx, exportHeightPx);
  const aspectWidth = exportWidthPx / aspectDivisor;
  const aspectHeight = exportHeightPx / aspectDivisor;
  exportAspectLabelElement.textContent =
    aspectWidth <= 32 && aspectHeight <= 32
      ? aspectWidth + " : " + aspectHeight
      : (exportWidthPx / exportHeightPx).toFixed(2) + " : 1";
  exportPreviewFrameElement.style.setProperty(
    "--export-aspect",
    String(exportWidthPx / exportHeightPx)
  );
}

/**
 * 在导出预览态下把渲染器与相机适配到预览框，使最终产物构图与屏幕预览一致。准入条件缺一不可：已进入导出态、导出任务不在
 */
export function resizeExportStage() {
  if (!state.exportRenderState || state.isExportBusy || !state.renderer || !state.previewCamera) {
    return;
  }
  const { width: resizeWidthPx, height: resizeHeightPx } = exportDimensions();
  const stageAspect = resizeWidthPx / resizeHeightPx;
  const availableWidthPx = Math.max(exportPreviewStageElement.clientWidth, 1);
  const availableHeightPx = Math.max(exportPreviewStageElement.clientHeight, 1);
  const exportPixelRatioValue = isAutoDiagramEmbed
    ? exportPixelRatio(false)
    : Math.min(window.devicePixelRatio || 1, 2);
  state.renderer.setPixelRatio(exportPixelRatioValue);
  state.renderer.setSize(availableWidthPx, availableHeightPx, false);
  state.previewCamera.userData.viewportAspect = stageAspect;
  if (state.previewCamera.isOrthographicCamera) {
    applyOrthographicFrame(state.previewCamera.userData.frameSize || 10, stageAspect, state.previewCamera);
  } else {
    state.previewCamera.aspect = stageAspect;
    applyFocalLength();
  }
  state.orbitControls.update();
  invalidateRender();
}

/**
 * 刷新导出预览：先更新分辨率标签，等两帧后再重设画布（避开布局未定的时刻）。
 */
export function refreshExportPreview() {
  syncExportResolutionLabels();
  requestAnimationFrame(() => requestAnimationFrame(resizeExportStage));
}

/**
 * 恢复导出预览用的已保存机位（按导出宽高比重算投影）。与 restoreStoredCameraView 的区别：
 */
export function restoreExportCamera(restoreOptions: any = {}) {
  const savedExportView = savedCameraView();
  if (!savedExportView || !state.exportRenderState) {
    return;
  }
  const exportAspect = exportDimensions().width / exportDimensions().height;
  const exportCameraSettings = cameraSettingsSource();
  exportCameraSettings.cameraMode = savedExportView.mode;
  exportCameraSettings.cameraView = savedExportView.view;
  exportCameraSettings.cameraTopRotation = savedExportView.topRotation;
  if (savedExportView.focalLength !== null) {
    exportCameraSettings.cameraFocalLength = savedExportView.focalLength;
  }
  applyCameraSnapshot(
    {
      mode: savedExportView.mode,
      cameraView: savedExportView.view,
      topRotation: savedExportView.topRotation,
      position: new threeModuleMin.Vector3(
        savedExportView.position.x,
        savedExportView.position.y,
        savedExportView.position.z
      ),
      target: new threeModuleMin.Vector3(
        savedExportView.target.x,
        savedExportView.target.y,
        savedExportView.target.z
      ),
      up:
        savedExportView.view === "top"
          ? topViewUpVector(savedExportView.topRotation)
          : new threeModuleMin.Vector3(0, 1, 0),
      zoom: 1,
      visibleHeight: savedExportView.visibleHeight,
      frameSize: savedExportView.visibleHeight,
      viewportAspect: exportAspect,
      fov: savedExportView.fov,
      near: 0.02,
      far: Math.max(
        new threeModuleMin.Vector3(
          savedExportView.position.x,
          savedExportView.position.y,
          savedExportView.position.z
        ).distanceTo(
          new threeModuleMin.Vector3(
            savedExportView.target.x,
            savedExportView.target.y,
            savedExportView.target.z
          )
        ) * (savedExportView.mode === "perspective" ? 8 : 5),
        100
      )
    },
    exportAspect
  );
  syncCameraModeButtons(savedExportView.mode);
  syncCameraViewButtons(savedExportView.view);
  if (!restoreOptions.silent) {
    const exportViewLabel = currentPreviewFloorMode() === "all" ? "总览视角" : "当前层视角";
    exportStatusElement.textContent = "已恢复上次保存的" + exportViewLabel;
    showToast("已恢复上次保存的" + exportViewLabel + "。");
  }
}

/**
 * 把档位里保存的相机参数应用到当前相机（并按导出宽高比还原投影）。
 */
export function applyPresetCamera(presetCamera: any) {
  const presetAspect = exportDimensions().width / exportDimensions().height;
  const presetCameraSettings = cameraSettingsSource();
  presetCameraSettings.cameraMode = presetCamera.mode;
  presetCameraSettings.cameraView = presetCamera.view;
  presetCameraSettings.cameraTopRotation = presetCamera.topRotation;
  if (presetCamera.focalLength !== null) {
    presetCameraSettings.cameraFocalLength = presetCamera.focalLength;
  }
  const presetPosition = new threeModuleMin.Vector3(
    presetCamera.position.x,
    presetCamera.position.y,
    presetCamera.position.z
  );
  const presetTargetVector = new threeModuleMin.Vector3(
    presetCamera.target.x,
    presetCamera.target.y,
    presetCamera.target.z
  );
  applyCameraSnapshot(
    {
      mode: presetCamera.mode,
      cameraView: presetCamera.view,
      topRotation: presetCamera.topRotation,
      position: presetPosition,
      target: presetTargetVector,
      up:
        presetCamera.view === "top"
          ? topViewUpVector(presetCamera.topRotation)
          : new threeModuleMin.Vector3(0, 1, 0),
      zoom: 1,
      visibleHeight: presetCamera.visibleHeight,
      frameSize: presetCamera.visibleHeight,
      viewportAspect: presetAspect,
      fov: presetCamera.fov,
      near: 0.02,
      far: Math.max(
        presetPosition.distanceTo(presetTargetVector) *
          (presetCamera.mode === "perspective" ? 8 : 5),
        100
      )
    },
    presetAspect
  );
  syncCameraModeButtons(presetCamera.mode);
  syncCameraViewButtons(presetCamera.view);
}

/**
 * 应用指定槽位的导出档位：分辨率、楼层选择、勾选的文件与相机一次性还原。兼容旧的选中项
 */
export function applyExportPreset(slotIndex: any, applyOptions: any = {}) {
  const exportPreset = normalizeExportPreset(state.studioDocument?.exportPresets?.[slotIndex]);
  if (!exportPreset || !state.exportRenderState) {
    return false;
  }
  exportWidthInput.value = String(exportPreset.width);
  exportHeightInput.value = String(exportPreset.height);
  exportLockRatioInput.checked = exportPreset.lockRatio;
  state.exportAspectRatio = exportPreset.width / exportPreset.height;
  state.studioDocument.exportFloorGap = exportPreset.floorGap;
  const presetFloor = state.studioDocument.floors.find(
    (presetFloorCandidate: any) => presetFloorCandidate.id === exportPreset.floorId
  );
  const presetFloorSelection =
    exportPreset.floorMode === "all" && state.studioDocument.floors.length > 1
      ? "all"
      : presetFloor?.id || getCurrentFloor()?.id || state.activeFloorId;
  applyExportFloorSelection(presetFloorSelection);
  exportFloorGapInput.value = exportPreset.floorGap.toFixed(1);
  exportFolderNameInput.value = exportPreset.folderName;
  const presetSelectedFiles = new Set(exportPreset.selectedFiles);
  const includesScreenFiles = presetSelectedFiles.has("televisionOn");
  const includesVehicleFiles = presetSelectedFiles.has("vehicleCharging");
  for (const exportFileInput of exportDialogElement.querySelectorAll("input[data-export-file]")) {
    const exportFileKey = exportFileInput.dataset.exportFile;
    exportFileInput.checked =
      presetSelectedFiles.has(exportFileKey) ||
      (includesScreenFiles && exportFileKey.startsWith("screen:")) ||
      (includesVehicleFiles && exportFileKey.startsWith("vehicle:"));
  }
  applyPresetCamera(exportPreset.camera);
  syncExportResolutionLabels();
  syncCameraViewControls();
  if (!applyOptions.silent) {
    exportStatusElement.textContent = "已切换到档位 " + String(slotIndex + 1).padStart(2, "0");
    showToast("已应用导出档位 " + String(slotIndex + 1).padStart(2, "0") + "。", "success");
  }
  refreshExportPreview();
  return true;
}

/**
 * 关闭「重命名档位」对话框；未打开时不做任何事。
 */
export function closePresetRenameDialog() {
  if (exportPresetRenameDialogElement.open) {
    exportPresetRenameDialogElement.close();
  }
}

/**
 * 打开档位重命名对话框，预填当前档位显示名并全选，方便直接覆写。
 */
export function openPresetRenameDialog() {
  if (state.isExportBusy) {
    return;
  }
  saveActiveExportPreset();
  const presetSlotList = normalizeExportPresetSlots(state.studioDocument?.exportPresets);
  const currentPresetSlotIndex = normalizeActiveExportPresetSlot(
    state.studioDocument?.activeExportPresetSlot,
    presetSlotList.length
  );
  if (presetSlotList[currentPresetSlotIndex]) {
    exportPresetRenameInputElement.value = exportPresetLabel(
      presetSlotList[currentPresetSlotIndex],
      currentPresetSlotIndex
    );
    exportPresetRenameDialogElement.showModal();
    requestAnimationFrame(() => exportPresetRenameInputElement.select());
  }
}

/**
 * 关闭「删除档位」对话框；未打开时不做任何事。
 */
export function closePresetDeleteDialog() {
  if (exportPresetDeleteDialogElement.open) {
    exportPresetDeleteDialogElement.close();
  }
}

/**
 * 打开「删除档位」对话框，并把待删档位的显示名写进确认文案。
 */
export function openPresetDeleteDialog() {
  if (state.isExportBusy) {
    return;
  }
  const presetSlotListForDelete = normalizeExportPresetSlots(state.studioDocument?.exportPresets);
  if (presetSlotListForDelete.length <= 1) {
    return;
  }
  const presetIndexForDelete = normalizeActiveExportPresetSlot(
    state.studioDocument?.activeExportPresetSlot,
    presetSlotListForDelete.length
  );
  exportPresetDeleteNameElement.textContent = exportPresetLabel(
    presetSlotListForDelete[presetIndexForDelete],
    presetIndexForDelete
  );
  exportPresetDeleteDialogElement.showModal();
}

/**
 * 删除当前导出档位并切换到相邻档位。只剩一个档位时不删（至少要留一个）。删除后活动下标取
 */
export function deleteActiveExportPreset() {
  const remainingPresetSlots = normalizeExportPresetSlots(state.studioDocument?.exportPresets);
  if (remainingPresetSlots.length <= 1) {
    return;
  }
  const removedPresetIndex = normalizeActiveExportPresetSlot(
    state.studioDocument?.activeExportPresetSlot,
    remainingPresetSlots.length
  );
  const removedPresetLabel = exportPresetLabel(
    remainingPresetSlots[removedPresetIndex],
    removedPresetIndex
  );
  window.clearTimeout(state.saveRetryTimer);
  state.saveRetryTimer = null;
  state.exportPresets = false;
  remainingPresetSlots.splice(removedPresetIndex, 1);
  state.studioDocument.exportPresets = remainingPresetSlots;
  state.studioDocument.activeExportPresetSlot = Math.min(
    removedPresetIndex,
    remainingPresetSlots.length - 1
  );
  closePresetDeleteDialog();
  const didRestoreNeighborPreset = applyExportPreset(state.studioDocument.activeExportPresetSlot, {
    silent: true
  });
  renderExportPresetSlots();
  markDocumentDirty();
  exportStatusElement.textContent = didRestoreNeighborPreset
    ? "已切换到相邻存档"
    : "当前存档尚未设置";
  showToast("已删除“" + removedPresetLabel + "”，楼层和户型未受影响。", "success");
}

export function ensureAutoDiagramFrame(frameAttempt = 0) {
  if (!!isAutoDiagramEmbed && !!autoDiagramComponentId && window.parent !== window) {
    requestAnimationFrame(() => {
      if (
        !state.exportRenderState ||
        !state.renderer ||
        !state.previewOverlayScene ||
        !state.previewCamera ||
        !state.orbitControls
      ) {
        return;
      }
      resizeExportStage();
      if (!state.previewModelRoot?.children?.length) {
        refreshPreviewScene();
      }
      const hasSizedExportStage =
        exportPreviewStageElement.clientWidth > 1 && exportPreviewStageElement.clientHeight > 1;
      const hasPreviewModelChildren = !!state.previewModelRoot?.children?.length;
      let isFrameProduced = false;
      if (hasSizedExportStage && hasPreviewModelChildren) {
        invalidateRender({
          shadows: true
        });
        state.orbitControls.update();
        for (let previewRenderPass = 0; previewRenderPass < 2; previewRenderPass += 1) {
          state.renderer.render(state.previewOverlayScene, state.previewCamera);
        }
        const rendererRenderStats = state.renderer.info.render;
        isFrameProduced = rendererRenderStats.calls > 0 && rendererRenderStats.triangles > 0;
        state.needsRender = false;
        state.hasRenderedFrame = isFrameProduced;
      }
      if (!isFrameProduced && frameAttempt < 7) {
        ensureAutoDiagramFrame(frameAttempt + 1);
        return;
      }
      if (!isFrameProduced) {
        window.parent.postMessage(
          {
            type: "homeos-floorplan-auto-diagram-error",
            componentId: autoDiagramComponentId,
            message: "3D户型首帧渲染失败，请刷新后重试。"
          },
          window.location.origin
        );
        return;
      }
      window.parent.postMessage(
        {
          type: "homeos-floorplan-auto-diagram-ready",
          componentId: autoDiagramComponentId,
          floors: state.studioDocument.floors.map((floorBrief: any) => ({
            id: floorBrief.id,
            name: floorBrief.name
          })),
          floorSelection:
            currentPreviewFloorMode() === "all" ? "all" : getCurrentFloor()?.id || state.activeFloorId
        },
        window.location.origin
      );
    });
  }
}

export function openExportDialog() {
  if (state.exportRenderState || !state.renderer || !state.previewCamera || !state.orbitControls) {
    return;
  }
  window.clearTimeout(state.saveRetryTimer);
  state.saveRetryTimer = null;
  state.exportPresets = false;
  const lightGroupSnapshot = collectLightGroups();
  const televisionSnapshot = collectTelevisions();
  const carSnapshot = collectCars();
  state.exportRenderState = {
    canvasParent: state.renderer.domElement.parentElement,
    camera: captureCameraSnapshot(),
    selected: state.primarySelection
      ? {
          ...state.primarySelection
        }
      : null,
    selectedMany: state.multiSelection.map((selectedItemSnapshot: any) => ({
      ...selectedItemSnapshot
    })),
    floorMode: currentPreviewFloorMode(),
    selectedFloorId: state.activeFloorId,
    floorCameraSettings: new Map(
      state.studioDocument.floors.map((floorSnapshotEntry: any) => [
        floorSnapshotEntry.id,
        {
          mode: floorSnapshotEntry.scene.settings.cameraMode,
          view: floorSnapshotEntry.scene.settings.cameraView,
          topRotation: floorSnapshotEntry.scene.settings.cameraTopRotation,
          focalLength: floorSnapshotEntry.scene.settings.cameraFocalLength
        }
      ])
    ),
    combinedCameraSettings: {
      ...state.studioDocument.combinedCameraSettings
    },
    groupStates: new Map(
      lightGroupSnapshot.map(({ key: groupStateKey, group: groupStateController }: any) => [
        groupStateKey,
        groupStateController.enabled
      ])
    ),
    tvStates: new Map(
      televisionSnapshot.map(({ key: tvStateKey, item: tvStateController }: any) => [
        tvStateKey,
        tvStateController.screenEnabled !== false
      ])
    ),
    carChargingStates: new Map(
      carSnapshot.map(({ key: carStateKey, item: carStateController }: any) => [
        carStateKey,
        carStateController.chargingEnabled === true
      ])
    ),
    cameraSettings: {
      mode: currentCameraMode(),
      view: currentCameraView(),
      topRotation: currentTopRotationDeg(),
      focalLength: currentFocalLength()
    },
    pixelRatio: state.renderer.getPixelRatio()
  };
  state.spotShadowAtlasController?.setEnabled(false);
  for (const { group: groupControllerToDisable } of lightGroupSnapshot) {
    groupControllerToDisable.enabled = false;
  }
  clearSelection();
  exportStatusElement.textContent = "准备保存到 NAS";
  exportFolderNameInput.classList.remove("invalid");
  populateExportGroupFiles();
  renderExportFloorOptions();
  syncCameraViewControls();
  renderExportPresetSlots();
  exportPackageButton.disabled = false;
  if (isAutoDiagramEmbed) {
    document.body.classList.add("auto-diagram-embedded");
    const searchParams = new URLSearchParams(window.location.search);
    const clampedExportWidth = clamp(
      finite(
        searchParams.get("dashboard-width"),
        finite(searchParams.get("component-width"), exportWidthInput.value)
      ),
      320,
      4096
    );
    const clampedExportHeight = clamp(
      finite(
        searchParams.get("dashboard-height"),
        finite(searchParams.get("component-height"), exportHeightInput.value)
      ),
      320,
      4096
    );
    exportWidthInput.value = String(Math.round(clampedExportWidth));
    exportHeightInput.value = String(Math.round(clampedExportHeight));
    exportLockRatioInput.checked = true;
    if (exportFolderName) {
      exportFolderNameInput.value = exportFolderName;
    }
    syncExportResolutionLabels();
  }
  exportDialogElement.showModal();
  exportPreviewStageElement.append(state.renderer.domElement);
  const restoredPresetSlot = normalizeActiveExportPresetSlot(
    state.studioDocument.activeExportPresetSlot,
    state.studioDocument.exportPresets.length
  );
  const didApplySavedPreset =
    restoredPresetSlot !== null &&
    applyExportPreset(restoredPresetSlot, {
      silent: true
    });
  if (isAutoDiagramEmbed && floorSelectionParam !== null) {
    const matchedFloorEntry = state.studioDocument.floors.find(
      (floorMatchCandidate: any) => floorMatchCandidate.id === floorSelectionParam
    );
    const floorSelectionId =
      floorSelectionParam === "all" && state.studioDocument.floors.length > 1
        ? "all"
        : matchedFloorEntry?.id || getCurrentFloor()?.id || state.activeFloorId;
    applyExportFloorSelection(floorSelectionId);
  }
  if (!didApplySavedPreset) {
    refreshPreviewScene();
    if (savedCameraView()) {
      restoreExportCamera({
        silent: true
      });
    } else if (isAutoDiagramEmbed) {
      applyCameraMode(currentCameraMode(), {
        preserveView: false
      });
      resetCameraView();
    }
  }
  state.exportAspectRatio = exportDimensions().width / exportDimensions().height;
  renderExportPresetSlots();
  refreshExportPreview();
  ensureAutoDiagramFrame();
}

/**
 * 填充「单独导出文件」列表：电视画面层、汽车充电层、每个灯组的透明光效层。键名约定为
 */
export function populateExportGroupFiles() {
  if (!exportGroupFilesInput) {
    return;
  }
  const previewFloorEntries = previewFloors();
  const groupFileListItems: any = [];
  /**
   * 往导出文件列表追加一个可勾选项。
   */
  const appendGroupFileOption = (optionValue: any, optionLabel: any, optionHint: any) => {
    const fileListItemElement = document.createElement("li");
    const fileLabelElement = document.createElement("label");
    const fileCheckboxElement = document.createElement("input");
    fileCheckboxElement.type = "checkbox";
    fileCheckboxElement.checked = true;
    fileCheckboxElement.dataset.exportFile = optionValue;
    const fileLabelTextElement = document.createElement("span");
    fileLabelTextElement.textContent = optionLabel;
    const fileHintElement = document.createElement("small");
    fileHintElement.textContent = optionHint;
    fileLabelElement.append(fileCheckboxElement, fileLabelTextElement);
    fileListItemElement.append(fileLabelElement, fileHintElement);
    groupFileListItems.push(fileListItemElement);
  };
  collectTelevisions(previewFloorEntries).forEach(
    ({ floor: tvLayerFloor, item: tvLayerItem, index: televisionIndex, key: televisionKey }: any) => {
      const televisionLayerName =
        "" +
        (previewFloorEntries.length > 1 ? tvLayerFloor.name + "-" : "") +
        (tvLayerItem.screenLayerName || "电视画面 " + (televisionIndex + 1));
      appendGroupFileOption(
        "screen:" + televisionKey,
        sanitizeFileName(televisionLayerName, "电视画面-" + (televisionIndex + 1)) +
          "." +
          EXPORT_IMAGE_EXTENSION,
        "该电视的独立开启透明层"
      );
    }
  );
  collectCars(previewFloorEntries).forEach(
    ({ floor: vehicleFloor, item: vehicleItem, index: vehicleIndex, key: vehicleKey }: any) => {
      const vehicleLayerName =
        "" +
        (previewFloorEntries.length > 1 ? vehicleFloor.name + "-" : "") +
        (vehicleItem.chargingLayerName || "汽车充电 " + (vehicleIndex + 1));
      appendGroupFileOption(
        "vehicle:" + vehicleKey,
        sanitizeFileName(vehicleLayerName, "汽车充电-" + (vehicleIndex + 1)) +
          "." +
          EXPORT_IMAGE_EXTENSION,
        "该汽车的独立充电光效层"
      );
    }
  );
  collectLightGroups(previewFloorEntries).forEach(
    ({
      floor: lightGroupFloor,
      group: lightGroupEntity,
      index: lightGroupIndex,
      key: lightGroupKey
    }: any) => {
      const lightGroupLayerName =
        "" +
        (previewFloorEntries.length > 1 ? lightGroupFloor.name + "-" : "") +
        (lightGroupEntity.name || "灯组-" + (lightGroupIndex + 1));
      appendGroupFileOption(
        "group:" + lightGroupKey,
        sanitizeFileName(lightGroupLayerName, "灯组-" + (lightGroupIndex + 1)) +
          "." +
          EXPORT_IMAGE_EXTENSION,
        "该灯组的透明光效层"
      );
    }
  );
  exportGroupFilesInput.replaceChildren(...groupFileListItems);
}

/**
 * 重建导出对话框的楼层下拉框：先列出全部楼层，楼层数大于 1 时再追加「全楼合并」。选项必须
 */
export function renderExportFloorOptions() {
  const isCombinedFloorView = currentPreviewFloorMode() === "all";
  const floorSelectValue = isCombinedFloorView ? "all" : getCurrentFloor()?.id || state.activeFloorId;
  exportFloorSelectElement.replaceChildren(
    ...state.studioDocument.floors.map((floorOptionEntry: any) => {
      const floorOptionElement = document.createElement("option");
      floorOptionElement.value = floorOptionEntry.id;
      floorOptionElement.textContent = floorOptionEntry.name;
      return floorOptionElement;
    }),
    ...(state.studioDocument.floors.length > 1
      ? [
          Object.assign(document.createElement("option"), {
            value: "all",
            textContent: "全楼合并"
          })
        ]
      : [])
  );
  exportFloorSelectElement.value = floorSelectValue;
  syncStudioSelect(exportFloorSelectElement);
  exportFloorGapControlElement.hidden = !isCombinedFloorView || state.studioDocument.floors.length <= 1;
  syncControlValue(exportFloorGapInput, finite(state.studioDocument.exportFloorGap, 3).toFixed(1));
  syncCameraViewControls();
}

/**
 * 切换导出时的楼层选择（单层 / 全楼合并），并重建相关预览。选择 "all" 只在楼层数大于 1 时
 */
export function applyExportFloorSelection(requestedFloorId: any) {
  if (!state.exportRenderState || state.isExportBusy) {
    return;
  }
  const isAllFloorsSelected = requestedFloorId === "all" && state.studioDocument.floors.length > 1;
  if (!isAllFloorsSelected) {
    const selectedFloorEntry = state.studioDocument.floors.find(
      (floorLookupEntry: any) => floorLookupEntry.id === requestedFloorId
    );
    if (!selectedFloorEntry) {
      return;
    }
    state.exportRenderState.selectedFloorId = selectedFloorEntry.id;
    state.activeScene = selectedFloorEntry.scene;
  }
  state.studioDocument.previewFloorMode = isAllFloorsSelected ? "all" : "active";
  renderExportFloorOptions();
  syncPreviewFloorButtons();
  syncCameraViewControls();
  refreshPreviewScene();
  if (savedCameraView()) {
    restoreExportCamera({
      silent: true
    });
  } else {
    applyCameraMode(currentCameraMode(), {
      preserveView: false
    });
    resetCameraView();
  }
  populateExportGroupFiles();
  exportStatusElement.textContent =
    currentPreviewFloorMode() === "all"
      ? "正在构图：全楼合并"
      : "正在构图：" + (getCurrentFloor()?.name || "当前层");
  refreshExportPreview();
}

/**
 * 关闭导出对话框，并把 openExportDialog 保存的快照逐项还原回预览态。还原顺序与打开时相反：
 */
export function closeExportDialog() {
  if (!state.exportRenderState || state.isExportBusy) {
    return;
  }
  closeBaseLightingPanel();
  if (baseLightControlsElement?.parentElement !== document.body) {
    document.body.append(baseLightControlsElement);
  }
  saveActiveExportPreset();
  const exportStateToRestore = state.exportRenderState;
  for (const floorToRestore of state.studioDocument.floors) {
    const savedFloorCameraSettings = exportStateToRestore.floorCameraSettings.get(
      floorToRestore.id
    );
    if (savedFloorCameraSettings) {
      floorToRestore.scene.settings.cameraMode = savedFloorCameraSettings.mode;
      floorToRestore.scene.settings.cameraView = savedFloorCameraSettings.view;
      floorToRestore.scene.settings.cameraTopRotation = savedFloorCameraSettings.topRotation;
      floorToRestore.scene.settings.cameraFocalLength = savedFloorCameraSettings.focalLength;
    }
  }
  state.studioDocument.combinedCameraSettings = {
    ...exportStateToRestore.combinedCameraSettings
  };
  state.exportRenderState = null;
  state.studioDocument.previewFloorMode = exportStateToRestore.floorMode;
  state.activeScene =
    state.studioDocument.floors.find((floorRestoreCandidate: any) => floorRestoreCandidate.id === state.activeFloorId)
      ?.scene || state.studioDocument.floors[0].scene;
  exportStateToRestore.canvasParent?.append(state.renderer.domElement);
  const cameraSettingsTarget = cameraSettingsSource();
  cameraSettingsTarget.cameraMode = exportStateToRestore.cameraSettings.mode;
  cameraSettingsTarget.cameraView = exportStateToRestore.cameraSettings.view;
  cameraSettingsTarget.cameraTopRotation = exportStateToRestore.cameraSettings.topRotation;
  cameraSettingsTarget.cameraFocalLength = exportStateToRestore.cameraSettings.focalLength;
  applyCameraSnapshot(exportStateToRestore.camera, exportStateToRestore.camera.viewportAspect);
  syncCameraModeButtons(exportStateToRestore.cameraSettings.mode);
  syncCameraViewButtons(exportStateToRestore.cameraSettings.view);
  state.primarySelection = exportStateToRestore.selected;
  state.multiSelection = exportStateToRestore.selectedMany;
  for (const { key: restoreGroupKey, group: restoreGroupController } of collectLightGroups()) {
    if (exportStateToRestore.groupStates.has(restoreGroupKey)) {
      restoreGroupController.enabled = exportStateToRestore.groupStates.get(restoreGroupKey);
    }
  }
  for (const { key: restoreTvKey, item: restoreTvController } of collectTelevisions()) {
    if (exportStateToRestore.tvStates.has(restoreTvKey)) {
      restoreTvController.screenEnabled = exportStateToRestore.tvStates.get(restoreTvKey);
    }
  }
  for (const { key: restoreCarKey, item: restoreCarController } of collectCars()) {
    if (exportStateToRestore.carChargingStates.has(restoreCarKey)) {
      restoreCarController.chargingEnabled =
        exportStateToRestore.carChargingStates.get(restoreCarKey);
    }
  }
  state.renderer.setPixelRatio(exportStateToRestore.pixelRatio);
  refreshPreviewScene();
  applyRenderQualityMode();
  handleStageResize();
  renderInspector();
  renderPlanView();
}

/**
 * 连渲三帧后再截图，抹平首帧可能缺纹理 / 阴影的问题（导出抓图前统一调用）。
 */
export function renderExportPreviewFrames() {
  state.orbitControls.update();
  for (let previewFramePass = 0; previewFramePass < 3; previewFramePass += 1) {
    state.renderer.render(state.previewOverlayScene, state.previewCamera);
  }
}

/**
 * 把任意标签清洗成安全的文件名片段：NFKC 归一化、剔除 Windows 非法字符，把空白与连续短横线
 */
export function sanitizeFileName(rawLabel: any, fallbackLabel: any) {
  return (
    String(rawLabel || "")
      .normalize("NFKC")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || fallbackLabel
  );
}
