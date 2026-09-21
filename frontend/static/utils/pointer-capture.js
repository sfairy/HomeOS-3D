/**
 * 指针捕获（setPointerCapture / releasePointerCapture）的唯一入口。
 *
 * 这两个 API 会抛错，而且抛的都是「预期之内」的情况，不是程序缺陷：
 *   - setPointerCapture：pointerId 已不是活动指针时抛 NotFoundError（按压早已结束、或元素刚被
 *     摘出文档），元素不在文档里时抛 InvalidStateError；
 *   - releasePointerCapture：当前没持有该指针的捕获时抛 NotFoundError —— 重复释放是常态，
 *     pointerup / pointercancel / lostpointercapture / 失焦几条收尾路径都会走一遍。
 *
 * 捕获本身只是「指针移出元素后仍收得到 pointermove / pointerup」的优化：拿不到捕获时，拖拽
 * 要么靠仍在元素上到达的事件走完，要么在 pointerup 收尾时把状态清干净。所以这里把异常吞掉 ——
 * 但只处理上面这两类「预期内」的失败，它不替调用方兜程序缺陷（参数写错之类照样会露出来）。
 *
 * 全仓这两个 API 只允许经这里调用（无自动把关，靠 review 与约定）：同一种操作
 * 原先在 9 个文件里分成「裸调 / `try{…}catch{}` / `?.` 可选调用」三种写法，谁该防、防的是什么，
 * 读代码的人只能逐处重新推一遍；而 try/catch 那些又都是空的，看不出吞掉的是哪一类异常。
 */

/**
 * 捕获指针；预期内失败（指针已消失 / 元素已脱离文档）时静默降级。
 * @param {Element|null|undefined} element 发起捕获的元素。
 * @param {number} pointerId 触发指针的 id。
 */
export function capturePointer(element, pointerId) {
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
export function releasePointer(element, pointerId) {
  try {
    element?.releasePointerCapture?.(pointerId);
  } catch {
    // 见文件头：重复释放是常态，不表示状态不一致。
  }
}
