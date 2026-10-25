/** 地面反射参数的归一化，以及「清晰度档 → 反射通道开销策略」的唯一出处。 */

const GROUND_REFLECTION_MODES = ["off", "inside", "outside", "all"] as const;
const GROUND_REFLECTION_RESOLUTIONS = [256, 512, 768] as const;

type GroundReflectionMode = (typeof GROUND_REFLECTION_MODES)[number];
type GroundReflectionResolution = (typeof GROUND_REFLECTION_RESOLUTIONS)[number];

type GroundReflectionSettings = {
  mode: GroundReflectionMode;
  resolution: GroundReflectionResolution;
  strength: number;
};

const DEFAULT_MODE: GroundReflectionMode = "off";
const DEFAULT_RESOLUTION: GroundReflectionResolution = 512;

const MAX_STRENGTH = 0.45;
const DEFAULT_STRENGTH = 0.18;

/** 倒影「离地高度截断」阈值（米）。 */
export const GROUND_REFLECTION_FADE_HEIGHT = 0;

type GroundReflectionQualityPreset = {
  /** 倒影贴图再走一趟双向高斯模糊。 */
  blur: boolean;
  /** 允许使用反射专用简化几何（detail）的清晰度上限（像素宽）。 */
  detailMaxResolution: number;
};

/** 清晰度档 → 反射通道开销策略。 */
const GROUND_REFLECTION_QUALITY: Record<
  GroundReflectionResolution,
  GroundReflectionQualityPreset
> = {
  // 256 是最省的档位（低性能设备 / 平板）：双高斯模糊每条记录要多两次全屏 pass，
  // 而 256 贴图本身的模糊效果肉眼几乎不可见 —— 这一档直接不做 blur。
  256: { blur: false, detailMaxResolution: 256 },
  512: { blur: false, detailMaxResolution: 0 },
  768: { blur: false, detailMaxResolution: 0 },
};

/** 把任意外部输入收敛成合法且完整的反射参数。 */
export function normalizeGroundReflection(settings: unknown = {}): GroundReflectionSettings {

  const source =
    settings && typeof settings == "object" ? (settings as Record<string, unknown>) : {};
  return {
    mode: GROUND_REFLECTION_MODES.includes(source.mode as GroundReflectionMode)
      ? (source.mode as GroundReflectionMode)
      : DEFAULT_MODE,
    resolution: GROUND_REFLECTION_RESOLUTIONS.includes(
      source.resolution as GroundReflectionResolution,
    )
      ? (source.resolution as GroundReflectionResolution)
      : DEFAULT_RESOLUTION,
    strength: Number.isFinite(source.strength)
      ? Math.max(0, Math.min(MAX_STRENGTH, Number(source.strength)))
      : DEFAULT_STRENGTH,
  };
}

/** 取某一清晰度档对应的反射通道开销策略。 */
export function groundReflectionQuality(
  resolution: GroundReflectionResolution,
): GroundReflectionQualityPreset {
  return GROUND_REFLECTION_QUALITY[resolution];
}
