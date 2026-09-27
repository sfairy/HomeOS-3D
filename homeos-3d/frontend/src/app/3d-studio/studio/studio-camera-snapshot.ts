/**
 * 自 studio-app.ts 外提的独立单元（Phase A：安全外提）。
 * 对本模块之外的 studio-app.ts 内部零依赖：只引用 import 与自身成员，故不存在循环引用。
 */
import {
  applyFocalLength,
  currentTopRotationDeg,
  measureVisibleHeight,
  updateCameraClipPlanes
} from "./studio-camera-presets.js";
import {
  applyCameraMode,
  applyOrthographicFrame,
  resetCameraView,
  syncCameraViewButtons,
  topViewUpVector
} from "./studio-camera-mode.js";
import { state } from "./studio-state.js";
import {
  applyRenderQualityMode,
  currentCameraView
} from "./studio-render-pipeline.js";
import * as threeModuleMin from "/static/vendor/three/0.186.0/three.module.min.js";

/**
 * 切换相机视角（free / top），必要时重排相机位置。顶视图把相机抬到目标上方（透视按可视高度
 */
export function applyCameraView(requestedView: any, viewRequestOptions: any = {}) {
  const normalizedView = requestedView === "top" ? "top" : "free";
  const topRotationDeg = currentTopRotationDeg();
  syncCameraViewButtons(normalizedView);
  if (!state.previewCamera || !state.orbitControls) {
    return;
  }
  if (
    state.previewCamera.userData.cameraView === normalizedView &&
    (normalizedView !== "top" || state.previewCamera.userData.topRotation === topRotationDeg) &&
    viewRequestOptions.force !== true
  ) {
    applyRenderQualityMode();
    return;
  }
  if (normalizedView === "free") {
    resetCameraView({
      view: "free"
    });
    return;
  }
  const cameraTarget = state.orbitControls.target.clone();
  const visibleHeight = measureVisibleHeight(state.previewCamera, cameraTarget);
  const targetDistanceToCamera = Math.max(state.previewCamera.position.distanceTo(cameraTarget), 8);
  state.previewCamera.up.copy(topViewUpVector(topRotationDeg));
  if (state.previewCamera.isPerspectiveCamera) {
    applyFocalLength();
    const topViewFovRad = threeModuleMin.MathUtils.degToRad(state.previewCamera.getEffectiveFOV());
    const cameraHeight = Math.max(visibleHeight / (Math.tan(topViewFovRad / 2) * 2), 8);
    state.previewCamera.position.set(cameraTarget.x, cameraTarget.y + cameraHeight, cameraTarget.z);
  } else {
    applyOrthographicFrame(
      visibleHeight,
      state.previewCamera.userData.viewportAspect || 1,
      state.previewCamera
    );
    state.previewCamera.position.set(
      cameraTarget.x,
      cameraTarget.y + targetDistanceToCamera,
      cameraTarget.z
    );
  }
  state.previewCamera.userData.frameSize = visibleHeight;
  state.previewCamera.userData.cameraView = "top";
  state.previewCamera.userData.topRotation = topRotationDeg;
  updateCameraClipPlanes(state.previewCamera, cameraTarget);
  state.previewCamera.lookAt(cameraTarget);
  state.previewCamera.updateProjectionMatrix();
  state.orbitControls.target.copy(cameraTarget);
  applyRenderQualityMode();
  state.orbitControls.update();
}

/**
 * 采集当前相机状态快照，供导出 / 打印流程保存与还原。
 */
export function captureCameraSnapshot() {
  if (!state.previewCamera || !state.orbitControls) {
    return null;
  } else {
    return {
      mode: state.previewCamera.isPerspectiveCamera ? "perspective" : "orthographic",
      cameraView: state.previewCamera.userData.cameraView || currentCameraView(),
      topRotation: state.previewCamera.userData.topRotation || 0,
      position: state.previewCamera.position.clone(),
      target: state.orbitControls.target.clone(),
      up: state.previewCamera.up.clone(),
      zoom: state.previewCamera.zoom,
      visibleHeight: measureVisibleHeight(state.previewCamera, state.orbitControls.target),
      frameSize:
        state.previewCamera.userData.frameSize ||
        measureVisibleHeight(state.previewCamera, state.orbitControls.target),
      viewportAspect: state.previewCamera.userData.viewportAspect || 1,
      fov: state.previewCamera.isPerspectiveCamera ? state.previewCamera.fov : 36,
      near: state.previewCamera.near,
      far: state.previewCamera.far
    };
  }
}

/**
 * 把相机快照应用到当前相机与控制器（导出 / 打印前的还原入口）。快照里的投影模式可能与当前
 */
export function applyCameraSnapshot(snapshot: any, snapshotAspect = snapshot?.viewportAspect || 1) {
  if (!!snapshot && !!state.renderer) {
    applyCameraMode(snapshot.mode, {
      preserveView: false
    });
    state.previewCamera.position.copy(snapshot.position);
    state.previewCamera.up.copy(snapshot.up);
    state.previewCamera.zoom = snapshot.zoom || 1;
    state.previewCamera.near = snapshot.near;
    state.previewCamera.far = snapshot.far;
    state.previewCamera.userData.frameSize = snapshot.frameSize;
    state.previewCamera.userData.viewportAspect = snapshotAspect;
    state.previewCamera.userData.cameraView = snapshot.cameraView || currentCameraView();
    state.previewCamera.userData.topRotation = snapshot.topRotation || 0;
    if (state.previewCamera.isPerspectiveCamera) {
      state.previewCamera.fov = snapshot.fov;
      state.previewCamera.aspect = snapshotAspect;
    } else {
      applyOrthographicFrame(snapshot.frameSize, snapshotAspect, state.previewCamera);
    }
    state.previewCamera.lookAt(snapshot.target);
    state.previewCamera.updateProjectionMatrix();
    state.orbitControls.target.copy(snapshot.target);
    applyRenderQualityMode();
    state.orbitControls.update();
  }
}
