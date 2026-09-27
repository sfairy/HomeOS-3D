/**
 * 自 studio-app.ts 外提的独立单元（Phase A：安全外提）。
 * 对本模块之外的 studio-app.ts 内部零依赖：只引用 import 与自身成员，故不存在循环引用。
 */
import {
  applyRenderQualityMode,
  cameraSettingsSource,
  computeSceneBoundingBox,
  currentCameraView
} from "./studio-render-pipeline.js";
import { state } from "./studio-state.js";
import {
  applyFocalLength,
  cameraFocalLengthInputs,
  createOrbitControls,
  currentFocalLength,
  currentTopRotationDeg,
  measureVisibleHeight,
  updateCameraClipPlanes
} from "./studio-camera-presets.js";
import {
  currentPixelsPerMeter,
  currentPreviewFloorMode,
  selectElement
} from "./studio-plan-render.js";
import { computeFloorBounds } from "./studio-overview-center.js";
import * as threeModuleMin from "/static/vendor/three/0.186.0/three.module.min.js";
import { clamp } from "../plan/geometry.js";
import {
  markDocumentDirty,
  showToast
} from "./studio-document-save.js";
import { syncControlValue } from "./ui-controls.js";
import {
  PREVIEW_OBJECT_LAYER,
  isStageViewerMode
} from "./studio-architecture.js";

export const cameraViewButtons = [...document.querySelectorAll("[data-camera-view]")];

export const cameraRotateTopButtons = [...document.querySelectorAll("[data-camera-rotate-top]")];

export const cameraModeButtons = [...document.querySelectorAll("[data-camera-mode]")];

export function cloneSceneForHistory(sourceScene = state.activeScene) {
  return structuredClone(sourceScene);
}

/**
 * 在改动文档前压入一条撤销快照，并清空重做栈。栈上限 40 步：再多也几乎没人会连点 40 次
 */
export function pushHistorySnapshot() {
  state.undoStack.push(cloneSceneForHistory());
  if (state.undoStack.length > 40) {
    state.undoStack.shift();
  }
  state.redoStack = [];
}

/**
 * 当前相机投影模式，只有透视与正交两种。用「是不是 perspective」来判断而非白名单校验
 */
export function currentCameraMode() {
  if (cameraSettingsSource()?.cameraMode === "perspective") {
    return "perspective";
  } else {
    return "orthographic";
  }
}

/**
 * 计算俯视图相机的「上方向」向量，使平面图按相机顶旋角在屏幕上摆正。相机在俯视时 up 取
 */
export function topViewUpVector(rotationDeg = currentTopRotationDeg()) {
  const rotationAngleRad = threeModuleMin.MathUtils.degToRad(rotationDeg);
  return new threeModuleMin.Vector3(Math.sin(rotationAngleRad), 0, -Math.cos(rotationAngleRad));
}

export function syncCameraModeButtons(cameraMode = currentCameraMode()) {
  for (const cameraModeButton of cameraModeButtons) {
    cameraModeButton.classList.toggle("active", (cameraModeButton as any).dataset.cameraMode === cameraMode);
  }
  syncFocalLengthInputs(cameraMode);
}

/**
 * 同步「视角」工具栏的选中态：高亮当前视角按钮，并只在顶视图下启用顶旋按钮。active 类与
 */
export function syncCameraViewButtons(cameraView = currentCameraView()) {
  for (const cameraViewButton of cameraViewButtons) {
    const isCameraViewActive = (cameraViewButton as any).dataset.cameraView === cameraView;
    cameraViewButton.classList.toggle("active", isCameraViewActive);
    cameraViewButton.setAttribute("aria-pressed", String(isCameraViewActive));
  }
  for (const cameraRotateButton of cameraRotateTopButtons) {
    (cameraRotateButton as any).disabled = cameraView !== "top";
  }
}

/**
 * 把焦距回填到各处的焦距输入框，并按投影模式控制可用性。正交相机没有焦距概念，因此非透视
 */
