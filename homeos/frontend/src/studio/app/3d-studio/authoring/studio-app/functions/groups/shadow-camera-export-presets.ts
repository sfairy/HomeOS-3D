import type { StudioAppRuntime } from "../../runtime/studio-app-runtime";
import { trimSharedGeometryCache as trimSharedGeometryCache2 } from "../../../studio-shared-geometry-cache";
import { MAX_CAMERA_POLAR_ANGLE as MAX_CAMERA_POLAR_ANGLE2, constrainCameraPosition as constrainCameraPosition2 } from "../../../scene/studio-camera-constraints";
import * as ns2 from "/static/vendor/three/0.186.1/three.module.min.js";
import { OrbitControls as OrbitControls2 } from "/static/vendor/three/0.186.1/OrbitControls.js";
import { clamp as clamp2 } from "../../../../plan/geometry";
import { MAX_EXPORT_PRESET_COUNT as MAX_EXPORT_PRESET_COUNT2, exportPresetIsEmpty as exportPresetIsEmpty2, normalizeActiveExportPresetSlot as normalizeActiveExportPresetSlot2, normalizeExportPreset as normalizeExportPreset2, normalizeExportPresetSlots as normalizeExportPresetSlots2 } from "../../../../export/export-presets";
import { syncControlValue as syncControlValue2 } from "../../../ui/ui-controls";
import { finite as finite2, normalizeLabelText as normalizeLabelText2 } from "../../../../loaders/studio-normalization";
import type { CameraSnapshotOptions, CameraModeOptions, CameraViewChangeOptions, ExportDialogOptions, ApplyExportOptions } from "../../../types/studio-app-types";

export function setShadowFreeze(runtime: StudioAppRuntime, isFrozen = true) {
  (runtime.appCtx.isShadowFrozen &&
    (!runtime.isEmbedStageMode ||
      Math.abs(runtime.appCtx.threeRenderer.getPixelRatio() - runtime.computeRenderPixelRatio(false)) > 0.000001 ||
      !runtime.appCtx.shadowAtlasCanvas?.matches(runtime.computeRenderPixelRatio(true))) &&
    runtime.updateShadowState(true, {
      preserveLightCache: true,
    }),
    runtime.appCtx.isShadowFrozen
      ? (runtime.appCtx.compiledShaderCache?.clear(), runtime.appCtx.shadowAtlasCanvas.render(runtime.appCtx.threeScene, runtime.appCtx.threeCamera))
      : runtime.isEffectCacheReady() && (runtime.shouldForceEffectFrame || (runtime.appCtx.isBackgroundMoving && !!runtime.effectCache.stats.bytes))
        ? (runtime.appCtx.compiledShaderCache?.clear(),
          runtime.effectCache.render(runtime.appCtx.threeScene, runtime.appCtx.threeCamera, {
            enabled: runtime.appCtx.isBackgroundMoving && !runtime.appCtx.isRenderSuppressed && !runtime.appCtx.pendingRuntimeSettings,
            background: runtime.appCtx.backgroundController?.cacheBackground,
          }),
          runtime.isRenderStatsTest &&
            (runtime.appCtx.threeRenderer.domElement.dataset.effectCacheStats = JSON.stringify(
              runtime.effectCache.stats,
            )))
        : runtime.appCtx.compiledShaderCache
          ? runtime.appCtx.compiledShaderCache.render(runtime.appCtx.threeScene, runtime.appCtx.threeCamera, {
              background: runtime.appCtx.backgroundController?.cacheBackground,
              changed: isFrozen,
              enabled: runtime.appCtx.isBackgroundMoving && !runtime.appCtx.isRenderSuppressed && !runtime.appCtx.pendingRuntimeSettings,
            })
          : runtime.appCtx.threeRenderer.render(runtime.appCtx.threeScene, runtime.appCtx.threeCamera),
    (runtime.shouldForceEffectFrame = false),
    // 背景缓存接管了整帧时，效果缓存没有复用价值，及时释放显存。
    !runtime.appCtx.isShadowFrozen &&
      runtime.appCtx.compiledShaderCache?.active &&
      runtime.effectCache?.stats.bytes &&
      runtime.effectCache.clear(),
    runtime.previewResources?.release(),
    runtime.shouldTrimSharedGeometry &&
      ((runtime.shouldTrimSharedGeometry = false),
      trimSharedGeometryCache2(runtime.geometryCacheByKey, [runtime.appCtx.threeScene, runtime.appCtx.sceneRootNode])),
    runtime.prepareShadowAtlas());
}

export function updateShadowState(runtime: StudioAppRuntime, 
  isShadowsEnabled: any,
  { preserveLightCache: shouldPreserveLightCache = false } = {},
) {
  if (!runtime.appCtx.threeRenderer || (runtime.appCtx.pendingRuntimeSettings && !runtime.isAutoDiagramEmbed)) return;
  const zn3 = runtime.computeRenderPixelRatio(false),
    isPixelRatioStable = Math.abs(runtime.appCtx.threeRenderer.getPixelRatio() - zn3) < 0.000001;
  if (
    (!runtime.appCtx.isShadowPreparing &&
      isShadowsEnabled &&
      runtime.appCtx.isRenderSuppressed &&
      runtime.isEmbeddedStage &&
      runtime.isEmbedStageMode &&
      isPixelRatioStable &&
      runtime.computeRenderPixelRatio(true) < zn3 &&
      runtime.appCtx.shadowAtlasCanvas?.matches(runtime.computeRenderPixelRatio(true)) &&
      (runtime.appCtx.isShadowPreparing = true),
    runtime.appCtx.isShadowPreparing)
  ) {
    if (
      runtime.isEmbedStageMode &&
      isPixelRatioStable &&
      (!isShadowsEnabled || runtime.appCtx.shadowAtlasCanvas?.matches(runtime.computeRenderPixelRatio(true)))
    ) {
      ((runtime.appCtx.isShadowFrozen = isShadowsEnabled),
        isShadowsEnabled || (runtime.appCtx.isShadowPreparing = false),
        runtime.refreshSceneRender({
          preserveLightCache: shouldPreserveLightCache,
        }));
      return;
    }
    runtime.appCtx.isShadowPreparing = runtime.appCtx.isShadowFrozen = false;
  }
  const $f2 = runtime.appCtx.pendingRuntimeSettings
    ? runtime.resolvePixelRatio(isShadowsEnabled)
    : runtime.computeRenderPixelRatio(isShadowsEnabled);
  (Math.abs(runtime.appCtx.threeRenderer.getPixelRatio() - $f2) > 0.000001 && runtime.appCtx.threeRenderer.setPixelRatio($f2),
    runtime.refreshSceneRender({
      preserveLightCache: shouldPreserveLightCache,
    }));
}

export function handleOrbitStart(runtime: StudioAppRuntime, ) {
  const hasShadowPreparePending = runtime.appCtx.rendererRestoreTimeoutId !== null;
  (window.clearTimeout(runtime.appCtx.rendererRestoreTimeoutId),
    (runtime.appCtx.rendererRestoreTimeoutId = null),
    (runtime.appCtx.isRenderSuppressed = true),
    (runtime.appCtx.isAdaptiveRenderPaused = hasShadowPreparePending || runtime.appCtx.isShadowFrozen),
    (runtime.appCtx.frameDurationSamples = []),
    (runtime.appCtx.samplingWindowStartMs = 0),
    runtime.requestStudioRender());
}

export function handleOrbitChange(runtime: StudioAppRuntime, ) {
  runtime.appCtx.isAdaptiveRenderPaused ||
    ((runtime.appCtx.isAdaptiveRenderPaused = true),
    runtime.requestStudioRender(),
    runtime.updateShadowState(true, {
      preserveLightCache: true,
    }));
}

