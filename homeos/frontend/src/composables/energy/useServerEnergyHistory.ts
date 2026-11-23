/**
 * 服务端能耗聚合（日/月表）→ 弹窗列表的数据源。
 *
 * 为什么需要：能耗弹窗原本只读 HA 属性里的 `daylist` / `monthlist`。一旦集成只暴露
 * 余额实体、或属性列表只有几天，弹窗就是空白 —— 而服务端日/月聚合表里其实有完整数据
 * （含国网 30 天日列表、回填补的历史）。这里按 `M`（30 天）/ `Y`（12 个月）各拉一次，
 * 转成与属性列表相同的条目形状，交给原有解析器复用，避免两套渲染逻辑。
 *
 * 口径取舍：
 * - 服务端只有「用量」，没有分时电价与费用；调用方会把同日属性条目的费用字段合并进来，
 *   所以这里只负责用量与日期。
 * - 服务端不可用（未登录 / 未授权 / 表还没数据）时保持空数组，弹窗继续用 HA 属性，
 *   不抛错、不阻塞弹窗打开。
 */
import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import { getEnergyHistory } from '@/services/api/energy'

/** 与属性列表同形状的原始条目（交给 parseDayItem / parseMonthItem 解析）。 */
export type ServerListItems = Record<string, unknown>[]

export interface ServerEnergyLists {
  dayItems: Ref<ServerListItems>
  monthItems: Ref<ServerListItems>
  /** 近 30 天费用（元）：服务端按 pricing 分区算出；无电价/非电时为 null */
  cost: Ref<number | null>
  /** 费用的数据来源是估算（峰谷模式按段时长占比拆分，日粒度无法精算） */
  costEstimated: Ref<boolean>
  /** 用能单位（电 kWh / 燃气、水 m³） */
  unit: Ref<string>
  reload: () => Promise<void>
}

/**
 * 拉取服务端日/月聚合，产出弹窗可直接消费的条目数组。
 *
 * @param enabled 电 / 燃气 / 水务账户都启用。单位由服务端按实体推导（kWh 或 m³），
 *  报表按 ``unit`` 分组，因此不同单位不会串味。
 */
export function useServerEnergyHistory(enabled: Ref<boolean>): ServerEnergyLists {
  const dayItems = ref<ServerListItems>([])
  const monthItems = ref<ServerListItems>([])
  const cost = ref<number | null>(null)
  const costEstimated = ref(false)
  const unit = ref('kWh')
  let loading = false
  let disposed = false

  async function reload() {
    if (!enabled.value || loading || disposed) return
    loading = true
    try {
      const [monthlyResponse, yearlyResponse] = await Promise.all([getEnergyHistory('M'), getEnergyHistory('Y')])
      if (disposed) return
      const monthly = monthlyResponse.data
      const yearly = yearlyResponse.data
      // `empty` 表示服务端这张表还没有该家庭的数据：保持空数组，让弹窗回退到属性列表。
      dayItems.value =
        monthly.source === 'empty' ? [] : monthly.series.map((point) => ({ day: point.date, dayEleNum: point.value }))
      monthItems.value =
        yearly.source === 'empty' ? [] : yearly.series.map((point) => ({ month: point.date, monthEleNum: point.value }))
      // 费用与单位只在服务端有数据时采用：空表时保持 null，弹窗回退到属性里的单价。
      cost.value = monthly.cost ?? null
      costEstimated.value = monthly.costEstimated === true
      unit.value = monthly.unit || 'kWh'
    } catch {
      // 服务端不可用属正常降级路径：清空，弹窗继续读 HA 属性。
      dayItems.value = []
      monthItems.value = []
      cost.value = null
      costEstimated.value = false
    } finally {
      loading = false
    }
  }

  onMounted(() => {
    void reload()
  })
  onBeforeUnmount(() => {
    disposed = true
  })

  return { dayItems, monthItems, cost, costEstimated, unit, reload }
}
