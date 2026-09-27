/**
 * 指针捕获（setPointerCapture / releasePointerCapture）的唯一入口。
 */

/**
 * 捕获指针；预期内失败（指针已消失 / 元素已脱离文档）时静默降级。
 * @param {Element|null|undefined} element 发起捕获的元素。
 * @param {number} pointerId 触发指针的 id。
 */
export function capturePointer(
  element: Element | null | undefined,
  pointerId: number,
): void {
  try {
    element?.setPointerCapture?.(pointerId);
  } catch {
    // 见文件头：捕获失败不影响后续 pointermove / pointerup 的收尾。
  }
}

/**
 * 释放指针捕获；未持有捕获时静默忽略（重复释放属预期内）。
 * @param {Element|null|undefined} element 持有捕获的元素。
 * @param {number} pointerId 触发指针的 id。
 */
export function releasePointer(
  element: Element | null | undefined,
  pointerId: number,
): void {
  try {
    element?.releasePointerCapture?.(pointerId);
  } catch {
    // 见文件头：重复释放是常态，不表示状态不一致。
  }
}
