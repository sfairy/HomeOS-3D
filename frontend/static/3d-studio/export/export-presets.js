/**
 * 导出预设的归一化与摘要文案：把后端读回、可能缺字段或被手改过的预设清洗后再用。
 *
 * 位置：3D 工作室「导出」面板的预设槽（每个槽保存分辨率、楼层范围、相机姿态、附加文件等）。
 * 约定：预设内部版本固定写 1；尺寸单位为像素，楼层间距单位为米；字段名与前端 JSON 的 camelCase 对齐。
 * 纯函数，不做持久化。
 */
import { clampNumber, coercedFiniteNumberOr } from "../../utils/numbers.js?v=2609260929";

// 最多 8 个预设槽；上限与导出面板的按钮禁用条件绑定。
export const MAX_EXPORT_PRESET_COUNT = 8;

// 允许出现在导出列表里的固定文件键：渲染图与平面图两类基础产物。
// 除这些之外只接受带前缀引用（group / screen / vehicle），见下面的正则。
const VALID_SELECTED_FILE_KEYS = new Set([
  "background",
  "backgroundWithPlan",
  "televisionOn",
  "vehicleCharging",
  "floorPlan",
  "dataLights",
  "dataScene"
]);

/**
 * 归一化一个三维向量（相机位置 / 注视点）。
 */
function normalizeVector3(source, defaults = {}) {
  return {
    x: coercedFiniteNumberOr(source?.x, defaults.x),
    y: coercedFiniteNumberOr(source?.y, defaults.y),
    z: coercedFiniteNumberOr(source?.z, defaults.z)
  };
}

/**
 * 归一化「随导出一并输出的文件」清单：未知键被过滤掉，避免旧版本残留的文件名让导出流程找不到素材；
 * 前缀引用允许 1~180 个字符，长度上限与后端文档字段长度限制一致。
 */
function normalizeSelectedFiles(files) {
  if (Array.isArray(files)) {
    // 先去重（用 Set）再截断，避免重复项占满 128 的额度。
    return [
      ...new Set(
        files
          .map(entry => String(entry || ""))
          .filter(
            fileKey =>
              VALID_SELECTED_FILE_KEYS.has(fileKey) ||
              /^(?:group|screen|vehicle):[A-Za-z0-9_.:-]{1,180}$/.test(fileKey)
          )
      )
    ].slice(0, 128);
  } else {
    return [];
  }
}

/**
 * 归一化预设里的相机设置。
 */
function normalizePresetCamera(camera) {
  // 只认这两个字面量，其余一律回落到默认值，防止非法枚举流到取景逻辑里。
  const cameraMode = camera?.mode === "perspective" ? "perspective" : "orthographic";
  const cameraView = camera?.view === "top" ? "top" : "free";
  return {
    mode: cameraMode,
    view: cameraView,
    // 顶视图旋转吸附到 90° 的整数倍并归一到 [0, 360)，保证预设间可稳定比较。
    topRotation:
      (((Math.round(coercedFiniteNumberOr(camera?.topRotation, 0) / 90) * 90) % 360) + 360) % 360,
    position: normalizeVector3(camera?.position, {
      x: 7,
      y: 7,
      z: 7
    }),
    target: normalizeVector3(camera?.target, {
      x: 0,
      y: 0.6,
      z: 0
    }),
    // 视口高度 0.1~1000 米；相机距离较远时可到数百米，下限留出近景剖面视图。
    visibleHeight: clampNumber(coercedFiniteNumberOr(camera?.visibleHeight, 10), 0.1, 1000),
    // 视场角 5°~120°，超出这个范围会产生透视畸变或近似正交。
    fov: clampNumber(coercedFiniteNumberOr(camera?.fov, 36), 5, 120),
    focalLength:
      cameraMode === "perspective"
        ? clampNumber(coercedFiniteNumberOr(camera?.focalLength, 50), 18, 120)
        : null
  };
}

/**
 * 归一化单个导出预设。
 */
