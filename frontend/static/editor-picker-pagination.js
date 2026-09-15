/**
 * 编辑器选择器分页：图标 / 实体 / 素材三类列表的每页条数与切片计算。
 *
 * 位置：编辑器各类 picker 弹层的分页逻辑，被选择器渲染层调用。
 * 职责：给出各分类固定页大小，并按当前页算出应显示的实体切片与总条数。
 * 约定：实体列表首页要额外占一个「清除选择」占位项，因此首页真实条数
 *   比其他页少 1，翻页下标计算也必须把占位项折算进去。
 */

// 三类列表的每页条数按网格布局排布，数值与 CSS 网格列数绑定，不要随意改。
export const EDITOR_PICKER_PAGE_SIZES = Object.freeze({ icon: 84, entity: 33, asset: 16 });

/**
 * 计算选中实体所在的分页页码。
 *
 * @param {number} selectedEntityIndex 选中实体在列表中的下标；小于 0 表示未选中。
 * @param {boolean} hasClearOption 首页是否带「清除选择」占位项。
 * @returns {number} 从 1 开始的页码。
 */
export function editorEntityPickerInitialPage(selectedEntityIndex, hasClearOption) {
  // 未选中时停在第 1 页；选中项下标要加上占位项偏移再折算页码。
  return selectedEntityIndex < 0
    ? 1
    : Math.floor(
        (selectedEntityIndex + (hasClearOption ? 1 : 0)) / EDITOR_PICKER_PAGE_SIZES.entity
      ) + 1;
}

/**
 * 截取指定页码应显示的实体切片。
 *
 * @param {Array<object>} entityList 全部实体。
 * @param {number} pageNumber 页码，从 1 开始。
 * @param {boolean} withClearOption 是否在首页插入「清除选择」占位项。
 * @returns {{items: Array<object>, total: number}} 当前页条目与含占位项的总条数。
 */
export function editorEntityPickerPage(entityList, pageNumber, withClearOption) {
  // 首页的占位项占用了第 1 个格子，数据起点与条数都要相应偏移。
  const pageSize = EDITOR_PICKER_PAGE_SIZES.entity,
    placeholderCount = withClearOption ? 1 : 0,
    startIndex = Math.max(0, (pageNumber - 1) * pageSize - placeholderCount),
    pageItemCount = pageSize - (pageNumber === 1 ? placeholderCount : 0);
  return {
    items: entityList.slice(startIndex, startIndex + pageItemCount),
    total: entityList.length + placeholderCount
  };
}
