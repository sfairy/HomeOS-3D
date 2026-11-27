import { computed, type ComputedRef, type Ref } from 'vue'
import { readPopupAttr as readPopupAttrUtil } from '@/domain/energy/model/composables'
import { type HaEntityState } from '@/kernel/types/entity'
import { parseJsonLoose } from '@/kernel/utils/core'

/** 抄表弹窗余额与阶梯统计字段组合式函数 */
/**
 * 水/电/气/综合抄表弹窗共用的余额、阶梯、统计 computed
 */
interface UtilityBalanceFieldsOpts {
  popField: (key: string) => unknown
  popNum: (key: string) => number | null
  ent: Ref<HaEntityState | null | undefined> | ComputedRef<HaEntityState | null | undefined>
  amountKey?: string
  usageKey?: string
  relClassPrefix?: string
  tierFieldMap?: Record<string, string>
}

export function useUtilityBalanceFields({
  popField,
  popNum,
  ent,
  amountKey = 'money',
  usageKey = 'usage',
  relClassPrefix = 'w',
  tierFieldMap = {} as Record<string, string>,
}: UtilityBalanceFieldsOpts) {
  function readPopupAttr(entity: HaEntityState | null | undefined, attributeKey: string) {
    return readPopupAttrUtil(entity, attributeKey)
  }
  function parseJson(input: unknown) {
    return parseJsonAttr(input)
  }
  function parseNumber(input: unknown) {
    return parseNumAttr(input)
  }
  const balance = computed(() => {
    const balanceValue = popNum('balance') ?? parseNumber(ent.value?.state)
    return balanceValue != null ? balanceValue.toFixed(2) : '--'
  })
  const lastDate = computed(
    () =>
      popField('refreshTime') ||
      readPopupAttr(ent.value, 'payment_date') ||
      readPopupAttr(ent.value, 'last_payment_date') ||
      '',
  )
  const dataDate = computed(() =>
    String(
      popField('dailyDate') ||
        readPopupAttr(ent.value, 'daily_lasted_date') ||
        readPopupAttr(ent.value, 'update_time') ||
        readPopupAttr(ent.value, 'latest_data') ||
        '',
    ),
  )
  const { relLabel, relClass } = useRelativeDateLabel(dataDate, relClassPrefix)
  const billingStandard = computed(() => {
    const parsed = parseJson(popField('billingStandard'))
    const fromAttr =
      readPopupAttr(ent.value, '计费标准') ||
      readPopupAttr(ent.value, 'billing_standard') ||
      (() => {
        const data = readPopupAttr(ent.value, 'data')
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          return (data as Record<string, unknown>)['计费标准']
        }
        return undefined
      })()
    const raw = parsed || fromAttr || {}
    return (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  })
  const pmode = computed(() => {
    const billing = billingStandard.value
    if (!billing || !Object.keys(billing).length) return 'tiered'
    return billing.计费标准 === '平均单价' || billing.pricing_mode === 'fixed' ? 'fixed' : 'tiered'
  })
  const annualTier = computed(() => {
    const tier = popNum('currentTier')
    if (tier != null && tier >= 1 && tier <= 3) return Math.floor(tier)
    const billing = billingStandard.value
    if (billing?.当前年阶梯档) return parseInt(String(billing.当前年阶梯档).replace(/[^0-9]/g, ''), 10) || 1
    return 1
  })
  const tLabel = computed(() => (pmode.value === 'fixed' ? '固定单价' : `第${annualTier.value}档`))
  const t1l = computed(() =>
    parseFloat(
      String(
        billingStandard.value?.[tierFieldMap.t1Limit || '年阶梯第2档起始水量'] ||
          billingStandard.value?.tier_1_limit ||
          0,
      ),
    ).toFixed(0),
  )
  const t2l = computed(() =>
    parseFloat(
      String(
        billingStandard.value?.[tierFieldMap.t2Limit || '年阶梯第3档起始水量'] ||
          billingStandard.value?.tier_2_limit ||
          0,
      ),
    ).toFixed(0),
  )
  const t1p = computed(() =>
    parseFloat(
      String(
        billingStandard.value?.[tierFieldMap.t1Price || '年阶梯第1档水价'] || billingStandard.value?.tier_1_price || 0,
      ),
    ).toFixed(2),
  )
  const t2p = computed(() =>
    parseFloat(
      String(
        billingStandard.value?.[tierFieldMap.t2Price || '年阶梯第2档水价'] || billingStandard.value?.tier_2_price || 0,
      ),
    ).toFixed(2),
  )
  const t3p = computed(() =>
    parseFloat(
      String(
        billingStandard.value?.[tierFieldMap.t3Price || '年阶梯第3档水价'] || billingStandard.value?.tier_3_price || 0,
      ),
    ).toFixed(2),
  )
  const price = computed(() => {
    const unit = popNum('unitPrice')
    if (unit != null && unit > 0) return unit.toFixed(2)
    if (pmode.value === 'tiered') {
      if (annualTier.value === 1) return t1p.value
      if (annualTier.value === 2) return t2p.value
      if (annualTier.value === 3) return t3p.value
    }
    const billing = billingStandard.value
    if (billing.平均单价) return parseFloat(String(billing.平均单价)).toFixed(2)
    if (billing.avg_price || billing.fixed_price)
      return parseFloat(String(billing.avg_price || billing.fixed_price)).toFixed(2)
    const dayList = parseJson(popField('daylist')) ?? parseJson(readPopupAttr(ent.value, 'daylist'))
    if (Array.isArray(dayList) && dayList.length) {
      const lastDay = dayList[dayList.length - 1] as Record<string, unknown>
      const usage = parseFloat(String(lastDay[usageKey] || lastDay.usage || 0))
      const amt = parseFloat(String(lastDay[amountKey] || lastDay.amount || 0))
      if (usage > 0 && amt > 0) {
        const unitPrice = amt / usage
        if (!isNaN(unitPrice) && unitPrice > 0) return unitPrice.toFixed(2)
      }
    }
    return '--'
  })
  const { remDays, remDate } = useRemainingDays(ent, readPopupAttr, parseJson, parseNumber, amountKey)
  const curYear = computed(() => String(new Date().getFullYear()))
  const mUsage = computed(() => {
    const monthUsage = popNum('monthNum')
    return monthUsage != null ? monthUsage.toFixed(1) : '--'
  })
  const mCost = computed(() => {
    const monthCost = popNum('monthCost')
    return monthCost != null ? monthCost.toFixed(1) : '--'
  })
  const yUsage = computed(() => {
    const yearUsage = popNum('yearNum')
    return yearUsage != null ? yearUsage.toFixed(1) : '--'
  })
  const yCost = computed(() => {
    const yearCost = popNum('yearCost')
    return yearCost != null ? yearCost.toFixed(1) : '--'
  })
  const lmUsage = computed(() => {
    const lastMonthUsage = popNum('lastMonthNum')
    return lastMonthUsage != null ? lastMonthUsage.toFixed(1) : '--'
  })
  const lmCost = computed(() => {
    const lastMonthCost = popNum('lastMonthCost')
    return lastMonthCost != null ? lastMonthCost.toFixed(1) : '--'
  })
  const dUsage = computed(() => {
    const dailyUsage = popNum('dailyNum')
    return dailyUsage != null ? dailyUsage.toFixed(1) : '--'
  })
  const dCost = computed(() => {
    const dailyCost = popNum('dailyCost')
    return dailyCost != null ? dailyCost.toFixed(2) : '--'
  })
  return {
    balance,
    lastDate,
    dataDate,
    relLabel,
    relClass,
    bs: billingStandard,
    pmode,
    at: annualTier,
    tLabel,
    t1l,
    t2l,
    t1p,
    t2p,
    t3p,
    price,
    remDays,
    remDate,
    curYear,
    mUsage,
    mCost,
    yUsage,
    yCost,
    lmUsage,
    lmCost,
    dUsage,
    dCost,
  }
}

