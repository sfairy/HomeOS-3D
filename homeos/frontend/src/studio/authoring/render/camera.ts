import { type StudioAppRuntime } from '../runtime/studio-app-runtime'
import * as ns2 from '/static/vendor/three/0.187.0/three.module.min.js'
import { clamp as clamp2 } from '../plan/geometry'
import { syncControlValue as syncControlValue2 } from '../ui/ui-controls'
import { finite as finite2 } from '../loaders/studio-normalization'
import { type CameraSnapshotOptions, type CameraModeOptions, type CameraViewChangeOptions } from '../types/studio-app-types'
import { MAX_CAMERA_POLAR_ANGLE as MAX_CAMERA_POLAR_ANGLE2, constrainCameraPosition as constrainCameraPosition2 } from '../scene/studio-camera-constraints'
import { OrbitControls as OrbitControls2 } from '/static/vendor/three/0.187.0/OrbitControls.js'
import { createStudioOrbitControls } from '../studio-orbit-controls'
import { normalizeActiveExportPresetSlot as normalizeActiveExportPresetSlot2 } from '../export/export-presets'


export function cameraSettings(runtime: StudioAppRuntime) {
  return runtime.getPreviewFloorMode() === 'all'
    ? runtime.appCtx.studioProject.combinedCameraSettings
    : runtime.appCtx.studioState.settings
}

export function getCameraMode(runtime: StudioAppRuntime) {
  return runtime.cameraSettings()?.cameraMode === 'perspective' ? 'perspective' : 'orthographic'
}

export function getCameraView(runtime: StudioAppRuntime) {
  return runtime.cameraSettings()?.cameraView === 'top' ? 'top' : 'free'
}

export function getCameraTopRotation(runtime: StudioAppRuntime) {
  return (((Math.round(finite2(runtime.cameraSettings()?.cameraTopRotation, 0) / 90) * 90) % 360) + 360) % 360
}

export function buildCameraUpVector(runtime: StudioAppRuntime, topRotationDegrees = runtime.getCameraTopRotation()) {
  const degToRad3 = ns2.MathUtils.degToRad(topRotationDegrees)
  return new ns2.Vector3(Math.sin(degToRad3), 0, -Math.cos(degToRad3))
}

export function getCameraFocalLength(runtime: StudioAppRuntime) {
  return clamp2(finite2(runtime.cameraSettings()?.cameraFocalLength, 50), 18, 120)
}

export function syncCameraModeControls(runtime: StudioAppRuntime, cameraMode = runtime.getCameraMode()) {
  for (const cameraModeButton of runtime.cameraModeControls)
    cameraModeButton.classList.toggle('active', cameraModeButton.dataset.cameraMode === cameraMode)
  runtime.syncCameraFocalLengthControl(cameraMode)
}

export function syncCameraViewControls(runtime: StudioAppRuntime, cameraView = runtime.getCameraView()) {
  for (const cameraViewButton of runtime.cameraViewControls) {
    const isCameraViewActive = cameraViewButton.dataset.cameraView === cameraView
    cameraViewButton.classList.toggle('active', isCameraViewActive),
      cameraViewButton.setAttribute('aria-pressed', String(isCameraViewActive))
  }
  for (const cameraViewDependentButton of runtime.cameraRotateTopControls)
    cameraViewDependentButton.disabled = cameraView !== 'top'
}

export function syncCameraFocalLengthControl(runtime: StudioAppRuntime, cameraModeName = runtime.getCameraMode()) {
  for (const focalLengthInput of runtime.cameraFocalLengthControls)
    syncControlValue2(focalLengthInput, Math.round(runtime.getCameraFocalLength())),
      (focalLengthInput.disabled = cameraModeName !== 'perspective'),
      focalLengthInput.closest('.camera-focal-control')?.classList.toggle('is-disabled', focalLengthInput.disabled)
}