export function normalizeExportPreset(rawPreset) {
  if (!rawPreset || typeof rawPreset != "object") {
    return null;
  }
  // 默认 1852×1293 对应 2 倍 DPI 的常见大屏比例；宽高都限制在 320~4096 像素。
  const normalizedWidth = Math.round(clampNumber(coercedFiniteNumberOr(rawPreset.width, 1852), 320, 4096));
  const normalizedHeight = Math.round(
    clampNumber(coercedFiniteNumberOr(rawPreset.height, 1293), 320, 4096)
  );
  return {
    version: 1,
    // 名称与文件夹名都做长度截断，避免导出路径过长或换行符混入文件名。
    name: String(rawPreset.name || "")
      .trim()
      .slice(0, 24),
    width: normalizedWidth,
    height: normalizedHeight,
    // 锁定比例默认开启，只有显式传 false 才关闭。
    lockRatio: rawPreset.lockRatio !== false,
    // floorMode 只有 all（全楼合并）与 floor（单层）两种取值。
    floorMode: rawPreset.floorMode === "all" ? "all" : "floor",
    floorId: String(rawPreset.floorId || "").slice(0, 180),
    // 楼层间距 0~20 米，决定全楼导出时刻意拉开的层间空隙。
    floorGap: clampNumber(coercedFiniteNumberOr(rawPreset.floorGap, 3), 0, 20),
    camera: normalizePresetCamera(rawPreset.camera),
    folderName: String(rawPreset.folderName || "").slice(0, 60),
    selectedFiles: normalizeSelectedFiles(rawPreset.selectedFiles)
  };
}

/**
 * 归一化整个预设槽数组。
 * 槽位数量夹在 1~8 之间（常量值与此处字面量一致）；非数组时按默认 4 个空槽处理，保证 UI 至少有槽位可用。
 * 槽位内容允许为 null，表示尚未配置。
 */
export function normalizeExportPresetSlots(slots) {
  const slotList = Array.isArray(slots) ? slots : [];
  const slotCount = Array.isArray(slots) ? Math.max(1, Math.min(8, slotList.length || 1)) : 4;
  return Array.from(
    {
      length: slotCount
    },
    (slotEntry, slotIndex) => normalizeExportPreset(slotList[slotIndex])
  );
}

/**
 * 归一化当前选中的预设槽下标。
 *
 * 越界或非整数一律回到 0，避免上层用非法下标去索引槽位数组。
 */
export function normalizeActiveExportPresetSlot(activeSlotIndex, requestedSlotCount = 4) {
  const slotNumber = Number(activeSlotIndex);
  const maxSlotNumber = Math.max(1, Math.min(8, Number(requestedSlotCount) || 4));
  if (Number.isInteger(slotNumber) && slotNumber >= 0 && slotNumber < maxSlotNumber) {
    return slotNumber;
  } else {
    return 0;
  }
}

/**
 * 判断导出预设是否为空。
 */
export function exportPresetIsEmpty(preset, presetFeatureEnabled = false) {
  return !normalizeExportPreset(preset) && !presetFeatureEnabled;
}

/**
 * 生成槽位摘要：「1852×1293 · 一层 · 透视」。
 * 让用户不切换槽位也能判断它是干什么的：档位名是用户自起的，随意时只有分辨率 / 楼层 / 投影方式能说明内容。
 * 楼层名走传入的 id → 名称映射，查不到时显式说「楼层已变更」而不是留空；未配置的槽位返回「未设置」。
 */
export function exportPresetSummary(preset, floorNamesById = new Map()) {
  const normalizedPreset = normalizeExportPreset(preset);
  if (!normalizedPreset) {
    return "未设置";
  }
  const presetFloorLabel =
    normalizedPreset.floorMode === "all"
      ? "全楼合并"
      : floorNamesById.get(normalizedPreset.floorId) || "楼层已变更";
  const presetCameraLabel = normalizedPreset.camera.mode === "perspective" ? "透视" : "正交";
  return (
    normalizedPreset.width +
    "×" +
    normalizedPreset.height +
    " · " +
    presetFloorLabel +
    " · " +
    presetCameraLabel
  );
}
