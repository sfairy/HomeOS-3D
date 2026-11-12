import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import * as ns2 from '/static/vendor/three/0.187.0/three.module.min.js'
import { clamp as clamp2 } from '../../../plan/geometry'
import { syncControlValue as syncControlValue2 } from '../../ui/ui-controls'
import { finite as finite2 } from '../../../loaders/studio-normalization'

export function refreshFloorControls(runtime: StudioAppRuntime) {
  const hasMultipleFloors = (runtime.appCtx.studioProject?.floors.length || 0) > 1,
    isOverviewMode = runtime.getPreviewFloorMode() === 'all'
  ;(runtime.floorCameraActionsElement.hidden = isOverviewMode),
    (runtime.overviewCameraActionsElement.hidden = !hasMultipleFloors || !isOverviewMode),
    (runtime.previewFloorGapControlElement.hidden = !hasMultipleFloors || !isOverviewMode),
    syncControlValue2(
      runtime.previewFloorGapInput,
      finite2(runtime.appCtx.studioProject?.previewFloorGap, 3).toFixed(1),
    ),
    (runtime.previewFloorUniformControlElement.hidden = !hasMultipleFloors || !isOverviewMode),
    (runtime.previewFloorUniformInput.checked = runtime.appCtx.studioProject?.uniformOverviewStack === true)
  const hasSavedFloorView = !!runtime.appCtx.studioState.settings?.fixedCameraView,
    hasSavedOverviewView = !!runtime.appCtx.studioProject?.combinedFixedCameraView
  ;(runtime.fixedCameraViewButton.disabled = !hasSavedFloorView),
    runtime.fixedCameraViewButton.classList.toggle('has-saved-view', hasSavedFloorView),
    (runtime.fixedOverviewViewButton.disabled = !hasSavedOverviewView),
    runtime.fixedOverviewViewButton.classList.toggle('has-saved-view', hasSavedOverviewView)
  const hasSavedCameraView = isOverviewMode ? hasSavedOverviewView : hasSavedFloorView
  ;(runtime.exportSaveViewButton.textContent = isOverviewMode ? '保存总览' : '保存视角'),
    (runtime.exportSaveViewButton.title = isOverviewMode
      ? '记录当前导图的全楼角度和投影方式'
      : '记录当前导图的角度、缩放和投影方式'),
    (runtime.selectElement('#export-use-fixed').textContent = isOverviewMode ? '恢复总览' : '恢复视角'),
    (runtime.selectElement('#export-use-fixed').title = isOverviewMode
      ? '恢复已保存的全楼总览视角'
      : '恢复当前楼层已保存的视角'),
    (runtime.selectElement('#export-use-fixed').disabled = !!runtime.appCtx.isInteractionLocked || !hasSavedCameraView),
    runtime.selectElement('#export-use-fixed').classList.toggle('has-saved-view', hasSavedCameraView)
}

export function resizeStudioRenderer(
  runtime: StudioAppRuntime,
  { preserveCanvasSize: shouldPreserveCanvasSize = false } = {},
) {
  if (!runtime.appCtx.threeRenderer) return
  if (runtime.appCtx.pendingRuntimeSettings) {
    runtime.resizeRenderCanvas()
    return
  }
  const previewStageElement = runtime.selectElement('#preview-3d'),
    size = runtime.isEmbeddedStage ? runtime.appCtx.threeRenderer.getSize(new ns2.Vector2()) : null,
    viewportWidth = Math.max(shouldPreserveCanvasSize && size ? size.x : previewStageElement.clientWidth, 1),
    viewportHeight = Math.max(shouldPreserveCanvasSize && size ? size.y : previewStageElement.clientHeight, 1),
    isViewportSizeUnchanged = size?.x === viewportWidth && size?.y === viewportHeight,
    join3 = runtime.isEmbeddedStage ? runtime.appCtx.threeCamera.projectionMatrix.elements.join(',') : ''
  isViewportSizeUnchanged || runtime.appCtx.threeRenderer.setSize(viewportWidth, viewportHeight, false),
    (runtime.appCtx.threeCamera.userData.viewportAspect = viewportWidth / viewportHeight),
    runtime.appCtx.threeCamera.isOrthographicCamera
      ? runtime.applyOrthoFrame(
          runtime.appCtx.threeCamera.userData.frameSize || 10,
          runtime.appCtx.threeCamera.userData.viewportAspect,
        )
      : ((runtime.appCtx.threeCamera.aspect = runtime.appCtx.threeCamera.userData.viewportAspect),
        runtime.applyCameraFocalLength()),
    (!isViewportSizeUnchanged || join3 !== runtime.appCtx.threeCamera.projectionMatrix.elements.join(',')) &&
      runtime.refreshSceneRender()
}

export function stateViewportAspectGetCanvasSize(runtime: StudioAppRuntime) {
  return {
    width: Math.round(clamp2(finite2(runtime.exportWidthInput.value, runtime.defaultExportWidth), 320, 4096)),
    height: Math.round(clamp2(finite2(runtime.exportHeightInput.value, runtime.defaultExportHeight), 320, 4096)),
  }
}

