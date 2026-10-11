/** 该文件本身不含逻辑，仅做统一聚合导出，便于调用方单点引入。 */
export {
  rectToDropdownPosition,
  buildDropdownFixedStyle,
  expandDropdownMaxHeight,
  viewportPointToPopupAnchor,
  measureDropdownFitWidth,
} from '@/composables/ui/popup-position-dropdown.util'

export { usePopupPosition } from '@/composables/ui/popup-position-percent.composable'
export { useFixedPopupPosition } from '@/composables/ui/popup-position-fixed.composable'