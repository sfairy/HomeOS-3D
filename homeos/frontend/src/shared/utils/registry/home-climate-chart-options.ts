/** 主页气候图表配置常量与规范化工具 */
export const HOME_CLIMATE_CHART_HOURS = 24

export type HomeClimateChartView = 'all' | 'temperature' | 'humidity'

/** HOME_CLIMATE_CHART_VIEW_OPTIONS：常量集合，成员语义见定义处。 */
export const HOME_CLIMATE_CHART_VIEW_OPTIONS: Array<{ id: HomeClimateChartView; label: string }> = [
  { id: 'all', label: '综合' },
  { id: 'temperature', label: '温度' },
  { id: 'humidity', label: '湿度' },
]

export interface HomeClimateChartConfig {
  temperatureEntities?: string[]
  humidityEntities?: string[]
  defaultView?: HomeClimateChartView
}

/**
 * 规范化主页气候图表配置：补齐默认值、清洗实体列表与视图 key
 *
 * @param raw - 用户原始配置；为空时使用默认空列表与综合视图。
 * @returns 含全部字段且类型完整的配置对象。
 */
export function normalizeHomeClimateChartConfig(
  raw?: Record<string, unknown>,
): Required<HomeClimateChartConfig> {
  const temperatureEntities = normalizeEntityList(raw?.temperatureEntities)
  const humidityEntities = normalizeEntityList(raw?.humidityEntities)
  const view = String(raw?.defaultView || 'all')
  const defaultView: HomeClimateChartView =
    view === 'temperature' || view === 'humidity' ? view : 'all'
  return { temperatureEntities, humidityEntities, defaultView }
}

/** 把字符串或数组形式的实体 ID 列表清洗为字符串数组（支持换行 / 逗号 / 空白分隔） */
function normalizeEntityList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((s) => String(s || '').trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value
      .split(/[\n,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}

export function cloneHomeClimateChartConfig(raw?: Record<string, unknown>) {
  const n = normalizeHomeClimateChartConfig(raw)
  return {
    temperatureEntities: [...n.temperatureEntities],
    humidityEntities: [...n.humidityEntities],
    defaultView: n.defaultView,
  }
}

/** 序列化草稿为可持久化结构（与 normalize 输出对齐，剔除冗余字段） */
export function serializeHomeClimateChartConfig(draft: HomeClimateChartConfig) {
  const n = normalizeHomeClimateChartConfig(draft as Record<string, unknown>)
  return {
    temperatureEntities: n.temperatureEntities,
    humidityEntities: n.humidityEntities,
    defaultView: n.defaultView,
  }
}
