/**
 * @file useEnergyDashboard.ts
 * @module frontend/src/composables
 */
import { computed } from 'vue'
import { usePowerMeter } from '@/composables/energy/usePowerMeter'
import { hasEnergyConfig } from '@homeos/shared'
import { useHaBindingsStore } from '@/stores/ha-bindings.store'
import { useHubTabs } from '@/composables/widget/useHubTabs'
import { normalizeHubTabConfig } from '@/utils/registry/hub-tabs-options'

function hasRowBalance(row: { balance?: string }) {
  return row.balance != null && row.balance !== '--'
}

function hasGridOverview(row: { stats?: Record<string, string> | null }) {
  const s = row.stats
  if (!s) return false
  return [s.dailyNum, s.monthNum, s.balance].some((v) => v != null && v !== '--')
}

function hasUtilityOverview(row: { balance?: string; stats?: Record<string, string> | null }) {
  if (hasRowBalance(row)) return true
  const s = row.stats
  if (!s) return false
  return [s.dailyNum, s.monthNum, s.balance].some((v) => v != null && v !== '--')
}

const ALL_HUB_TABS = [
  { key: 'overview', label: '概览' },
  { key: 'electricity', label: '电力' },
  { key: 'solar', label: '发电' },
  { key: 'gas', label: '燃气' },
  { key: 'water', label: '用水' },
  { key: 'waterTrend', label: '水势' },
  { key: 'budget', label: '预算' },
  { key: 'analytics', label: '分析' },
  { key: 'insight', label: '洞察' },
  { key: 'pricing', label: '电价' },
  { key: 'comm', label: '通信' },
]