export function handleOrbitEnd(runtime: StudioAppRuntime, ) {
  const Xi2 = runtime.appCtx.isAdaptiveRenderPaused;
  if (
    (runtime.resetFrameSamples(),
    (runtime.appCtx.isRenderSuppressed = false),
    runtime.handleInteractionEnded(),
    (runtime.appCtx.isAdaptiveRenderPaused = false),
    (runtime.appCtx.samplingWindowStartMs = 0),
    runtime.requestStudioRender(),
    window.clearTimeout(runtime.appCtx.rendererRestoreTimeoutId),
    !Xi2)
  ) {
    runtime.appCtx.pendingRuntimeSettings && !runtime.appCtx.isInteractionLocked && runtime.syncExportControls();
    return;
  }
  // 立即恢复全质量像素比，避免拖转结束后再糊 140ms。
  ((runtime.appCtx.rendererRestoreTimeoutId = null),
    runtime.updateShadowState(false, {
      preserveLightCache: true,
    }),
    runtime.appCtx.pendingRuntimeSettings && !runtime.appCtx.isInteractionLocked && runtime.syncExportControls());
}

export function refreshFloorControls(runtime: StudioAppRuntime, ) {
  const hasMultipleFloors = (runtime.appCtx.studioProject?.floors.length || 0) > 1,
    isOverviewMode = runtime.getPreviewFloorMode() === "all";
  ((runtime.floorCameraActionsElement.hidden = isOverviewMode),
    (runtime.overviewCameraActionsElement.hidden = !hasMultipleFloors || !isOverviewMode),
    (runtime.previewFloorGapControlElement.hidden = !hasMultipleFloors || !isOverviewMode),
    syncControlValue2(runtime.previewFloorGapInput, finite2(runtime.appCtx.studioProject?.previewFloorGap, 3).toFixed(1)),
    (runtime.previewFloorUniformControlElement.hidden = !hasMultipleFloors || !isOverviewMode),
    (runtime.previewFloorUniformInput.checked = runtime.appCtx.studioProject?.uniformOverviewStack === true));
  const hasSavedFloorView = !!runtime.appCtx.studioState.settings?.fixedCameraView,
    hasSavedOverviewView = !!runtime.appCtx.studioProject?.combinedFixedCameraView;
  ((runtime.fixedCameraViewButton.disabled = !hasSavedFloorView),
    runtime.fixedCameraViewButton.classList.toggle("has-saved-view", hasSavedFloorView),
    (runtime.fixedOverviewViewButton.disabled = !hasSavedOverviewView),
    runtime.fixedOverviewViewButton.classList.toggle("has-saved-view", hasSavedOverviewView));
  const hasSavedCameraView = isOverviewMode ? hasSavedOverviewView : hasSavedFloorView;
  ((runtime.exportSaveViewButton.textContent = isOverviewMode ? "保存总览" : "保存视角"),
    (runtime.exportSaveViewButton.title = isOverviewMode
      ? "记录当前导图的全楼角度和投影方式"
      : "记录当前导图的角度、缩放和投影方式"),
    (runtime.selectElement("#export-use-fixed").textContent = isOverviewMode ? "恢复总览" : "恢复视角"),
    (runtime.selectElement("#export-use-fixed").title = isOverviewMode
      ? "恢复已保存的全楼总览视角"
      : "恢复当前楼层已保存的视角"),
    (runtime.selectElement("#export-use-fixed").disabled = !!runtime.appCtx.isInteractionLocked || !hasSavedCameraView),
    runtime.selectElement("#export-use-fixed").classList.toggle("has-saved-view", hasSavedCameraView));
}

export function captureCameraView(runtime: StudioAppRuntime, ) {
  return runtime.getPreviewFloorMode() === "all"
    ? runtime.appCtx.studioProject?.combinedFixedCameraView
    : runtime.appCtx.studioState.settings?.fixedCameraView;
}

export function storeFixedCameraView(runtime: StudioAppRuntime, cameraViewSnapshot: any) {
  runtime.getPreviewFloorMode() === "all"
    ? (runtime.appCtx.studioProject.combinedFixedCameraView = cameraViewSnapshot)
    : (runtime.appCtx.studioState.settings.fixedCameraView = cameraViewSnapshot);
}

export function createOrbitControls(runtime: StudioAppRuntime, orbitCamera: any) {
  const orbitControlsHandle = new OrbitControls2(orbitCamera, runtime.appCtx.threeRenderer.domElement);
  ((orbitControlsHandle.touchDragThreshold = runtime.isEmbeddedStage ? 8 : 0),
    (orbitControlsHandle.enableDamping = true),
    (orbitControlsHandle.rotateSmoothing = 8),
    (orbitControlsHandle.rotateSmoothingThreshold = 0.000001),
    (orbitControlsHandle.dampingFactor = 0.22),
    (orbitControlsHandle.minDistance = 2),
    (orbitControlsHandle.maxDistance = 100),
    (orbitControlsHandle.minZoom = 0.35),
    (orbitControlsHandle.maxZoom = 6),
    (orbitControlsHandle.maxPolarAngle = MAX_CAMERA_POLAR_ANGLE2),
    orbitControlsHandle.target.set(0, 0.6, 0));
  const bind = orbitControlsHandle.update.bind(orbitControlsHandle);
  return (
    (orbitControlsHandle.update = (deltaSeconds: any) => {
      (orbitControlsHandle._quat.identity(),
        orbitControlsHandle._quatInverse.identity(),
        runtime.getCameraView() !== "top" &&
          (!runtime.isEmbeddedStage ||
            orbitControlsHandle._sphericalDelta.theta ||
            orbitControlsHandle._sphericalDelta.phi) &&
          orbitCamera.up.set(0, 1, 0),
        (orbitControlsHandle.maxPolarAngle = Math.min(
          orbitControlsHandle.maxPolarAngle,
          MAX_CAMERA_POLAR_ANGLE2,
        )),
        (orbitControlsHandle.minPolarAngle = Math.min(
          orbitControlsHandle.minPolarAngle,
          orbitControlsHandle.maxPolarAngle,
        )));
      const boundOrbitDelta = bind(deltaSeconds),
        polarAngle = orbitControlsHandle.getPolarAngle();
      return (
        ((polarAngle >= orbitControlsHandle.maxPolarAngle - 1e-8 &&
          orbitControlsHandle._sphericalDelta.phi > 0) ||
          (polarAngle <= orbitControlsHandle.minPolarAngle + 0.000001 &&
            orbitControlsHandle._sphericalDelta.phi < 0)) &&
          (orbitControlsHandle._sphericalDelta.phi = 0),
        constrainCameraPosition2(orbitCamera.position, orbitControlsHandle.target)
          ? (orbitControlsHandle._sphericalDelta.phi > 0 &&
              (orbitControlsHandle._sphericalDelta.phi = 0),
            orbitCamera.lookAt(orbitControlsHandle.target),
            orbitCamera.updateMatrixWorld(),
            orbitControlsHandle.dispatchEvent({
              type: "change",
            }),
            true)
          : boundOrbitDelta
      );
    }),
    orbitControlsHandle.addEventListener("start", runtime.handleOrbitStart),
    orbitControlsHandle.addEventListener("change", () => {
      (runtime.updateCameraPlanes(orbitCamera, orbitControlsHandle.target),
        runtime.appCtx.isRenderSuppressed
          ? (runtime.handleOrbitChange(),
            runtime.refreshSceneRender({
              preserveLightCache: true,
            }))
          : runtime.refreshSceneRender());
    }),
    orbitControlsHandle.addEventListener("change", () => {
      if (!runtime.appCtx.pendingRuntimeSettings || runtime.appCtx.isInteractionLocked) return;
      const activePresetSlot = normalizeActiveExportPresetSlot2(
        runtime.appCtx.studioProject?.activeExportPresetSlot,
        runtime.appCtx.studioProject?.exportPresets?.length,
      );
      runtime.appCtx.isExportPresetDirty ||
        runtime.appCtx.studioProject?.exportPresets?.[activePresetSlot] ||
        ((runtime.appCtx.isExportPresetDirty = true), runtime.renderExportPresetSlots());
    }),
    orbitControlsHandle.addEventListener("end", runtime.handleOrbitEnd),
    orbitControlsHandle
  );
}

