/**
 * 天气 Hub 微件 Tab 选项与配置规范化
 *
 * 职责：
 * - 维护天气 Hub 的可选 Tab（实时 / 预报 / 生活 / 日出）。
 * - 提供天气 Hub 配置的规范化、克隆、序列化函数。
 *
 * 依赖：无外部依赖，纯静态配置与纯函数。
 *
 * 注意：
 * - `id`（current / forecast / life / sun）为 Tab 配置 key，不翻译。
 * - 仅 `label`（面向用户的 Tab 文案）使用简体中文。
 */
interface WeatherHubTabOption {
  id: string
  label: string
}

/** WEATHER_HUB_TABS：常量集合，成员语义见定义处。 */
export const WEATHER_HUB_TABS: WeatherHubTabOption[] = [
  { id: 'current', label: '实时' },
  { id: 'forecast', label: '预报' },
  { id: 'life', label: '生活' },
  { id: 'sun', label: '日出' },
]

const WEATHER_HUB_WIDGET_TYPES = new Set(['weather'])

const WEATHER_HUB_DEFAULT_VISIBLE_TABS = WEATHER_HUB_TABS.map((t) => t.id)

interface WeatherHubConfig {
  defaultTab?: string
  visibleTabs?: string[]
  forecastDays?: number
  weatherEntityId?: string
  showPresence?: boolean
  /** 日出 Tab 展示的人员 id（空=全部） */
  presencePersonIds?: string[]
}

/** 判定微件类型是否属于天气 Hub（当前仅 weather 一种） */
export function isWeatherHubWidgetType(type: string): boolean {
  return WEATHER_HUB_WIDGET_TYPES.has(type)
}

/**
 * 规范化天气 Hub 配置：校验 visibleTabs、补默认 defaultTab、约束预报天数 3-7
 *
 * @param raw - 用户原始配置。
 * @returns 含全部字段且类型完整的配置对象。
 */
export function normalizeWeatherHubConfig(
  raw: Record<string, unknown> | undefined,
  _widgetType = 'weather',
): Required<
  Pick<WeatherHubConfig, 'defaultTab' | 'visibleTabs' | 'forecastDays' | 'showPresence'>
> &
  WeatherHubConfig {
  const visibleRaw = Array.isArray(raw?.visibleTabs) ? raw.visibleTabs.map(String) : null
  const visibleTabs = visibleRaw?.filter((id) => WEATHER_HUB_TABS.some((t) => t.id === id)) || []

  const normalizedVisible = visibleTabs.length ? visibleTabs : [...WEATHER_HUB_DEFAULT_VISIBLE_TABS]

  let defaultTab = String(raw?.defaultTab || 'current')
  if (!normalizedVisible.includes(defaultTab)) {
    defaultTab = normalizedVisible[0] || 'current'
  }

  const forecastDaysRaw = Number(raw?.forecastDays)
  const forecastDays = Number.isFinite(forecastDaysRaw)
    ? Math.min(7, Math.max(3, Math.round(forecastDaysRaw)))
    : 7

  const weatherEntityId = String(raw?.weatherEntityId || '').trim()

  const presencePersonIds = Array.isArray(raw?.presencePersonIds)
    ? raw.presencePersonIds.map(String).filter(Boolean)
    : []

  return {
    defaultTab,
    visibleTabs: normalizedVisible,
    forecastDays,
    weatherEntityId,
    showPresence: raw?.showPresence !== false,
    presencePersonIds,
  }
}

export function cloneWeatherHubConfig(
  raw: Record<string, unknown> | undefined,
  widgetType = 'weather',
) {
  const normalized = normalizeWeatherHubConfig(raw, widgetType)
  return {
    defaultTab: normalized.defaultTab,
    visibleTabs: [...normalized.visibleTabs],
    forecastDays: normalized.forecastDays,
    ...(normalized.weatherEntityId ? { weatherEntityId: normalized.weatherEntityId } : {}),
    ...(normalized.showPresence === false ? { showPresence: false } : {}),
    ...(normalized.presencePersonIds?.length
      ? { presencePersonIds: [...normalized.presencePersonIds] }
      : {}),
  }
}

/** 序列化天气 Hub 草稿为可持久化结构（仅保留有意义的字段以减小配置体积） */
export function serializeWeatherHubConfig(draft: WeatherHubConfig) {
  const normalized = normalizeWeatherHubConfig(draft as Record<string, unknown>)
  const out: Record<string, unknown> = {
    defaultTab: normalized.defaultTab,
    visibleTabs: normalized.visibleTabs,
    forecastDays: normalized.forecastDays,
  }
  if (normalized.weatherEntityId) out.weatherEntityId = normalized.weatherEntityId
  if (normalized.showPresence === false) out.showPresence = false
  if (normalized.presencePersonIds?.length) out.presencePersonIds = normalized.presencePersonIds
  return out
}
