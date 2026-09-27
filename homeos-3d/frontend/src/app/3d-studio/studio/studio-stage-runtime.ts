/**
 * 舞台运行时：相机/投影混合、轨道控制切面与楼层切换装配
 *
 * 自 studio-app.ts 的 createStageController 内簇工厂化外提。
 * 对 studio-app.ts 内部零依赖（模块级依赖 0），故不存在循环引用；
 * 簇内可变状态经 getter/setter 暴露；簇外局部经 deps 注入。
 */
import { createFloorTransition } from "./studio-floor-transition.js";
import * as threeModuleMin from "/static/vendor/three/0.186.0/three.module.min.js";
import { state } from "./studio-state.js";
import { disposeSceneSubtree } from "./studio-mesh-geometry.js";
import {
  applyShadowBudget,
  cameraSettingsSource,
  computeSceneBoundingBox,
  currentCameraView,
  fitDirectionalShadowCamera,
  invalidateRender
} from "./studio-render-pipeline.js";
import {
  currentPreviewFloorMode,
  isAdaptiveLightCacheEnabled
} from "./studio-plan-render.js";
import {
  MAX_CAMERA_POLAR_ANGLE,
  constrainCameraPosition
} from "./studio-camera-constraints.js";
import { computeOverviewCenter } from "./studio-overview-center.js";
import { createFloorEffectsController } from "./studio-floor-effects.js";
import { createFloorCacheController } from "./studio-floor-cache.js";
import { createOrbitControls } from "./studio-camera-presets.js";

/* ---------- 工厂 ---------- */