export function updateCameraPlanes(runtime: StudioAppRuntime, planeCamera = runtime.appCtx.threeCamera, planeTarget = runtime.appCtx.orbitControls?.target) {
  if (!planeCamera || !planeTarget) return false;
  const cameraTargetDistance = Math.max(planeCamera.position.distanceTo(planeTarget), 1),
    computedCameraNear = planeCamera.isPerspectiveCamera
      ? clamp2(cameraTargetDistance * runtime.cameraNearFactor, runtime.minCameraNear, runtime.maxCameraNear)
      : 0.02,
    computedCameraFar = Math.max(
      cameraTargetDistance * (planeCamera.isPerspectiveCamera ? 6 : 5),
      100,
    );
  return Math.abs(planeCamera.near - computedCameraNear) < 0.000001 &&
    Math.abs(planeCamera.far - computedCameraFar) < 0.0001
    ? false
    : ((planeCamera.near = computedCameraNear),
      (planeCamera.far = computedCameraFar),
      planeCamera.updateProjectionMatrix(),
      true);
}

export function computeVisibleHeight(runtime: StudioAppRuntime, heightCamera: any, heightTarget: any) {
  if (heightCamera?.isOrthographicCamera)
    return (
      Math.abs(heightCamera.top - heightCamera.bottom) / Math.max(heightCamera.zoom || 1, 0.000001)
    );
  if (heightCamera?.isPerspectiveCamera) {
    const cameraDistance = Math.max(heightCamera.position.distanceTo(heightTarget), 0.0001),
      degToRad4 = ns2.MathUtils.degToRad(heightCamera.getEffectiveFOV());
    return 2 * cameraDistance * Math.tan(degToRad4 / 2);
  }
  return 10;
}

export function adjustFrameSize(runtime: StudioAppRuntime, visibleHeight: any, viewportAspectRatio = 1, cameraZoomFactor = 1) {
  const clampedAspect = Math.max(finite2(viewportAspectRatio, 1), 0.1),
    clampedZoom = Math.max(finite2(cameraZoomFactor, 1), 0.000001);
  return Math.max(finite2(visibleHeight, 10), 0.000001) * Math.min(1, clampedAspect) * clampedZoom;
}

export function computeFrameSize(runtime: StudioAppRuntime, frameCamera: any, frameTarget: any) {
  const storedFrameSize = Number(frameCamera?.userData?.frameSize);
  if (frameCamera?.isOrthographicCamera && Number.isFinite(storedFrameSize) && storedFrameSize > 0)
    return storedFrameSize;
  const cameraAspect = frameCamera?.userData?.viewportAspect || frameCamera?.aspect || 1,
    cameraZoom = frameCamera?.isOrthographicCamera ? Math.max(frameCamera.zoom || 1, 0.000001) : 1;
  return runtime.adjustFrameSize(runtime.computeVisibleHeight(frameCamera, frameTarget), cameraAspect, cameraZoom);
}

export function computeOrthoFrameSize(runtime: StudioAppRuntime, orthoCamera: any, orthoTarget: any) {
  const orthoAspect = orthoCamera?.userData?.viewportAspect || orthoCamera?.aspect || 1;
  if (orthoCamera?.isOrthographicCamera) {
    const orthoStoredFrameSize = Number(orthoCamera?.userData?.frameSize);
    if (Number.isFinite(orthoStoredFrameSize) && orthoStoredFrameSize > 0)
      return orthoStoredFrameSize / Math.max(orthoCamera.zoom || 1, 0.000001);
  }
  return runtime.adjustFrameSize(runtime.computeVisibleHeight(orthoCamera, orthoTarget), orthoAspect);
}

export function resolveFrameSize(runtime: StudioAppRuntime, cameraViewSettings: any, targetAspect: any, targetZoom = 1) {
  const settingsFrameSize = Number(cameraViewSettings?.frameSize);
  return Number.isFinite(settingsFrameSize) && settingsFrameSize > 0
    ? settingsFrameSize
    : runtime.adjustFrameSize(cameraViewSettings?.visibleHeight, targetAspect, targetZoom);
}

export async function saveCameraView(runtime: StudioAppRuntime, ) {
  if (!runtime.appCtx.threeCamera || !runtime.appCtx.orbitControls) return;
  const cameraViewLabel = runtime.getPreviewFloorMode() === "all" ? "总览视角" : "当前层视角";
  runtime.appCtx.pendingRuntimeSettings || runtime.deselectAll();
  const target = runtime.appCtx.orbitControls.target;
  if (
    (runtime.storeFixedCameraView({
      mode: runtime.appCtx.threeCamera.isPerspectiveCamera ? "perspective" : "orthographic",
      view: runtime.getCameraView(),
      topRotation: runtime.getCameraTopRotation(),
      position: {
        x: runtime.appCtx.threeCamera.position.x,
        y: runtime.appCtx.threeCamera.position.y,
        z: runtime.appCtx.threeCamera.position.z,
      },
      target: {
        x: target.x,
        y: target.y,
        z: target.z,
      },
      visibleHeight: runtime.computeVisibleHeight(runtime.appCtx.threeCamera, target),
      frameSize: runtime.computeOrthoFrameSize(runtime.appCtx.threeCamera, target),
      fov: runtime.appCtx.threeCamera.isPerspectiveCamera ? runtime.appCtx.threeCamera.fov : 36,
      focalLength: runtime.appCtx.threeCamera.isPerspectiveCamera ? runtime.getCameraFocalLength() : null,
    }),
    runtime.refreshFloorControls(),
    runtime.appCtx.pendingRuntimeSettings)
  ) {
    ((runtime.exportStatusElement.textContent = cameraViewLabel + "已保存"),
      await runtime.flushAutosave(),
      runtime.showToast(cameraViewLabel + "已保存。"));
    return;
  }
  (runtime.markDocumentDirty(),
    window.clearTimeout(runtime.appCtx.autosaveTimeoutId),
    (runtime.appCtx.autosaveTimeoutId = null),
    await runtime.flushAutosave(),
    runtime.showToast(
      runtime.appCtx.localSaveRevision === runtime.appCtx.remoteSaveRevision
        ? cameraViewLabel + "已保存。"
        : cameraViewLabel + "已记录，正在保存…",
    ));
}

