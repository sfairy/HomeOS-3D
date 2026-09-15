/**
 * 3D 工作室原生表单控件的回填工具。
 *
 * 位置：工作室面板上有大量 <input> / <select> 直接承载场景参数，
 *   外部（例如文档同步、撤销重做）改值后需要把结果写回这些原生控件。
 * 对外：只导出 syncControlValue 一个纯 DOM 工具函数，不持有任何状态。
 * 副作用：命中时会直接改写传入控件的 value。
 */

/**
 * 把新值写回原生表单控件，只在确实需要改动时才写。
 *
 * 返回布尔值而非直接操作，是为了让调用方知道「这次是否真的产生了 DOM 写入」，
 * 从而决定要不要触发重绘或标记脏数据。正在被用户操作的控件会跳过：
 * 输入框获得焦点时若被程序回写，会打断用户的正在输入的选区与光标位置。
 *
 * @param {HTMLInputElement|HTMLSelectElement} controlElement 目标控件。
 * @param {*} nextValue 新值，内部统一转成字符串再比较。
 * @param {Element} [activeElement] 当前聚焦元素，默认取 document.activeElement；
 *   允许注入是为了在无 DOM 环境下也能测试。
 * @returns {boolean} 发生写入返回 true；控件缺失、控件正聚焦、值未变都返回 false。
 */
export function syncControlValue(
  controlElement,
  nextValue,
  activeElement = globalThis.document?.activeElement
) {
  // 控件不存在或用户正在其上操作时直接放弃，避免打断输入。
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
