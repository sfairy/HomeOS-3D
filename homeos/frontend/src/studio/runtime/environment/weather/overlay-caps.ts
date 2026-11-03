/**
 * 覆盖层「不遮挡 3D 交互图」的上限。
 *
 * 天气层是一张盖在 3D 舞台上的 2D canvas，任何不透明度都会削弱户型、家具、
 * 设备图标与状态文字的可读性。所以**能不能看见天气**要让位于**能不能看清户型**：
 * 这里集中定义各层的硬上限，任何预设的数值都必须先过这些闸门。
 *
 * 三条硬约定：
 * 1. 天空只染画面顶部，且在地平线以上就淡出到 0，绝不压到户型主体。
 * 2. 云只出现在顶部窄带里，且不透明度远低于「白云」应有的白。
 * 3. 全屏调色 / 暗角的总不透明度有绝对上限，雷电白闪单独限得更死。
 */

/** 天空渐变允许的最大不透明度。 */
export const SKY_MAX_ALPHA = 0.46;
/** 天空渐变最多铺到画面高度的这个比例（之后必须已经完全淡出）。 */
export const SKY_MAX_STOP = 0.42;
/** 云层允许的最大不透明度。 */
export const CLOUD_MAX_ALPHA = 0.78;
/** 云层中心最多下探到画面高度的这个比例。 */
export const CLOUD_MAX_CENTER = 0.2;
/** 全屏调色的最大不透明度（「染」而不是「盖」）。 */
export const GRADE_MAX_ALPHA = 0.1;
/** 暗角的最大不透明度。 */
export const VIGNETTE_MAX_ALPHA = 0.2;
/** 雷电白闪的最大不透明度。 */
export const FLASH_MAX_ALPHA = 0.07;

/** 把任意预设值夹到 `[0, max]`；预设写超了也不会盖住宿主画面。 */
export function clampAlpha(value: number, max: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(0, value));
}