export function applyCameraSnapshot(runtime: StudioAppRuntime, snapshotOptions: CameraSnapshotOptions = {}) {
  const cs2 = runtime.captureCameraView();
  if (!cs2 || !runtime.appCtx.threeCamera || !runtime.appCtx.orbitControls) return;
  const hasModeChanged = cs2.mode !== runtime.getCameraMode(),
    hasViewChanged = cs2.view !== runtime.getCameraView(),
    hasRotationChanged = cs2.topRotation !== runtime.getCameraTopRotation(),
    hasFocalLengthChanged =
      cs2.focalLength !== null && Math.abs(cs2.focalLength - runtime.getCameraFocalLength()) > 1e-8,
    shouldRecordChange = snapshotOptions.recordChange !== false;
  (hasModeChanged || hasViewChanged || hasRotationChanged || hasFocalLengthChanged) &&
    shouldRecordChange &&
    runtime.deselectAll();
  const ut2 = runtime.cameraSettings();
  ((ut2.cameraMode = cs2.mode),
    (ut2.cameraView = cs2.view),
    (ut2.cameraTopRotation = cs2.topRotation),
    cs2.focalLength !== null && (ut2.cameraFocalLength = cs2.focalLength),
    runtime.setCameraMode(cs2.mode, {
      preserveView: false,
    }));
  const snapshotTargetVector = new ns2.Vector3(cs2.target.x, cs2.target.y, cs2.target.z);
  (runtime.appCtx.threeCamera.position.set(cs2.position.x, cs2.position.y, cs2.position.z),
    runtime.appCtx.threeCamera.up.copy(
      cs2.view === "top" ? runtime.buildCameraUpVector(cs2.topRotation) : new ns2.Vector3(0, 1, 0),
    ),
    (runtime.appCtx.threeCamera.userData.viewportAspect ||= Math.max(
      runtime.selectElement("#preview-3d").clientWidth /
        Math.max(runtime.selectElement("#preview-3d").clientHeight, 1),
      0.1,
    )));
  const ds2 = runtime.resolveFrameSize(cs2, runtime.appCtx.threeCamera.userData.viewportAspect);
  if (
    ((runtime.appCtx.threeCamera.userData.frameSize = ds2),
    (runtime.appCtx.threeCamera.userData.cameraView = cs2.view),
    (runtime.appCtx.threeCamera.userData.topRotation = cs2.topRotation),
    (runtime.appCtx.threeCamera.zoom = 1),
    runtime.appCtx.threeCamera.isPerspectiveCamera
      ? ((runtime.appCtx.threeCamera.aspect = runtime.appCtx.threeCamera.userData.viewportAspect),
        cs2.focalLength !== null
          ? runtime.applyCameraFocalLength(runtime.appCtx.threeCamera, cs2.focalLength)
          : ((runtime.appCtx.threeCamera.fov = cs2.fov),
            runtime.appCtx.threeCamera.updateProjectionMatrix(),
            (ut2.cameraFocalLength = clamp2(runtime.appCtx.threeCamera.getFocalLength(), 18, 120))))
      : runtime.applyOrthoFrame(ds2, runtime.appCtx.threeCamera.userData.viewportAspect, runtime.appCtx.threeCamera),
    runtime.updateCameraPlanes(runtime.appCtx.threeCamera, snapshotTargetVector),
    runtime.appCtx.threeCamera.lookAt(snapshotTargetVector),
    runtime.appCtx.threeCamera.updateProjectionMatrix(),
    runtime.appCtx.orbitControls.target.copy(snapshotTargetVector),
    runtime.requestStudioRender(),
    runtime.appCtx.orbitControls.update(),
    runtime.syncCameraModeControls(cs2.mode),
    runtime.syncCameraViewControls(cs2.view),
    (hasModeChanged || hasViewChanged || hasRotationChanged || hasFocalLengthChanged) &&
      shouldRecordChange &&
      runtime.markDocumentDirty(),
    !snapshotOptions.silent)
  ) {
    const restoredViewLabel = runtime.getPreviewFloorMode() === "all" ? "总览视角" : "当前层视角";
    runtime.showToast("已恢复上次保存的" + restoredViewLabel + "。");
  }
}

export function setCameraView(runtime: StudioAppRuntime, requestedCameraView: any, viewChangeOptions: CameraViewChangeOptions = {}) {
  const cameraViewName = requestedCameraView === "top" ? "top" : "free",
    qn2 = runtime.getCameraTopRotation();
  if ((runtime.syncCameraViewControls(cameraViewName), !runtime.appCtx.threeCamera || !runtime.appCtx.orbitControls)) return;
  if (
    runtime.appCtx.threeCamera.userData.cameraView === cameraViewName &&
    (cameraViewName !== "top" || runtime.appCtx.threeCamera.userData.topRotation === qn2) &&
    viewChangeOptions.force !== true
  ) {
    runtime.requestStudioRender();
    return;
  }
  if (cameraViewName === "free") {
    runtime.updateCameraView({
      view: "free",
    });
    return;
  }
  const clone = runtime.appCtx.orbitControls.target.clone(),
    bo2 = runtime.computeVisibleHeight(runtime.appCtx.threeCamera, clone),
    wf2 = runtime.computeFrameSize(runtime.appCtx.threeCamera, clone),
    cameraTopDistance = Math.max(runtime.appCtx.threeCamera.position.distanceTo(clone), 8);
  if ((runtime.appCtx.threeCamera.up.copy(runtime.buildCameraUpVector(qn2)), runtime.appCtx.threeCamera.isPerspectiveCamera)) {
    runtime.applyCameraFocalLength();
    const degToRad5 = ns2.MathUtils.degToRad(runtime.appCtx.threeCamera.getEffectiveFOV()),
      cameraFreeDistance = Math.max(bo2 / (2 * Math.tan(degToRad5 / 2)), 8);
    runtime.appCtx.threeCamera.position.set(clone.x, clone.y + cameraFreeDistance, clone.z);
  } else
    (runtime.applyOrthoFrame(wf2, runtime.appCtx.threeCamera.userData.viewportAspect || 1, runtime.appCtx.threeCamera),
      runtime.appCtx.threeCamera.position.set(clone.x, clone.y + cameraTopDistance, clone.z));
  ((runtime.appCtx.threeCamera.userData.frameSize = wf2),
    (runtime.appCtx.threeCamera.userData.cameraView = "top"),
    (runtime.appCtx.threeCamera.userData.topRotation = qn2),
    runtime.updateCameraPlanes(runtime.appCtx.threeCamera, clone),
    runtime.appCtx.threeCamera.lookAt(clone),
    runtime.appCtx.threeCamera.updateProjectionMatrix(),
    runtime.appCtx.orbitControls.target.copy(clone),
    runtime.requestStudioRender(),
    runtime.appCtx.orbitControls.update());
}

export function setCameraMode(runtime: StudioAppRuntime, requestedCameraMode: any, modeChangeOptions: CameraModeOptions = {}) {
  const cameraModeValue = requestedCameraMode === "perspective" ? "perspective" : "orthographic";
  if ((runtime.syncCameraModeControls(cameraModeValue), !runtime.appCtx.threeRenderer)) return;
  if ((cameraModeValue === "perspective") == !!runtime.appCtx.threeCamera?.isPerspectiveCamera) {
    (runtime.applyCameraFocalLength(), runtime.requestStudioRender());
    return;
  }
  const shouldPreserveView = modeChangeOptions.preserveView !== false,
    previousCamera = runtime.appCtx.threeCamera,
    previousCameraTarget = runtime.appCtx.orbitControls?.target.clone() || new ns2.Vector3(0, 0.6, 0),
    sub = previousCamera
      ? previousCamera.position.clone().sub(previousCameraTarget)
      : new ns2.Vector3(1.12, 1.42, 1.2),
    defaultCameraDistance = Math.max(sub.length(), 2),
    normalize =
      sub.lengthSq() > 1e-8 ? sub.normalize() : new ns2.Vector3(1.12, 1.42, 1.2).normalize(),
    newCameraAspect =
      previousCamera?.userData.viewportAspect ||
      Math.max(
        runtime.selectElement("#preview-3d").clientWidth /
          Math.max(runtime.selectElement("#preview-3d").clientHeight, 1),
        0.1,
      ),
    bo3 =
      shouldPreserveView && previousCamera
        ? runtime.computeVisibleHeight(previousCamera, previousCameraTarget)
        : previousCamera?.userData.frameSize || 10,
    oc2 =
      shouldPreserveView && previousCamera
        ? runtime.adjustFrameSize(bo3, newCameraAspect)
        : previousCamera?.userData.frameSize || 10;
  if ((runtime.appCtx.orbitControls?.dispose(), cameraModeValue === "perspective")) {
    ((runtime.appCtx.threeCamera = new ns2.PerspectiveCamera(36, newCameraAspect, 0.02, 200)),
      runtime.applyCameraFocalLength(runtime.appCtx.threeCamera));
    const computedCameraDistance =
        bo3 / (2 * Math.tan(ns2.MathUtils.degToRad(runtime.appCtx.threeCamera.getEffectiveFOV()) / 2)),
      cameraPlacementDistance = shouldPreserveView ? computedCameraDistance : defaultCameraDistance;
    runtime.appCtx.threeCamera.position
      .copy(previousCameraTarget)
      .addScaledVector(normalize, Math.max(cameraPlacementDistance, 2));
  } else
    ((runtime.appCtx.threeCamera = new ns2.OrthographicCamera(-5, 5, 5, -5, 0.02, 200)),
      runtime.appCtx.threeCamera.position
        .copy(previousCameraTarget)
        .addScaledVector(normalize, defaultCameraDistance),
      runtime.applyOrthoFrame(oc2, newCameraAspect, runtime.appCtx.threeCamera));
  (runtime.appCtx.threeCamera.layers.enable(runtime.lampsLayerIndex),
    (runtime.appCtx.threeCamera.userData.viewportAspect = newCameraAspect),
    (runtime.appCtx.threeCamera.userData.frameSize = oc2),
    (runtime.appCtx.threeCamera.userData.cameraView = previousCamera?.userData.cameraView || "free"),
    (runtime.appCtx.threeCamera.userData.topRotation = previousCamera?.userData.topRotation || 0),
    runtime.appCtx.threeCamera.up.copy(previousCamera?.up || new ns2.Vector3(0, 1, 0)),
    runtime.updateCameraPlanes(runtime.appCtx.threeCamera, previousCameraTarget),
    runtime.appCtx.threeCamera.lookAt(previousCameraTarget),
    runtime.appCtx.threeCamera.updateProjectionMatrix(),
    (runtime.appCtx.orbitControls = runtime.createOrbitControls(runtime.appCtx.threeCamera)),
    runtime.appCtx.orbitControls.target.copy(previousCameraTarget),
    runtime.requestStudioRender(),
    (runtime.isEmbeddedStage && modeChangeOptions.deferControlUpdate === true) || runtime.appCtx.orbitControls.update());
}

