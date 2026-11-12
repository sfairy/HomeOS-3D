import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import * as ns2 from '/static/vendor/three/0.187.0/three.module.min.js'
import { clamp as clamp2 } from '../../../plan/geometry'
import {
  MAX_EXPORT_PRESET_COUNT as MAX_EXPORT_PRESET_COUNT2,
  exportPresetIsEmpty as exportPresetIsEmpty2,
  normalizeActiveExportPresetSlot as normalizeActiveExportPresetSlot2,
  normalizeExportPreset as normalizeExportPreset2,
  normalizeExportPresetSlots as normalizeExportPresetSlots2,
} from '../../../export/export-presets'
import { finite as finite2, normalizeLabelText as normalizeLabelText2 } from '../../../loaders/studio-normalization'
import type { ExportDialogOptions, ApplyExportOptions } from '../../types/studio-app-types'

export function openExportDialog(runtime: StudioAppRuntime, exportDialogOptions: ExportDialogOptions = {}) {
  const cs3 = runtime.captureCameraView()
  if (!cs3 || !runtime.appCtx.pendingRuntimeSettings) return
  const exportAspect =
      runtime.stateViewportAspectGetCanvasSize().width / runtime.stateViewportAspectGetCanvasSize().height,
    ut3 = runtime.cameraSettings()
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
        up: cs3.view === 'top' ? runtime.buildCameraUpVector(cs3.topRotation) : new ns2.Vector3(0, 1, 0),
        zoom: 1,
        visibleHeight: cs3.visibleHeight,
        frameSize: runtime.resolveFrameSize(cs3, exportAspect),
        viewportAspect: exportAspect,
        fov: cs3.fov,
        near: 0.02,
        far: Math.max(
          new ns2.Vector3(cs3.position.x, cs3.position.y, cs3.position.z).distanceTo(
            new ns2.Vector3(cs3.target.x, cs3.target.y, cs3.target.z),
          ) * (cs3.mode === 'perspective' ? 8 : 5),
          100,
        ),
      },
      exportAspect,
    ),
    runtime.syncCameraModeControls(cs3.mode),
    runtime.syncCameraViewControls(cs3.view),
    !exportDialogOptions.silent)
  ) {
    const exportViewLabel = runtime.getPreviewFloorMode() === 'all' ? '总览视角' : '当前层视角'
    ;(runtime.exportStatusElement.textContent = '已恢复上次保存的' + exportViewLabel),
      runtime.showToast('已恢复上次保存的' + exportViewLabel + '。')
  }
}

