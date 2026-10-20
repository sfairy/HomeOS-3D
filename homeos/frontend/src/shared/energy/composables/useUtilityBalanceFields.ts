/** 抄表弹窗余额与阶梯统计字段组合式函数 */
import { computed, type ComputedRef, type Ref } from 'vue'
import { useRelativeDateLabel, useRemainingDays } from '@/shared/energy/composables/useUtilityMeter'
import {
  readPopupAttr as readPopupAttrUtil,
  parseJsonAttr,
  parseNumAttr,
} from '@/shared/energy/composables/utility-entity-helpers'
import type { HaEntityState } from '@/shared/types/entity-store'
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
  const dataDate = computed(
    () =>
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
        billingStandard.value?.[tierFieldMap.t1Limit || '年阶梯第2档起始水量'] || billingStandard.value?.tier_1_limit || 0,
      ),
    ).toFixed(0),
  )
  const t2l = computed(() =>
    parseFloat(
      String(
        billingStandard.value?.[tierFieldMap.t2Limit || '年阶梯第3档起始水量'] || billingStandard.value?.tier_2_limit || 0,
      ),
    ).toFixed(0),
  )
  const t1p = computed(() =>
    parseFloat(
      String(billingStandard.value?.[tierFieldMap.t1Price || '年阶梯第1档水价'] || billingStandard.value?.tier_1_price || 0),
    ).toFixed(2),
  )
  const t2p = computed(() =>
    parseFloat(
      String(billingStandard.value?.[tierFieldMap.t2Price || '年阶梯第2档水价'] || billingStandard.value?.tier_2_price || 0),
    ).toFixed(2),
  )
  const t3p = computed(() =>
    parseFloat(
      String(billingStandard.value?.[tierFieldMap.t3Price || '年阶梯第3档水价'] || billingStandard.value?.tier_3_price || 0),
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