export function syncFocalLengthInputs(syncCameraMode = currentCameraMode()) {
  for (const focalLengthInputElement of cameraFocalLengthInputs) {
    syncControlValue(focalLengthInputElement, Math.round(currentFocalLength()));
    (focalLengthInputElement as any).disabled = syncCameraMode !== "perspective";
    focalLengthInputElement
      .closest(".camera-focal-control")
      ?.classList.toggle("is-disabled", (focalLengthInputElement as any).disabled);
  }
}

/**
 * 取当前模式下已保存的固定相机视角快照。总览模式读文档级的 combinedFixedCameraView，
 */
export function savedCameraView() {
  if (currentPreviewFloorMode() === "all") {
    return state.studioDocument?.combinedFixedCameraView;
  } else {
    return state.activeScene.settings?.fixedCameraView;
  }
}

export function restoreStoredCameraView(restoreViewOptions: any = {}) {
  const storedView = savedCameraView();
  if (!storedView || !state.previewCamera || !state.orbitControls) {
    return;
  }
  const modeChanged = storedView.mode !== currentCameraMode();
  const viewChanged = storedView.view !== currentCameraView();
  const topRotationChanged = storedView.topRotation !== currentTopRotationDeg();
  const focalLengthChanged =
    storedView.focalLength !== null &&
    Math.abs(storedView.focalLength - currentFocalLength()) > 1e-8;
  const shouldRecordChange = restoreViewOptions.recordChange !== false;
  if (
    (modeChanged || viewChanged || topRotationChanged || focalLengthChanged) &&
    shouldRecordChange
  ) {
    pushHistorySnapshot();
  }
  const storedCameraSettings = cameraSettingsSource();
  storedCameraSettings.cameraMode = storedView.mode;
  storedCameraSettings.cameraView = storedView.view;
  storedCameraSettings.cameraTopRotation = storedView.topRotation;
  if (storedView.focalLength !== null) {
    storedCameraSettings.cameraFocalLength = storedView.focalLength;
  }
  applyCameraMode(storedView.mode, {
    preserveView: false
  });
  const cameraTargetVector = new threeModuleMin.Vector3(
    storedView.target.x,
    storedView.target.y,
    storedView.target.z
  );
  state.previewCamera.position.set(storedView.position.x, storedView.position.y, storedView.position.z);
  state.previewCamera.up.copy(
    storedView.view === "top"
      ? topViewUpVector(storedView.topRotation)
      : new threeModuleMin.Vector3(0, 1, 0)
  );
  state.previewCamera.userData.frameSize = storedView.visibleHeight;
  state.previewCamera.userData.cameraView = storedView.view;
  state.previewCamera.userData.topRotation = storedView.topRotation;
  state.previewCamera.userData.viewportAspect ||= Math.max(
    selectElement("#preview-3d").clientWidth /
      Math.max(selectElement("#preview-3d").clientHeight, 1),
    0.1
  );
  state.previewCamera.zoom = 1;
  if (state.previewCamera.isPerspectiveCamera) {
    state.previewCamera.aspect = state.previewCamera.userData.viewportAspect;
    if (storedView.focalLength !== null) {
      applyFocalLength(state.previewCamera, storedView.focalLength);
    } else {
      state.previewCamera.fov = storedView.fov;
      state.previewCamera.updateProjectionMatrix();
      storedCameraSettings.cameraFocalLength = clamp(state.previewCamera.getFocalLength(), 18, 120);
    }
  } else {
    applyOrthographicFrame(
      storedView.visibleHeight,
      state.previewCamera.userData.viewportAspect,
      state.previewCamera
    );
  }
  updateCameraClipPlanes(state.previewCamera, cameraTargetVector);
  state.previewCamera.lookAt(cameraTargetVector);
  state.previewCamera.updateProjectionMatrix();
  state.orbitControls.target.copy(cameraTargetVector);
  applyRenderQualityMode();
  state.orbitControls.update();
  syncCameraModeButtons(storedView.mode);
  syncCameraViewButtons(storedView.view);
  if (
    (modeChanged || viewChanged || topRotationChanged || focalLengthChanged) &&
    shouldRecordChange
  ) {
    markDocumentDirty();
  }
  if (!restoreViewOptions.silent) {
    const restoreViewLabel = currentPreviewFloorMode() === "all" ? "总览视角" : "当前层视角";
    showToast("已恢复上次保存的" + restoreViewLabel + "。");
  }
}

