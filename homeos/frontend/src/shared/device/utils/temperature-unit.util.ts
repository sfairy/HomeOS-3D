/**
 * 温度单位的唯一解析入口。
 *
 * 背景（审计 U-04）：空调弹窗、设备组列表等处把 `°C` 写死在模板里，而 HA 的
 * climate 实体本身会声明 `temperature_unit`（`°C` / `°F` / `K`），传感器则用
 * `unit_of_measurement`。用 °F 部署时界面会显示「23°C」这种与实际单位不符的文案。
 *
 * 解析顺序：`temperature_unit`（climate 实体的权威字段）
 * → `unit_of_measurement`（传感器 / 通用实体）
 * → `°C`（本项目默认交付地区）。
 *
 * 注意 `K` 不做换算：HA 里极少出现，且换算需要知道源单位语义；这里只保证**标签**正确。
 */

/** HA climate 实体可能声明的温度单位。 */
const CLIMATE_TEMPERATURE_UNITS = new Set(['°C', '°F', 'K'])

/** 默认单位：与后端默认交付地区（中国）一致。 */
export const DEFAULT_TEMPERATURE_UNIT = '°C'

/**
 * 从实体属性解析温度单位。
 *
 * @param attributes 实体 attributes（可为 null / 非对象）
 * @returns 单位文本，如 `°C` / `°F` / `K`
 */
export function resolveTemperatureUnit(attributes: unknown): string {
  const attrs = (attributes ?? {}) as Record<string, unknown>
  const climateUnit = String(attrs.temperature_unit ?? '').trim()
  if (CLIMATE_TEMPERATURE_UNITS.has(climateUnit)) return climateUnit
  const measuredUnit = String(attrs.unit_of_measurement ?? '').trim()
  if (measuredUnit) return measuredUnit
  return DEFAULT_TEMPERATURE_UNIT
}

/**
 * 数值 + 单位（无值时返回 `--`）。
 *
 * @param value 数值或数值字符串；``null`` / ``undefined`` / 非有限数视为无值
 * @param unit 单位文本（应来自 :func:`resolveTemperatureUnit`）
 * @returns 例如 `23.5 °C` 或 `--`
 */
export function formatTemperature(value: unknown, unit: string): string {
  if (value === null || value === undefined || value === '') return '--'
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '--'
  return `${numeric}${unit}`
}