export function applyCameraFocalLength(
  runtime: StudioAppRuntime,
  targetCamera = runtime.appCtx.threeCamera,
  focalLengthValue = runtime.getCameraFocalLength(),
) {
  targetCamera?.isPerspectiveCamera && targetCamera.setFocalLength(clamp2(finite2(focalLengthValue, 50), 18, 120))
}


export function captureCameraView(runtime: StudioAppRuntime) {
  return runtime.getPreviewFloorMode() === 'all'
    ? runtime.appCtx.studioProject?.combinedFixedCameraView
    : runtime.appCtx.studioState.settings?.fixedCameraView
}

export function storeFixedCameraView(runtime: StudioAppRuntime, cameraViewSnapshot: any) {
  runtime.getPreviewFloorMode() === 'all'
    ? (runtime.appCtx.studioProject.combinedFixedCameraView = cameraViewSnapshot)
    : (runtime.appCtx.studioState.settings.fixedCameraView = cameraViewSnapshot)
}

export function updateCameraPlanes(
  runtime: StudioAppRuntime,
  planeCamera = runtime.appCtx.threeCamera,
  planeTarget = runtime.appCtx.orbitControls?.target,
) {
  if (!planeCamera || !planeTarget) return false
  const cameraTargetDistance = Math.max(planeCamera.position.distanceTo(planeTarget), 1),
    computedCameraNear = planeCamera.isPerspectiveCamera
      ? clamp2(cameraTargetDistance * runtime.cameraNearFactor, runtime.minCameraNear, runtime.maxCameraNear)
      : 0.02,
    computedCameraFar = Math.max(cameraTargetDistance * (planeCamera.isPerspectiveCamera ? 6 : 5), 100)
  return Math.abs(planeCamera.near - computedCameraNear) < 0.000001 &&
    Math.abs(planeCamera.far - computedCameraFar) < 0.0001
    ? false
    : ((planeCamera.near = computedCameraNear),
      (planeCamera.far = computedCameraFar),
      planeCamera.updateProjectionMatrix(),
      true)
}

export function computeVisibleHeight(_runtime: StudioAppRuntime, heightCamera: any, heightTarget: any) {
  if (heightCamera?.isOrthographicCamera)
    return Math.abs(heightCamera.top - heightCamera.bottom) / Math.max(heightCamera.zoom || 1, 0.000001)
  if (heightCamera?.isPerspectiveCamera) {
    const cameraDistance = Math.max(heightCamera.position.distanceTo(heightTarget), 0.0001),
      degToRad4 = ns2.MathUtils.degToRad(heightCamera.getEffectiveFOV())
    return 2 * cameraDistance * Math.tan(degToRad4 / 2)
  }
  return 10
}

export function adjustFrameSize(
  _runtime: StudioAppRuntime,
  visibleHeight: any,
  viewportAspectRatio = 1,
  cameraZoomFactor = 1,
) {
  const clampedAspect = Math.max(finite2(viewportAspectRatio, 1), 0.1),
    clampedZoom = Math.max(finite2(cameraZoomFactor, 1), 0.000001)
  return Math.max(finite2(visibleHeight, 10), 0.000001) * Math.min(1, clampedAspect) * clampedZoom
}

export function computeFrameSize(runtime: StudioAppRuntime, frameCamera: any, frameTarget: any) {
  const storedFrameSize = Number(frameCamera?.userData?.frameSize)
  if (frameCamera?.isOrthographicCamera && Number.isFinite(storedFrameSize) && storedFrameSize > 0)
    return storedFrameSize
  const cameraAspect = frameCamera?.userData?.viewportAspect || frameCamera?.aspect || 1,
    cameraZoom = frameCamera?.isOrthographicCamera ? Math.max(frameCamera.zoom || 1, 0.000001) : 1
  return runtime.adjustFrameSize(runtime.computeVisibleHeight(frameCamera, frameTarget), cameraAspect, cameraZoom)
}

