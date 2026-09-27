// 夹取统一走 utils/numbers.js（唯一实现）。
import { clampNumber } from "../utils/numbers.js?v=2609271226";

/**
 * 数字输入框的「上 / 下一步进」唯一实现：原生 `stepUp()` / `stepDown()` 会连带触发浏览器的
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
    return false;
  }
  numberInput.dispatchEvent(new EventConstructor("input", { bubbles: true }));
  if (dispatchChange) {
    numberInput.dispatchEvent(new EventConstructor("change", { bubbles: true }));
  }
  return true;
}
