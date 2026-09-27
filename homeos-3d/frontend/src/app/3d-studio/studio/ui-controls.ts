/**
 * 3D 工作室原生表单控件的回填工具。
 */

type FormControlLike = {
  value: string;
};

/**
 * 把新值写回原生表单控件，只在确实需要改动时才写，并返回「是否真的产生了 DOM 写入」。
 */
export function syncControlValue(
  controlElement: FormControlLike | null | undefined,
  nextValue: unknown,
  activeElement: unknown = globalThis.document?.activeElement
): boolean {
  if (!controlElement || activeElement === controlElement) {
    return false;
  }
  const stringValue = String(nextValue);
  // 原生控件的 value 永远是字符串，先比较后写，减少无意义的重排与事件风暴。
  if (controlElement.value === stringValue) {
    return false;
  } else {
    controlElement.value = stringValue;
    return true;
  }
}