/** 水电燃气抄表相对日期与剩余天数计算工具 */
/**
 * 计算数据日期的相对标签
 * @param {import('vue').ComputedRef<string>} dataDate - 数据日期字符串
 * @param {string} prefix - CSS 类名前缀（如 'ele', 'gas', 'w'）
 * @returns {{ relLabel, relClass }}
 */
export function useRelativeDateLabel(dataDate: ComputedRef<unknown> | Ref<unknown>, prefix: string) {
  const relMeta = computed(() => {
    const dateValue = dataDate.value
    if (dateValue == null || dateValue === '') return { label: '', classSuffix: '' }
    const parts = String(dateValue).split('-')
    const dataLocal = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
    const todayLocal = new Date()
    todayLocal.setHours(0, 0, 0, 0)
    const daysAgo = Math.floor((todayLocal.getTime() - dataLocal.getTime()) / 86400000)
    if (daysAgo === 0) return { label: '今天', classSuffix: 'today' }
    if (daysAgo === 1) return { label: '昨天', classSuffix: 'yesterday' }
    if (daysAgo === 2) return { label: '前天', classSuffix: 'daybefore' }
    if (daysAgo <= 7) return { label: '近一周', classSuffix: 'week' }
    if (daysAgo <= 14) return { label: '近两周', classSuffix: '2week' }
    if (daysAgo <= 30) return { label: '近一月', classSuffix: 'month' }
    return { label: `${daysAgo}天前`, classSuffix: 'old' }
  })
  const relLabel = computed(() => relMeta.value.label)
  const relClass = computed(() => (relMeta.value.classSuffix ? `${prefix}-rel--${relMeta.value.classSuffix}` : ''))
  return { relLabel, relClass }
}
/**
 * 解析日期字符串，返回 { year?, month, day }
 * 支持格式：YYYY-MM-DD 或 M.D
 * @param {string} label
 * @returns {{ year?: number, month: number, day: number } | null}
 */