export function applyCameraMode(requestedMode: any, modeOptions: any = {}) {
  const normalizedMode = requestedMode === "perspective" ? "perspective" : "orthographic";
  syncCameraModeButtons(normalizedMode);
  if (!state.renderer) {
    return;
  }
  if ((normalizedMode === "perspective") == !!state.previewCamera?.isPerspectiveCamera) {
    applyFocalLength();
    applyRenderQualityMode();
    return;
  }
  const shouldPreserveView = modeOptions.preserveView !== false;
  const previousCamera = state.previewCamera;
  const orbitTarget = state.orbitControls?.target.clone() || new threeModuleMin.Vector3(0, 0.6, 0);
  const offsetVector = previousCamera
    ? previousCamera.position.clone().sub(orbitTarget)
    : new threeModuleMin.Vector3(1.12, 1.42, 1.2);
  const offsetLength = Math.max(offsetVector.length(), 2);
  const cameraDirection =
    offsetVector.lengthSq() > 1e-8
      ? offsetVector.normalize()
      : new threeModuleMin.Vector3(1.12, 1.42, 1.2).normalize();
  const viewportAspect =
    previousCamera?.userData.viewportAspect ||
    Math.max(
      selectElement("#preview-3d").clientWidth /
        Math.max(selectElement("#preview-3d").clientHeight, 1),
      0.1
    );
  const currentVisibleHeight =
    shouldPreserveView && previousCamera
      ? measureVisibleHeight(previousCamera, orbitTarget)
      : previousCamera?.userData.frameSize || 10;
  state.orbitControls?.dispose();
  if (normalizedMode === "perspective") {
    state.previewCamera = new threeModuleMin.PerspectiveCamera(36, viewportAspect, 0.02, 200);
    applyFocalLength(state.previewCamera);
    const perspectiveDistance =
      currentVisibleHeight /
      (Math.tan(threeModuleMin.MathUtils.degToRad(state.previewCamera.getEffectiveFOV()) / 2) * 2);
    const placementDistance = shouldPreserveView ? perspectiveDistance : offsetLength;
    state.previewCamera.position
      .copy(orbitTarget)
      .addScaledVector(cameraDirection, Math.max(placementDistance, 2));
  } else {
    state.previewCamera = new threeModuleMin.OrthographicCamera(-5, 5, 5, -5, 0.02, 200);
    state.previewCamera.position.copy(orbitTarget).addScaledVector(cameraDirection, offsetLength);
    applyOrthographicFrame(currentVisibleHeight, viewportAspect, state.previewCamera);
  }
  state.previewCamera.layers.enable(PREVIEW_OBJECT_LAYER);
  state.previewCamera.userData.viewportAspect = viewportAspect;
  state.previewCamera.userData.frameSize = currentVisibleHeight;
  state.previewCamera.userData.cameraView = previousCamera?.userData.cameraView || "free";
  state.previewCamera.userData.topRotation = previousCamera?.userData.topRotation || 0;
  state.previewCamera.up.copy(previousCamera?.up || new threeModuleMin.Vector3(0, 1, 0));
  updateCameraClipPlanes(state.previewCamera, orbitTarget);
  state.previewCamera.lookAt(orbitTarget);
  state.previewCamera.updateProjectionMatrix();
  state.orbitControls = createOrbitControls(state.previewCamera);
  state.orbitControls.target.copy(orbitTarget);
  applyRenderQualityMode();
  if (!isStageViewerMode || modeOptions.deferControlUpdate !== true) {
    state.orbitControls.update();
  }
}

/**
 * 按可视高度与视口纵横比设置正交相机的视锥边界。aspect ≥ 1 时以高度为准向两侧扩宽；
 */
export function applyOrthographicFrame(frameVisibleHeight: any, aspect: any, orthoCamera = state.previewCamera) {
  if (!orthoCamera?.isOrthographicCamera) {
    return;
  }
  const halfHeight = Math.max(frameVisibleHeight, 1) / 2;
  if (aspect >= 1) {
    orthoCamera.left = -halfHeight * aspect;
    orthoCamera.right = halfHeight * aspect;
    orthoCamera.top = halfHeight;
    orthoCamera.bottom = -halfHeight;
  } else {
    orthoCamera.left = -halfHeight;
    orthoCamera.right = halfHeight;
    orthoCamera.top = halfHeight / Math.max(aspect, 0.1);
    orthoCamera.bottom = -halfHeight / Math.max(aspect, 0.1);
  }
  orthoCamera.updateProjectionMatrix();
}

