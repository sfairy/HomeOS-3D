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
/** parseGasMonthItem：常量，取值语义见定义处。 */
export const parseGasMonthItem = makeUtilityMeterParser({
  usageKeys: ['monthEleNum', 'usage', 'ele'],
  costKeys: ['monthEleCost', 'amount', 'cost'],
  labelKeys: ['month', 'date'],
  ...numericUsageCost,
})
/** parseGasYearItem：常量，取值语义见定义处。 */
export const parseGasYearItem = makeUtilityMeterParser({
  usageKeys: ['usage', 'yearEleNum', 'ele'],
  costKeys: ['amount', 'yearEleCost', 'cost'],
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
    usageKeys: ['usage'],
    costKeys: ['amount'],
    labelKeys: ['day', 'date'],
    ...rawFieldUsageCost,
  })(x, amountKey, usageKey)
}
/** parseWaterMonthItem：常量，取值语义见定义处。 */
export const parseWaterMonthItem = makeUtilityMeterParser({
  usageKeys: ['monthEleNum', 'ele'],
  costKeys: ['monthEleCost', 'cost'],
  labelKeys: ['month', 'date'],
  ...rawFieldUsageCost,
})
/** parseWaterYearItem：常量，取值语义见定义处。 */
export const parseWaterYearItem = makeUtilityMeterParser({
  usageKeys: ['yearEleNum', 'ele'],
  costKeys: ['yearEleCost', 'cost'],
  labelKeys: ['year', 'date'],
  ...rawFieldUsageCost,
})
