/**
 * 地面反射参数的归一化。
 */

/**
 * 把任意外部输入收敛成合法且完整的反射参数。
 */
export function normalizeGroundReflection(settings = {}) {
  // 先做类型防御：非对象（含 null）一律当空对象，后续字段全部走默认值。
  return (
    (settings = settings && typeof settings == "object" ? settings : {}),
    {
      mode: ["off", "inside", "outside", "all"].includes(settings.mode) ? settings.mode : "off",
      resolution: [256, 512, 768].includes(settings.resolution) ? settings.resolution : 512,
      // 上限 0.45 是观感与性能的折中：再高会盖过地面材质本身，也更容易出现反射瑕疵。
      strength: Number.isFinite(settings.strength)
        ? Math.max(0, Math.min(0.45, settings.strength))
        : 0.18
    }
  );
}
