/** 浮动 Hub Tab 选项与默认值 */
import { getHubTabSet } from '@/shared/utils/registry/hub-tabs-options'

export { FLOATING_HUB_DEFAULT_TAB } from '@/shared/utils/registry/hub-tabs-options'

/**
 * 获取指定 Hub 类型的可选 Tab 集合。
 *
 * @param type Hub 类型 key
 * @returns 该 Hub 支持的 Tab 集合
 */
export function getFloatingHubTabOptions(type: string) {
  return getHubTabSet(type)
}
