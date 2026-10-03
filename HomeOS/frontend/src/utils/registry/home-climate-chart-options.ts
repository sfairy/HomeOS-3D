/**
 * 主页气候图表配置常量与规范化工具
 *
 * 职责：
 * - 维护主页气候图表的小时跨度、视图切换选项（综合 / 温度 / 湿度）。
 * - 提供图表配置的规范化、克隆、序列化函数，供设置页与画布组件共用。
 *
 * 依赖：无外部依赖，纯静态配置与纯函数。
 *
 * 注意：
 * - `HomeClimateChartView`（all / temperature / humidity）为视图 key，不翻译。
 * - 仅面向用户的 label（综合 / 温度 / 湿度）使用简体中文。
 */
export const HOME_CLIMATE_CHART_HOURS = 24

/** HomeClimateChartView：类型定义，字段语义见声明。 */
export type HomeClimateChartView = 'all' | 'temperature' | 'humidity'

/** HOME_CLIMATE_CHART_VIEW_OPTIONS：常量集合，成员语义见定义处。 */
export const HOME_CLIMATE_CHART_VIEW_OPTIONS: Array<{ id: HomeClimateChartView; label: string }> = [
  { id: 'all', label: '综合' },
  { id: 'temperature', label: '温度' },
  { id: 'humidity', label: '湿度' },
]

/** HomeClimateChartConfig：类型定义，字段语义见声明。 */
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

/** cloneHomeClimateChartConfig：函数，按签名入参返回处理结果。 */
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
