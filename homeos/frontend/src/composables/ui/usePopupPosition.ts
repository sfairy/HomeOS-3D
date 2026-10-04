/**
 * @file usePopupPosition.ts
 * @module composables/ui
 * @description 弹窗定位 composable 统一导出：百分比定位、固定定位与下拉菜单工具函数。
 *
 * 该文件本身不含逻辑，仅做统一聚合导出，便于调用方单点引入。
 *
 * 依赖：
 * - popup-position-dropdown.util（下拉菜单定位工具）
 * - popup-position-percent.composable（百分比定位 composable）
 * - popup-position-fixed.composable（固定定位 composable）
 */
export {
  rectToDropdownPosition,
  buildDropdownFixedStyle,
  expandDropdownMaxHeight,
  viewportPointToPopupAnchor,
  measureDropdownFitWidth,
} from '@/utils/ui/popup-position-dropdown.util'

export { usePopupPosition } from '@/composables/ui/popup-position-percent.composable'
export { useFixedPopupPosition } from '@/composables/ui/popup-position-fixed.composable'