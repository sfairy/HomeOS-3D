/**
 * 舞台相机：焦距 / 俯角 / 裁剪面参数、轨道控制器与相机运动、相机视图预设槽位。
 *
 * 自 studio-app.ts 外提（依赖闭包自底向上）。对本模块之外的 studio-app.ts
 * 内部零依赖：只引用 import 与自身成员，故不存在循环引用。
 * 注意：轨道控制器创建时需要刷新预设槽位、预设又需要读相机参数，两者存在
 * 相互依赖，故必须同处一个模块。
 */
import { state } from "./studio-state.js";
import {
  MAX_EXPORT_PRESET_COUNT,
  exportPresetIsEmpty,
  exportPresetSummary,
  normalizeActiveExportPresetSlot,
  normalizeExportPreset,
  normalizeExportPresetSlots
} from "../export/export-presets.js";
import { markDocumentDirty } from "./studio-document-save.js";
import {
  currentPreviewFloorMode,
  getCurrentFloor,
  selectElement
} from "./studio-plan-render.js";
import { clamp } from "../plan/geometry.js";
import { finite } from "../loaders/studio-normalization.js";
import {
  applyRenderQualityMode,
  cameraSettingsSource,
  currentCameraView,
  invalidateRender
} from "./studio-render-pipeline.js";
import {
  assessFrameRateForAdaptive,
  exportDimensions,
  updateRenderPixelRatio
} from "./studio-render-quality.js";
import * as threeModuleMin from "/static/vendor/three/0.186.0/three.module.min.js";
import { OrbitControls } from "/static/vendor/three/0.186.0/OrbitControls.js";
import {
  MAX_CAMERA_POLAR_ANGLE,
  constrainCameraPosition
} from "./studio-camera-constraints.js";
import { isStageViewerMode } from "./studio-architecture.js";

export const cameraFocalLengthInputs: any[] = [...document.querySelectorAll("[data-camera-focal-length]")];

export const exportDialogElement = selectElement("#export-dialog");

export const exportPresetEmptyStateElement = selectElement("#export-preset-empty-state");

export const exportPresetEmptyTitleElement = selectElement("#export-preset-empty-title");

export const exportLockRatioInput = selectElement("#export-lock-ratio");

export const exportFolderNameInput = selectElement("#export-folder-name");

export const exportPresetSlotsElement = selectElement("#export-preset-slots");

export const exportPresetAddButton = selectElement("#export-preset-add");

export const exportPresetRenameButton = selectElement("#export-preset-rename");

export const exportPresetDeleteButton = selectElement("#export-preset-delete");

/**
 * 顶视图当前的水平旋转角，归一化到 0/90/180/270 四档之一。先四舍五入到 90 的整数倍
 */
export function currentTopRotationDeg() {
  return (
    (((Math.round(finite(cameraSettingsSource()?.cameraTopRotation, 0) / 90) * 90) % 360) + 360) %
    360
  );
}

/**
 * 当前相机焦距（毫米），夹在 18~120mm。下限 18mm 已是超广角，再短透视畸变大到没法看户型；
 */
export function currentFocalLength() {
  return clamp(finite(cameraSettingsSource()?.cameraFocalLength, 50), 18, 120);
}

/**
 * 把焦距写进目标相机（仅透视相机有效）。这里再次 clamp 到 18~120：调用方可能直接把用户
 */
export function applyFocalLength(targetCamera = state.previewCamera, focalLength = currentFocalLength()) {
  if (targetCamera?.isPerspectiveCamera) {
    targetCamera.setFocalLength(clamp(finite(focalLength, 50), 18, 120));
  }
}

export function startCameraMotion() {
  window.clearTimeout(state.pixelRatioRestoreTimer);
  state.pixelRatioRestoreTimer = null;
  state.isCameraMotionActive = true;
  state.hasCameraMotionMoved = false;
  state.recentFrameDurationsMs = [];
  state.lastFrameTimestampMs = 0;
  applyRenderQualityMode();
}

/**
 * 相机首次真正移动时的一次性降采样：切到运动像素比并保留光照缓存。用
 */
export function handleCameraMotionMoved() {
  if (!state.hasCameraMotionMoved) {
    state.hasCameraMotionMoved = true;
    applyRenderQualityMode();
    updateRenderPixelRatio(true, {
      preserveLightCache: true
    });
  }
}

/**
 * 相机交互结束：恢复静止画质，并延迟 140ms 把像素比切回高分辨率。若本次交互相机压根没动
 */