export function refreshCanvasSizeUi(runtime: StudioAppRuntime) {
  const { width: wn2, height: wn3 } = runtime.stateViewportAspectGetCanvasSize()
  runtime.exportResolutionLabelElement.textContent = wn2 + ' × ' + wn3 + ' px'
  const greatestCommonDivisor = ((gcdLeft, gcdRight) => {
      for (; gcdRight; ) [gcdLeft, gcdRight] = [gcdRight, gcdLeft % gcdRight]
      return gcdLeft
    })(wn2, wn3),
    ratioWidth = wn2 / greatestCommonDivisor,
    ratioHeight = wn3 / greatestCommonDivisor
  ;(runtime.exportAspectLabelElement.textContent =
    ratioWidth <= 32 && ratioHeight <= 32 ? ratioWidth + ' : ' + ratioHeight : (wn2 / wn3).toFixed(2) + ' : 1'),
    runtime.exportPreviewFrameElement.style.setProperty('--export-aspect', String(wn2 / wn3))
}

export function resolvePixelRatio(runtime: StudioAppRuntime, isExportMode = false) {
  const devicePixelRatioValue = window.devicePixelRatio || 1
  if (!runtime.isAutoDiagramEmbed || !runtime.exportPreviewStageElement) return devicePixelRatioValue
  const { width: wn4, height: wn5 } = runtime.stateViewportAspectGetCanvasSize(),
    hostClientWidth = Math.max(runtime.exportPreviewStageElement.clientWidth, 1),
    hostClientHeight = Math.max(runtime.exportPreviewStageElement.clientHeight, 1),
    cappedPixelRatio = Math.max(devicePixelRatioValue, wn4 / hostClientWidth, wn5 / hostClientHeight, 1.5)
  return Math.min(cappedPixelRatio, isExportMode ? 2 : 4)
}

export function resizeRenderCanvas(runtime: StudioAppRuntime) {
  if (
    !runtime.appCtx.pendingRuntimeSettings ||
    runtime.appCtx.isInteractionLocked ||
    !runtime.appCtx.threeRenderer ||
    !runtime.appCtx.threeCamera
  )
    return
  const { width: wn6, height: wn7 } = runtime.stateViewportAspectGetCanvasSize(),
    canvasAspect = wn6 / wn7,
    canvasClientWidth = Math.max(runtime.exportPreviewStageElement.clientWidth, 1),
    canvasClientHeight = Math.max(runtime.exportPreviewStageElement.clientHeight, 1),
    $f3 = runtime.isAutoDiagramEmbed ? runtime.resolvePixelRatio(false) : Math.min(window.devicePixelRatio || 1, 2)
  runtime.appCtx.threeRenderer.setPixelRatio($f3),
    runtime.appCtx.threeRenderer.setSize(canvasClientWidth, canvasClientHeight, false),
    (runtime.appCtx.threeCamera.userData.viewportAspect = canvasAspect),
    runtime.appCtx.threeCamera.isOrthographicCamera
      ? runtime.applyOrthoFrame(
          runtime.appCtx.threeCamera.userData.frameSize || 10,
          canvasAspect,
          runtime.appCtx.threeCamera,
        )
      : ((runtime.appCtx.threeCamera.aspect = canvasAspect), runtime.applyCameraFocalLength()),
    runtime.appCtx.orbitControls.update(),
    runtime.refreshSceneRender()
}

export function syncCanvasSizeInputs(runtime: StudioAppRuntime) {
  runtime.refreshCanvasSizeUi(), requestAnimationFrame(() => requestAnimationFrame(runtime.resizeRenderCanvas))
}

export function handleCanvasSizeInput(runtime: StudioAppRuntime, dimensionName: any, shouldCommitSize = false) {
  const inputDimensionValue = Number(
    (dimensionName === 'width' ? runtime.exportWidthInput : runtime.exportHeightInput).value,
  )
  if (!Number.isFinite(inputDimensionValue) || inputDimensionValue <= 0) return
  let nextCanvasWidth = dimensionName === 'width' ? inputDimensionValue : Number(runtime.exportWidthInput.value),
    nextCanvasHeight = dimensionName === 'height' ? inputDimensionValue : Number(runtime.exportHeightInput.value)
  ;(nextCanvasWidth =
    Number.isFinite(nextCanvasWidth) && nextCanvasWidth > 0 ? nextCanvasWidth : runtime.defaultExportWidth),
    (nextCanvasHeight =
      Number.isFinite(nextCanvasHeight) && nextCanvasHeight > 0 ? nextCanvasHeight : runtime.defaultExportHeight),
    runtime.exportLockRatioInput.checked &&
      (dimensionName === 'width'
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
          : (nextCanvasWidth = Math.round(clamp2(nextCanvasHeight * runtime.appCtx.exportAspectRatio, 320, 4096)))),
    shouldCommitSize
      ? ((nextCanvasWidth = Math.round(clamp2(nextCanvasWidth, 320, 4096))),
        (nextCanvasHeight = Math.round(clamp2(nextCanvasHeight, 320, 4096))),
        (runtime.exportWidthInput.value = String(nextCanvasWidth)),
        (runtime.exportHeightInput.value = String(nextCanvasHeight)))
      : runtime.exportLockRatioInput.checked &&
        (dimensionName === 'width'
          ? (runtime.exportHeightInput.value = String(nextCanvasHeight))
          : (runtime.exportWidthInput.value = String(nextCanvasWidth))),
    runtime.syncCanvasSizeInputs()
}