export function computeOrthoFrameSize(runtime: StudioAppRuntime, orthoCamera: any, orthoTarget: any) {
  const orthoAspect = orthoCamera?.userData?.viewportAspect || orthoCamera?.aspect || 1
  if (orthoCamera?.isOrthographicCamera) {
    const orthoStoredFrameSize = Number(orthoCamera?.userData?.frameSize)
    if (Number.isFinite(orthoStoredFrameSize) && orthoStoredFrameSize > 0)
      return orthoStoredFrameSize / Math.max(orthoCamera.zoom || 1, 0.000001)
  }
  return runtime.adjustFrameSize(runtime.computeVisibleHeight(orthoCamera, orthoTarget), orthoAspect)
}

export function resolveFrameSize(
  runtime: StudioAppRuntime,
  cameraViewSettings: any,
  targetAspect: any,
  targetZoom = 1,
) {
  const settingsFrameSize = Number(cameraViewSettings?.frameSize)
  return Number.isFinite(settingsFrameSize) && settingsFrameSize > 0
    ? settingsFrameSize
    : runtime.adjustFrameSize(cameraViewSettings?.visibleHeight, targetAspect, targetZoom)
}

export async function saveCameraView(runtime: StudioAppRuntime) {
  if (!runtime.appCtx.threeCamera || !runtime.appCtx.orbitControls) return
  const cameraViewLabel = runtime.getPreviewFloorMode() === 'all' ? '总览视角' : '当前层视角'
  runtime.appCtx.pendingRuntimeSettings || runtime.deselectAll()
  const target = runtime.appCtx.orbitControls.target
  if (
    (runtime.storeFixedCameraView({
      mode: runtime.appCtx.threeCamera.isPerspectiveCamera ? 'perspective' : 'orthographic',
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
    ;(runtime.exportStatusElement.textContent = cameraViewLabel + '已保存'),
      await runtime.flushAutosave(),
      runtime.showToast(cameraViewLabel + '已保存。')
    return
  }
  runtime.markDocumentDirty(),
    window.clearTimeout(runtime.appCtx.autosaveTimeoutId),
    (runtime.appCtx.autosaveTimeoutId = null),
    await runtime.flushAutosave(),
    runtime.showToast(
      runtime.appCtx.localSaveRevision === runtime.appCtx.remoteSaveRevision
        ? cameraViewLabel + '已保存。'
        : cameraViewLabel + '已记录，正在保存…',
    )
}

export function applyCameraSnapshot(runtime: StudioAppRuntime, snapshotOptions: CameraSnapshotOptions = {}) {
  const cs2 = runtime.captureCameraView()
  if (!cs2 || !runtime.appCtx.threeCamera || !runtime.appCtx.orbitControls) return
  const hasModeChanged = cs2.mode !== runtime.getCameraMode(),
    hasViewChanged = cs2.view !== runtime.getCameraView(),
    hasRotationChanged = cs2.topRotation !== runtime.getCameraTopRotation(),
    hasFocalLengthChanged =
      cs2.focalLength !== null && Math.abs(cs2.focalLength - runtime.getCameraFocalLength()) > 1e-8,
    shouldRecordChange = snapshotOptions.recordChange !== false
  ;(hasModeChanged || hasViewChanged || hasRotationChanged || hasFocalLengthChanged) &&
    shouldRecordChange &&
    runtime.deselectAll()
  const ut2 = runtime.cameraSettings()
  ;(ut2.cameraMode = cs2.mode),
    (ut2.cameraView = cs2.view),
    (ut2.cameraTopRotation = cs2.topRotation),
    cs2.focalLength !== null && (ut2.cameraFocalLength = cs2.focalLength),
    runtime.setCameraMode(cs2.mode, {
      preserveView: false,
    })
  const snapshotTargetVector = new ns2.Vector3(cs2.target.x, cs2.target.y, cs2.target.z)
  runtime.appCtx.threeCamera.position.set(cs2.position.x, cs2.position.y, cs2.position.z),
    runtime.appCtx.threeCamera.up.copy(
      cs2.view === 'top' ? runtime.buildCameraUpVector(cs2.topRotation) : new ns2.Vector3(0, 1, 0),
    ),
    (runtime.appCtx.threeCamera.userData.viewportAspect ||= Math.max(
      runtime.selectElement('#preview-3d').clientWidth / Math.max(runtime.selectElement('#preview-3d').clientHeight, 1),
      0.1,
    ))
  const ds2 = runtime.resolveFrameSize(cs2, runtime.appCtx.threeCamera.userData.viewportAspect)
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
    const restoredViewLabel = runtime.getPreviewFloorMode() === 'all' ? '总览视角' : '当前层视角'
    runtime.showToast('已恢复上次保存的' + restoredViewLabel + '。')
  }
}

export function setCameraView(
  runtime: StudioAppRuntime,
  requestedCameraView: any,
  viewChangeOptions: CameraViewChangeOptions = {},
) {
  const cameraViewName = requestedCameraView === 'top' ? 'top' : 'free',
    qn2 = runtime.getCameraTopRotation()
  if ((runtime.syncCameraViewControls(cameraViewName), !runtime.appCtx.threeCamera || !runtime.appCtx.orbitControls))
    return
  if (
    runtime.appCtx.threeCamera.userData.cameraView === cameraViewName &&
    (cameraViewName !== 'top' || runtime.appCtx.threeCamera.userData.topRotation === qn2) &&
    viewChangeOptions.force !== true
  ) {
    runtime.requestStudioRender()
    return
  }
  if (cameraViewName === 'free') {
    runtime.updateCameraView({
      view: 'free',
    })
    return
  }
  const clone = runtime.appCtx.orbitControls.target.clone(),
    bo2 = runtime.computeVisibleHeight(runtime.appCtx.threeCamera, clone),
    wf2 = runtime.computeFrameSize(runtime.appCtx.threeCamera, clone),
    cameraTopDistance = Math.max(runtime.appCtx.threeCamera.position.distanceTo(clone), 8)
  if (
    (runtime.appCtx.threeCamera.up.copy(runtime.buildCameraUpVector(qn2)),
    runtime.appCtx.threeCamera.isPerspectiveCamera)
  ) {
    runtime.applyCameraFocalLength()
    const degToRad5 = ns2.MathUtils.degToRad(runtime.appCtx.threeCamera.getEffectiveFOV()),
      cameraFreeDistance = Math.max(bo2 / (2 * Math.tan(degToRad5 / 2)), 8)
    runtime.appCtx.threeCamera.position.set(clone.x, clone.y + cameraFreeDistance, clone.z)
  } else
    runtime.applyOrthoFrame(wf2, runtime.appCtx.threeCamera.userData.viewportAspect || 1, runtime.appCtx.threeCamera),
      runtime.appCtx.threeCamera.position.set(clone.x, clone.y + cameraTopDistance, clone.z)
  ;(runtime.appCtx.threeCamera.userData.frameSize = wf2),
    (runtime.appCtx.threeCamera.userData.cameraView = 'top'),
    (runtime.appCtx.threeCamera.userData.topRotation = qn2),
    runtime.updateCameraPlanes(runtime.appCtx.threeCamera, clone),
    runtime.appCtx.threeCamera.lookAt(clone),
    runtime.appCtx.threeCamera.updateProjectionMatrix(),
    runtime.appCtx.orbitControls.target.copy(clone),
    runtime.requestStudioRender(),
    runtime.appCtx.orbitControls.update()
}

export function setCameraMode(
  runtime: StudioAppRuntime,
  requestedCameraMode: any,
  modeChangeOptions: CameraModeOptions = {},
) {
  const cameraModeValue = requestedCameraMode === 'perspective' ? 'perspective' : 'orthographic'
  if ((runtime.syncCameraModeControls(cameraModeValue), !runtime.appCtx.threeRenderer)) return
  if ((cameraModeValue === 'perspective') == !!runtime.appCtx.threeCamera?.isPerspectiveCamera) {
    runtime.applyCameraFocalLength(), runtime.requestStudioRender()
    return
  }
  const shouldPreserveView = modeChangeOptions.preserveView !== false,
    previousCamera = runtime.appCtx.threeCamera,
    previousCameraTarget = runtime.appCtx.orbitControls?.target.clone() || new ns2.Vector3(0, 0.6, 0),
    sub = previousCamera ? previousCamera.position.clone().sub(previousCameraTarget) : new ns2.Vector3(1.12, 1.42, 1.2),
    defaultCameraDistance = Math.max(sub.length(), 2),
    normalize = sub.lengthSq() > 1e-8 ? sub.normalize() : new ns2.Vector3(1.12, 1.42, 1.2).normalize(),
    newCameraAspect =
      previousCamera?.userData.viewportAspect ||
      Math.max(
        runtime.selectElement('#preview-3d').clientWidth /
          Math.max(runtime.selectElement('#preview-3d').clientHeight, 1),
        0.1,
      ),
    bo3 =
      shouldPreserveView && previousCamera
        ? runtime.computeVisibleHeight(previousCamera, previousCameraTarget)
        : previousCamera?.userData.frameSize || 10,
    oc2 =
      shouldPreserveView && previousCamera
        ? runtime.adjustFrameSize(bo3, newCameraAspect)
        : previousCamera?.userData.frameSize || 10
  if ((runtime.appCtx.orbitControls?.dispose(), cameraModeValue === 'perspective')) {
    ;(runtime.appCtx.threeCamera = new ns2.PerspectiveCamera(36, newCameraAspect, 0.02, 200)),
      runtime.applyCameraFocalLength(runtime.appCtx.threeCamera)
    const computedCameraDistance =
        bo3 / (2 * Math.tan(ns2.MathUtils.degToRad(runtime.appCtx.threeCamera.getEffectiveFOV()) / 2)),
      cameraPlacementDistance = shouldPreserveView ? computedCameraDistance : defaultCameraDistance
    runtime.appCtx.threeCamera.position
      .copy(previousCameraTarget)
      .addScaledVector(normalize, Math.max(cameraPlacementDistance, 2))
  } else
    (runtime.appCtx.threeCamera = new ns2.OrthographicCamera(-5, 5, 5, -5, 0.02, 200)),
      runtime.appCtx.threeCamera.position.copy(previousCameraTarget).addScaledVector(normalize, defaultCameraDistance),
      runtime.applyOrthoFrame(oc2, newCameraAspect, runtime.appCtx.threeCamera)
  runtime.appCtx.threeCamera.layers.enable(runtime.lampsLayerIndex),
    (runtime.appCtx.threeCamera.userData.viewportAspect = newCameraAspect),
    (runtime.appCtx.threeCamera.userData.frameSize = oc2),
    (runtime.appCtx.threeCamera.userData.cameraView = previousCamera?.userData.cameraView || 'free'),
    (runtime.appCtx.threeCamera.userData.topRotation = previousCamera?.userData.topRotation || 0),
    runtime.appCtx.threeCamera.up.copy(previousCamera?.up || new ns2.Vector3(0, 1, 0)),
    runtime.updateCameraPlanes(runtime.appCtx.threeCamera, previousCameraTarget),
    runtime.appCtx.threeCamera.lookAt(previousCameraTarget),
    runtime.appCtx.threeCamera.updateProjectionMatrix(),
    (runtime.appCtx.orbitControls = runtime.createOrbitControls(runtime.appCtx.threeCamera)),
    runtime.appCtx.orbitControls.target.copy(previousCameraTarget),
    runtime.requestStudioRender(),
    (runtime.isEmbeddedStage && modeChangeOptions.deferControlUpdate === true) || runtime.appCtx.orbitControls.update()
}

export function applyOrthoFrame(
  runtime: StudioAppRuntime,
  orthoFrameSize: any,
  orthoFrameAspect: any,
  orthoFrameCamera = runtime.appCtx.threeCamera,
) {
  if (!orthoFrameCamera?.isOrthographicCamera) return
  const frameHalfHeight = Math.max(orthoFrameSize, 1) / 2
  orthoFrameAspect >= 1
    ? ((orthoFrameCamera.left = -frameHalfHeight * orthoFrameAspect),
      (orthoFrameCamera.right = frameHalfHeight * orthoFrameAspect),
      (orthoFrameCamera.top = frameHalfHeight),
      (orthoFrameCamera.bottom = -frameHalfHeight))
    : ((orthoFrameCamera.left = -frameHalfHeight),
      (orthoFrameCamera.right = frameHalfHeight),
      (orthoFrameCamera.top = frameHalfHeight / Math.max(orthoFrameAspect, 0.1)),
      (orthoFrameCamera.bottom = -frameHalfHeight / Math.max(orthoFrameAspect, 0.1))),
    orthoFrameCamera.updateProjectionMatrix()
}

export function captureOverviewCamera(runtime: StudioAppRuntime) {
  return !runtime.appCtx.threeCamera || !runtime.appCtx.orbitControls
    ? null
    : {
        mode: runtime.appCtx.threeCamera.isPerspectiveCamera ? 'perspective' : 'orthographic',
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
      }
}

export function applyCameraState(
  runtime: StudioAppRuntime,
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
      ? ((runtime.appCtx.threeCamera.fov = cameraStateSnapshot.fov),
        (runtime.appCtx.threeCamera.aspect = stateViewportAspect))
      : runtime.applyOrthoFrame(
          runtime.appCtx.threeCamera.userData.frameSize,
          stateViewportAspect,
          runtime.appCtx.threeCamera,
        ),
    runtime.appCtx.threeCamera.lookAt(cameraStateSnapshot.target),
    runtime.appCtx.threeCamera.updateProjectionMatrix(),
    runtime.appCtx.orbitControls.target.copy(cameraStateSnapshot.target),
    runtime.requestStudioRender(),
    runtime.appCtx.orbitControls.update())
}


export function handleOrbitStart(runtime: StudioAppRuntime) {
  const hasShadowPreparePending = runtime.appCtx.rendererRestoreTimeoutId !== null
  window.clearTimeout(runtime.appCtx.rendererRestoreTimeoutId),
    (runtime.appCtx.rendererRestoreTimeoutId = null),
    (runtime.appCtx.isRenderSuppressed = true),
    (runtime.appCtx.isAdaptiveRenderPaused = hasShadowPreparePending || runtime.appCtx.isShadowFrozen),
    (runtime.appCtx.frameDurationSamples = []),
    (runtime.appCtx.samplingWindowStartMs = 0),
    runtime.requestStudioRender()
}

export function handleOrbitChange(runtime: StudioAppRuntime) {
  runtime.appCtx.isAdaptiveRenderPaused ||
    ((runtime.appCtx.isAdaptiveRenderPaused = true),
    runtime.requestStudioRender(),
    runtime.updateShadowState(true, {
      preserveLightCache: true,
    }))
}

export function handleOrbitEnd(runtime: StudioAppRuntime) {
  const Xi2 = runtime.appCtx.isAdaptiveRenderPaused
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
    runtime.appCtx.pendingRuntimeSettings && !runtime.appCtx.isInteractionLocked && runtime.syncExportControls()
    return
  }
  // 立即恢复全质量像素比，避免拖转结束后再糊 140ms。
  ;(runtime.appCtx.rendererRestoreTimeoutId = null),
    runtime.updateShadowState(false, {
      preserveLightCache: true,
    }),
    runtime.appCtx.pendingRuntimeSettings && !runtime.appCtx.isInteractionLocked && runtime.syncExportControls()
}

