/**
 * HA 窗帘（cover）实体的能力位定义与「设备能不能调叶片」的证据判定。
 */
import { finiteNumberOrNull } from "./numbers.js?v=2609271411";

export const COVER_FEATURE_OPEN = 1;
export const COVER_FEATURE_CLOSE = 2;
export const COVER_FEATURE_SET_POSITION = 4;
export const COVER_FEATURE_STOP = 8;
export const COVER_FEATURE_SET_TILT_POSITION = 128;

/**
 * 窗帘「打开」的默认开合度（%）：未绑定实体时的展示值，也是新建模型的开合预览。
 */
export const COVER_DEFAULT_PREVIEW_POSITION = 75;

/** 240 = 16+32+64+128：HA 里全部 tilt（开合角度）相关能力位的并集，置起任意一位即「能调叶片」。 */
export const COVER_TILT_FEATURE_MASK = 16 | 32 | 64 | 128;

/**
 * 窗帘位置百分比的端点容差（%）：差值在 1% 以内就当作「完全关闭 / 完全打开」。
 */
export const COVER_POSITION_EPSILON_PERCENT = 1;

/**
 * 窗帘图形（详情弹窗 / 组合弹窗右上那幅 244×154 的示意）里「帘布宽度」的几何。
 */
export const COVER_PANEL_WIDTH_BASE_PERCENT = 45.9;
export const COVER_PANEL_WIDTH_PER_POSITION = 0.331;
export const COVER_SINGLE_PANEL_WIDTH_BASE_PERCENT = 91.8;
export const COVER_SINGLE_PANEL_WIDTH_PER_POSITION = 0.79;

/** 两片对开时单片的宽度百分比（位置 0 = 合拢 = 45.9%）。 */
export function coverPanelWidthPercent(position) {
  return COVER_PANEL_WIDTH_BASE_PERCENT - position * COVER_PANEL_WIDTH_PER_POSITION;
}

/** 单侧梦幻帘（整幅）的宽度百分比（位置 0 = 合拢 = 91.8%）。 */
export function coverSinglePanelWidthPercent(position) {
  return COVER_SINGLE_PANEL_WIDTH_BASE_PERCENT - position * COVER_SINGLE_PANEL_WIDTH_PER_POSITION;
}

/** 开合方向：向左收拢 / 向右收拢 / 双向收拢。 */
const COVER_DIRECTION_SET = new Set(["left", "right", "split"]);

/**
 * 取窗帘的开合方向。
 */
export function resolveCoverDirection(directionBinding) {
  return COVER_DIRECTION_SET.has(directionBinding?.coverDirection)
    ? directionBinding.coverDirection
    : COVER_DIRECTION_SET.has(directionBinding?.curtainPosition)
      ? directionBinding.curtainPosition
      : "split";
}

export function coverFeaturesOf(rawFeatures) {
  const parsedFeatures = finiteNumberOrNull(rawFeatures);
  return Number.isSafeInteger(parsedFeatures) && parsedFeatures >= 0 ? parsedFeatures : 0;
}

/**
 * 取窗帘能力位；设备**从不**上报 `supported_features` 时，按它已经报出来的状态推断。
 */
export function coverFeaturesOrInferred(attributes) {
  const reportedFeatures = finiteNumberOrNull(attributes?.supported_features);
  if (reportedFeatures !== null) {
    // 与 coverFeaturesOf 同一口径：只有安全范围内的非负整数才算有效能力位。
    return Number.isSafeInteger(reportedFeatures) && reportedFeatures >= 0 ? reportedFeatures : 0;
  }
  let inferredFeatures = COVER_FEATURE_OPEN | COVER_FEATURE_CLOSE | COVER_FEATURE_STOP;
  if (finiteNumberOrNull(attributes?.current_position) !== null) {
    inferredFeatures |= COVER_FEATURE_SET_POSITION;
  }
  if (finiteNumberOrNull(attributes?.current_tilt_position) !== null) {
    inferredFeatures |= COVER_FEATURE_SET_TILT_POSITION;
  }
  return inferredFeatures;
}

export function coverReportsTilt(attributes, features) {
  const reportedTilt = finiteNumberOrNull(attributes?.current_tilt_position);
  return reportedTilt !== null || !!(features & COVER_TILT_FEATURE_MASK);
}
