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


/**
 * 数字输入框的步进与显示（0.8.1 `studio-edit-metrics` 新增）。
 *
 * 原生 `input.stepUp()` 在「值为空 / 越界 / step 非法」时**抛异常**，之前这里直接
 * `return false`，用户把输入框清空后再点 ± 就完全没反应。上游改成自己做算术：
 * 空值按 `min`（无 min 时 0）起算，结果夹在 `[min, max]` 内，再格式化回输入框。
 */

/** 记住「显示文本 → 数值」的对应关系；`display` 变了说明用户改过，不能再用缓存值。 */
const rememberedNumberValues = new WeakMap<object, { value: number; display: string }>();

/** 输入框显示用的数字文本：最多 6 位小数，去掉多余的 0。 */
export function editNumberText(value: unknown) {
  return String(Number(Number(value).toFixed(6)));
}

/** 在 `value` 上走 `direction` 步（`step × direction`），夹在 `[minValue, maxValue]` 内。 */
export function steppedNumber(
  value: number,
  step: number,
  direction: number,
  minValue = -Infinity,
  maxValue = Infinity,
) {
  if (!Number.isFinite(value) || !(step > 0)) return null;
  const steppedValue = Number((value + direction * step).toFixed(12));
  return Math.min(maxValue, Math.max(minValue, steppedValue));
}

/** 记下「当前显示文本对应哪个数值」，供下一次步进接着算（而不是重新解析被格式化过的文本）。 */
export function rememberNumberValue(input: { value: string } | null | undefined, value: number) {
  if (input && Number.isFinite(value))
    rememberedNumberValues.set(input, { value: value, display: input.value });
}

/** 输入框当前值：显示文本没变过就用记住的数值，否则按用户输入重新解析。 */
export function numberEditValue(input: { value: string } | null | undefined) {
  const remembered = input ? rememberedNumberValues.get(input) : undefined;
  return remembered && remembered.display === input?.value
    ? remembered.value
    : Number(input?.value);
}