export function resetCameraView(cameraViewOptions: any = {}) {
  if (!state.previewCamera || !state.orbitControls) {
    return;
  }
  const nextView =
    cameraViewOptions.view === "top"
      ? "top"
      : cameraViewOptions.view === "free"
        ? "free"
        : currentCameraView();
  const viewTopRotationDeg = currentTopRotationDeg();
  const isFloorOverview = currentPreviewFloorMode() === "all";
  const cameraPixelsPerMeter = currentPixelsPerMeter() || 100;
  const cameraFloorBounds = computeFloorBounds();
  const cameraSceneBounds = computeSceneBoundingBox({
    excludeModelLayers: new Set(["items", "lights"])
  });
  const sceneSize =
    isFloorOverview && !cameraSceneBounds.isEmpty()
      ? cameraSceneBounds.getSize(new threeModuleMin.Vector3())
      : null;
  const sceneCenter = cameraSceneBounds.isEmpty()
    ? null
    : cameraSceneBounds.getCenter(new threeModuleMin.Vector3());
  const orthoFrameSize =
    isFloorOverview && sceneSize
      ? clamp(Math.max(sceneSize.x, sceneSize.z), 5, 100)
      : clamp(
          Math.max(cameraFloorBounds.width, cameraFloorBounds.height) / cameraPixelsPerMeter,
          5,
          35
        );
  const maxWallHeight =
    isFloorOverview && sceneSize
      ? sceneSize.y
      : Math.max(0, ...state.activeScene.walls.map((sceneWall: any) => sceneWall.height || 0));
  const frameExtent = Math.max(orthoFrameSize * 1.18, orthoFrameSize + maxWallHeight * 0.32);
  state.previewCamera.userData.frameSize = frameExtent;
  state.previewCamera.userData.cameraView = nextView;
  state.previewCamera.userData.topRotation = viewTopRotationDeg;
  const resetTargetPoint = sceneCenter
    ? new threeModuleMin.Vector3(sceneCenter.x, sceneCenter.y, sceneCenter.z)
    : new threeModuleMin.Vector3(0, Math.min(0.78, orthoFrameSize * 0.055), 0);
  let resetCameraDistance;
  if (state.previewCamera.isPerspectiveCamera) {
    state.previewCamera.aspect = state.previewCamera.userData.viewportAspect || 1;
    applyFocalLength();
    const boundsDiagonal =
      frameExtent /
      (Math.tan(threeModuleMin.MathUtils.degToRad(state.previewCamera.getEffectiveFOV()) / 2) * 2);
    resetCameraDistance = Math.max(boundsDiagonal * 1.04, orthoFrameSize * 1.65, 8);
  } else {
    applyOrthographicFrame(frameExtent, state.previewCamera.userData.viewportAspect || 1);
    resetCameraDistance = Math.max(orthoFrameSize * 3.2, 18);
  }
  if (nextView === "top") {
    state.previewCamera.up.copy(topViewUpVector(viewTopRotationDeg));
    state.previewCamera.position.set(
      resetTargetPoint.x,
      resetTargetPoint.y + resetCameraDistance,
      resetTargetPoint.z
    );
  } else {
    state.previewCamera.up.set(0, 1, 0);
    const resetCameraDirection = new threeModuleMin.Vector3(1.08, 1.7, 1.12).normalize();
    state.previewCamera.position
      .copy(resetTargetPoint)
      .addScaledVector(resetCameraDirection, resetCameraDistance);
  }
  updateCameraClipPlanes(state.previewCamera, resetTargetPoint);
  state.previewCamera.zoom = 1;
  state.previewCamera.lookAt(resetTargetPoint);
  state.previewCamera.updateProjectionMatrix();
  state.orbitControls.target.copy(resetTargetPoint);
  applyRenderQualityMode();
  state.orbitControls.update();
}
