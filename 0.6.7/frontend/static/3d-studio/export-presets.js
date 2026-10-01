export const DEFAULT_EXPORT_PRESET_COUNT = 4,
  MAX_EXPORT_PRESET_COUNT = 8;
const a = new Set([
  "background",
  "backgroundWithPlan",
  "televisionOn",
  "vehicleCharging",
  "floorPlan",
  "dataLights",
  "dataScene",
]);
function o(arg1, arg2 = 0) {
  const value1 = Number(arg1);
  return Number.isFinite(value1) ? value1 : arg2;
}
function i(arg3, arg4, arg5) {
  return Math.max(arg4, Math.min(arg5, arg3));
}
function c(arg6, arg7 = {}) {
  return {
    x: o(arg6?.x, arg7.x),
    y: o(arg6?.y, arg7.y),
    z: o(arg6?.z, arg7.z),
  };
}
function m(arg8) {
  return Array.isArray(arg8)
    ? [
        ...new Set(
          arg8
            .map((arg9) => String(arg9 || ""))
            .filter(
              (arg10) =>
                a.has(arg10) || /^(?:group|screen|vehicle):[A-Za-z0-9_.:-]{1,180}$/.test(arg10),
            ),
        ),
      ].slice(0, 128)
    : [];
}
function f(arg11) {
  const value2 = arg11?.mode === "perspective" ? "perspective" : "orthographic",
    value3 = arg11?.view === "top" ? "top" : "free",
    object1 = {
      mode: value2,
      view: value3,
      topRotation: (((Math.round(o(arg11?.topRotation, 0) / 90) * 90) % 360) + 360) % 360,
      position: c(arg11?.position, {
        x: 7,
        y: 7,
        z: 7,
      }),
      target: c(arg11?.target, {
        x: 0,
        y: 0.6,
        z: 0,
      }),
      visibleHeight: i(o(arg11?.visibleHeight, 10), 0.1, 1000),
      fov: i(o(arg11?.fov, 36), 5, 120),
      focalLength: value2 === "perspective" ? i(o(arg11?.focalLength, 50), 18, 120) : null,
    };
  return (
    Number.isFinite(Number(arg11?.frameSize)) &&
      Number(arg11.frameSize) > 0 &&
      (object1.frameSize = i(o(arg11.frameSize, 10), 0.1, 1000)),
    object1
  );
}
export function normalizeExportPreset(arg12) {
  if (!arg12 || typeof arg12 != "object") return null;
  const value4 = Math.round(i(o(arg12.width, 1852), 320, 4096)),
    value5 = Math.round(i(o(arg12.height, 1293), 320, 4096));
  return {
    version: 1,
    name: String(arg12.name || "")
      .trim()
      .slice(0, 24),
    width: value4,
    height: value5,
    lockRatio: arg12.lockRatio !== false,
    floorMode: arg12.floorMode === "all" ? "all" : "floor",
    floorId: String(arg12.floorId || "").slice(0, 180),
    floorGap: i(o(arg12.floorGap, 3), 0, 20),
    camera: f(arg12.camera),
    folderName: String(arg12.folderName || "").slice(0, 60),
    selectedFiles: m(arg12.selectedFiles),
  };
}
export function normalizeExportPresetSlots(arg13) {
  const value6 = Array.isArray(arg13) ? arg13 : [],
    value7 = Array.isArray(arg13) ? Math.max(1, Math.min(8, value6.length || 1)) : 4;
  return Array.from(
    {
      length: value7,
    },
    (arg14, arg15) => normalizeExportPreset(value6[arg15]),
  );
}
export function normalizeActiveExportPresetSlot(arg16, arg17 = 4) {
  const value8 = Number(arg16),
    value9 = Math.max(1, Math.min(8, Number(arg17) || 4));
  return Number.isInteger(value8) && value8 >= 0 && value8 < value9 ? value8 : 0;
}
export function exportPresetIsEmpty(arg18, arg19 = false) {
  return !normalizeExportPreset(arg18) && !arg19;
}
export function exportPresetSummary(arg20, arg21 = new Map()) {
  const value10 = normalizeExportPreset(arg20);
  if (!value10) return "未设置";
  const value11 =
      value10.floorMode === "all" ? "全楼合并" : arg21.get(value10.floorId) || "楼层已变更",
    value12 = value10.camera.mode === "perspective" ? "透视" : "正交";
  return value10.width + "×" + value10.height + " · " + value11 + " · " + value12;
}
