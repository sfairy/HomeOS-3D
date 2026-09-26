// 夹取统一走 utils/numbers.js（唯一实现）。
import { clampNumber } from "../utils/numbers.js?v=2609262221";

/**
 * 数字输入框的「上 / 下一步进」唯一实现：原生 `stepUp()` / `stepDown()` 会连带触发浏览器的
 * 值净化（受 `min` / `max` / `step` 约束），比手工加减更贴近原生行为，所以一律优先走它们。
 *
 * 两处调用点的差异是**调用方的策略**，在这里做成显式参数，而不是各写一份：
 *
 *   `dispatchChange` —— 步进后是否立刻补发 `change`。
 *     编辑器（`editor/home.js`）要求「按住连发时只在松手补一次 change」，否则每一发都往撤销栈写一次
 *     历史，所以它传 `false`，由调用点在合适时机统一补发；平面光区编辑器的一次步进就是要落配置，
 *     于是传 `true`。
 *
 *   `fallbackOnInvalidStep` —— 原生方法在 `step` 非法 / 缺失（含 `step="any"`）时会抛错。
 *     `true`：按 `dataset.numberStep` → `step` → `1` 取步长自行计算并夹到 `min` / `max`，
 *       方向键与加减按钮继续可用；`false`：返回 `false` 放弃这次步进 —— 那会让方向键**静默失效**，
 *       只该用在能保证 `step` 一定合法的静态表单上。
 *
 * `EventConstructor` 供跨文档调用点传入自己那份 `Event`（面板 / 弹窗位于另一份文档时，
 * 用全局 `Event` 造出来的事件不是同一个 realm 的构造器）。
 *
 * @returns {boolean} 值是否真的变了；调用方据此决定要不要补发 `change`。
 */
export function stepNumberInput(numberInput, stepDirection, options = {}) {
  const {
    dispatchChange = false,
    fallbackOnInvalidStep = true,
    EventConstructor = globalThis.Event
  } = options;
  if (!numberInput || numberInput.disabled || numberInput.readOnly) {
    return false;
  }
  const valueBeforeStep = numberInput.value;
  try {
    if (stepDirection > 0) {
      numberInput.stepUp();
    } else {
      numberInput.stepDown();
    }
  } catch {
    if (!fallbackOnInvalidStep) {
      return false;
    }
    // 步长取值顺序与原生一致：显式 dataset 覆盖 > 元素 step 属性 > 兜底 1。
    const fallbackStepSize =
      Number(numberInput.dataset?.numberStep) || Number(numberInput.step) || 1;
    const numericInputValue = Number(numberInput.value) || 0;
    const numericMinValue = numberInput.min === "" ? -Infinity : Number(numberInput.min);
    const numericMaxValue = numberInput.max === "" ? Infinity : Number(numberInput.max);
    numberInput.value = String(
      clampNumber(numericInputValue + fallbackStepSize * stepDirection, numericMinValue, numericMaxValue)
    );
  }
  if (numberInput.value === valueBeforeStep) {
    // 已经顶到 min / max：不算改动，也不派发事件（否则会凭空写一次「未变化」的历史）。
    return false;
  }
  numberInput.dispatchEvent(new EventConstructor("input", { bubbles: true }));
  if (dispatchChange) {
    numberInput.dispatchEvent(new EventConstructor("change", { bubbles: true }));
  }
  return true;
}