export function applyOrthoFrame(runtime: StudioAppRuntime, orthoFrameSize: any, orthoFrameAspect: any, orthoFrameCamera = runtime.appCtx.threeCamera) {
  if (!orthoFrameCamera?.isOrthographicCamera) return;
  const frameHalfHeight = Math.max(orthoFrameSize, 1) / 2;
  (orthoFrameAspect >= 1
    ? ((orthoFrameCamera.left = -frameHalfHeight * orthoFrameAspect),
      (orthoFrameCamera.right = frameHalfHeight * orthoFrameAspect),
      (orthoFrameCamera.top = frameHalfHeight),
      (orthoFrameCamera.bottom = -frameHalfHeight))
    : ((orthoFrameCamera.left = -frameHalfHeight),
      (orthoFrameCamera.right = frameHalfHeight),
      (orthoFrameCamera.top = frameHalfHeight / Math.max(orthoFrameAspect, 0.1)),
      (orthoFrameCamera.bottom = -frameHalfHeight / Math.max(orthoFrameAspect, 0.1))),
    orthoFrameCamera.updateProjectionMatrix());
}

export function resizeStudioRenderer(runtime: StudioAppRuntime, { preserveCanvasSize: shouldPreserveCanvasSize = false } = {}) {
  if (!runtime.appCtx.threeRenderer) return;
  if (runtime.appCtx.pendingRuntimeSettings) {
    runtime.resizeRenderCanvas();
    return;
  }
  const previewStageElement = runtime.selectElement("#preview-3d"),
    size = runtime.isEmbeddedStage ? runtime.appCtx.threeRenderer.getSize(new ns2.Vector2()) : null,
    viewportWidth = Math.max(
      shouldPreserveCanvasSize && size ? size.x : previewStageElement.clientWidth,
      1,
    ),
    viewportHeight = Math.max(
      shouldPreserveCanvasSize && size ? size.y : previewStageElement.clientHeight,
      1,
    ),
    isViewportSizeUnchanged = size?.x === viewportWidth && size?.y === viewportHeight,
    join3 = runtime.isEmbeddedStage ? runtime.appCtx.threeCamera.projectionMatrix.elements.join(",") : "";
  (isViewportSizeUnchanged || runtime.appCtx.threeRenderer.setSize(viewportWidth, viewportHeight, false),
    (runtime.appCtx.threeCamera.userData.viewportAspect = viewportWidth / viewportHeight),
    runtime.appCtx.threeCamera.isOrthographicCamera
      ? runtime.applyOrthoFrame(runtime.appCtx.threeCamera.userData.frameSize || 10, runtime.appCtx.threeCamera.userData.viewportAspect)
      : ((runtime.appCtx.threeCamera.aspect = runtime.appCtx.threeCamera.userData.viewportAspect), runtime.applyCameraFocalLength()),
    (!isViewportSizeUnchanged || join3 !== runtime.appCtx.threeCamera.projectionMatrix.elements.join(",")) &&
      runtime.refreshSceneRender());
}

export function captureOverviewCamera(runtime: StudioAppRuntime, ) {
  return !runtime.appCtx.threeCamera || !runtime.appCtx.orbitControls
    ? null
    : {
        mode: runtime.appCtx.threeCamera.isPerspectiveCamera ? "perspective" : "orthographic",
        cameraView: runtime.appCtx.threeCamera.userData.cameraView || runtime.getCameraView(),
        topRotation: runtime.appCtx.threeCamera.userData.topRotation || 0,
        position: runtime.appCtx.threeCamera.position.clone(),
        target: runtime.appCtx.orbitControls.target.clone(),
        up: runtime.appCtx.threeCamera.up.clone(),
        zoom: runtime.appCtx.threeCamera.zoom,
        visibleHeight: runtime.computeVisibleHeight(runtime.appCtx.threeCamera, runtime.appCtx.orbitControls.target),
        frameSize: runtime.computeFrameSize(runtime.appCtx.threeCamera, runtime.appCtx.orbitControls.target),
        viewportAspect: runtime.appCtx.threeCamera.userData.viewportAspect || 1,
        fov: runtime.appCtx.threeCamera.isPerspectiveCamera ? runtime.appCtx.threeCamera.fov : 36,
        near: runtime.appCtx.threeCamera.near,
        far: runtime.appCtx.threeCamera.far,
      };
}

export function applyCameraState(runtime: StudioAppRuntime, 
  cameraStateSnapshot: any,
  stateViewportAspect = cameraStateSnapshot?.viewportAspect || 1,
) {
  !cameraStateSnapshot ||
    !runtime.appCtx.threeRenderer ||
    (runtime.setCameraMode(cameraStateSnapshot.mode, {
      preserveView: false,
    }),
    runtime.appCtx.threeCamera.position.copy(cameraStateSnapshot.position),
    runtime.appCtx.threeCamera.up.copy(cameraStateSnapshot.up),
    (runtime.appCtx.threeCamera.zoom = cameraStateSnapshot.zoom || 1),
    (runtime.appCtx.threeCamera.near = cameraStateSnapshot.near),
    (runtime.appCtx.threeCamera.far = cameraStateSnapshot.far),
    (runtime.appCtx.threeCamera.userData.frameSize = runtime.resolveFrameSize(
      cameraStateSnapshot,
      stateViewportAspect,
      cameraStateSnapshot.zoom || 1,
    )),
    (runtime.appCtx.threeCamera.userData.viewportAspect = stateViewportAspect),
    (runtime.appCtx.threeCamera.userData.cameraView = cameraStateSnapshot.cameraView || runtime.getCameraView()),
    (runtime.appCtx.threeCamera.userData.topRotation = cameraStateSnapshot.topRotation || 0),
    runtime.appCtx.threeCamera.isPerspectiveCamera
      ? ((runtime.appCtx.threeCamera.fov = cameraStateSnapshot.fov), (runtime.appCtx.threeCamera.aspect = stateViewportAspect))
      : runtime.applyOrthoFrame(runtime.appCtx.threeCamera.userData.frameSize, stateViewportAspect, runtime.appCtx.threeCamera),
    runtime.appCtx.threeCamera.lookAt(cameraStateSnapshot.target),
    runtime.appCtx.threeCamera.updateProjectionMatrix(),
    runtime.appCtx.orbitControls.target.copy(cameraStateSnapshot.target),
    runtime.requestStudioRender(),
    runtime.appCtx.orbitControls.update());
}

