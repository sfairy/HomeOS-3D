/**
 * 温湿度读数的舒适度分级（纯函数，零运行时依赖）。
 *
 * 为什么单独成文件：分级阈值是产品口径，前端多处（摘要行、未来的工具提示）都要
 * 用同一套；抽出来后 `node --test` 能直接覆盖，改阈值也不必翻组件。
 *
 * 阈值参考常见室内舒适区间：
 *  - 温度 22–26 °C 记为舒适，16 °C 以下偏冷，29 °C 以上偏热；
 *  - 湿度 40–60% 记为舒适，30% 以下偏干，70% 以上偏湿。
 */

/** 分级 key，同时作为 CSS 类名后缀（`is-temp-comfortable` 等）。 */
type ClimateLevelKey = 'cold' | 'cool' | 'comfortable' | 'warm' | 'hot'

/** 湿度分级 key（与温度分开，避免「冷/热」用在湿度上语义错位）。 */
export type HumidityLevelKey = 'dry' | 'slightly-dry' | 'comfortable' | 'slightly-humid' | 'humid'

export interface ClimateLevel<K extends string = ClimateLevelKey | HumidityLevelKey> {
  key: K
  /** 无障碍文案用的中文名，例如「偏热」「干燥」 */
  label: string
}

/** 摄氏温度分级。传 `undefined` / `NaN` 时按「无读数」处理。 */
export function temperatureLevel(valueC: number | null | undefined): ClimateLevel | null {
  if (valueC == null || !Number.isFinite(valueC)) return null
  if (valueC < 16) return { key: 'cold', label: '偏冷' }
  if (valueC < 22) return { key: 'cool', label: '偏凉' }
  if (valueC <= 26) return { key: 'comfortable', label: '舒适' }
  if (valueC <= 29) return { key: 'warm', label: '偏热' }
  return { key: 'hot', label: '闷热' }
}

/** 相对湿度分级（单位 %）。 */
export function humidityLevel(value: number | null | undefined): ClimateLevel<HumidityLevelKey> | null {
  if (value == null || !Number.isFinite(value)) return null
  if (value < 30) return { key: 'dry', label: '干燥' }
  if (value < 40) return { key: 'slightly-dry', label: '偏干' }
  if (value <= 60) return { key: 'comfortable', label: '舒适' }
  if (value <= 70) return { key: 'slightly-humid', label: '偏湿' }
  return { key: 'humid', label: '潮湿' }
}

/**
 * 华氏度读数折算成摄氏度，供分级判断用。
 *
 * 只影响分级，不改变界面显示的数字 —— 用户绑的传感器报 °F 就继续显示 °F，
 * 但舒适度是按摄氏阈值算出来的。
 */
export function toCelsius(value: number, unit: string | null | undefined) {
  const normalized = String(unit || '').trim().toUpperCase()
  if (normalized.includes('F') && !normalized.includes('C')) return ((value - 32) * 5) / 9
  return value
}