export function parseDateParts(label: string | null | undefined) {
  if (!label) return null
  const match = label.match(/(\d{4})-(\d{2})-(\d{2})/) || label.match(/(\d{1,2})\.(\d{1,2})/)
  if (!match) return null
  if (match.length === 4) {
    return { year: parseInt(match[1]), month: parseInt(match[2]), day: parseInt(match[3]) }
  }
  return { month: parseInt(match[1]), day: parseInt(match[2]) }
}
/**
 * 计算预估剩余天数
 * @param {Object} entity - HA 实体
 * @param {(e: Object, key: string) => unknown} getAttr - 获取属性函数
 * @param {(json: unknown) => unknown} parseJson - 解析 JSON 函数
 * @param {(state: string) => number|null} parseNum - 字符串转数字
 * @param {string} costField - 费用字段名（如 'dayEleCost'）
 * @returns {{ remDays, remDate }}
 */
export function useRemainingDays(
  entity: Ref<HaEntityState | null | undefined> | ComputedRef<HaEntityState | null | undefined>,
  getAttr: (entityState: HaEntityState | null | undefined, key: string) => unknown,
  parseJson: (json: unknown) => unknown,
  parseNum: (state: string | undefined) => number | null,
  costField: string,
) {
  const remDays = computed(() => {
    const remainingDaysAttr = getAttr(entity.value, 'remaining_days')
    if (remainingDaysAttr != null) {
      const remainingDaysNumber = parseInt(String(remainingDaysAttr), 10)
      if (!isNaN(remainingDaysNumber) && remainingDaysNumber >= 0) return remainingDaysNumber
    }
    const stateValue = parseNum(entity.value?.state)
    if (stateValue == null) return '--'
    const dayList = parseJson(getAttr(entity.value, 'daylist'))
    if (!Array.isArray(dayList) || !dayList.length) return '--'
    const recent = dayList.slice(0, 30)
    let totalCost = 0,
      countedDays = 0
    recent.forEach((x) => {
      const row = x as Record<string, unknown>
      const cost = parseFloat(String(row[costField] || row.cost || 0))
      if (cost > 0) {
        totalCost += cost
        countedDays++
      }
    })
    if (countedDays === 0) return '--'
    const avg = totalCost / countedDays
    if (avg <= 0) return '--'
    return Math.floor(stateValue / avg)
  })
  const remDate = computed(() => {
    if (remDays.value === '--' || remDays.value <= 0) return ''
    const remainingDate = new Date(Date.now() + remDays.value * 86400000)
    return `${remainingDate.getMonth() + 1}.${remainingDate.getDate()}`
  })
  return { remDays, remDate }
}

/** 公用事业实体辅助函数：从 HA 实体读取并解析弹窗属性值。 */

/**
 * 从 HA 实体读取弹窗属性值。
 *
 * 查找顺序：
 *  1. 实体顶层 attributes[name]；
 *  2. 嵌套 attributes.data[name]（部分集成会将数据包裹在 data 子对象中）。
 *
 * @param entity HA 实体状态，可为 null/undefined
 * @param name   属性名（与 HA 集成原始 payload key 一致，不做转换）
 * @returns 属性值；不存在时返回 undefined
 */
export function readPopupAttr(entity: HaEntityState | null | undefined, name: string) {
  if (!entity?.attributes) return undefined
  if (entity.attributes[name] !== undefined) return entity.attributes[name]
  const data = entity.attributes.data
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return (data as Record<string, unknown>)[name]
  }
  return undefined
}

/**
 * 解析 JSON 字符串；若已是数组或对象则原样返回。
 * 使用 'null' 容错策略：解析失败时返回 null，避免抛错中断 UI 渲染。
 * @param value 待解析的值（可能是 JSON 字符串、数组、对象或其他类型）
 * @returns 解析后的数组/对象，或 null
 */
export const parseJsonAttr = (value: unknown) => parseJsonLoose(value, 'null')

/**
 * 解析数值字符串。
 * @param value 待解析的值（字符串、数字等）
 * @returns 解析得到的数字；非数字时返回 null（不抛异常）
 */
export function parseNumAttr(value: unknown) {
  const v = parseFloat(String(value ?? ''))
  return Number.isNaN(v) ? null : v
}

/**
 * 公用事业仪表弹窗图表数据的共享解析器。
 */
type MeterRow = Record<string, unknown>