export function stateViewportAspectGetCanvasSize(runtime: StudioAppRuntime, ) {
  return {
    width: Math.round(clamp2(finite2(runtime.exportWidthInput.value, runtime.defaultExportWidth), 320, 4096)),
    height: Math.round(clamp2(finite2(runtime.exportHeightInput.value, runtime.defaultExportHeight), 320, 4096)),
  };
}

export function refreshCanvasSizeUi(runtime: StudioAppRuntime, ) {
  const { width: wn2, height: wn3 } = runtime.stateViewportAspectGetCanvasSize();
  runtime.exportResolutionLabelElement.textContent = wn2 + " × " + wn3 + " px";
  const greatestCommonDivisor = ((gcdLeft, gcdRight) => {
      for (; gcdRight;) [gcdLeft, gcdRight] = [gcdRight, gcdLeft % gcdRight];
      return gcdLeft;
    })(wn2, wn3),
    ratioWidth = wn2 / greatestCommonDivisor,
    ratioHeight = wn3 / greatestCommonDivisor;
  ((runtime.exportAspectLabelElement.textContent =
    ratioWidth <= 32 && ratioHeight <= 32
      ? ratioWidth + " : " + ratioHeight
      : (wn2 / wn3).toFixed(2) + " : 1"),
    runtime.exportPreviewFrameElement.style.setProperty("--export-aspect", String(wn2 / wn3)));
}

export function resolvePixelRatio(runtime: StudioAppRuntime, isExportMode = false) {
  const devicePixelRatioValue = window.devicePixelRatio || 1;
  if (!runtime.isAutoDiagramEmbed || !runtime.exportPreviewStageElement) return devicePixelRatioValue;
  const { width: wn4, height: wn5 } = runtime.stateViewportAspectGetCanvasSize(),
    hostClientWidth = Math.max(runtime.exportPreviewStageElement.clientWidth, 1),
    hostClientHeight = Math.max(runtime.exportPreviewStageElement.clientHeight, 1),
    cappedPixelRatio = Math.max(
      devicePixelRatioValue,
      wn4 / hostClientWidth,
      wn5 / hostClientHeight,
      1.5,
    );
  return Math.min(cappedPixelRatio, isExportMode ? 2 : 4);
}

export function resizeRenderCanvas(runtime: StudioAppRuntime, ) {
  if (!runtime.appCtx.pendingRuntimeSettings || runtime.appCtx.isInteractionLocked || !runtime.appCtx.threeRenderer || !runtime.appCtx.threeCamera) return;
  const { width: wn6, height: wn7 } = runtime.stateViewportAspectGetCanvasSize(),
    canvasAspect = wn6 / wn7,
    canvasClientWidth = Math.max(runtime.exportPreviewStageElement.clientWidth, 1),
    canvasClientHeight = Math.max(runtime.exportPreviewStageElement.clientHeight, 1),
    $f3 = runtime.isAutoDiagramEmbed ? runtime.resolvePixelRatio(false) : Math.min(window.devicePixelRatio || 1, 2);
  (runtime.appCtx.threeRenderer.setPixelRatio($f3),
    runtime.appCtx.threeRenderer.setSize(canvasClientWidth, canvasClientHeight, false),
    (runtime.appCtx.threeCamera.userData.viewportAspect = canvasAspect),
    runtime.appCtx.threeCamera.isOrthographicCamera
      ? runtime.applyOrthoFrame(runtime.appCtx.threeCamera.userData.frameSize || 10, canvasAspect, runtime.appCtx.threeCamera)
      : ((runtime.appCtx.threeCamera.aspect = canvasAspect), runtime.applyCameraFocalLength()),
    runtime.appCtx.orbitControls.update(),
    runtime.refreshSceneRender());
}

export function syncCanvasSizeInputs(runtime: StudioAppRuntime, ) {
  (runtime.refreshCanvasSizeUi(), requestAnimationFrame(() => requestAnimationFrame(runtime.resizeRenderCanvas)));
}

export function handleCanvasSizeInput(runtime: StudioAppRuntime, dimensionName: any, shouldCommitSize = false) {
  const inputDimensionValue = Number(
    (dimensionName === "width" ? runtime.exportWidthInput : runtime.exportHeightInput).value,
  );
  if (!Number.isFinite(inputDimensionValue) || inputDimensionValue <= 0) return;
  let nextCanvasWidth =
      dimensionName === "width" ? inputDimensionValue : Number(runtime.exportWidthInput.value),
    nextCanvasHeight =
      dimensionName === "height" ? inputDimensionValue : Number(runtime.exportHeightInput.value);
  ((nextCanvasWidth =
    Number.isFinite(nextCanvasWidth) && nextCanvasWidth > 0 ? nextCanvasWidth : runtime.defaultExportWidth),
    (nextCanvasHeight =
      Number.isFinite(nextCanvasHeight) && nextCanvasHeight > 0
        ? nextCanvasHeight
        : runtime.defaultExportHeight),
    runtime.exportLockRatioInput.checked &&
      (dimensionName === "width"
        ? shouldCommitSize
          ? ((nextCanvasWidth = clamp2(nextCanvasWidth, 320, 4096)),
            (nextCanvasHeight = Math.round(nextCanvasWidth / runtime.appCtx.exportAspectRatio)),
            nextCanvasHeight < 320 &&
              ((nextCanvasHeight = 320),
              (nextCanvasWidth = Math.round(nextCanvasHeight * runtime.appCtx.exportAspectRatio))),
            nextCanvasHeight > 4096 &&
              ((nextCanvasHeight = 4096),
              (nextCanvasWidth = Math.round(nextCanvasHeight * runtime.appCtx.exportAspectRatio))))
          : (nextCanvasHeight = Math.round(clamp2(nextCanvasWidth / runtime.appCtx.exportAspectRatio, 320, 4096)))
        : shouldCommitSize
          ? ((nextCanvasHeight = clamp2(nextCanvasHeight, 320, 4096)),
            (nextCanvasWidth = Math.round(nextCanvasHeight * runtime.appCtx.exportAspectRatio)),
            nextCanvasWidth < 320 &&
              ((nextCanvasWidth = 320),
              (nextCanvasHeight = Math.round(nextCanvasWidth / runtime.appCtx.exportAspectRatio))),
            nextCanvasWidth > 4096 &&
              ((nextCanvasWidth = 4096),
              (nextCanvasHeight = Math.round(nextCanvasWidth / runtime.appCtx.exportAspectRatio))))
          : (nextCanvasWidth = Math.round(
              clamp2(nextCanvasHeight * runtime.appCtx.exportAspectRatio, 320, 4096),
            ))),
    shouldCommitSize
      ? ((nextCanvasWidth = Math.round(clamp2(nextCanvasWidth, 320, 4096))),
        (nextCanvasHeight = Math.round(clamp2(nextCanvasHeight, 320, 4096))),
        (runtime.exportWidthInput.value = String(nextCanvasWidth)),
        (runtime.exportHeightInput.value = String(nextCanvasHeight)))
      : runtime.exportLockRatioInput.checked &&
        (dimensionName === "width"
          ? (runtime.exportHeightInput.value = String(nextCanvasHeight))
          : (runtime.exportWidthInput.value = String(nextCanvasWidth))),
    runtime.syncCanvasSizeInputs());
}

