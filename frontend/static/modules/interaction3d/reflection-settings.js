/**
 * 地面反射参数的归一化。
 *
 * 位置：编辑器设置面板写入、渲染层读取，是两侧对反射配置的唯一解释口径。
 * 对外导出：normalizeGroundReflection。
 * 全局约定：mode / resolution 的合法取值由本文件写死，渲染层不再重复校验，
 *   新增取值时必须同时改这里，否则会被静默回落成默认值。
 * 副作用：无，纯函数（对传入对象只读）。
 */

/**
 * 把任意外部输入收敛成合法且完整的反射参数。
 *
 * @param {object} [settings] 原始设置对象；可能是 null、数组或别的类型。
 * @returns {{mode: string, resolution: number, strength: number}} 归一化结果：
 *   mode ∈ off / inside / outside / all，resolution ∈ 256 / 512 / 768，
 *   strength 限制在 0 ~ 0.45。
 */
export function normalizeGroundReflection(settings = {}) {
  // 先做类型防御：非对象（含 null）一律当空对象，后续字段全部走默认值。
  return (
    (settings = settings && typeof settings == "object" ? settings : {}),
    {
      mode: ["off", "inside", "outside", "all"].includes(settings.mode) ? settings.mode : "off",
      // 反射贴图分辨率的白名单只有三档，刻意不接受任意数值：
      // 非档位值会让 GPU 分配出预期外的显存，这里统一压回 512。
      resolution: [256, 512, 768].includes(settings.resolution) ? settings.resolution : 512,
      // 上限 0.45 是观感与性能的折中：再高会盖过地面材质本身，也更容易出现反射瑕疵。
      strength: Number.isFinite(settings.strength)
        ? Math.max(0, Math.min(0.45, settings.strength))
        : 0.18
    }
  );
}