interface UtilityMeterParserOpts {
  usageKeys: string[]
  costKeys: string[]
  labelKeys: string[]
  formatUsage?: (raw: unknown, usageValue: number) => string
  formatCost?: (raw: unknown, costValue: number) => string
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
  return function parseItem(x: MeterRow, amountKey?: string | null, usageKey?: string | null): UtilityMeterParsedItem {
    const usage = parseFloat(
      String(
        (usageKey && x[usageKey]) ?? usageKeys.reduce<unknown>((accumulated, k) => accumulated ?? x[k], undefined) ?? 0,
      ),
    )
    const cost = parseFloat(
      String(
        (amountKey && x[amountKey]) ??
          costKeys.reduce<unknown>((accumulated, k) => accumulated ?? x[k], undefined) ??
          0,
      ),
    )
    const label = String(labelKeys.reduce<unknown>((accumulated, k) => accumulated || x[k], '') || '') || ''
    const usageRaw =
      (usageKey && x[usageKey]) ?? usageKeys.reduce<unknown>((accumulated, k) => accumulated ?? x[k], undefined)
    const costRaw =
      (amountKey && x[amountKey]) ?? costKeys.reduce<unknown>((accumulated, k) => accumulated ?? x[k], undefined)
    return {
      _label: label,
      _usage: usage,
      _cost: cost,
      _usageStr: formatUsage ? formatUsage(usageRaw, usage) : String(usage > 0 ? usage.toFixed(1) : '--'),
      _costStr: formatCost ? formatCost(costRaw, cost) : String(cost > 0 ? cost.toFixed(2) : '--'),
      _time: label,
    }
  }
}
const numericUsageCost = {
  formatUsage: (_raw: unknown, usage: number) => String(usage > 0 ? usage.toFixed(1) : '--'),
  formatCost: (_raw: unknown, cost: number) => String(cost > 0 ? cost.toFixed(2) : '--'),
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
 * 这两类表的历史列表由供应商集成直接给出，字段名必须是「气/水」语义，不能复用电力字段名
 * （`monthEleNum` / `monthEleCost` / `yearEleNum` / `ele`）：useUtilityMeterPopup 调用
 * 月/年解析器时并不传 amountKey/usageKey，复用会把同一份 payload 里的电力用量（kWh）
 * 当成用气量（m³）渲染。
 */
const FLUID_USAGE_KEYS = ['usage', 'cycleTotalVolume']
const FLUID_COST_KEYS = ['amount', 'cycleTotalValues', 'money', 'cost']
/** parseGasMonthItem：常量，取值语义见定义处。 */
export const parseGasMonthItem = makeUtilityMeterParser({
  usageKeys: FLUID_USAGE_KEYS,
  costKeys: FLUID_COST_KEYS,
  // `readingTime` 与日明细同一个字段名（部分燃气/水集成三类明细都用它）。
  // 不列它的话月/年列表的 `_label` 是空串，日历与年视图都读不出日期。
  labelKeys: ['month', 'readingTime', 'date'],
  ...numericUsageCost,
})
/** parseGasYearItem：常量，取值语义见定义处。 */
export const parseGasYearItem = makeUtilityMeterParser({
  usageKeys: FLUID_USAGE_KEYS,
  costKeys: FLUID_COST_KEYS,
  labelKeys: ['year', 'readingTime', 'date'],
  ...numericUsageCost,
})
/** parseGridDayItem：常量，取值语义见定义处。 */
export const parseGridDayItem = makeUtilityMeterParser({
  // `usage` 排在最前：服务端聚合条目用中性字段名（电 / 气 / 水共用同一条渲染链），
  // 合并属性条目时它必须压过属性里的 `dayEleNum` —— 否则日期来自服务端窗口、
  // 用量却来自属性里的上个月整月表，日历会显示错位的数据。
  usageKeys: ['usage', 'dayEleNum', 'ele'],
  costKeys: ['dayEleCost', 'cost'],
  labelKeys: ['day', 'date'],
  ...rawFieldUsageCost,
})
/** parseGridMonthItem：常量，取值语义见定义处。 */
export const parseGridMonthItem = makeUtilityMeterParser({
  usageKeys: ['usage', 'monthEleNum', 'ele'],
  costKeys: ['monthEleCost', 'cost'],
  labelKeys: ['month', 'date'],
  ...rawFieldUsageCost,
})
/** parseGridYearItem：常量，取值语义见定义处。 */
export const parseGridYearItem = makeUtilityMeterParser({
  usageKeys: ['usage', 'yearEleNum', 'ele'],
  costKeys: ['yearEleCost', 'cost'],
  labelKeys: ['year', 'date'],
  ...rawFieldUsageCost,
})
export function parseWaterDayItem(x: MeterRow, amountKey: string = 'money', usageKey: string = 'usage') {
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