export function openExportDialog(runtime: StudioAppRuntime, exportDialogOptions: ExportDialogOptions = {}) {
  const cs3 = runtime.captureCameraView();
  if (!cs3 || !runtime.appCtx.pendingRuntimeSettings) return;
  const exportAspect =
      runtime.stateViewportAspectGetCanvasSize().width / runtime.stateViewportAspectGetCanvasSize().height,
    ut3 = runtime.cameraSettings();
  if (
    ((ut3.cameraMode = cs3.mode),
    (ut3.cameraView = cs3.view),
    (ut3.cameraTopRotation = cs3.topRotation),
    cs3.focalLength !== null && (ut3.cameraFocalLength = cs3.focalLength),
    runtime.applyCameraState(
      {
        mode: cs3.mode,
        cameraView: cs3.view,
        topRotation: cs3.topRotation,
        position: new ns2.Vector3(cs3.position.x, cs3.position.y, cs3.position.z),
        target: new ns2.Vector3(cs3.target.x, cs3.target.y, cs3.target.z),
        up: cs3.view === "top" ? runtime.buildCameraUpVector(cs3.topRotation) : new ns2.Vector3(0, 1, 0),
        zoom: 1,
        visibleHeight: cs3.visibleHeight,
        frameSize: runtime.resolveFrameSize(cs3, exportAspect),
        viewportAspect: exportAspect,
        fov: cs3.fov,
        near: 0.02,
        far: Math.max(
          new ns2.Vector3(cs3.position.x, cs3.position.y, cs3.position.z).distanceTo(
            new ns2.Vector3(cs3.target.x, cs3.target.y, cs3.target.z),
          ) * (cs3.mode === "perspective" ? 8 : 5),
          100,
        ),
      },
      exportAspect,
    ),
    runtime.syncCameraModeControls(cs3.mode),
    runtime.syncCameraViewControls(cs3.view),
    !exportDialogOptions.silent)
  ) {
    const exportViewLabel = runtime.getPreviewFloorMode() === "all" ? "总览视角" : "当前层视角";
    ((runtime.exportStatusElement.textContent = "已恢复上次保存的" + exportViewLabel),
      runtime.showToast("已恢复上次保存的" + exportViewLabel + "。"));
  }
}

export function renderExportPresetSlots(runtime: StudioAppRuntime, ) {
  const normalizedExportPresets = normalizeExportPresetSlots2(runtime.appCtx.studioProject?.exportPresets),
    normalizedActiveSlot = normalizeActiveExportPresetSlot2(
      runtime.appCtx.studioProject?.activeExportPresetSlot,
      normalizedExportPresets.length,
    );
  ((runtime.appCtx.studioProject.exportPresets = normalizedExportPresets),
    (runtime.appCtx.studioProject.activeExportPresetSlot = normalizedActiveSlot));
  const floorNameById = new Map(
    (runtime.appCtx.studioProject?.floors || []).map((presetFloor: any) => [presetFloor.id, presetFloor.name]),
  );
  runtime.exportPresetSlotsElement.replaceChildren(
    ...normalizedExportPresets.map((exportPreset, presetSlotIndex) => {
      const presetSlotButton = document.createElement("button");
      ((presetSlotButton.type = "button"),
        (presetSlotButton.dataset.exportPresetSlot = String(presetSlotIndex)),
        presetSlotButton.setAttribute("role", "tab"));
      const presetSlotNameLabel = document.createElement("strong"),
        presetSlotStateLabel = document.createElement("small");
      ((presetSlotNameLabel.textContent =
        (exportPreset?.name || floorNameById.get(exportPreset?.floorId) || "未命名存档") as string),
        (presetSlotStateLabel.textContent = exportPreset ? "已设置" : "未设置"));
      const isActivePresetSlot = presetSlotIndex === normalizedActiveSlot;
      return (
        presetSlotButton.classList.toggle("active", isActivePresetSlot),
        presetSlotButton.classList.toggle("has-value", !!exportPreset),
        presetSlotButton.setAttribute("aria-selected", String(isActivePresetSlot)),
        (presetSlotButton.title = exportPreset
          ? presetSlotNameLabel.textContent + "：已设置"
          : presetSlotNameLabel.textContent + "：未设置"),
        presetSlotButton.append(presetSlotNameLabel, presetSlotStateLabel),
        presetSlotButton
      );
    }),
  );
  const activePreset = normalizedExportPresets[normalizedActiveSlot];
  ((runtime.exportPresetAddButton.disabled = normalizedExportPresets.length >= MAX_EXPORT_PRESET_COUNT2),
    (runtime.exportPresetRenameButton.disabled = !activePreset),
    (runtime.exportPresetDeleteButton.disabled = normalizedExportPresets.length <= 1));
  const isPresetEmpty = exportPresetIsEmpty2(activePreset, runtime.appCtx.isExportPresetDirty);
  ((runtime.exportPresetEmptyStateElement.hidden = !isPresetEmpty),
    (runtime.exportPresetEmptyTitleElement.textContent = activePreset
      ? runtime.formatPresetLabel(activePreset, normalizedActiveSlot) + "已设置"
      : "当前存档尚未设置"));
}

export function buildExportPreset(runtime: StudioAppRuntime, { name: presetName = "" } = {}) {
  if (runtime.appCtx.threeCamera.isPerspectiveCamera) {
    const cameraFocalLengthInput = runtime.selectElement("#camera-focal-length"),
      inputFocalLength = clamp2(
        finite2(cameraFocalLengthInput?.value, runtime.getCameraFocalLength()),
        18,
        120,
      );
    runtime.cameraSettings().cameraFocalLength = inputFocalLength;
    for (const focalLengthControl of runtime.cameraFocalLengthControls)
      focalLengthControl.value = String(Math.round(inputFocalLength));
    runtime.applyCameraFocalLength(runtime.appCtx.threeCamera, inputFocalLength);
  }
  const { width: wn8, height: wn9 } = runtime.stateViewportAspectGetCanvasSize(),
    exportCameraTarget = runtime.appCtx.orbitControls.target;
  return normalizeExportPreset2({
    name: presetName,
    width: wn8,
    height: wn9,
    lockRatio: runtime.exportLockRatioInput.checked,
    floorMode: runtime.getPreviewFloorMode() === "all" ? "all" : "floor",
    floorId: runtime.getActiveFloor()?.id || runtime.appCtx.activeFloorId,
    floorGap: finite2(runtime.appCtx.studioProject.exportFloorGap, 3),
    camera: {
      mode: runtime.appCtx.threeCamera.isPerspectiveCamera ? "perspective" : "orthographic",
      view: runtime.getCameraView(),
      topRotation: runtime.getCameraTopRotation(),
      position: {
        x: runtime.appCtx.threeCamera.position.x,
        y: runtime.appCtx.threeCamera.position.y,
        z: runtime.appCtx.threeCamera.position.z,
      },
      target: {
        x: exportCameraTarget.x,
        y: exportCameraTarget.y,
        z: exportCameraTarget.z,
      },
      visibleHeight: runtime.computeVisibleHeight(runtime.appCtx.threeCamera, exportCameraTarget),
      frameSize: runtime.computeOrthoFrameSize(runtime.appCtx.threeCamera, exportCameraTarget),
      fov: runtime.appCtx.threeCamera.isPerspectiveCamera ? runtime.appCtx.threeCamera.fov : 36,
      focalLength: runtime.appCtx.threeCamera.isPerspectiveCamera ? runtime.getCameraFocalLength() : null,
    },
    folderName: runtime.exportFolderNameInput.value,
    selectedFiles: [...runtime.collectSelectedExportFiles()],
  });
}

