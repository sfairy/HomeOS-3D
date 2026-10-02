/**
 * 地面反射参数的归一化，以及「清晰度档 → 反射通道开销策略」的唯一出处。
 *
 * 对外只暴露三个用户可见旋钮（范围 / 清晰度 / 强度），其余内部开销（是否做高斯模糊、
 * 要不要做反射专用几何简化、离地多高开始截断倒影）都在本文件里按清晰度档统一决定，
 * 避免这些阈值散落在渲染管线各处、被单独改坏。
 */

export const GROUND_REFLECTION_MODES = ["off", "inside", "outside", "all"] as const;
export const GROUND_REFLECTION_RESOLUTIONS = [256, 512, 768] as const;

export type GroundReflectionMode = (typeof GROUND_REFLECTION_MODES)[number];
export type GroundReflectionResolution = (typeof GROUND_REFLECTION_RESOLUTIONS)[number];

export type GroundReflectionSettings = {
  mode: GroundReflectionMode;
  resolution: GroundReflectionResolution;
  strength: number;
};

const DEFAULT_MODE: GroundReflectionMode = "off";
const DEFAULT_RESOLUTION: GroundReflectionResolution = 512;
// 上限 0.45 是观感与性能的折中：再高会盖过地面材质本身，也更容易出现反射瑕疵。
const MAX_STRENGTH = 0.45;
const DEFAULT_STRENGTH = 0.18;

/**
 * 倒影「离地高度截断」阈值（米）。0 表示不截断，倒影里保留整幅画面。
 *
 * 这是与 0.6.5 观感差异的主因，改前务必读懂：
 * 0.6.5 不截断——高楼、吊灯、柜顶全都完整出现在倒影里；
 * 0.6.7 把它写死成 1.25，着色器对高于 1.25m 的片段做 smoothstep 淡出（淡到 0 直接 discard），
 * 剔除器还会把整个包围盒都在该高度之上的网格整块剔掉，于是「倒影又少又淡」。
 * 默认回到 0（不截断）＝对齐 0.6.5；想换回截断可以调这里，或给控制器传 fadeHeight。
 */
export const GROUND_REFLECTION_FADE_HEIGHT = 0;

export type GroundReflectionQualityPreset = {
  /** 倒影贴图再走一趟双向高斯模糊。低分辨率下能压掉闪烁，但会让倒影发糊。 */
  blur: boolean;
  /**
   * 允许使用反射专用简化几何（detail）的清晰度上限（像素宽）。
   * 0 表示从不简化，Infinity 表示始终简化。
   */
  detailMaxResolution: number;
};

/**
 * 清晰度档 → 反射通道开销策略。
 *
 * 只有最低档（256）才值得为性能牺牲观感：倒影本身就糊，做高斯模糊能压闪烁、
 * 用简化几何能省一半以上的三角形，两笔交易都划算。
 * 512（默认档）与 768 一律对齐 0.6.5：不做模糊、不做几何简化——清晰度是这两档存在的理由。
 */
export const GROUND_REFLECTION_QUALITY: Record<
  GroundReflectionResolution,
  GroundReflectionQualityPreset
> = {
  256: { blur: true, detailMaxResolution: 256 },
  512: { blur: false, detailMaxResolution: 0 },
  768: { blur: false, detailMaxResolution: 0 },
};

/**
 * 把任意外部输入收敛成合法且完整的反射参数。
 *
 * 只返回用户可见的三个旋钮：其余开销策略由 GROUND_REFLECTION_QUALITY 按清晰度推导。
 * 调用方（如 performance-warning）会拿它的结果做前后比较，所以不要往返回值里塞派生字段。
 */
export function normalizeGroundReflection(settings: unknown = {}): GroundReflectionSettings {
  // 先做类型防御：非对象（含 null）一律当空对象，后续字段全部走默认值。
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

/**
 * 取某一清晰度档对应的反射通道开销策略。
 */
export function groundReflectionQuality(
  resolution: GroundReflectionResolution,
): GroundReflectionQualityPreset {
  return GROUND_REFLECTION_QUALITY[resolution];
}