export function renderExportPresetSlots(runtime: StudioAppRuntime) {
  const normalizedExportPresets = normalizeExportPresetSlots2(runtime.appCtx.studioProject?.exportPresets),
    normalizedActiveSlot = normalizeActiveExportPresetSlot2(
      runtime.appCtx.studioProject?.activeExportPresetSlot,
      normalizedExportPresets.length,
    )
  ;(runtime.appCtx.studioProject.exportPresets = normalizedExportPresets),
    (runtime.appCtx.studioProject.activeExportPresetSlot = normalizedActiveSlot)
  const floorNameById = new Map(
    (runtime.appCtx.studioProject?.floors || []).map((presetFloor: any) => [presetFloor.id, presetFloor.name]),
  )
  runtime.exportPresetSlotsElement.replaceChildren(
    ...normalizedExportPresets.map((exportPreset, presetSlotIndex) => {
      const presetSlotButton = document.createElement('button')
      ;(presetSlotButton.type = 'button'),
        (presetSlotButton.dataset.exportPresetSlot = String(presetSlotIndex)),
        presetSlotButton.setAttribute('role', 'tab')
      const presetSlotNameLabel = document.createElement('strong'),
        presetSlotStateLabel = document.createElement('small')
      ;(presetSlotNameLabel.textContent = (exportPreset?.name ||
        floorNameById.get(exportPreset?.floorId) ||
        '未命名存档') as string),
        (presetSlotStateLabel.textContent = exportPreset ? '已设置' : '未设置')
      const isActivePresetSlot = presetSlotIndex === normalizedActiveSlot
      return (
        presetSlotButton.classList.toggle('active', isActivePresetSlot),
        presetSlotButton.classList.toggle('has-value', !!exportPreset),
        presetSlotButton.setAttribute('aria-selected', String(isActivePresetSlot)),
        (presetSlotButton.title = exportPreset
          ? presetSlotNameLabel.textContent + '：已设置'
          : presetSlotNameLabel.textContent + '：未设置'),
        presetSlotButton.append(presetSlotNameLabel, presetSlotStateLabel),
        presetSlotButton
      )
    }),
  )
  const activePreset = normalizedExportPresets[normalizedActiveSlot]
  ;(runtime.exportPresetAddButton.disabled = normalizedExportPresets.length >= MAX_EXPORT_PRESET_COUNT2),
    (runtime.exportPresetRenameButton.disabled = !activePreset),
    (runtime.exportPresetDeleteButton.disabled = normalizedExportPresets.length <= 1)
  const isPresetEmpty = exportPresetIsEmpty2(activePreset, runtime.appCtx.isExportPresetDirty)
  ;(runtime.exportPresetEmptyStateElement.hidden = !isPresetEmpty),
    (runtime.exportPresetEmptyTitleElement.textContent = activePreset
      ? runtime.formatPresetLabel(activePreset, normalizedActiveSlot) + '已设置'
      : '当前存档尚未设置')
}