export function createOrbitControls(runtime: StudioAppRuntime, orbitCamera: any) {
  const orbitControlsHandle = createStudioOrbitControls(
    OrbitControls2,
    orbitCamera,
    runtime.appCtx.threeRenderer.domElement,
    {
      touchDragThreshold: runtime.isEmbeddedStage ? 8 : 0,
      rotateSmoothing: 8,
      rotateSmoothingThreshold: 0.000001,
    },
  )
  ;(orbitControlsHandle.enableDamping = true),
    (orbitControlsHandle.dampingFactor = 0.22),
    (orbitControlsHandle.minDistance = 2),
    (orbitControlsHandle.maxDistance = 100),
    (orbitControlsHandle.minZoom = 0.35),
    (orbitControlsHandle.maxZoom = 6),
    (orbitControlsHandle.maxPolarAngle = MAX_CAMERA_POLAR_ANGLE2),
    orbitControlsHandle.target.set(0, 0.6, 0)
  const bind = orbitControlsHandle.update.bind(orbitControlsHandle)
  return (
    (orbitControlsHandle.update = (deltaSeconds: any) => {
      orbitControlsHandle._quat.identity(),
        orbitControlsHandle._quatInverse.identity(),
        runtime.getCameraView() !== 'top' &&
          (!runtime.isEmbeddedStage ||
            orbitControlsHandle._sphericalDelta.theta ||
            orbitControlsHandle._sphericalDelta.phi) &&
          orbitCamera.up.set(0, 1, 0),
        (orbitControlsHandle.maxPolarAngle = Math.min(orbitControlsHandle.maxPolarAngle, MAX_CAMERA_POLAR_ANGLE2)),
        (orbitControlsHandle.minPolarAngle = Math.min(
          orbitControlsHandle.minPolarAngle,
          orbitControlsHandle.maxPolarAngle,
        ))
      const boundOrbitDelta = bind(deltaSeconds),
        polarAngle = orbitControlsHandle.getPolarAngle()
      return (
        ((polarAngle >= orbitControlsHandle.maxPolarAngle - 1e-8 && orbitControlsHandle._sphericalDelta.phi > 0) ||
          (polarAngle <= orbitControlsHandle.minPolarAngle + 0.000001 &&
            orbitControlsHandle._sphericalDelta.phi < 0)) &&
          (orbitControlsHandle._sphericalDelta.phi = 0),
        constrainCameraPosition2(orbitCamera.position, orbitControlsHandle.target)
          ? (orbitControlsHandle._sphericalDelta.phi > 0 && (orbitControlsHandle._sphericalDelta.phi = 0),
            orbitCamera.lookAt(orbitControlsHandle.target),
            orbitCamera.updateMatrixWorld(),
            orbitControlsHandle.dispatchEvent({
              type: 'change',
            }),
            true)
          : boundOrbitDelta
      )
    }),
    orbitControlsHandle.addEventListener('start', runtime.handleOrbitStart),
    orbitControlsHandle.addEventListener('change', () => {
      runtime.updateCameraPlanes(orbitCamera, orbitControlsHandle.target),
        runtime.appCtx.isRenderSuppressed
          ? (runtime.handleOrbitChange(),
            runtime.refreshSceneRender({
              preserveLightCache: true,
            }))
          : runtime.refreshSceneRender()
    }),
    orbitControlsHandle.addEventListener('change', () => {
      if (!runtime.appCtx.pendingRuntimeSettings || runtime.appCtx.isInteractionLocked) return
      const activePresetSlot = normalizeActiveExportPresetSlot2(
        runtime.appCtx.studioProject?.activeExportPresetSlot,
        runtime.appCtx.studioProject?.exportPresets?.length,
      )
      runtime.appCtx.isExportPresetDirty ||
        runtime.appCtx.studioProject?.exportPresets?.[activePresetSlot] ||
        ((runtime.appCtx.isExportPresetDirty = true), runtime.renderExportPresetSlots())
    }),
    orbitControlsHandle.addEventListener('end', runtime.handleOrbitEnd),
    orbitControlsHandle
  )
}
