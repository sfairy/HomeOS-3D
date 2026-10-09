/**
 * 公用事业仪表弹窗图表数据的共享解析器。
 */
type MeterRow = Record<string, unknown>

interface UtilityMeterParserOpts {
  usageKeys: string[]
  costKeys: string[]
  labelKeys: string[]
  formatUsage?: (raw: unknown, u: number) => string
  formatCost?: (raw: unknown, c: number) => string
}

export interface UtilityMeterParsedItem {
  _label: string
  _usage: number
  _cost: number
  _usageStr: string
  _costStr: string
  _time: string
  _isMax?: boolean
  _isMin?: boolean
}

function makeUtilityMeterParser(opts: UtilityMeterParserOpts) {
  const { usageKeys, costKeys, labelKeys, formatUsage, formatCost } = opts
  return function parseItem(
    x: MeterRow,
    amountKey?: string | null,
    usageKey?: string | null,
  ): UtilityMeterParsedItem {
    const u = parseFloat(
      String(
        (usageKey && x[usageKey]) ??
          usageKeys.reduce<unknown>((v, k) => v ?? x[k], undefined) ??
          0,
      ),
    )
    const c = parseFloat(
      String(
        (amountKey && x[amountKey]) ??
          costKeys.reduce<unknown>((v, k) => v ?? x[k], undefined) ??
          0,
      ),
    )
    const label =
      String(labelKeys.reduce<unknown>((v, k) => v || x[k], '') || '') || ''
    const usageRaw =
      (usageKey && x[usageKey]) ?? usageKeys.reduce<unknown>((v, k) => v ?? x[k], undefined)
    const costRaw =
      (amountKey && x[amountKey]) ?? costKeys.reduce<unknown>((v, k) => v ?? x[k], undefined)
    return {
      _label: label,
      _usage: u,
      _cost: c,
      _usageStr: formatUsage ? formatUsage(usageRaw, u) : String(u > 0 ? u.toFixed(1) : '--'),
      _costStr: formatCost ? formatCost(costRaw, c) : String(c > 0 ? c.toFixed(2) : '--'),
      _time: label,
    }
  }
}
const numericUsageCost = {
  formatUsage: (_raw: unknown, u: number) => String(u > 0 ? u.toFixed(1) : '--'),
  formatCost: (_raw: unknown, c: number) => String(c > 0 ? c.toFixed(2) : '--'),
}
const rawFieldUsageCost = {
  formatUsage: (raw: unknown) => (raw ?? '--') as string,
  formatCost: (raw: unknown) => (raw ?? '--') as string,
}
/** parseGasDayItem：常量，取值语义见定义处。 */
export const parseGasDayItem = makeUtilityMeterParser({
  usageKeys: ['usage', 'cycleTotalVolume'],
  costKeys: ['amount', 'cycleTotalValues'],
  labelKeys: ['readingTime', 'day', 'date'],
  ...numericUsageCost,
})
/**
 * 燃气 / 水表的通用字段名。
 *
 * 这两类表的历史列表由供应商集成直接给出，字段名必须是「气/水」语义；
 * 旧实现复用了电力字段名（`monthEleNum` / `monthEleCost` / `yearEleNum` / `ele`），
 * 而 useUtilityMeterPopup 调用月/年解析器时并不传 amountKey/usageKey，
 * 于是燃气弹窗的月度曲线会把同一份 payload 里的电力用量（kWh）当成用气量（m³）渲染。
 */
const FLUID_USAGE_KEYS = ['usage', 'cycleTotalVolume']
const FLUID_COST_KEYS = ['amount', 'cycleTotalValues', 'money', 'cost']
/** parseGasMonthItem：常量，取值语义见定义处。 */
export const parseGasMonthItem = makeUtilityMeterParser({
  usageKeys: FLUID_USAGE_KEYS,
  costKeys: FLUID_COST_KEYS,
  labelKeys: ['month', 'date'],
  ...numericUsageCost,
})
/** parseGasYearItem：常量，取值语义见定义处。 */
export const parseGasYearItem = makeUtilityMeterParser({
  usageKeys: FLUID_USAGE_KEYS,
  costKeys: FLUID_COST_KEYS,
  labelKeys: ['year', 'date'],
  ...numericUsageCost,
})
/** parseGridDayItem：常量，取值语义见定义处。 */
export const parseGridDayItem = makeUtilityMeterParser({
  usageKeys: ['dayEleNum', 'ele'],
  costKeys: ['dayEleCost', 'cost'],
  labelKeys: ['day', 'date'],
  ...rawFieldUsageCost,
})
/** parseGridMonthItem：常量，取值语义见定义处。 */
export const parseGridMonthItem = makeUtilityMeterParser({
  usageKeys: ['monthEleNum', 'ele'],
  costKeys: ['monthEleCost', 'cost'],
  labelKeys: ['month', 'date'],
  ...rawFieldUsageCost,
})
/** parseGridYearItem：常量，取值语义见定义处。 */
export const parseGridYearItem = makeUtilityMeterParser({
  usageKeys: ['yearEleNum', 'ele'],
  costKeys: ['yearEleCost', 'cost'],
  labelKeys: ['year', 'date'],
  ...rawFieldUsageCost,
})
export function parseWaterDayItem(
  x: MeterRow,
  amountKey: string = 'money',
  usageKey: string = 'usage',
) {
  return makeUtilityMeterParser({
    usageKeys: FLUID_USAGE_KEYS,
    costKeys: FLUID_COST_KEYS,
    labelKeys: ['day', 'date'],
    ...rawFieldUsageCost,
  })(x, amountKey, usageKey)
}
/** parseWaterMonthItem：常量，取值语义见定义处。 */
export const parseWaterMonthItem = makeUtilityMeterParser({
  usageKeys: FLUID_USAGE_KEYS,
  costKeys: FLUID_COST_KEYS,
  labelKeys: ['month', 'date'],
  ...rawFieldUsageCost,
})
/** parseWaterYearItem：常量，取值语义见定义处。 */
export const parseWaterYearItem = makeUtilityMeterParser({
  usageKeys: FLUID_USAGE_KEYS,
  costKeys: FLUID_COST_KEYS,
  labelKeys: ['year', 'date'],
  ...rawFieldUsageCost,
})
