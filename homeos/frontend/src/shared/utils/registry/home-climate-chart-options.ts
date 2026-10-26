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
  /**
   * 实体 → 自定义显示名。键是实体 ID（如 `sensor.ke_ting_wen_du`），值是用户在
   * 后台配置里手填的房间名。
   *
   * 为什么按实体而不是按房间存：房间不是一等公民，只能从实体显示名推导出来；
   * 按实体存不会因为改名 / 换传感器而错位。配置面板在写入时会把同一房间的
   * 温度与湿度实体一起写上同样的名字，保证摘要里仍然合并成一行。
   */
  entityNames?: Record<string, string>
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
  return {
    temperatureEntities,
    humidityEntities,
    defaultView,
    entityNames: normalizeEntityNames(raw?.entityNames),
  }
}

/**
 * 清洗自定义名称表：丢掉空键 / 空值，值去首尾空白。
 *
 * 空值必须剔除而不是存 `{ id: '' }`：空字符串在读取侧会被当成「没有自定义名」，
 * 存下来只会让配置越滚越大，也容易在面板里被误判成「已改名」。
 */
function normalizeEntityNames(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, string> = {}
  for (const [entityId, name] of Object.entries(value as Record<string, unknown>)) {
    const key = String(entityId || '').trim()
    const label = String(name ?? '').trim()
    if (key && label) out[key] = label
  }
  return out
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
    entityNames: { ...n.entityNames },
  }
}

/** 序列化草稿为可持久化结构（与 normalize 输出对齐，剔除冗余字段） */
export function serializeHomeClimateChartConfig(draft: HomeClimateChartConfig) {
  const n = normalizeHomeClimateChartConfig(draft as Record<string, unknown>)
  return {
    temperatureEntities: n.temperatureEntities,
    humidityEntities: n.humidityEntities,
    defaultView: n.defaultView,
    entityNames: n.entityNames,
  }
}
