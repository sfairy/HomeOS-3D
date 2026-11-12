import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import {
  MAX_CAMERA_POLAR_ANGLE as MAX_CAMERA_POLAR_ANGLE2,
  constrainCameraPosition as constrainCameraPosition2,
} from '../../scene/studio-camera-constraints'
import { OrbitControls as OrbitControls2 } from '/static/vendor/three/0.187.0/OrbitControls.js'
import { createStudioOrbitControls } from '../../studio-orbit-controls'
import { normalizeActiveExportPresetSlot as normalizeActiveExportPresetSlot2 } from '../../../export/export-presets'

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