export function finishCameraMotion() {
  const hasCameraMoved = state.hasCameraMotionMoved;
  assessFrameRateForAdaptive();
  state.isCameraMotionActive = false;
  state.hasCameraMotionMoved = false;
  state.lastFrameTimestampMs = 0;
  applyRenderQualityMode();
  window.clearTimeout(state.pixelRatioRestoreTimer);
  if (!hasCameraMoved) {
    if (state.exportRenderState && !state.isExportBusy) {
      scheduleExportPresetSave();
    }
    return;
  }
  state.pixelRatioRestoreTimer = window.setTimeout(() => {
    state.pixelRatioRestoreTimer = null;
    updateRenderPixelRatio(false, {
      preserveLightCache: true
    });
  }, 140);
  if (state.exportRenderState && !state.isExportBusy) {
    scheduleExportPresetSave();
  }
}

export function createOrbitControls(orbitCamera: any) {
  const orbitControlsInstance = new OrbitControls(orbitCamera, state.renderer.domElement);
  orbitControlsInstance.enableDamping = true;
  orbitControlsInstance.rotateSmoothing = 8;
  orbitControlsInstance.rotateSmoothingThreshold = 0.000001;
  orbitControlsInstance.dampingFactor = 0.22;
  orbitControlsInstance.minDistance = 2;
  orbitControlsInstance.maxDistance = 100;
  orbitControlsInstance.minZoom = 0.35;
  orbitControlsInstance.maxZoom = 6;
  orbitControlsInstance.maxPolarAngle = MAX_CAMERA_POLAR_ANGLE;
  orbitControlsInstance.target.set(0, 0.6, 0);
  const originalControlsUpdate = orbitControlsInstance.update.bind(orbitControlsInstance);
  orbitControlsInstance.update = (deltaSeconds: any) => {
    orbitControlsInstance._quat.identity();
    orbitControlsInstance._quatInverse.identity();
    if (
      currentCameraView() !== "top" &&
      (!isStageViewerMode ||
        orbitControlsInstance._sphericalDelta.theta ||
        orbitControlsInstance._sphericalDelta.phi)
    ) {
      orbitCamera.up.set(0, 1, 0);
    }
    orbitControlsInstance.maxPolarAngle = Math.min(
      orbitControlsInstance.maxPolarAngle,
      MAX_CAMERA_POLAR_ANGLE
    );
    orbitControlsInstance.minPolarAngle = Math.min(
      orbitControlsInstance.minPolarAngle,
      orbitControlsInstance.maxPolarAngle
    );
    const didControlsUpdate = originalControlsUpdate(deltaSeconds);
    const polarAngleRad = orbitControlsInstance.getPolarAngle();
    if (
      (polarAngleRad >= orbitControlsInstance.maxPolarAngle - 1e-8 &&
        orbitControlsInstance._sphericalDelta.phi > 0) ||
      (polarAngleRad <= orbitControlsInstance.minPolarAngle + 0.000001 &&
        orbitControlsInstance._sphericalDelta.phi < 0)
    ) {
      orbitControlsInstance._sphericalDelta.phi = 0;
    }
    if (constrainCameraPosition(orbitCamera.position, orbitControlsInstance.target)) {
      if (orbitControlsInstance._sphericalDelta.phi > 0) {
        orbitControlsInstance._sphericalDelta.phi = 0;
      }
      orbitCamera.lookAt(orbitControlsInstance.target);
      orbitCamera.updateMatrixWorld();
      orbitControlsInstance.dispatchEvent({
        type: "change"
      });
      return true;
    } else {
      return didControlsUpdate;
    }
  };
  orbitControlsInstance.addEventListener("start", startCameraMotion);
  orbitControlsInstance.addEventListener("change", () => {
    updateCameraClipPlanes(orbitCamera, orbitControlsInstance.target);
    if (state.isCameraMotionActive) {
      handleCameraMotionMoved();
      invalidateRender({
        preserveLightCache: true
      });
    } else {
      invalidateRender();
    }
  });
  orbitControlsInstance.addEventListener("change", () => {
    if (!state.exportRenderState || state.isExportBusy) {
      return;
    }
    const presetSlotIndex = normalizeActiveExportPresetSlot(
      state.studioDocument?.activeExportPresetSlot,
      state.studioDocument?.exportPresets?.length
    );
    if (!state.exportPresets && !state.studioDocument?.exportPresets?.[presetSlotIndex]) {
      state.exportPresets = true;
      renderExportPresetSlots();
    }
  });
  orbitControlsInstance.addEventListener("end", finishCameraMotion);
  return orbitControlsInstance;
}

export const MIN_CAMERA_NEAR = 0.02;

