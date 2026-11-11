import { clampNumber, finiteNumberOrCoerced } from '../../shared/util/number'

//: 新建户型时的存档数量：4 个刚好铺满一行，再多用户就得横向滚动。
const DEFAULT_EXPORT_PRESET_COUNT = 4
export const MAX_EXPORT_PRESET_COUNT = 8
const allowedFileKindSet = new Set([
  'background',
  'backgroundWithPlan',
  'televisionOn',
  'vehicleCharging',
  'floorPlan',
  'dataLights',
  'dataScene',
])
type PointCoordinates = {
  x: number
  y: number
  z: number
}
function toFiniteNumber(candidateNumber: any, fallbackNumber = 0) {
  return finiteNumberOrCoerced(candidateNumber, fallbackNumber)
}

function resolvePoint(sourcePoint: any, defaultPoint: Partial<PointCoordinates> = {}) {
  return {
    x: toFiniteNumber(sourcePoint?.x, defaultPoint.x ?? 0),
    y: toFiniteNumber(sourcePoint?.y, defaultPoint.y ?? 0),
    z: toFiniteNumber(sourcePoint?.z, defaultPoint.z ?? 0),
  }
}
function normalizeSelectedFiles(sourceFiles: any) {
  return Array.isArray(sourceFiles)
    ? [
        ...new Set(
          sourceFiles
            .map((fileCandidate) => String(fileCandidate || ''))
            .filter(
              (fileToken) =>
                allowedFileKindSet.has(fileToken) ||
                /^(?:group|screen|vehicle):[A-Za-z0-9_.:-]{1,180}$/.test(fileToken),
            ),
        ),
      ].slice(0, 128)
    : []
}

function normalizeCameraConfig(sourceCamera: any) {
  const cameraMode = sourceCamera?.mode === 'perspective' ? 'perspective' : 'orthographic',
    cameraView = sourceCamera?.view === 'top' ? 'top' : 'free',
    cameraConfig: {
      mode: string
      view: string
      topRotation: number
      position: PointCoordinates
      target: PointCoordinates
      visibleHeight: number
      fov: number
      focalLength: number | null
      frameSize?: number
    } = {
      mode: cameraMode,
      view: cameraView,
      topRotation: (((Math.round(toFiniteNumber(sourceCamera?.topRotation, 0) / 90) * 90) % 360) + 360) % 360,
      position: resolvePoint(sourceCamera?.position, {
        x: 7,
        y: 7,
        z: 7,
      }),
      target: resolvePoint(sourceCamera?.target, {
        x: 0,
        y: 0.6,
        z: 0,
      }),
      visibleHeight: clampNumber(toFiniteNumber(sourceCamera?.visibleHeight, 10), 0.1, 1000),
      fov: clampNumber(toFiniteNumber(sourceCamera?.fov, 36), 5, 120),
      focalLength:
        cameraMode === 'perspective' ? clampNumber(toFiniteNumber(sourceCamera?.focalLength, 50), 18, 120) : null,
    }
  return (
    Number.isFinite(Number(sourceCamera?.frameSize)) &&
      Number(sourceCamera.frameSize) > 0 &&
      (cameraConfig.frameSize = clampNumber(toFiniteNumber(sourceCamera.frameSize, 10), 0.1, 1000)),
    cameraConfig
  )
}
export function normalizeExportPreset(sourcePreset: any) {
  if (!sourcePreset || typeof sourcePreset != 'object') return null
  const widthPx = Math.round(clampNumber(toFiniteNumber(sourcePreset.width, 1852), 320, 4096)),
    heightPx = Math.round(clampNumber(toFiniteNumber(sourcePreset.height, 1293), 320, 4096))
  return {
    version: 1,
    name: String(sourcePreset.name || '')
      .trim()
      .slice(0, 24),
    width: widthPx,
    height: heightPx,
    lockRatio: sourcePreset.lockRatio !== false,
    floorMode: sourcePreset.floorMode === 'all' ? 'all' : 'floor',
    floorId: String(sourcePreset.floorId || '').slice(0, 180),
    floorGap: clampNumber(toFiniteNumber(sourcePreset.floorGap, 3), 0, 20),
    camera: normalizeCameraConfig(sourcePreset.camera),
    folderName: String(sourcePreset.folderName || '').slice(0, 60),
    selectedFiles: normalizeSelectedFiles(sourcePreset.selectedFiles),
  }
}
export function normalizeExportPresetSlots(sourceSlots: any) {
  const slotCandidates = Array.isArray(sourceSlots) ? sourceSlots : [],
    slotCount = Array.isArray(sourceSlots)
      ? Math.max(1, Math.min(MAX_EXPORT_PRESET_COUNT, slotCandidates.length || 1))
      : DEFAULT_EXPORT_PRESET_COUNT
  return Array.from(
    {
      length: slotCount,
    },
    (_slotEntry, slotIndex) => normalizeExportPreset(slotCandidates[slotIndex]),
  )
}
export function normalizeActiveExportPresetSlot(
  activeSlotInput: unknown,
  totalSlotCount = DEFAULT_EXPORT_PRESET_COUNT,
) {
  const activeSlotIndex = Number(activeSlotInput),
    boundedSlotCount = Math.max(
      1,
      Math.min(MAX_EXPORT_PRESET_COUNT, Number(totalSlotCount) || DEFAULT_EXPORT_PRESET_COUNT),
    )
  return Number.isInteger(activeSlotIndex) && activeSlotIndex >= 0 && activeSlotIndex < boundedSlotCount
    ? activeSlotIndex
    : 0
}
export function exportPresetIsEmpty(candidatePreset: any, hasPendingValue = false) {
  return !normalizeExportPreset(candidatePreset) && !hasPendingValue
}
