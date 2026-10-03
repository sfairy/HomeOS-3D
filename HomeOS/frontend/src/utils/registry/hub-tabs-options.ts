/**
 * 顶层 Hub 微件 Tab 选项与配置规范化
 *
 * 职责：
 * - 维护各 Hub 微件（环境 / 气候 / 日程 / 看护 / 门锁 / 智能建议 / 多媒体 / 能源 /
 *   安防 / 场景 / 运维 / 开关分组 / 场景脚本）的可选 Tab 注册表。
 * - 提供 Tab 集查询、默认 Tab 解析、配置规范化、可见 Tab 过滤、草稿克隆与序列化工具。
 *
 * 依赖：
 * - @/utils/registry/floating-hub-tab-options 的默认 Tab 表。
 * - @/utils/registry/weather-hub-options 的天气 Hub Tab 与类型判定。
 *
 * 注意：
 * - `id`（overview / life / ...）为 Tab 配置 key，不翻译。
 * - 仅 `label`（面向用户的 Tab 文案）使用简体中文。
 */
import { FLOATING_HUB_DEFAULT_TAB } from '@/utils/registry/floating-hub-tab-options'
import { WEATHER_HUB_TABS, isWeatherHubWidgetType } from '@/utils/registry/weather-hub-options'

/** HubTabOption：类型定义，字段语义见声明。 */
export interface HubTabOption {
  id: string
  label: string
}

interface HubTabConfig {
  defaultTab: string
  visibleTabs: string[]
}

/** 顶层 hub 微件 Tab 注册表（与组件 WidgetHubHeader 展示一致） */
const HUB_TAB_REGISTRY: Record<string, HubTabOption[]> = {
  homeEnvironment: [
    { id: 'overview', label: '总览' },
    { id: 'life', label: '生活' },
    { id: 'comfort', label: '舒适' },
    { id: 'trend', label: '趋势' },
    { id: 'rooms', label: '房间' },
    { id: 'circadian', label: '节律' },
  ],
  climateHub: [
    { id: 'trend', label: '趋势' },
    { id: 'control', label: '控制' },
    { id: 'adaptive', label: '建议' },
  ],
  scheduleHub: [
    { id: 'schedule', label: '日程' },
    { id: 'voice', label: '语音' },
  ],
  careHub: [
    { id: 'monitor', label: '看护' },
    { id: 'child', label: '儿童' },
  ],
  lockHub: [
    { id: 'locks', label: '门锁' },
    { id: 'guest', label: '访客' },
  ],
  smartAdvisor: [
    { id: 'overview', label: '总览' },
    { id: 'advisor', label: '每日建议' },
    { id: 'habits', label: '习惯推荐' },
    { id: 'config', label: '配置建议' },
    { id: 'timeline', label: '事件' },
    { id: 'linkage', label: '联动' },
    { id: 'analytics', label: '分析' },
  ],
  mediaMini: [
    { id: 'player', label: '播放' },
    { id: 'scene', label: '场景' },
    { id: 'playlist', label: '列表' },
  ],
  energyDashboard: [
    { id: 'overview', label: '概览' },
    { id: 'electricity', label: '电力' },
    { id: 'solar', label: '发电' },
    { id: 'gas', label: '燃气' },
    { id: 'water', label: '用水' },
    { id: 'waterTrend', label: '水势' },
    { id: 'budget', label: '预算' },
    { id: 'analytics', label: '分析' },
    { id: 'insight', label: '洞察' },
    { id: 'pricing', label: '电价' },
    { id: 'comm', label: '通信' },
  ],
  securityPanel: [
    { id: 'arm', label: '布防' },
    { id: 'sensors', label: '传感器' },
    { id: 'anomaly', label: '异常' },
    { id: 'simulation', label: '模拟' },
    { id: 'frigate', label: '摄像' },
  ],
  sceneHub: [
    { id: 'scenes', label: '收藏' },
    { id: 'history', label: '历史' },
  ],
  opsHub: [
    { id: 'health', label: '设备' },
    { id: 'usage', label: '用量' },
    { id: 'system', label: '系统' },
    { id: 'sync', label: '同步' },
  ],
  switchGroup: [
    { id: 'groups', label: '分组' },
    { id: 'shortcuts', label: '快捷' },
    { id: 'features', label: '功能' },
  ],
  sceneScript: [
    { id: 'scene', label: '场景' },
    { id: 'script', label: '脚本' },
    { id: 'automation', label: '自动化' },
    { id: 'favorites', label: '收藏' },
  ],
}

/** 把天气类 widgetType 收敛为统一 canonical key `weather`，便于复用天气 Tab 集 */
function normalizeHubWidgetType(widgetType: string): string {
  if (isWeatherHubWidgetType(widgetType)) return 'weather'
  return widgetType
}

/**
 * 查询指定 Hub 的可选 Tab 集。
 * @param widgetType - 微件类型 key。
 * @returns Tab 选项数组；天气类走 WEATHER_HUB_TABS，未命中返回 null。
 */
export function getHubTabSet(widgetType: string): HubTabOption[] | null {
  const canonical = normalizeHubWidgetType(widgetType)
  if (canonical === 'weather') {
    return WEATHER_HUB_TABS.map((t) => ({ id: t.id, label: t.label }))
  }
  return HUB_TAB_REGISTRY[canonical] ?? null
}