export function createStageRuntimeController(deps: {
  isCameraMotionRunning: () => any;
  isControlInteractionActive: {
    get: () => any;
    set: (next: any) => void;
  };
  lightTransitionController: () => any;
}) {
  const floorCacheController = createFloorCacheController();
  let isCameraInteractionEnabled = false;
  let orbitPivotOverride: any;
  let boundOrbitControls: any;
  let boundsCacheModelRoot: any;
  let boundsCacheSceneRevision: any;
  let boundsCacheFloorKey: any;
  let boundsCacheCenter: any = null;
  const boundsExcludedModelLayers = new Set(["items", "lights"]);
  let rotationConstraintMode = "free";
  let controlsPanEnabled = true;
  let controlsZoomEnabled = true;
  let focusViewportRatio = 0;
  let projectionSignatureValue = "";
  let cameraBlendState: any = null;
  const orthographicBlendCamera = new threeModuleMin.OrthographicCamera();
  const perspectiveBlendCamera = new threeModuleMin.PerspectiveCamera();
  const projectionBlendCache: any = {
    matrix: new threeModuleMin.Matrix4()
  };
  const rendererSizeVector = new threeModuleMin.Vector2();
  /**
   * 按给定相机位姿估算其可见世界高度，用于正交与透视相机之间的过渡混合。
   * @param {object} poseForHeight 相机位姿：正交看 frameSize/zoom，透视看 focalLength/position/target。
   * @returns {number} 该位姿下的可见高度（米）。
   */
  function measurePoseVisibleHeight(poseForHeight: any) {
    if (poseForHeight.mode !== "perspective") {
      return (
        Math.max(1, poseForHeight.frameSize || 10) /
        poseForHeight.zoom /
        Math.min(1, Math.max(0.1, state.previewCamera.userData.viewportAspect || 1))
      );
    } else {
      perspectiveBlendCamera.aspect = state.previewCamera.userData.viewportAspect || 1;
      perspectiveBlendCamera.zoom = poseForHeight.zoom;
      perspectiveBlendCamera.setFocalLength(poseForHeight.focalLength || 50);
      return (
        new threeModuleMin.Vector3()
          .fromArray(poseForHeight.position)
          .distanceTo(new threeModuleMin.Vector3().fromArray(poseForHeight.target)) *
        2 *
        Math.tan(threeModuleMin.MathUtils.degToRad(perspectiveBlendCamera.getEffectiveFOV()) / 2)
      );
    }
  }
  /**
   * @returns {void} 无返回值。
   */
  function applyBlendedProjection() {
    if (!cameraBlendState) {
      return;
    }
    const blendCameraDistance = Math.max(
      0.000001,
      state.previewCamera.position.distanceTo(state.orbitControls.target)
    );
    const blendVisibleHeight = Math.max(0.000001, cameraBlendState.height);
    const blendViewportAspect = state.previewCamera.userData.viewportAspect || 1;
    const blendWeight = cameraBlendState.weight;
    const cameraViewportState = state.previewCamera.view;
    const referenceViewportState = orthographicBlendCamera.view;
    const isViewportStateEqual =
      cameraViewportState === referenceViewportState ||
      (cameraViewportState &&
        referenceViewportState &&
        cameraViewportState.enabled === referenceViewportState.enabled &&
        cameraViewportState.fullWidth === referenceViewportState.fullWidth &&
        cameraViewportState.fullHeight === referenceViewportState.fullHeight &&
        cameraViewportState.offsetX === referenceViewportState.offsetX &&
        cameraViewportState.offsetY === referenceViewportState.offsetY &&
        cameraViewportState.width === referenceViewportState.width &&
        cameraViewportState.height === referenceViewportState.height);
    if (
      projectionBlendCache.motion === cameraBlendState &&
      projectionBlendCache.camera === state.previewCamera &&
      projectionBlendCache.distance === blendCameraDistance &&
      projectionBlendCache.height === blendVisibleHeight &&
      projectionBlendCache.aspect === blendViewportAspect &&
      projectionBlendCache.weight === blendWeight &&
      projectionBlendCache.near === state.previewCamera.near &&
      projectionBlendCache.far === state.previewCamera.far &&
      isViewportStateEqual &&
      projectionBlendCache.matrix.equals(state.previewCamera.projectionMatrix)
    ) {
      return;
    }
    Object.assign(orthographicBlendCamera, {
      left: (-blendVisibleHeight * blendViewportAspect) / 2,
      right: (blendVisibleHeight * blendViewportAspect) / 2,
      top: blendVisibleHeight / 2,
      bottom: -blendVisibleHeight / 2,
      near: state.previewCamera.near,
      far: state.previewCamera.far,
      zoom: 1
    });
    Object.assign(perspectiveBlendCamera, {
      fov: threeModuleMin.MathUtils.radToDeg(
        Math.atan(blendVisibleHeight / (blendCameraDistance * 2)) * 2
      ),
      aspect: blendViewportAspect,
      near: state.previewCamera.near,
      far: state.previewCamera.far,
      zoom: 1
    });
    for (const blendCamera of [orthographicBlendCamera, perspectiveBlendCamera]) {
      blendCamera.view = state.previewCamera.view
        ? {
            ...state.previewCamera.view
          }
        : null;
      blendCamera.updateProjectionMatrix();
    }
    const orthoProjectionElements = orthographicBlendCamera.projectionMatrix.elements;
    const perspectiveProjectionElements = perspectiveBlendCamera.projectionMatrix.elements;
    for (let matrixElementIndex = 0; matrixElementIndex < 16; matrixElementIndex++) {
      state.previewCamera.projectionMatrix.elements[matrixElementIndex] =
        orthoProjectionElements[matrixElementIndex] * (1 - blendWeight) +
        (perspectiveProjectionElements[matrixElementIndex] / blendCameraDistance) * blendWeight;
    }
    state.previewCamera.projectionMatrixInverse.copy(state.previewCamera.projectionMatrix).invert();
    projectionBlendCache.motion = cameraBlendState;
    projectionBlendCache.camera = state.previewCamera;
    projectionBlendCache.distance = blendCameraDistance;
    projectionBlendCache.height = blendVisibleHeight;
    projectionBlendCache.aspect = blendViewportAspect;
    projectionBlendCache.weight = blendWeight;
    projectionBlendCache.near = state.previewCamera.near;
    projectionBlendCache.far = state.previewCamera.far;
    projectionBlendCache.matrix.copy(state.previewCamera.projectionMatrix);
  }
  /**
   * 同步预览投影：渲染尺寸 / 聚焦视口 / 相机变化时重设 viewOffset，未变化则只更新混合投影。
   * @returns {void} 无返回值。
   */
  function syncPreviewProjection() {
    state.renderer.getSize(rendererSizeVector);
    const rendererWidthPx = Math.max(rendererSizeVector.x || 1, 1);
    const rendererHeightPx = Math.max(rendererSizeVector.y || 1, 1);
    const projectionSignatureKey =
      rendererWidthPx +
      "/" +
      rendererHeightPx +
      "/" +
      focusViewportRatio +
      "/" +
      state.previewCamera.uuid;
    if (projectionSignatureKey === projectionSignatureValue) {
      applyBlendedProjection();
      return;
    }
    projectionSignatureValue = projectionSignatureKey;
    if (focusViewportRatio) {
      state.previewCamera.setViewOffset(
        rendererWidthPx,
        rendererHeightPx,
        (rendererWidthPx * focusViewportRatio) / 2,
        0,
        rendererWidthPx,
        rendererHeightPx
      );
    } else {
      state.previewCamera.clearViewOffset();
    }
    applyBlendedProjection();
  }
  /**
   * 把当前控制约束（平移 / 缩放开关与旋转轴向锁定）应用到轨道控制器。
   * @returns {void} 无返回值。
   */
  function applyControlConstraints() {
    state.orbitControls.enablePan = controlsPanEnabled;
    state.orbitControls.enableZoom = controlsZoomEnabled;
    if (rotationConstraintMode === "horizontal") {
      state.orbitControls.minPolarAngle = state.orbitControls.maxPolarAngle = state.orbitControls.getPolarAngle();
    }
    if (rotationConstraintMode === "vertical") {
      state.orbitControls.minAzimuthAngle = state.orbitControls.maxAzimuthAngle =
        state.orbitControls.getAzimuthalAngle();
    }
  }
  /**
   * 取轨道旋转中心：按模型根 / 场景版本号 / 楼层键做缓存，失效时用总览中心或场景包围盒中心重算。
   * @returns {object} 中心的克隆（Three.js Vector3）。
   */
  function resolveOrbitCenter(fallbackCenterTarget: any) {
    const orbitCenterFloorKey = currentPreviewFloorMode() === "all" ? "all" : state.activeFloorId;
    if (
      boundsCacheModelRoot !== state.previewModelRoot ||
      boundsCacheSceneRevision !== state.sceneCacheRevision ||
      boundsCacheFloorKey !== orbitCenterFloorKey
    ) {
      const orbitOverviewCenter = computeOverviewCenter();
      const orbitSceneBounds = orbitOverviewCenter
        ? null
        : computeSceneBoundingBox({
            excludeModelLayers: boundsExcludedModelLayers
          });
      boundsCacheModelRoot = state.previewModelRoot;
      boundsCacheSceneRevision = state.sceneCacheRevision;
      boundsCacheFloorKey = orbitCenterFloorKey;
      boundsCacheCenter =
        orbitOverviewCenter ||
        (orbitSceneBounds.isEmpty()
          ? null
          : orbitSceneBounds.getCenter(new threeModuleMin.Vector3()));
    }
    return (boundsCacheCenter || fallbackCenterTarget).clone();
  }
  /**
   * @returns {void} 无返回值。
   */
  function installOrbitControlsOverrides() {
    orbitPivotOverride ||= resolveOrbitCenter(state.orbitControls.target);
    if (boundOrbitControls === state.orbitControls) {
      return;
    }
    const overriddenControls = state.orbitControls;
    const overriddenCamera = state.previewCamera;
    const baseControlsUpdate = overriddenControls.update.bind(overriddenControls);
    boundOrbitControls = overriddenControls;
    /**
     * @returns {void} 无返回值。
     */
    const settleLightTransitionAfterControls = () => {
      if (state.lightTransitionSession === deps.lightTransitionController().lightTransitionSessionToken) {
        if (deps.lightTransitionController().lightSettleTimeoutHandle !== null) {
          window.clearTimeout(deps.lightTransitionController().lightSettleTimeoutHandle);
        }
        deps.lightTransitionController().lightSettleTimeoutHandle = null;
        if (!deps.isControlInteractionActive.get()) {
          deps.lightTransitionController().lightSettleTimeoutHandle = window.setTimeout(deps.lightTransitionController().endLightTransitionSession, 180);
        }
      }
    };
    overriddenControls.addEventListener("start", () => {
      if (!deps.isCameraMotionRunning()) {
        deps.isControlInteractionActive.set(true);
      }
    });
    overriddenControls.addEventListener("change", () => {
      if (!deps.isCameraMotionRunning()) {
        if (
          deps.isControlInteractionActive.get() &&
          isAdaptiveLightCacheEnabled() &&
          state.lightTransitionSession !== deps.lightTransitionController().lightTransitionSessionToken
        ) {
          deps.lightTransitionController().beginLightTransitionSession();
          deps.lightTransitionController().syncLightTransitionSession(performance.now());
          applyShadowBudget(state.previewModelRoot, {
            rebuildAtlas: false
          });
        }
        settleLightTransitionAfterControls();
      }
    });
    overriddenControls.addEventListener("end", () => {
      if (!deps.isCameraMotionRunning()) {
        deps.isControlInteractionActive.set(false);
        settleLightTransitionAfterControls();
      }
    });
    let storedControlsEnabled = overriddenControls.enabled;
    Object.defineProperty(overriddenControls, "enabled", {
      configurable: true,
      get: () => isCameraInteractionEnabled && !deps.isCameraMotionRunning() && storedControlsEnabled,
      set: nextControlsEnabled => {
        storedControlsEnabled = nextControlsEnabled === true;
      }
    });
    Object.defineProperty(overriddenControls, "enableRotate", {
      configurable: true,
      get: () => true,
      set() {}
    });
    overriddenControls.update = (controlsUpdateDelta: any) => {
      if (
        deps.isCameraMotionRunning() ||
        overriddenControls !== state.orbitControls ||
        overriddenCamera !== state.previewCamera
      ) {
        return false;
      }
      /**
       * 本次更新使用的轨道中心：首次调用时以当前目标点解析并缓存为覆盖中心。
       * @returns {object} Three.js Vector3 形式的旋转中心。
       */
      const updatedOrbitCenter = (orbitPivotOverride ||= resolveOrbitCenter(
        overriddenControls.target
      ));
      const preUpdateQuaternion = overriddenCamera.quaternion.clone();
      if (
        currentCameraView() === "top" &&
        (overriddenControls._sphericalDelta.theta || overriddenControls._sphericalDelta.phi)
      ) {
        const targetCameraOffset = overriddenCamera.position.clone().sub(overriddenControls.target);
        const targetOffsetLength = Math.max(targetCameraOffset.length(), 0.001);
        if (
          Math.hypot(targetCameraOffset.x, targetCameraOffset.z) < targetOffsetLength * 0.00001 &&
          targetCameraOffset.y > 0
        ) {
          const projectedUpDirection = new threeModuleMin.Vector3(0, 1, 0).applyQuaternion(
            overriddenCamera.quaternion
          );
          projectedUpDirection.y = 0;
          projectedUpDirection.normalize();
          targetCameraOffset.set(
            -projectedUpDirection.x * targetOffsetLength * 0.000001,
            targetOffsetLength,
            -projectedUpDirection.z * targetOffsetLength * 0.000001
          );
          overriddenCamera.position.copy(overriddenControls.target).add(targetCameraOffset);
        }
        overriddenCamera.up.set(0, 1, 0);
        overriddenControls._quat.identity();
        overriddenControls._quatInverse.identity();
        overriddenControls._spherical.setFromVector3(targetCameraOffset);
        overriddenControls.minPolarAngle = 0;
        overriddenControls.maxPolarAngle = MAX_CAMERA_POLAR_ANGLE;
        overriddenControls.minAzimuthAngle = -Infinity;
        overriddenControls.maxAzimuthAngle = Infinity;
        cameraSettingsSource().cameraView = "free";
        overriddenCamera.userData.cameraView = "free";
        applyControlConstraints();
      }
      const controlsUpdateResult = baseControlsUpdate(controlsUpdateDelta);
      if (
        deps.isCameraMotionRunning() ||
        overriddenControls !== state.orbitControls ||
        overriddenCamera !== state.previewCamera
      ) {
        return controlsUpdateResult;
      }
      if (
        isCameraInteractionEnabled &&
        preUpdateQuaternion.angleTo(overriddenCamera.quaternion) > 1e-7
      ) {
        const cameraRotationDelta = overriddenCamera.quaternion
          .clone()
          .multiply(preUpdateQuaternion.invert());
        const orbitPivotOffset = updatedOrbitCenter.clone().sub(overriddenControls.target);
        const orbitDriftCompensation = orbitPivotOffset
          .clone()
          .sub(orbitPivotOffset.applyQuaternion(cameraRotationDelta));
        overriddenCamera.position.add(orbitDriftCompensation);
        overriddenControls.target.add(orbitDriftCompensation);
        constrainCameraPosition(overriddenCamera.position, overriddenControls.target);
        overriddenCamera.lookAt(overriddenControls.target);
        overriddenCamera.updateMatrixWorld();
        overriddenControls.dispatchEvent({
          type: "change"
        });
        return true;
      }
      return controlsUpdateResult;
    };
  }
  const floorEffectsController = createFloorEffectsController();
  const floorTransitionController = createFloorTransition({
    THREE: threeModuleMin,
    getRoot: () => state.previewModelRoot,
    dispose: disposeSceneSubtree,
    release: floorCacheController.retainCachedFloorRecord,
    suspendReflections: floorEffectsController.suspendFloorEffects,
    invalidate: (isFullSceneInvalidate: any) => {
      if (isFullSceneInvalidate) {
        orbitPivotOverride = null;
        boundsCacheModelRoot = null;
        boundsCacheSceneRevision = undefined;
        boundsCacheCenter = null;
        installOrbitControlsOverrides();
      }
      if (floorEffectsController.areFloorEffectsFollowed && !isFullSceneInvalidate) {
        fitDirectionalShadowCamera();
      }
      invalidateRender(
        isFullSceneInvalidate
          ? {
              scene: true,
              shadows: true
            }
          : {
              preserveLightCache: true
            }
      );
    }
  });
  /**
   * 重建轨道控制器（相机被替换时使用）：保留原相机位置与观察目标，并重新套用距离 / 缩放范围与约束。
   * @param {object} [recreatedOrbitTarget=orbitControls.target.clone()] 新的观察目标点。
   */
  function recreateOrbitControls(recreatedOrbitTarget = state.orbitControls.target.clone()) {
    const preservedCameraPosition = state.previewCamera.position.clone();
    state.orbitControls.dispose();
    state.orbitControls = createOrbitControls(state.previewCamera);
    state.previewCamera.position.copy(preservedCameraPosition);
    state.orbitControls.target.copy(recreatedOrbitTarget);
    const preservedOrbitDistance = Math.max(
      preservedCameraPosition.distanceTo(recreatedOrbitTarget),
      0.001
    );
    state.orbitControls.minDistance = Math.min(2, preservedOrbitDistance);
    state.orbitControls.maxDistance = Math.max(100, preservedOrbitDistance * 2);
    state.orbitControls.minZoom = Math.min(0.35, state.previewCamera.zoom);
    state.orbitControls.maxZoom = Math.max(6, state.previewCamera.zoom);
    state.orbitControls.maxPolarAngle = MAX_CAMERA_POLAR_ANGLE;
    state.orbitControls.enableRotate = true;
    state.orbitControls.enabled = isCameraInteractionEnabled;
    state.orbitControls.update();
    applyControlConstraints();
    installOrbitControlsOverrides();
  }

  return {
    get boundsCacheCenter(): any {
      return boundsCacheCenter;
    },
    set boundsCacheCenter(next: any) {
      boundsCacheCenter = next;
    },
    get boundsCacheModelRoot(): any {
      return boundsCacheModelRoot;
    },
    set boundsCacheModelRoot(next: any) {
      boundsCacheModelRoot = next;
    },
    get boundsCacheSceneRevision(): any {
      return boundsCacheSceneRevision;
    },
    set boundsCacheSceneRevision(next: any) {
      boundsCacheSceneRevision = next;
    },
    get cameraBlendState(): any {
      return cameraBlendState;
    },
    set cameraBlendState(next: any) {
      cameraBlendState = next;
    },
    get controlsPanEnabled(): any {
      return controlsPanEnabled;
    },
    set controlsPanEnabled(next: any) {
      controlsPanEnabled = next;
    },
    get controlsZoomEnabled(): any {
      return controlsZoomEnabled;
    },
    set controlsZoomEnabled(next: any) {
      controlsZoomEnabled = next;
    },
    floorCacheController,
    floorEffectsController,
    floorTransitionController,
    get focusViewportRatio(): any {
      return focusViewportRatio;
    },
    set focusViewportRatio(next: any) {
      focusViewportRatio = next;
    },
    installOrbitControlsOverrides,
    get isCameraInteractionEnabled(): any {
      return isCameraInteractionEnabled;
    },
    set isCameraInteractionEnabled(next: any) {
      isCameraInteractionEnabled = next;
    },
    measurePoseVisibleHeight,
    get orbitPivotOverride(): any {
      return orbitPivotOverride;
    },
    set orbitPivotOverride(next: any) {
      orbitPivotOverride = next;
    },
    recreateOrbitControls,
    resolveOrbitCenter,
    get rotationConstraintMode(): any {
      return rotationConstraintMode;
    },
    set rotationConstraintMode(next: any) {
      rotationConstraintMode = next;
    },
    syncPreviewProjection
  };
}