export const MAX_CAMERA_NEAR = 0.32;

export const CAMERA_NEAR_DISTANCE_RATIO = 0.006;

export function updateCameraClipPlanes(clipCamera = state.previewCamera, clipTarget = state.orbitControls?.target) {
  if (!clipCamera || !clipTarget) {
    return false;
  }
  const cameraDistance = Math.max(clipCamera.position.distanceTo(clipTarget), 1);
  const nearPlane = clipCamera.isPerspectiveCamera
    ? clamp(cameraDistance * CAMERA_NEAR_DISTANCE_RATIO, MIN_CAMERA_NEAR, MAX_CAMERA_NEAR)
    : 0.02;
  const farPlane = Math.max(cameraDistance * (clipCamera.isPerspectiveCamera ? 8 : 5), 100);
  if (
    Math.abs(clipCamera.near - nearPlane) < 0.000001 &&
    Math.abs(clipCamera.far - farPlane) < 0.0001
  ) {
    return false;
  } else {
    clipCamera.near = nearPlane;
    clipCamera.far = farPlane;
    clipCamera.updateProjectionMatrix();
    return true;
  }
}

/**
 * 量出相机在目标距离处的可视高度（米），用于在透视 / 正交之间保持构图一致。正交相机取上下
 */
export function measureVisibleHeight(frameCamera: any, frameTarget: any) {
  if (frameCamera?.isOrthographicCamera) {
    return (
      Math.abs(frameCamera.top - frameCamera.bottom) / Math.max(frameCamera.zoom || 1, 0.000001)
    );
  }
  if (frameCamera?.isPerspectiveCamera) {
    const targetDistance = Math.max(frameCamera.position.distanceTo(frameTarget), 0.0001);
    const fovRad = threeModuleMin.MathUtils.degToRad(frameCamera.getEffectiveFOV());
    return targetDistance * 2 * Math.tan(fovRad / 2);
  }
  return 10;
}

export function renderExportPresetSlots() {
  const presetSlots = normalizeExportPresetSlots(state.studioDocument?.exportPresets);
  const activePresetSlot = normalizeActiveExportPresetSlot(
    state.studioDocument?.activeExportPresetSlot,
    presetSlots.length
  );
  state.studioDocument.exportPresets = presetSlots;
  state.studioDocument.activeExportPresetSlot = activePresetSlot;
  const floorNamesById = new Map<any, any>(
    (state.studioDocument?.floors || []).map((slotFloor: any) => [slotFloor.id, slotFloor.name])
  );
  exportPresetSlotsElement.replaceChildren(
    ...presetSlots.map((presetSlot, presetSlotIndexValue) => {
      const presetSlotButton = document.createElement("button");
      presetSlotButton.type = "button";
      presetSlotButton.dataset.exportPresetSlot = String(presetSlotIndexValue);
      presetSlotButton.setAttribute("role", "tab");
      const presetNameElement = document.createElement("strong");
      const presetStateElement = document.createElement("small");
      presetNameElement.textContent =
        presetSlot?.name || floorNamesById.get(presetSlot?.floorId) || "未命名存档";
      presetStateElement.textContent = presetSlot ? "已设置" : "未设置";
      const isActivePresetSlot = presetSlotIndexValue === activePresetSlot;
      presetSlotButton.classList.toggle("active", isActivePresetSlot);
      presetSlotButton.classList.toggle("has-value", !!presetSlot);
      presetSlotButton.setAttribute("aria-selected", String(isActivePresetSlot));
      // 悬停给出分辨率 / 楼层 / 投影：档位名是用户自起的，常常看不出这个档位到底导什么。
      presetSlotButton.title = presetSlot
        ? presetNameElement.textContent +
          "：已设置（" +
          exportPresetSummary(presetSlot, floorNamesById) +
          "）"
        : presetNameElement.textContent + "：未设置";
      presetSlotButton.append(presetNameElement, presetStateElement);
      return presetSlotButton;
    })
  );
  const activePreset = presetSlots[activePresetSlot];
  exportPresetAddButton.disabled = presetSlots.length >= MAX_EXPORT_PRESET_COUNT;
  exportPresetRenameButton.disabled = !activePreset;
  exportPresetDeleteButton.disabled = presetSlots.length <= 1;
  const isPresetEmpty = exportPresetIsEmpty(activePreset, state.exportPresets);
  exportPresetEmptyStateElement.hidden = !isPresetEmpty;
  exportPresetEmptyTitleElement.textContent = activePreset
    ? exportPresetLabel(activePreset, activePresetSlot) + "已设置"
    : "当前存档尚未设置";
}