export function importCameraPreset(runtime: StudioAppRuntime, cameraPresetSpec: any) {
  const presetAspect =
      runtime.stateViewportAspectGetCanvasSize().width / runtime.stateViewportAspectGetCanvasSize().height,
    ut4 = runtime.cameraSettings();
  ((ut4.cameraMode = cameraPresetSpec.mode),
    (ut4.cameraView = cameraPresetSpec.view),
    (ut4.cameraTopRotation = cameraPresetSpec.topRotation),
    cameraPresetSpec.focalLength !== null &&
      (ut4.cameraFocalLength = cameraPresetSpec.focalLength));
  const presetPosition = new ns2.Vector3(
      cameraPresetSpec.position.x,
      cameraPresetSpec.position.y,
      cameraPresetSpec.position.z,
    ),
    presetTarget = new ns2.Vector3(
      cameraPresetSpec.target.x,
      cameraPresetSpec.target.y,
      cameraPresetSpec.target.z,
    );
  (runtime.applyCameraState(
    {
      mode: cameraPresetSpec.mode,
      cameraView: cameraPresetSpec.view,
      topRotation: cameraPresetSpec.topRotation,
      position: presetPosition,
      target: presetTarget,
      up:
        cameraPresetSpec.view === "top"
          ? runtime.buildCameraUpVector(cameraPresetSpec.topRotation)
          : new ns2.Vector3(0, 1, 0),
      zoom: 1,
      visibleHeight: cameraPresetSpec.visibleHeight,
      frameSize: runtime.resolveFrameSize(cameraPresetSpec, presetAspect),
      viewportAspect: presetAspect,
      fov: cameraPresetSpec.fov,
      near: 0.02,
      far: Math.max(
        presetPosition.distanceTo(presetTarget) * (cameraPresetSpec.mode === "perspective" ? 8 : 5),
        100,
      ),
    },
    presetAspect,
  ),
    runtime.syncCameraModeControls(cameraPresetSpec.mode),
    runtime.syncCameraViewControls(cameraPresetSpec.view));
}

export function applyExportPreset(runtime: StudioAppRuntime, presetSlotIndexToApply: any, applyOptions: ApplyExportOptions = {}) {
  const appliedPreset = normalizeExportPreset2(
    runtime.appCtx.studioProject?.exportPresets?.[presetSlotIndexToApply],
  );
  if (!appliedPreset || !runtime.appCtx.pendingRuntimeSettings) return false;
  ((runtime.exportWidthInput.value = String(appliedPreset.width)),
    (runtime.exportHeightInput.value = String(appliedPreset.height)),
    (runtime.exportLockRatioInput.checked = appliedPreset.lockRatio),
    (runtime.appCtx.exportAspectRatio = appliedPreset.width / appliedPreset.height),
    (runtime.appCtx.studioProject.exportFloorGap = appliedPreset.floorGap));
  const presetFloorEntry = runtime.appCtx.studioProject.floors.find(
      (applyOptionsMatchedFloor: any) => applyOptionsMatchedFloor.id === appliedPreset.floorId,
    ),
    presetFloorId =
      appliedPreset.floorMode === "all" && runtime.appCtx.studioProject.floors.length > 1
        ? "all"
        : presetFloorEntry?.id || runtime.getActiveFloor()?.id || runtime.appCtx.activeFloorId;
  (runtime.selectPreviewFloor(presetFloorId),
    (runtime.exportFloorGapInput.value = appliedPreset.floorGap.toFixed(1)),
    (runtime.exportFolderNameInput.value = appliedPreset.folderName));
  const selectedExportFileSet = new Set(appliedPreset.selectedFiles),
    hasTelevisionFile = selectedExportFileSet.has("televisionOn"),
    hasVehicleFile = selectedExportFileSet.has("vehicleCharging");
  for (const exportFileInput of runtime.exportDialogElement.querySelectorAll("input[data-export-file]")) {
    const exportFile = exportFileInput.dataset.exportFile;
    exportFileInput.checked =
      selectedExportFileSet.has(exportFile) ||
      (hasTelevisionFile && exportFile.startsWith("screen:")) ||
      (hasVehicleFile && exportFile.startsWith("vehicle:"));
  }
  return (
    runtime.importCameraPreset(appliedPreset.camera),
    runtime.refreshCanvasSizeUi(),
    runtime.refreshFloorControls(),
    applyOptions.silent ||
      ((runtime.exportStatusElement.textContent =
        "已切换到档位 " + String(presetSlotIndexToApply + 1).padStart(2, "0")),
      runtime.showToast(
        "已应用导出档位 " + String(presetSlotIndexToApply + 1).padStart(2, "0") + "。",
        "success",
      )),
    runtime.syncCanvasSizeInputs(),
    true
  );
}

export function selectExportPresetSlot(runtime: StudioAppRuntime, slotIndex: any) {
  const exportPresetCount = runtime.appCtx.studioProject?.exportPresets?.length || 0;
  if (
    !Number.isInteger(slotIndex) ||
    slotIndex < 0 ||
    slotIndex >= exportPresetCount ||
    runtime.appCtx.isInteractionLocked
  )
    return;
  (runtime.saveExportPreset(), (runtime.appCtx.studioProject.activeExportPresetSlot = slotIndex));
  const du2 = runtime.applyExportPreset(slotIndex);
  ((runtime.appCtx.isExportPresetDirty = false),
    runtime.renderExportPresetSlots(),
    runtime.markDocumentDirty(),
    du2 ||
      (runtime.exportStatusElement.textContent =
        "存档 " + String(slotIndex + 1).padStart(2, "0") + " 没有设置"));
}

export function saveExportPreset(runtime: StudioAppRuntime, ) {
  if (
    (window.clearTimeout(runtime.appCtx.exportPreviewTimeoutId),
    (runtime.appCtx.exportPreviewTimeoutId = null),
    !runtime.appCtx.isExportPresetDirty)
  )
    return false;
  const targetPresetSlot = normalizeActiveExportPresetSlot2(
    runtime.appCtx.studioProject?.activeExportPresetSlot,
    runtime.appCtx.studioProject?.exportPresets?.length,
  );
  if (!runtime.appCtx.pendingRuntimeSettings || runtime.appCtx.isInteractionLocked) return false;
  runtime.appCtx.studioProject.exportPresets = normalizeExportPresetSlots2(runtime.appCtx.studioProject.exportPresets);
  const currentPresetName = runtime.appCtx.studioProject.exportPresets[targetPresetSlot]?.name || "";
  return (
    (runtime.appCtx.studioProject.exportPresets[targetPresetSlot] = runtime.buildExportPreset({
      name: currentPresetName,
    })),
    (runtime.appCtx.isExportPresetDirty = false),
    runtime.renderExportPresetSlots(),
    runtime.markDocumentDirty(),
    true
  );
}

export function syncExportControls(runtime: StudioAppRuntime, ) {
  !runtime.appCtx.pendingRuntimeSettings ||
    runtime.appCtx.isInteractionLocked ||
    ((runtime.appCtx.isExportPresetDirty = true),
    runtime.renderExportPresetSlots(),
    window.clearTimeout(runtime.appCtx.exportPreviewTimeoutId),
    (runtime.appCtx.exportPreviewTimeoutId = window.setTimeout(runtime.saveExportPreset, 360)));
}

export function formatPresetLabel(runtime: StudioAppRuntime, labelPreset: any, labelSlotIndex: any) {
  if (!labelPreset) return "存档 " + String(labelSlotIndex + 1).padStart(2, "0");
  const presetFloorName = (runtime.appCtx.studioProject?.floors || []).find(
    (labelFloor: any) => labelFloor.id === labelPreset.floorId,
  )?.name;
  return (
    labelPreset.name || presetFloorName || "存档 " + String(labelSlotIndex + 1).padStart(2, "0")
  );
}

export function makeUniquePresetName(runtime: StudioAppRuntime, basePresetName: any, ignoredSlotIndex = -1) {
  const normalizedPresetName = normalizeLabelText2(basePresetName, "导出视角", 24),
    presetNameSet = new Set(
      (runtime.appCtx.studioProject?.exportPresets || [])
        .map((nameSlotPreset: any, nameSlotIndex: any) =>
          nameSlotIndex === ignoredSlotIndex
            ? ""
            : runtime.formatPresetLabel(nameSlotPreset, nameSlotIndex),
        )
        .filter(Boolean),
    );
  if (!presetNameSet.has(normalizedPresetName)) return normalizedPresetName;
  let ignoredSlotIndexDuplicateNameSuffix = 2;
  for (; presetNameSet.has(normalizedPresetName + " " + ignoredSlotIndexDuplicateNameSuffix);)
    ignoredSlotIndexDuplicateNameSuffix += 1;
  return (normalizedPresetName + " " + ignoredSlotIndexDuplicateNameSuffix).slice(0, 24);
}
