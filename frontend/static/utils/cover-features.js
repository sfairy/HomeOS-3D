/**
 * HA 窗帘（cover）实体的能力位定义与「设备能不能调叶片」的证据判定。
 *
 * 位值来自 HA 的 `CoverEntityFeature`：1=开、2=关、4=设位置、8=停、128=设叶片角度；
 * 16/32/64 是窗帘开合角度（tilt）相关的其余位，合并成 `COVER_TILT_FEATURE_MASK`（240）。
 *
 * 为什么单独一个叶子模块：仪表盘控件注册表（`renderer/core/registry/cover-state.js`，决定图标与
 * 活动态）与 3D 舞台（`modules/runtime/cover/cover-state.js`，决定动画）都要这份判定，两处各写一遍
 * 时口径已经分叉（一处把 `""` 当读数、一处不当），同一台设备会被判成不同帘型。零依赖，两侧都能直接用。
 */
import { finiteNumberOrNull } from "./numbers.js?v=2609222006";

export const COVER_FEATURE_OPEN = 1;
export const COVER_FEATURE_CLOSE = 2;
export const COVER_FEATURE_SET_POSITION = 4;
export const COVER_FEATURE_STOP = 8;
export const COVER_FEATURE_SET_TILT_POSITION = 128;

/** 240 = 16+32+64+128：HA 里全部 tilt（开合角度）相关能力位的并集，置起任意一位即「能调叶片」。 */
export const COVER_TILT_FEATURE_MASK = 16 | 32 | 64 | 128;

/**
 * 窗帘位置百分比的端点容差（%）：差值在 1% 以内就当作「完全关闭 / 完全打开」。
 *
 * 取 1 而不是 0：设备常在 0 附近上报 0.4 这类残值，用严格等于会让开合状态来回抖动。三个消费方
 * （控件注册表的开合判定、渲染器的收起判定、窗帘运行时的位置取值）必须用同一个数，否则同一位置
 * 会在图标与动画两边得到不同结论 —— 合并成一个常量也正是为了这个；以前两边各写一份、只是「恰好
 * 等值」，改一处就会悄悄分叉。
 */
export const COVER_POSITION_EPSILON_PERCENT = 1;

/**
 * 窗帘图形（详情弹窗 / 组合弹窗右上那幅 244×154 的示意）里「帘布宽度」的几何。
 *
 * 帘布宽度是开合百分比的线性函数：`基准 − 位置 × 每格`。四个数以前在
 * `entity-details.js` 与 `custom-popup.js` 里各写一份、只是「恰好等值」——
 * 和上面 `COVER_POSITION_EPSILON_PERCENT` 当年分叉的情形一模一样，所以一并收进来。
 *
 * 两个基准值的来路：可视宽 244 − 左右各 10px = 224px，占容器 91.8%；两片各占一半（45.9%）
 * 时正好在中间合拢。两式在位置 = 100 时都收敛到 12.8%（45.9 − 33.1 = 91.8 − 79），
 * 也就是全开时帘布都收到 12.8% —— 这个巧合是两条公式必须同改同验的原因。
 *
 * 注意别把它和 `--hb-cover-open-position` 混起来：后者曾经由 JS 写入但样式表从不取用，
 * 已删除。真正决定帘布宽度的是下面这两个函数算出的百分比，原始的开合百分比只留在 JS 里
 * （用于叶片角度、晾衣杆高度与转向类名）。
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

/**
 * 归一 `supported_features`：必须是安全范围内的非负整数，否则按「没上报任何能力」（0）处理。
 * 不能直接 `Number(x)` 后拿去按位与 —— 传入对象 / NaN / 负数都得不到有意义的结果，而调用方
 * 拿 0 只会走「保守」分支，拿 NaN 则会让所有 `&` 判定变成 false 且看不出原因。
 */
export function coverFeaturesOf(rawFeatures) {
  const parsedFeatures = finiteNumberOrNull(rawFeatures);
  return Number.isSafeInteger(parsedFeatures) && parsedFeatures >= 0 ? parsedFeatures : 0;
}

/**
 * 设备是否给出了「能调叶片」的证据：上报了 `current_tilt_position`，或置起了任一 tilt 能力位。
 *
 * 判据用 `finiteNumberOrNull`（空串 / 布尔 / 非数字都算「没上报」）而不是裸 `Number.isFinite`：
 * `Number("")` 是 0，会把一个空字段当成「叶片位于 0 度」的有效读数。
 */
export function coverReportsTilt(attributes, features) {
  const reportedTilt = finiteNumberOrNull(attributes?.current_tilt_position);
  return reportedTilt !== null || !!(features & COVER_TILT_FEATURE_MASK);
}