/** useEnergyDashboard：函数，按签名入参返回处理结果。 */
export function useEnergyDashboard(props: {
  defaultTab?: string
  tabSelectToken?: number
  floatingCompact?: boolean
  config?: Record<string, unknown>
  panelVisible?: boolean
}) {
  const baseTabs = computed(() => {
    const tabConfig = normalizeHubTabConfig(props.config, 'energyDashboard')
    const allIds = new Set(ALL_HUB_TABS.map((t) => t.key))
    const hasCustomVisible =
      tabConfig.visibleTabs.length > 0 &&
      tabConfig.visibleTabs.some((id) => allIds.has(id)) &&
      !ALL_HUB_TABS.every((t) => tabConfig.visibleTabs.includes(t.key))
    if (props.floatingCompact && !hasCustomVisible) {
      return ALL_HUB_TABS.filter((t) =>
        ['overview', 'electricity', 'solar', 'insight'].includes(t.key),
      )
    }
    return ALL_HUB_TABS
  })

  const { hubTabs, activeTab } = useHubTabs({
    hubType: 'energyDashboard',
    config: () => props.config,
    defaultTabProp: () => props.defaultTab,
    tabSelectToken: () => props.tabSelectToken ?? 0,
    allTabs: baseTabs,
  })

  const powerMeter = usePowerMeter()
  const haBindingsStore = useHaBindingsStore()
  const statsSensors = computed(() => haBindingsStore.statsSensors)
  const panelVisibleEffective = computed(() => props.panelVisible !== false)

  const hasGridConfig = computed(() => hasEnergyConfig('grid', statsSensors.value))
  const hasGasConfig = computed(() => hasEnergyConfig('gas', statsSensors.value))
  const hasWaterConfig = computed(() => hasEnergyConfig('water', statsSensors.value))
  const hasCommConfig = computed(
    () => hasEnergyConfig('ct', statsSensors.value) || hasEnergyConfig('cu', statsSensors.value),
  )

  const gridAccountList = computed(() => powerMeter.gridAccountList.value ?? [])
  const gasAccountList = computed(() => powerMeter.gasAccountList.value ?? [])
  const waterAccountList = computed(() => powerMeter.waterAccountList.value ?? [])
  const ctAccountList = computed(() => powerMeter.ctAccountList.value ?? [])
  const cuAccountList = computed(() => powerMeter.cuAccountList.value ?? [])

  const hasOverviewData = computed(
    () =>
      gridAccountList.value.some(hasGridOverview) ||
      gasAccountList.value.some(hasUtilityOverview) ||
      waterAccountList.value.some(hasUtilityOverview) ||
      ctAccountList.value.some(hasRowBalance) ||
      cuAccountList.value.some(hasRowBalance),
  )

  const overviewHero = computed(() => {
    const gridDaily = gridAccountList.value.find((row) => row.stats?.dailyNum !== '--')
    if (gridDaily?.stats) {
      return {
        kind: 'grid' as const,
        label: gridAccountList.value.length > 1 ? `今日用电 · ${gridDaily.label}` : '今日用电',
        value: String(gridDaily.stats.dailyNum),
        unit: 'kWh',
        cost: gridDaily.stats.dailyCost !== '--' ? String(gridDaily.stats.dailyCost) : '',
      }
    }
    const gridMonth = gridAccountList.value.find((row) => row.stats?.monthNum !== '--')
    if (gridMonth?.stats) {
      return {
        kind: 'grid' as const,
        label: gridAccountList.value.length > 1 ? `本月用电 · ${gridMonth.label}` : '本月用电',
        value: String(gridMonth.stats.monthNum),
        unit: 'kWh',
        cost: gridMonth.stats.monthCost !== '--' ? String(gridMonth.stats.monthCost) : '',
      }
    }
    const gas = gasAccountList.value.find(hasUtilityOverview)
    if (gas) {
      if (hasRowBalance(gas)) {
        return {
          kind: 'gas' as const,
          label: gasAccountList.value.length > 1 ? `燃气余额 · ${gas.label}` : '燃气余额',
          value: String(gas.balance),
          unit: '元',
          cost: '',
        }
      }
      if (gas.stats?.monthNum && gas.stats.monthNum !== '--') {
        return {
          kind: 'gas' as const,
          label: gasAccountList.value.length > 1 ? `本月用气 · ${gas.label}` : '本月用气',
          value: String(gas.stats.monthNum),
          unit: 'm³',
          cost: '',
        }
      }
    }
    const water = waterAccountList.value.find(hasUtilityOverview)
    if (water) {
      if (hasRowBalance(water)) {
        return {
          kind: 'water' as const,
          label: waterAccountList.value.length > 1 ? `用水余额 · ${water.label}` : '用水余额',
          value: String(water.balance),
          unit: '元',
          cost: '',
        }
      }
      if (water.stats?.monthNum && water.stats.monthNum !== '--') {
        return {
          kind: 'water' as const,
          label: waterAccountList.value.length > 1 ? `本月用水 · ${water.label}` : '本月用水',
          value: String(water.stats.monthNum),
          unit: 'm³',
          cost: '',
        }
      }
    }
    return null
  })

  const overviewCards = computed(() => {
    const cards: Array<{
      key: string
      icon: 'zap' | 'flame' | 'droplets' | 'wifi'
      tone: string
      label: string
      value: string
      suffix?: string
    }> = []
    for (const row of gridAccountList.value) {
      if (!hasGridOverview(row) || !row.stats) continue
      if (row.stats.dailyNum !== '--') {
        cards.push({
          key: `grid-${row.index}`,
          icon: 'zap',
          tone: 'amber',
          label: gridAccountList.value.length > 1 ? `电网 · ${row.label}` : '今日用电',
          value: String(row.stats.dailyNum),
          suffix:
            row.stats.dailyCost !== '--' ? `kWh · ¥${row.stats.dailyCost}` : 'kWh',
        })
      } else if (row.stats.monthNum !== '--') {
        cards.push({
          key: `grid-${row.index}`,
          icon: 'zap',
          tone: 'amber',
          label: gridAccountList.value.length > 1 ? `电网 · ${row.label}` : '本月用电',
          value: String(row.stats.monthNum),
          suffix:
            row.stats.monthCost !== '--' ? `kWh · ¥${row.stats.monthCost}` : 'kWh',
        })
      } else if (row.stats.balance !== '--') {
        cards.push({
          key: `grid-${row.index}`,
          icon: 'zap',
          tone: 'amber',
          label: gridAccountList.value.length > 1 ? `电网 · ${row.label}` : '电费余额',
          value: `¥${row.stats.balance}`,
        })
      }
    }
    for (const row of gasAccountList.value) {
      if (!hasUtilityOverview(row)) continue
      if (hasRowBalance(row)) {
        cards.push({
          key: `gas-${row.index}`,
          icon: 'flame',
          tone: 'orange',
          label: gasAccountList.value.length > 1 ? `燃气 · ${row.label}` : '燃气余额',
          value: `¥${row.balance}`,
        })
      } else if (row.stats?.monthNum && row.stats.monthNum !== '--') {
        cards.push({
          key: `gas-${row.index}`,
          icon: 'flame',
          tone: 'orange',
          label: gasAccountList.value.length > 1 ? `燃气 · ${row.label}` : '本月用气',
          value: String(row.stats.monthNum),
          suffix: 'm³',
        })
      }
    }
    for (const row of waterAccountList.value) {
      if (!hasUtilityOverview(row)) continue
      if (hasRowBalance(row)) {
        cards.push({
          key: `water-${row.index}`,
          icon: 'droplets',
          tone: 'cyan',
          label: waterAccountList.value.length > 1 ? `水务 · ${row.label}` : '用水余额',
          value: `¥${row.balance}`,
        })
      } else if (row.stats?.monthNum && row.stats.monthNum !== '--') {
        cards.push({
          key: `water-${row.index}`,
          icon: 'droplets',
          tone: 'cyan',
          label: waterAccountList.value.length > 1 ? `水务 · ${row.label}` : '本月用水',
          value: String(row.stats.monthNum),
          suffix: 'm³',
        })
      }
    }
    for (const row of ctAccountList.value) {
      if (!hasRowBalance(row)) continue
      cards.push({
        key: `ct-${row.index}`,
        icon: 'wifi',
        tone: 'violet',
        label: ctAccountList.value.length > 1 ? `电信 · ${row.label}` : '电信余额',
        value: `¥${row.balance}`,
      })
    }
    for (const row of cuAccountList.value) {
      if (!hasRowBalance(row)) continue
      cards.push({
        key: `cu-${row.index}`,
        icon: 'wifi',
        tone: 'violet',
        label: cuAccountList.value.length > 1 ? `联通 · ${row.label}` : '联通余额',
        value: `¥${row.balance}`,
      })
    }
    return cards
  })

  const configCompletion = computed(() => {
    const items = [
      { key: 'grid', label: '电网', done: hasGridConfig.value },
      { key: 'gas', label: '燃气', done: hasGasConfig.value },
      { key: 'water', label: '水务', done: hasWaterConfig.value },
      { key: 'comm', label: '通信', done: hasCommConfig.value },
    ]
    const done = items.filter((i) => i.done).length
    return { items, done, total: items.length, pct: Math.round((done / items.length) * 100) }
  })

  return {
    hubTabs,
    activeTab,
    panelVisibleEffective,
    hasGridConfig,
    hasGasConfig,
    hasWaterConfig,
    hasCommConfig,
    gridAccountList,
    gasAccountList,
    waterAccountList,
    ctAccountList,
    cuAccountList,
    hasOverviewData,
    overviewHero,
    overviewCards,
    configCompletion,
  }
}