/** 解析 Hub 默认 Tab：天气固定 current，其余走默认表 → 首个 Tab → overview 兜底 */
function getHubDefaultTab(widgetType: string): string {
  const canonical = normalizeHubWidgetType(widgetType)
  if (canonical === 'weather') return 'current'
  const tabs = getHubTabSet(widgetType)
  return (
    FLOATING_HUB_DEFAULT_TAB[canonical] ||
    FLOATING_HUB_DEFAULT_TAB[widgetType] ||
    tabs?.[0]?.id ||
    'overview'
  )
}

/**
 * 规范化 Hub Tab 配置：校验 visibleTabs 合法性、补齐默认 defaultTab
 *
 * @param raw - 用户原始配置；visibleTabs 非法或缺失时回退为全部 Tab。
 * @param widgetType - 微件类型 key。
 * @returns 含 defaultTab 与 visibleTabs 的完整配置；无可配置 Tab 时 visibleTabs 为空。
 */
export function normalizeHubTabConfig(
  raw: Record<string, unknown> | undefined,
  widgetType: string,
): HubTabConfig {
  const tabSet = getHubTabSet(widgetType)
  if (!tabSet?.length) {
    return { defaultTab: getHubDefaultTab(widgetType), visibleTabs: [] }
  }

  const validIds = new Set(tabSet.map((t) => t.id))
  const visibleRaw = Array.isArray(raw?.visibleTabs) ? raw.visibleTabs.map(String) : null
  const visibleTabs = visibleRaw?.filter((id) => validIds.has(id)) || []
  const normalizedVisible = visibleTabs.length ? visibleTabs : tabSet.map((t) => t.id)

  let defaultTab = String(raw?.defaultTab || getHubDefaultTab(widgetType))
  if (!normalizedVisible.includes(defaultTab)) {
    defaultTab = normalizedVisible[0] || tabSet[0].id
  }

  return { defaultTab, visibleTabs: normalizedVisible }
}

/** 该 Hub 是否存在可配置 Tab（注册表有记录即视为可配置） */
export function hasConfigurableTabs(widgetType: string): boolean {
  return getHubTabSet(widgetType) != null
}

/** Hub Tab 定义可能使用 key（组件侧）或 id（注册表侧） */
export function resolveHubTabId(tab: { key?: string; id?: string }): string {
  return tab.key ?? tab.id ?? ''
}

/**
 * 按可见 Tab 配置过滤 Tab 列表
 *
 * @param tabs - 组件原始 Tab 列表（带 key 或 id）。
 * @param config - Hub 配置对象。
 * @param widgetType - 微件类型 key。
 * @returns 仅保留可见 Tab 的数组；无配置时原样返回。
 */
export function filterTabsByVisible<T extends { key?: string; id?: string }>(
  tabs: T[],
  config: Record<string, unknown> | undefined,
  widgetType: string,
): T[] {
  const { visibleTabs } = normalizeHubTabConfig(config, widgetType)
  if (!visibleTabs.length) return tabs
  const visible = new Set(visibleTabs)
  return tabs.filter((t) => visible.has(resolveHubTabId(t)))
}

/**
 * 解析当前激活 Tab：优先 raw，否则默认 Tab；不在可见集合内时回退首个可见 Tab
 *
 * @param raw - 路由/外部传入的 Tab 标识。
 * @param config - Hub 配置对象。
 * @param widgetType - 微件类型 key。
 * @param visibleTabIds - 当前可见 Tab id 列表。
 * @returns 合法且可见的 Tab id。
 */
export function resolveHubTab(
  raw: string | undefined,
  config: Record<string, unknown> | undefined,
  widgetType: string,
  visibleTabIds: string[],
): string {
  const normalized = normalizeHubTabConfig(config, widgetType)
  let tab = raw || normalized.defaultTab
  if (visibleTabIds.includes(tab)) return tab
  return visibleTabIds[0] || normalized.defaultTab
}

/** 克隆 Hub Tab 草稿（规范化后复制数组，避免与原对象共享引用） */
export function cloneHubTabsDraft(
  raw: Record<string, unknown> | undefined,
  widgetType: string,
): HubTabConfig {
  const normalized = normalizeHubTabConfig(raw, widgetType)
  return {
    defaultTab: normalized.defaultTab,
    visibleTabs: [...normalized.visibleTabs],
  }
}

/**
 * 序列化 Hub Tab 草稿为可持久化结构
 *
 * 全部 Tab 可见时省略 visibleTabs 字段以减小配置体积；
 * 非全可见时显式写入 visibleTabs。
 */
export function serializeHubTabsConfig(
  draft: HubTabConfig,
  widgetType: string,
): Record<string, unknown> {
  const normalized = normalizeHubTabConfig(draft as unknown as Record<string, unknown>, widgetType)
  const allIds = getHubTabSet(widgetType)?.map((t) => t.id) ?? []
  const isAllVisible =
    allIds.length > 0 && allIds.every((id) => normalized.visibleTabs.includes(id))
  const out: Record<string, unknown> = { defaultTab: normalized.defaultTab }
  if (!isAllVisible) out.visibleTabs = normalized.visibleTabs
  return out
}
