/**
 * 地面反射参数的归一化。
 */

import type {
  GroundReflectionMode,
  GroundReflectionResolution,
  GroundReflectionSettings
} from "../types/document.js";

const GROUND_REFLECTION_MODES: readonly GroundReflectionMode[] = [
  "off",
  "inside",
  "outside",
  "all"
];
const GROUND_REFLECTION_RESOLUTIONS: readonly GroundReflectionResolution[] = [
  256,
  512,
  768
];

/**
 * 把任意外部输入收敛成合法且完整的反射参数。
 */
export function normalizeGroundReflection(
  settings: unknown = {}
): GroundReflectionSettings {
  // 先做类型防御：非对象（含 null）一律当空对象，后续字段全部走默认值。
  const source =
    settings && typeof settings == "object"
      ? (settings as Record<string, unknown>)
      : {};
  return {
    mode: GROUND_REFLECTION_MODES.includes(source.mode as GroundReflectionMode)
      ? (source.mode as GroundReflectionMode)
      : "off",
    resolution: GROUND_REFLECTION_RESOLUTIONS.includes(
      source.resolution as GroundReflectionResolution
    )
      ? (source.resolution as GroundReflectionResolution)
      : 512,
    // 上限 0.45 是观感与性能的折中：再高会盖过地面材质本身，也更容易出现反射瑕疵。
    strength: Number.isFinite(source.strength)
      ? Math.max(0, Math.min(0.45, Number(source.strength)))
      : 0.18
  };
}