/**
 * 用当前画布状态生成一份导出档位快照（分辨率、楼层、勾选文件、相机位姿）。透视模式下会先把
 */
export function buildExportPreset({ name: presetName = "" } = {}) {
  if (state.previewCamera.isPerspectiveCamera) {
    const cameraFocalInputElement = selectElement("#camera-focal-length");
    const presetFocalLength = clamp(
      finite(cameraFocalInputElement?.value, currentFocalLength()),
      18,
      120
    );
    cameraSettingsSource().cameraFocalLength = presetFocalLength;
    for (const focalInputElement of cameraFocalLengthInputs) {
      (focalInputElement as any).value = String(Math.round(presetFocalLength));
    }
    applyFocalLength(state.previewCamera, presetFocalLength);
  }
  const { width: presetWidthPx, height: presetHeightPx } = exportDimensions();
  const presetTarget = state.orbitControls.target;
  return normalizeExportPreset({
    name: presetName,
    width: presetWidthPx,
    height: presetHeightPx,
    lockRatio: exportLockRatioInput.checked,
    floorMode: currentPreviewFloorMode() === "all" ? "all" : "floor",
    floorId: getCurrentFloor()?.id || state.activeFloorId,
    floorGap: finite(state.studioDocument.exportFloorGap, 3),
    camera: {
      mode: state.previewCamera.isPerspectiveCamera ? "perspective" : "orthographic",
      view: currentCameraView(),
      topRotation: currentTopRotationDeg(),
      position: {
        x: state.previewCamera.position.x,
        y: state.previewCamera.position.y,
        z: state.previewCamera.position.z
      },
      target: {
        x: presetTarget.x,
        y: presetTarget.y,
        z: presetTarget.z
      },
      visibleHeight: measureVisibleHeight(state.previewCamera, presetTarget),
      fov: state.previewCamera.isPerspectiveCamera ? state.previewCamera.fov : 36,
      focalLength: state.previewCamera.isPerspectiveCamera ? currentFocalLength() : null
    },
    folderName: exportFolderNameInput.value,
    selectedFiles: [...collectCheckedExportFileKeys()]
  });
}

/**
 * 把当前画布状态写回活动档位（导出视角的自动保存）。仅在导出态且非导出进行中生效；
 */
export function saveActiveExportPreset() {
  window.clearTimeout(state.saveRetryTimer);
  state.saveRetryTimer = null;
  if (!state.exportPresets) {
    return false;
  }
  const activePresetSlotIndex = normalizeActiveExportPresetSlot(
    state.studioDocument?.activeExportPresetSlot,
    state.studioDocument?.exportPresets?.length
  );
  if (!state.exportRenderState || state.isExportBusy) {
    return false;
  }
  state.studioDocument.exportPresets = normalizeExportPresetSlots(state.studioDocument.exportPresets);
  const activePresetName = state.studioDocument.exportPresets[activePresetSlotIndex]?.name || "";
  state.studioDocument.exportPresets[activePresetSlotIndex] = buildExportPreset({
    name: activePresetName
  });
  state.exportPresets = false;
  renderExportPresetSlots();
  markDocumentDirty();
  return true;
}

/**
 * 防抖地保存活动档位：360ms 内的多次相机变更只落一次盘。
 */
export function scheduleExportPresetSave() {
  if (!!state.exportRenderState && !state.isExportBusy) {
    state.exportPresets = true;
    renderExportPresetSlots();
    window.clearTimeout(state.saveRetryTimer);
    state.saveRetryTimer = window.setTimeout(saveActiveExportPreset, 360);
  }
}

/**
 * 计算档位在界面上的显示名：优先用户命名，其次楼层名，最后退化为「存档 NN」。
 */
export function exportPresetLabel(preset: any, labelSlotIndex: any) {
  if (!preset) {
    return "存档 " + String(labelSlotIndex + 1).padStart(2, "0");
  }
  // 档位可能引用已被删除的楼层，这里按 id 查楼层名作为显示名兜底，查不到则为空。
  const presetFloorName = (state.studioDocument?.floors || []).find(
    (floorCandidate: any) => floorCandidate.id === preset.floorId
  )?.name;
  return preset.name || presetFloorName || "存档 " + String(labelSlotIndex + 1).padStart(2, "0");
}

/**
 * 收集导出文件列表中被勾选的键集合。
 */
export function collectCheckedExportFileKeys() {
  return new Set(
    [...exportDialogElement.querySelectorAll("input[data-export-file]:checked")].map(
      checkedInputElement => checkedInputElement.dataset.exportFile
    )
  );
}
