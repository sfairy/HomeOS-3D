/**
 * 3D 工作室原生表单控件的回填工具。
 *
 * 工作室面板上大量 <input> / <select> 直接承载场景参数，外部（文档同步、撤销重做）改值后需要
 * 把结果写回这些原生控件。只导出纯 DOM 工具函数 syncControlValue，不持有状态；命中时直接改写
 * 传入控件的 value。
 */

/**
 * 把新值写回原生表单控件，只在确实需要改动时才写，并返回「是否真的产生了 DOM 写入」。
 * 正在被用户操作的控件会跳过：输入框获得焦点时被程序回写会打断选区与光标位置。
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
