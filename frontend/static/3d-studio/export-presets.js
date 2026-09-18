/**
 * 导出预设的归一化与摘要文案。
 *
 * 位置：3D 工作室「导出」面板的预设槽（每个槽保存一组导出参数：分辨率、楼层范围、
 *   相机姿态、要一起导出的附加文件等）。文档从后端读回来的预设可能缺字段或被手改过，
 *   统一经本模块清洗后再使用。
 * 对外：预设数量常量、normalizeExportPreset（单个预设）、normalizeExportPresetSlots（槽位数组）、
 *   normalizeActiveExportPresetSlot（当前槽下标）、exportPresetIsEmpty 与 exportPresetSummary。
 * 约定：预设内部版本固定写 1；尺寸单位为像素，楼层间距单位为米；
 *   字段名与前端 JSON 的 camelCase 对齐。本模块纯函数、不做持久化。
 *   夹取用 utils/numbers.js 的 clampNumber（唯一实现，P10 B 类收敛）。
 */
import { clampNumber } from "../utils/numbers.js?v=20260918233037";

// 默认 4 个预设槽、最多 8 个；上限与导出面板的按钮禁用条件绑定。
export const DEFAULT_EXPORT_PRESET_COUNT = 4;
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
 * 转成有限数字，失败时返回兜底值。
 *
 * @param {*} value 原始值。
 * @param {number} [fallback] 兜底值，默认 0。
 * @returns {number} 有限数或兜底值。
 */
function toFiniteNumber(value, fallback = 0) {
  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) {
    return numericValue;
  } else {
    return fallback;
  }
}

/**
 * 归一化一个三维向量（相机位置 / 注视点）。
 *
 * @param {{x?: number, y?: number, z?: number}} source 原始向量。
 * @param {{x?: number, y?: number, z?: number}} [defaults] 各分量缺失时的兜底值。
 * @returns {{x: number, y: number, z: number}} 归一化结果。
 */
function normalizeVector3(source, defaults = {}) {
  return {
    x: toFiniteNumber(source?.x, defaults.x),
    y: toFiniteNumber(source?.y, defaults.y),
    z: toFiniteNumber(source?.z, defaults.z)
  };
}

/**
 * 归一化「随导出一并输出的文件」清单。
 *
 * 非数组一律当空；未知键被过滤掉，避免旧版本残留的文件名让导出流程找不到素材；
 * 前缀引用允许 1~180 个字符，长度上限与后端文档字段长度限制一致。
 *
 * @param {*} files 原始清单。
 * @returns {Array<string>} 去重后的键名，最多 128 项。
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
 *
 * @param {object} [camera] 原始相机设置。
 * @returns {{mode: string, view: string, topRotation: number, position: object,
 *   target: object, visibleHeight: number, fov: number, focalLength: number|null}}
 *   清洗后的相机设置；正交模式下 focalLength 置 null。
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
      (((Math.round(toFiniteNumber(camera?.topRotation, 0) / 90) * 90) % 360) + 360) % 360,
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
    visibleHeight: clampNumber(toFiniteNumber(camera?.visibleHeight, 10), 0.1, 1000),
    // 视场角 5°~120°，超出这个范围会产生透视畸变或近似正交。
    fov: clampNumber(toFiniteNumber(camera?.fov, 36), 5, 120),
    focalLength:
      cameraMode === "perspective"
        ? clampNumber(toFiniteNumber(camera?.focalLength, 50), 18, 120)
        : null
  };
}

/**
 * 归一化单个导出预设。
 *
 * @param {*} rawPreset 原始预设；非对象返回 null（调用方据此判定槽位为空）。
 * @returns {{version: number, name: string, width: number, height: number,
 *   lockRatio: boolean, floorMode: string, floorId: string, floorGap: number,
 *   camera: object, folderName: string, selectedFiles: Array<string>}|null}
 *   清洗后的预设。
 */
export function normalizeExportPreset(rawPreset) {
  if (!rawPreset || typeof rawPreset != "object") {
    return null;
  }
  // 默认 1852×1293 对应 2 倍 DPI 的常见大屏比例；宽高都限制在 320~4096 像素。
  const normalizedWidth = Math.round(clampNumber(toFiniteNumber(rawPreset.width, 1852), 320, 4096));
  const normalizedHeight = Math.round(
    clampNumber(toFiniteNumber(rawPreset.height, 1293), 320, 4096)
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
    floorGap: clampNumber(toFiniteNumber(rawPreset.floorGap, 3), 0, 20),
    camera: normalizePresetCamera(rawPreset.camera),
    folderName: String(rawPreset.folderName || "").slice(0, 60),
    selectedFiles: normalizeSelectedFiles(rawPreset.selectedFiles)
  };
}

/**
 * 归一化整个预设槽数组。
 *
 * 槽位数量夹在 1~8 之间（常量值与此处的字面量保持一致）；
 * 入参不是数组时按默认 4 个空槽处理，保证 UI 至少有槽位可用。
 * 槽位内容允许为 null，表示该槽尚未配置。
 *
 * @param {*} slots 原始槽位数组。
 * @returns {Array<object|null>} 定长的槽位数组。
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
 *
 * @param {*} activeSlotIndex 原始槽下标。
 * @param {*} [requestedSlotCount] 当前槽位总数，默认 4。
 * @returns {number} 合法的槽下标。
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
 *
 * @param {*} preset 原始预设。
 * @param {*} [presetFeatureEnabled] 预设功能开关；功能关闭时即便有配置也算「未启用」。
 * @returns {boolean} 无有效预设且功能未启用时返回 true。
 */
export function exportPresetIsEmpty(preset, presetFeatureEnabled = false) {
  return !normalizeExportPreset(preset) && !presetFeatureEnabled;
}

/**
 * 生成预设的一行摘要文案（用于下拉列表等紧凑位置）。
 *
 * @param {*} storedPreset 原始预设。
 * @param {Map<string, string>} [floorLabelsById] 楼层 id 到名称的映射，用于显示楼层名。
 * @returns {string} 形如 `1852×1293 · 一层 · 透视` 的文案；
 *   未设置预设返回「未设置」；楼层已被删除时返回「楼层已变更」。
 */
export function exportPresetSummary(storedPreset, floorLabelsById = new Map()) {
  const normalizedPreset = normalizeExportPreset(storedPreset);
  if (!normalizedPreset) {
    return "未设置";
  }
  // 楼层名取不到说明该楼层已被删除，用「楼层已变更」提示用户重新选择而不是显示空白。
  const floorLabel =
    normalizedPreset.floorMode === "all"
      ? "全楼合并"
      : floorLabelsById.get(normalizedPreset.floorId) || "楼层已变更";
  const cameraModeLabel = normalizedPreset.camera.mode === "perspective" ? "透视" : "正交";
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
