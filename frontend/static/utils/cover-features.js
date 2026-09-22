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
import { finiteNumberOrNull } from "./numbers.js?v=2609221415";

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
