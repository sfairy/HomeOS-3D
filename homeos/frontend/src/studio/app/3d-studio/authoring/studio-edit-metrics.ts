/**
 * 3D Studio 编辑精度（0.7.8 `studio-edit-metrics`）。
 *
 * 统一键盘移动步长、吸附取整与不同家具的宽/深/高步进，
 * 避免数值控件出现「0.30000000000000004」这类浮点尾巴。
 */

const MOVE_STEP_METERS = 0.05;

/** Alt 精细 1cm，Shift 粗调 25cm，默认 5cm。 */
export function moveStepMeters({ altKey = false, shiftKey = false } = {}) {
  return altKey ? 0.01 : shiftKey ? 0.25 : MOVE_STEP_METERS;
}

/** 按吸附粒度取整；粒度 <= 0 时原样返回。 */
export function snapEditDelta(delta: number, step: number) {
  return step > 0 ? Number((Math.round(delta / step) * step).toFixed(12)) : delta;
}

const SMALL_ITEM_TYPES = new Set([
  "presence",
  "smart-socket-86",
  "bunk-bed",
  "wardrobe",
  "office-chair",
  "router",
  "humidifier",
  "dehumidifier",
  "heater",
  "pool-table",
]);

type ItemDimensionPolicy = {
  digits: number;
  widthStep: number;
  depthStep: number;
  heightStep: number;
};

/** 家具尺寸步进策略：常规 5cm、小件 5mm、插座 1mm。 */
export function itemDimensionPolicy(itemType: string, isPlanLabel = false): ItemDimensionPolicy {
  const digits =
      isPlanLabel || itemType === "airer"
        ? 6
        : itemType === "presence" || itemType.startsWith("decor-") || SMALL_ITEM_TYPES.has(itemType)
          ? 3
          : 2,
    sizeStep = itemType === "smart-socket-86" ? 0.001 : digits >= 3 ? 0.005 : 0.05;
  return {
    digits,
    widthStep: sizeStep,
    depthStep: sizeStep,
    heightStep: itemType === "smart-socket-86" ? 0.001 : itemType === "rug" ? 0.002 : sizeStep,
  };
}

