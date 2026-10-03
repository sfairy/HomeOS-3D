/**
 * 浮动 Hub Tab 选项与默认值
 *
 * 职责：
 * - 转发 hub-tabs-options 的 Tab 集合查询（按 Hub 类型取可选 Tab）。
 * - 维护各 Hub 类型添加时的 defaultTab 默认值。
 *
 * 依赖：@/utils/registry/hub-tabs-options 的 getHubTabSet。
 *
 * 注意：Hub 类型 key（homeEnvironment / climateHub ...）与 Tab key（overview / control ...）
 *   均为配置 key，不翻译。
 */
import { getHubTabSet } from '@/utils/registry/hub-tabs-options'

/**
 * 获取指定 Hub 类型的可选 Tab 集合。
 *
 * @param type Hub 类型 key
 * @returns 该 Hub 支持的 Tab 集合
 */
export function getFloatingHubTabOptions(type: string) {
  return getHubTabSet(type)
}

/** 各 Hub 类型添加时的 defaultTab 默认值 */
export const FLOATING_HUB_DEFAULT_TAB: Record<string, string> = {
  homeEnvironment: 'overview',
  climateHub: 'control',
  lockHub: 'locks',
  securityPanel: 'arm',
  smartAdvisor: 'overview',
  energyDashboard: 'overview',
  careHub: 'monitor',
  scheduleHub: 'schedule',
}
