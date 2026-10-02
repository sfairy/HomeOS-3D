export const DEFAULT_EXPORT_PRESET_COUNT = 4,
  MAX_EXPORT_PRESET_COUNT = 8;
const allowedFileKindSet = new Set([
  "background",
  "backgroundWithPlan",
  "televisionOn",
  "vehicleCharging",
  "floorPlan",
  "dataLights",
  "dataScene",
]);
type PointCoordinates = {
  x: number;
  y: number;
  z: number;
};
function toFiniteNumber(candidateNumber, fallbackNumber = 0) {
  const numericValue = Number(candidateNumber);
  return Number.isFinite(numericValue) ? numericValue : fallbackNumber;
}
function clamp(inputNumber, minValue, maxValue) {
  return Math.max(minValue, Math.min(maxValue, inputNumber));
}
// defaultPoint 允许只给部分轴：缺省轴按 0 兜底（调用方有时只想覆盖 y）。
function resolvePoint(sourcePoint, defaultPoint: Partial<PointCoordinates> = {}) {
  return {
    x: toFiniteNumber(sourcePoint?.x, defaultPoint.x ?? 0),
    y: toFiniteNumber(sourcePoint?.y, defaultPoint.y ?? 0),
    z: toFiniteNumber(sourcePoint?.z, defaultPoint.z ?? 0),
  };
}
function normalizeSelectedFiles(sourceFiles) {
  return Array.isArray(sourceFiles)
    ? [
        ...new Set(
          sourceFiles
            .map((fileCandidate) => String(fileCandidate || ""))
            .filter(
              (fileToken) =>
                allowedFileKindSet.has(fileToken) ||
                /^(?:group|screen|vehicle):[A-Za-z0-9_.:-]{1,180}$/.test(fileToken),
            ),
        ),
      ].slice(0, 128)
    : [];
}
// frameSize 是可选字段：只有调用方显式给了正数才写进 preset，否则整个键都不存在
// （下游用 Number.isFinite 判断有没有，序列化后的 preset 也因此保持稳定）。
function normalizeCameraConfig(sourceCamera) {
  const cameraMode = sourceCamera?.mode === "perspective" ? "perspective" : "orthographic",
    cameraView = sourceCamera?.view === "top" ? "top" : "free",
    cameraConfig: {
      mode: string;
      view: string;
      topRotation: number;
      position: PointCoordinates;
      target: PointCoordinates;
      visibleHeight: number;
      fov: number;
      focalLength: number | null;
      frameSize?: number;
    } = {
      mode: cameraMode,
      view: cameraView,
      topRotation:
        (((Math.round(toFiniteNumber(sourceCamera?.topRotation, 0) / 90) * 90) % 360) + 360) % 360,
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
      visibleHeight: clamp(toFiniteNumber(sourceCamera?.visibleHeight, 10), 0.1, 1000),
      fov: clamp(toFiniteNumber(sourceCamera?.fov, 36), 5, 120),
      focalLength:
        cameraMode === "perspective"
          ? clamp(toFiniteNumber(sourceCamera?.focalLength, 50), 18, 120)
          : null,
    };
  return (
    Number.isFinite(Number(sourceCamera?.frameSize)) &&
      Number(sourceCamera.frameSize) > 0 &&
      (cameraConfig.frameSize = clamp(toFiniteNumber(sourceCamera.frameSize, 10), 0.1, 1000)),
    cameraConfig
  );
}
export function normalizeExportPreset(sourcePreset) {
  if (!sourcePreset || typeof sourcePreset != "object") return null;
  const widthPx = Math.round(clamp(toFiniteNumber(sourcePreset.width, 1852), 320, 4096)),
    heightPx = Math.round(clamp(toFiniteNumber(sourcePreset.height, 1293), 320, 4096));
  return {
    version: 1,
    name: String(sourcePreset.name || "")
      .trim()
      .slice(0, 24),
    width: widthPx,
    height: heightPx,
    lockRatio: sourcePreset.lockRatio !== false,
    floorMode: sourcePreset.floorMode === "all" ? "all" : "floor",
    floorId: String(sourcePreset.floorId || "").slice(0, 180),
    floorGap: clamp(toFiniteNumber(sourcePreset.floorGap, 3), 0, 20),
    camera: normalizeCameraConfig(sourcePreset.camera),
    folderName: String(sourcePreset.folderName || "").slice(0, 60),
    selectedFiles: normalizeSelectedFiles(sourcePreset.selectedFiles),
  };
}
export function normalizeExportPresetSlots(sourceSlots) {
  const slotCandidates = Array.isArray(sourceSlots) ? sourceSlots : [],
    slotCount = Array.isArray(sourceSlots)
      ? Math.max(1, Math.min(8, slotCandidates.length || 1))
      : 4;
  return Array.from(
    {
      length: slotCount,
    },
    (_slotEntry, slotIndex) => normalizeExportPreset(slotCandidates[slotIndex]),
  );
}
export function normalizeActiveExportPresetSlot(activeSlotInput, totalSlotCount = 4) {
  const activeSlotIndex = Number(activeSlotInput),
    boundedSlotCount = Math.max(1, Math.min(8, Number(totalSlotCount) || 4));
  return Number.isInteger(activeSlotIndex) &&
    activeSlotIndex >= 0 &&
    activeSlotIndex < boundedSlotCount
    ? activeSlotIndex
    : 0;
}
export function exportPresetIsEmpty(candidatePreset, hasPendingValue = false) {
  return !normalizeExportPreset(candidatePreset) && !hasPendingValue;
}
export function exportPresetSummary(presetCandidate, floorNameByFloorId = new Map()) {
  const normalizedPreset = normalizeExportPreset(presetCandidate);
  if (!normalizedPreset) return "未设置";
  const floorLabel =
      normalizedPreset.floorMode === "all"
        ? "全楼合并"
        : floorNameByFloorId.get(normalizedPreset.floorId) || "楼层已变更",
    cameraModeLabel = normalizedPreset.camera.mode === "perspective" ? "透视" : "正交";
  return (
    normalizedPreset.width +
    "×" +
    normalizedPreset.height +
    " · " +
    floorLabel +
    " · " +
    cameraModeLabel
  );
}