export function buildExportPreset(runtime: StudioAppRuntime, { name: presetName = '' } = {}) {
  if (runtime.appCtx.threeCamera.isPerspectiveCamera) {
    const cameraFocalLengthInput = runtime.selectElement('#camera-focal-length'),
      inputFocalLength = clamp2(finite2(cameraFocalLengthInput?.value, runtime.getCameraFocalLength()), 18, 120)
    runtime.cameraSettings().cameraFocalLength = inputFocalLength
    for (const focalLengthControl of runtime.cameraFocalLengthControls)
      focalLengthControl.value = String(Math.round(inputFocalLength))
    runtime.applyCameraFocalLength(runtime.appCtx.threeCamera, inputFocalLength)
  }
  const { width: wn8, height: wn9 } = runtime.stateViewportAspectGetCanvasSize(),
    exportCameraTarget = runtime.appCtx.orbitControls.target
  return normalizeExportPreset2({
    name: presetName,
    width: wn8,
    height: wn9,
    lockRatio: runtime.exportLockRatioInput.checked,
    floorMode: runtime.getPreviewFloorMode() === 'all' ? 'all' : 'floor',
    floorId: runtime.getActiveFloor()?.id || runtime.appCtx.activeFloorId,
    floorGap: finite2(runtime.appCtx.studioProject.exportFloorGap, 3),
    camera: {
      mode: runtime.appCtx.threeCamera.isPerspectiveCamera ? 'perspective' : 'orthographic',
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
  })
}

export function importCameraPreset(runtime: StudioAppRuntime, cameraPresetSpec: any) {
  const presetAspect =
      runtime.stateViewportAspectGetCanvasSize().width / runtime.stateViewportAspectGetCanvasSize().height,
    ut4 = runtime.cameraSettings()
  ;(ut4.cameraMode = cameraPresetSpec.mode),
    (ut4.cameraView = cameraPresetSpec.view),
    (ut4.cameraTopRotation = cameraPresetSpec.topRotation),
    cameraPresetSpec.focalLength !== null && (ut4.cameraFocalLength = cameraPresetSpec.focalLength)
  const presetPosition = new ns2.Vector3(
      cameraPresetSpec.position.x,
      cameraPresetSpec.position.y,
      cameraPresetSpec.position.z,
    ),
    presetTarget = new ns2.Vector3(cameraPresetSpec.target.x, cameraPresetSpec.target.y, cameraPresetSpec.target.z)
  runtime.applyCameraState(
    {
      mode: cameraPresetSpec.mode,
      cameraView: cameraPresetSpec.view,
      topRotation: cameraPresetSpec.topRotation,
      position: presetPosition,
      target: presetTarget,
      up:
        cameraPresetSpec.view === 'top'
          ? runtime.buildCameraUpVector(cameraPresetSpec.topRotation)
          : new ns2.Vector3(0, 1, 0),
      zoom: 1,
      visibleHeight: cameraPresetSpec.visibleHeight,
      frameSize: runtime.resolveFrameSize(cameraPresetSpec, presetAspect),
      viewportAspect: presetAspect,
      fov: cameraPresetSpec.fov,
      near: 0.02,
      far: Math.max(presetPosition.distanceTo(presetTarget) * (cameraPresetSpec.mode === 'perspective' ? 8 : 5), 100),
    },
    presetAspect,
  ),
    runtime.syncCameraModeControls(cameraPresetSpec.mode),
    runtime.syncCameraViewControls(cameraPresetSpec.view)
}

export function applyExportPreset(
  runtime: StudioAppRuntime,
  presetSlotIndexToApply: any,
  applyOptions: ApplyExportOptions = {},
) {
  const appliedPreset = normalizeExportPreset2(runtime.appCtx.studioProject?.exportPresets?.[presetSlotIndexToApply])
  if (!appliedPreset || !runtime.appCtx.pendingRuntimeSettings) return false
  ;(runtime.exportWidthInput.value = String(appliedPreset.width)),
    (runtime.exportHeightInput.value = String(appliedPreset.height)),
    (runtime.exportLockRatioInput.checked = appliedPreset.lockRatio),
    (runtime.appCtx.exportAspectRatio = appliedPreset.width / appliedPreset.height),
    (runtime.appCtx.studioProject.exportFloorGap = appliedPreset.floorGap)
  const presetFloorEntry = runtime.appCtx.studioProject.floors.find(
      (applyOptionsMatchedFloor: any) => applyOptionsMatchedFloor.id === appliedPreset.floorId,
    ),
    presetFloorId =
      appliedPreset.floorMode === 'all' && runtime.appCtx.studioProject.floors.length > 1
        ? 'all'
        : presetFloorEntry?.id || runtime.getActiveFloor()?.id || runtime.appCtx.activeFloorId
  runtime.selectPreviewFloor(presetFloorId),
    (runtime.exportFloorGapInput.value = appliedPreset.floorGap.toFixed(1)),
    (runtime.exportFolderNameInput.value = appliedPreset.folderName)
  const selectedExportFileSet = new Set(appliedPreset.selectedFiles),
    hasTelevisionFile = selectedExportFileSet.has('televisionOn'),
    hasVehicleFile = selectedExportFileSet.has('vehicleCharging')
  for (const exportFileInput of runtime.exportDialogElement.querySelectorAll('input[data-export-file]')) {
    const exportFile = exportFileInput.dataset.exportFile
    exportFileInput.checked =
      selectedExportFileSet.has(exportFile) ||
      (hasTelevisionFile && exportFile.startsWith('screen:')) ||
      (hasVehicleFile && exportFile.startsWith('vehicle:'))
  }
  return (
    runtime.importCameraPreset(appliedPreset.camera),
    runtime.refreshCanvasSizeUi(),
    runtime.refreshFloorControls(),
    applyOptions.silent ||
      ((runtime.exportStatusElement.textContent =
        '已切换到档位 ' + String(presetSlotIndexToApply + 1).padStart(2, '0')),
      runtime.showToast('已应用导出档位 ' + String(presetSlotIndexToApply + 1).padStart(2, '0') + '。', 'success')),
    runtime.syncCanvasSizeInputs(),
    true
  )
}

export function selectExportPresetSlot(runtime: StudioAppRuntime, slotIndex: any) {
  const exportPresetCount = runtime.appCtx.studioProject?.exportPresets?.length || 0
  if (
    !Number.isInteger(slotIndex) ||
    slotIndex < 0 ||
    slotIndex >= exportPresetCount ||
    runtime.appCtx.isInteractionLocked
  )
    return
  runtime.saveExportPreset(), (runtime.appCtx.studioProject.activeExportPresetSlot = slotIndex)
  const du2 = runtime.applyExportPreset(slotIndex)
  ;(runtime.appCtx.isExportPresetDirty = false),
    runtime.renderExportPresetSlots(),
    runtime.markDocumentDirty(),
    du2 || (runtime.exportStatusElement.textContent = '存档 ' + String(slotIndex + 1).padStart(2, '0') + ' 没有设置')
}

export function saveExportPreset(runtime: StudioAppRuntime) {
  if (
    (window.clearTimeout(runtime.appCtx.exportPreviewTimeoutId),
    (runtime.appCtx.exportPreviewTimeoutId = null),
    !runtime.appCtx.isExportPresetDirty)
  )
    return false
  const targetPresetSlot = normalizeActiveExportPresetSlot2(
    runtime.appCtx.studioProject?.activeExportPresetSlot,
    runtime.appCtx.studioProject?.exportPresets?.length,
  )
  if (!runtime.appCtx.pendingRuntimeSettings || runtime.appCtx.isInteractionLocked) return false
  runtime.appCtx.studioProject.exportPresets = normalizeExportPresetSlots2(runtime.appCtx.studioProject.exportPresets)
  const currentPresetName = runtime.appCtx.studioProject.exportPresets[targetPresetSlot]?.name || ''
  return (
    (runtime.appCtx.studioProject.exportPresets[targetPresetSlot] = runtime.buildExportPreset({
      name: currentPresetName,
    })),
    (runtime.appCtx.isExportPresetDirty = false),
    runtime.renderExportPresetSlots(),
    runtime.markDocumentDirty(),
    true
  )
}

export function syncExportControls(runtime: StudioAppRuntime) {
  !runtime.appCtx.pendingRuntimeSettings ||
    runtime.appCtx.isInteractionLocked ||
    ((runtime.appCtx.isExportPresetDirty = true),
    runtime.renderExportPresetSlots(),
    window.clearTimeout(runtime.appCtx.exportPreviewTimeoutId),
    (runtime.appCtx.exportPreviewTimeoutId = window.setTimeout(runtime.saveExportPreset, 360)))
}

export function formatPresetLabel(runtime: StudioAppRuntime, labelPreset: any, labelSlotIndex: any) {
  if (!labelPreset) return '存档 ' + String(labelSlotIndex + 1).padStart(2, '0')
  const presetFloorName = (runtime.appCtx.studioProject?.floors || []).find(
    (labelFloor: any) => labelFloor.id === labelPreset.floorId,
  )?.name
  return labelPreset.name || presetFloorName || '存档 ' + String(labelSlotIndex + 1).padStart(2, '0')
}

export function makeUniquePresetName(runtime: StudioAppRuntime, basePresetName: any, ignoredSlotIndex = -1) {
  const normalizedPresetName = normalizeLabelText2(basePresetName, '导出视角', 24),
    presetNameSet = new Set(
      (runtime.appCtx.studioProject?.exportPresets || [])
        .map((nameSlotPreset: any, nameSlotIndex: any) =>
          nameSlotIndex === ignoredSlotIndex ? '' : runtime.formatPresetLabel(nameSlotPreset, nameSlotIndex),
        )
        .filter(Boolean),
    )
  if (!presetNameSet.has(normalizedPresetName)) return normalizedPresetName
  let ignoredSlotIndexDuplicateNameSuffix = 2
  for (; presetNameSet.has(normalizedPresetName + ' ' + ignoredSlotIndexDuplicateNameSuffix); )
    ignoredSlotIndexDuplicateNameSuffix += 1
  return (normalizedPresetName + ' ' + ignoredSlotIndexDuplicateNameSuffix).slice(0, 24)
}
