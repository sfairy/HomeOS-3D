/**
 * 抄表弹窗余额与阶梯统计字段组合式函数
 *
 * 所属模块：composables/energy
 * 职责：为水/电/气/综合抄表弹窗提供统一的余额、阶梯、统计类 computed 字段组装，
 *      涵盖当前余额、数据日期相对标签、计费标准（固定单价/阶梯价）、当前阶梯档、
 *      阶梯价目、当前单价、预估剩余天数、月/年/上月/日用量与费用等展示字段。
 * 入参（UtilityBalanceFieldsOpts）：
 *   - popField/popNum：弹窗字段读取器（字符串/数字）
 *   - ent：HA 实体引用（用于属性回退）
 *   - amountKey/usageKey：日消费/用量字段名映射
 *   - tierFieldMap：阶梯字段名的中英文自定义映射
 * 返回：二十余个 computed 字段，供弹窗模板直接绑定。
 * 依赖：useUtilityMeter（相对日期 + 剩余天数）、utility-entity-helpers（属性解析）。
 */
import { computed, type ComputedRef, type Ref } from 'vue'
import { useRelativeDateLabel, useRemainingDays } from '@/composables/energy/useUtilityMeter'
import {
  readPopupAttr as readPopupAttrUtil,
  parseJsonAttr,
  parseNumAttr,
} from '@/composables/energy/utility-entity-helpers'
import type { HaEntityState } from '@/types/entity-store'
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

/** useUtilityBalanceFields：函数，按签名入参返回处理结果。 */
export function useUtilityBalanceFields({
  popField,
  popNum,
  ent,
  amountKey = 'money',
  usageKey = 'usage',
  relClassPrefix = 'w',
  tierFieldMap = {} as Record<string, string>,
}: UtilityBalanceFieldsOpts) {
  function a(e: HaEntityState | null | undefined, n: string) {
    return readPopupAttrUtil(e, n)
  }
  function j(v: unknown) {
    return parseJsonAttr(v)
  }
  function n(s: unknown) {
    return parseNumAttr(s)
  }
  const balance = computed(() => {
    const v = popNum('balance') ?? n(ent.value?.state)
    return v != null ? v.toFixed(2) : '--'
  })
  const lastDate = computed(
    () =>
      popField('refreshTime') ||
      a(ent.value, 'payment_date') ||
      a(ent.value, 'last_payment_date') ||
      '',
  )
  const dataDate = computed(
    () =>
      String(
        popField('dailyDate') ||
          a(ent.value, 'daily_lasted_date') ||
          a(ent.value, 'update_time') ||
          a(ent.value, 'latest_data') ||
          '',
      ),
  )
  const { relLabel, relClass } = useRelativeDateLabel(dataDate, relClassPrefix)
  const bs = computed(() => {
    const parsed = j(popField('billingStandard'))
    const fromAttr =
      a(ent.value, '计费标准') ||
      a(ent.value, 'billing_standard') ||
      (() => {
        const data = a(ent.value, 'data')
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          return (data as Record<string, unknown>)['计费标准']
        }
        return undefined
      })()
    const raw = parsed || fromAttr || {}
    return (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  })
  const pmode = computed(() => {
    const b = bs.value
    if (!b || !Object.keys(b).length) return 'tiered'
    return b.计费标准 === '平均单价' || b.pricing_mode === 'fixed' ? 'fixed' : 'tiered'
  })
  const at = computed(() => {
    const tier = popNum('currentTier')
    if (tier != null && tier >= 1 && tier <= 3) return Math.floor(tier)
    const b = bs.value
    if (b?.当前年阶梯档) return parseInt(String(b.当前年阶梯档).replace(/[^0-9]/g, ''), 10) || 1
    return 1
  })
  const tLabel = computed(() => (pmode.value === 'fixed' ? '固定单价' : `第${at.value}档`))
  const t1l = computed(() =>
    parseFloat(
      String(
        bs.value?.[tierFieldMap.t1Limit || '年阶梯第2档起始水量'] || bs.value?.tier_1_limit || 0,
      ),
    ).toFixed(0),
  )
  const t2l = computed(() =>
    parseFloat(
      String(
        bs.value?.[tierFieldMap.t2Limit || '年阶梯第3档起始水量'] || bs.value?.tier_2_limit || 0,
      ),
    ).toFixed(0),
  )
  const t1p = computed(() =>
    parseFloat(
      String(bs.value?.[tierFieldMap.t1Price || '年阶梯第1档水价'] || bs.value?.tier_1_price || 0),
    ).toFixed(2),
  )
  const t2p = computed(() =>
    parseFloat(
      String(bs.value?.[tierFieldMap.t2Price || '年阶梯第2档水价'] || bs.value?.tier_2_price || 0),
    ).toFixed(2),
  )
  const t3p = computed(() =>
    parseFloat(
      String(bs.value?.[tierFieldMap.t3Price || '年阶梯第3档水价'] || bs.value?.tier_3_price || 0),
    ).toFixed(2),
  )
  const price = computed(() => {
    const unit = popNum('unitPrice')
    if (unit != null && unit > 0) return unit.toFixed(2)
    if (pmode.value === 'tiered') {
      if (at.value === 1) return t1p.value
      if (at.value === 2) return t2p.value
      if (at.value === 3) return t3p.value
    }
    const b = bs.value
    if (b.平均单价) return parseFloat(String(b.平均单价)).toFixed(2)
    if (b.avg_price || b.fixed_price)
      return parseFloat(String(b.avg_price || b.fixed_price)).toFixed(2)
    const d = j(popField('daylist')) ?? j(a(ent.value, 'daylist'))
    if (Array.isArray(d) && d.length) {
      const l = d[d.length - 1] as Record<string, unknown>
      const u = parseFloat(String(l[usageKey] || l.usage || 0))
      const amt = parseFloat(String(l[amountKey] || l.amount || 0))
      if (u > 0 && amt > 0) {
        const p = amt / u
        if (!isNaN(p) && p > 0) return p.toFixed(2)
      }
    }
    return '--'
  })
  const { remDays, remDate } = useRemainingDays(ent, a, j, n, amountKey)
  const curYear = computed(() => String(new Date().getFullYear()))
  const mUsage = computed(() => {
    const v = popNum('monthNum')
    return v != null ? v.toFixed(1) : '--'
  })
  const mCost = computed(() => {
    const v = popNum('monthCost')
    return v != null ? v.toFixed(1) : '--'
  })
  const yUsage = computed(() => {
    const v = popNum('yearNum')
    return v != null ? v.toFixed(1) : '--'
  })
  const yCost = computed(() => {
    const v = popNum('yearCost')
    return v != null ? v.toFixed(1) : '--'
  })
  const lmUsage = computed(() => {
    const v = popNum('lastMonthNum')
    return v != null ? v.toFixed(1) : '--'
  })
  const lmCost = computed(() => {
    const v = popNum('lastMonthCost')
    return v != null ? v.toFixed(1) : '--'
  })
  const dUsage = computed(() => {
    const v = popNum('dailyNum')
    return v != null ? v.toFixed(1) : '--'
  })
  const dCost = computed(() => {
    const v = popNum('dailyCost')
    return v != null ? v.toFixed(2) : '--'
  })
  return {
    balance,
    lastDate,
    dataDate,
    relLabel,
    relClass,
    bs,
    pmode,
    at,
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
