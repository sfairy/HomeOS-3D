import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import * as ns2 from '/static/vendor/three/0.187.0/three.module.min.js'
import { clamp as clamp2 } from '../../../plan/geometry'
import { syncControlValue as syncControlValue2 } from '../../ui/ui-controls'
import { finite as finite2 } from '../../../loaders/studio-normalization'

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
