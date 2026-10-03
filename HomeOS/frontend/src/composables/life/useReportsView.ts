/**
 * @file useReportsView.ts
 * @module frontend/src/composables
 * @description 统计报表页（Requirement E6）：指标 / 周期选择、周期对比序列、
 * 汇总差额、洞察摘要、明细表与设备/能耗上下文的拉取与 CSV 导出。
 * 依赖：fetchReportCompare、getEnergyBudget/Savings、fetchAdvisorUsageSummary、
 * entitiesStore、downloadBlob。
 */
import { getEntityLeaf } from '@homeos/shared'
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { fetchReportCompare } from '@/services/api/entities'
import { getEnergyBudget, getEnergySavings } from '@/services/api/energy'
import { fetchAdvisorUsageSummary } from '@/services/api/system'
import { useEntitiesStore } from '@/stores/entities.store'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import { downloadBlob } from '@/utils/core/misc.util'
import { getApiErrorMessage } from '@/utils/core/error-message'

type ReportMetric = 'energy' | 'environment' | 'events' | 'device'
type ReportGranularity = 'week' | 'month'
type EnvField = 'temperature' | 'humidity' | 'iaq'

interface ReportSeriesPoint {
  date: string
  label: string
  value: number | null
}

interface ReportCompareRow {
  key: string
  current: number
  previous: number | null
  delta: number
  deltaPct: number | null
}

interface ReportInsights {
  peakDay: { date: string; label: string; value: number } | null
  avgPerDay: number | null
  activeDays: number
  topRiser: ReportCompareRow | null
  topFaller: ReportCompareRow | null
}

interface ReportCompareData {
  metric: ReportMetric
  granularity: ReportGranularity
  field?: EnvField
  unit: string
  periods: {
    current: { start: string; end: string; label: string }
    previous: { start: string; end: string; label: string }
  }
  series: { current: ReportSeriesPoint[]; previous: ReportSeriesPoint[] }
  totals: ReportCompareRow
  byEntity: ReportCompareRow[]
  insights?: ReportInsights
}

type ReportTableSortKey = 'label' | 'current' | 'previous' | 'delta' | 'deltaPct'
type ReportSortDir = 'asc' | 'desc'

/** 指标文案与单位提示 */
export const REPORT_METRIC_OPTIONS = [
  { value: 'energy', label: '能耗' },
  { value: 'environment', label: '环境' },
  { value: 'events', label: '事件' },
  { value: 'device', label: '设备使用' },
] as const

/** REPORT_GRANULARITY_OPTIONS：常量集合，成员语义见定义处。 */
export const REPORT_GRANULARITY_OPTIONS = [
  { value: 'week', label: '本周 vs 上周' },
  { value: 'month', label: '本月 vs 上月' },
] as const

/** REPORT_ENV_FIELD_OPTIONS：常量集合，成员语义见定义处。 */
export const REPORT_ENV_FIELD_OPTIONS = [
  { value: 'temperature', label: '温度' },
  { value: 'humidity', label: '湿度' },
  { value: 'iaq', label: 'IAQ' },
] as const

/** 环境指标在周期均值口径下的总额展示：单位见 metricUnit */
function metricUnitLabel(metric: ReportMetric, unit?: string): string {
  if (metric === 'energy') return unit || 'kWh'
  if (metric === 'environment') return unit || '℃'
  if (metric === 'device') return unit || '小时'
  return unit || '次'
}

function formatMetricNumber(metric: ReportMetric, n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  if (metric === 'events') return String(Math.round(n))
  if (metric === 'environment') return String(Math.round(n * 10) / 10)
  return String(Math.round(n * 100) / 100)
}

function csvEscape(cell: unknown): string {
  return `"${String(cell ?? '').replace(/"/g, '""')}"`
}

function sortRows<T extends Record<string, unknown>>(
  rows: T[],
  key: ReportTableSortKey,
  dir: ReportSortDir,
): T[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const av = a[key]
    const bv = b[key]
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    if (typeof av === 'string' || typeof bv === 'string') {
      return String(av).localeCompare(String(bv), 'zh') * sign
    }
    return (Number(av) - Number(bv)) * sign
  })
}

/** useReportsView：函数，按签名入参返回处理结果。 */
export function useReportsView() {
  const entitiesStore = useEntitiesStore()
  const metric = ref<ReportMetric>('events')
  const granularity = ref<ReportGranularity>('week')
  const field = ref<EnvField>('temperature')
  /** 实体筛选（能耗 / 事件 / 设备）；环境指标忽略 */
  const entityIds = ref<string[]>([])
  const entityFilter = ref('')
  const data = ref<ReportCompareData | null>(null)
  const loading = ref(false)
  const error = ref('')
  let requestSeq = 0

  const energyContext = ref<{
    budgetPct: number | null
    monthUsage: number | null
    monthlyKwh: number | null
    projectedKwh: number | null
    savingsYuan: number | null
    peakWow: { thisWeek: number; lastWeek: number; improved: boolean } | null
  } | null>(null)

  const deviceContext = ref<{
    domainBreakdown: Array<{ domain: string; count: number; totalRuntimeMs?: number }>
    anomalyHints: Array<{ entityId: string; type: string; message: string }>
  } | null>(null)

  const daySortKey = ref<ReportTableSortKey>('label')
  const daySortDir = ref<ReportSortDir>('asc')
  const entitySortKey = ref<ReportTableSortKey>('current')
  const entitySortDir = ref<ReportSortDir>('desc')

  async function loadContext() {
    if (metric.value === 'energy') {
      try {
        const [budgetRes, savingsRes] = await Promise.all([
          getEnergyBudget().catch(() => ({ data: null })),
          getEnergySavings().catch(() => ({ data: null })),
        ])
        const budget = budgetRes?.data as Record<string, unknown> | null
        const savings = savingsRes?.data as Record<string, unknown> | null
        if (!budget && !savings) {
          energyContext.value = null
          return
        }
        const budgetCfg = (budget?.budget || null) as Record<string, unknown> | null
        const wow = (savings?.weekOverWeek || null) as Record<string, unknown> | null
        energyContext.value = {
          budgetPct:
            budget?.kwhUsedPct != null && Number.isFinite(Number(budget.kwhUsedPct))
              ? Number(budget.kwhUsedPct)
              : null,
          monthUsage:
            budget?.monthUsage != null && Number.isFinite(Number(budget.monthUsage))
              ? Number(budget.monthUsage)
              : null,
          monthlyKwh:
            budgetCfg?.monthlyKwh != null && Number.isFinite(Number(budgetCfg.monthlyKwh))
              ? Number(budgetCfg.monthlyKwh)
              : null,
          projectedKwh:
            budget?.projectedKwh != null && Number.isFinite(Number(budget.projectedKwh))
              ? Number(budget.projectedKwh)
              : null,
          savingsYuan:
            savings?.estimatedMonthlySavingsYuan != null
              ? Number(savings.estimatedMonthlySavingsYuan)
              : null,
          peakWow:
            wow && (wow.thisWeekPeakKwh != null || wow.lastWeekPeakKwh != null)
              ? {
                  thisWeek: Number(wow.thisWeekPeakKwh) || 0,
                  lastWeek: Number(wow.lastWeekPeakKwh) || 0,
                  improved: Boolean(wow.improved),
                }
              : null,
        }
      } catch {
        energyContext.value = null
      }
      deviceContext.value = null
      return
    }

    if (metric.value === 'device') {
      try {
        const days = granularity.value === 'week' ? 7 : 30
        const { data: summary } = await fetchAdvisorUsageSummary({ days })
        const raw = (summary || {}) as Record<string, unknown>
        const domains = Array.isArray(raw.domainBreakdown) ? raw.domainBreakdown : []
        const hints = Array.isArray(raw.anomalyHints) ? raw.anomalyHints : []
        deviceContext.value = {
          domainBreakdown: domains
            .map((d) => {
              const row = d as Record<string, unknown>
              return {
                domain: String(row.domain || ''),
                count: Number(row.count) || 0,
                totalRuntimeMs:
                  row.totalRuntimeMs != null ? Number(row.totalRuntimeMs) : undefined,
              }
            })
            .filter((d) => d.domain)
            .slice(0, 8),
          anomalyHints: hints
            .map((h) => {
              const row = h as Record<string, unknown>
              return {
                entityId: String(row.entityId || ''),
                type: String(row.type || ''),
                message: String(row.message || ''),
              }
            })
            .filter((h) => h.message)
            .slice(0, 6),
        }
      } catch {
        deviceContext.value = null
      }
      energyContext.value = null
      return
    }

    energyContext.value = null
    deviceContext.value = null
  }

  async function load() {
    const seq = ++requestSeq
    const keepPrevious = Boolean(data.value)
    loading.value = true
    error.value = ''
    try {
      const params: Record<string, unknown> = {
        metric: metric.value,
        granularity: granularity.value,
      }
      if (metric.value === 'environment') params.field = field.value
      if (metric.value !== 'environment' && entityIds.value.length) {
        params.entity_ids = entityIds.value.join(',')
      }
      const [{ data: result }] = await Promise.all([
        fetchReportCompare(params),
        loadContext(),
      ])
      if (seq !== requestSeq) return
      data.value = result && typeof result === 'object' ? (result as ReportCompareData) : null
    } catch (e) {
      if (seq !== requestSeq) return
      if (keepPrevious) {
        // 切换筛选时失败：保留旧数据，避免整页被错误态替换
        error.value = ''
      } else {
        error.value = getApiErrorMessage(e, '报表加载失败')
        data.value = null
      }
    } finally {
      if (seq === requestSeq) loading.value = false
    }
  }

  /** 仅首次无数据时让 ApiQueryState 显示骨架，避免刷新卸载图表 DOM */
  const showSkeleton = computed(() => loading.value && !data.value)

  watch([metric, granularity, field, entityIds], () => {
    void load()
  })

  watch(metric, (next, prev) => {
    if (next === prev) return
    if (next === 'environment') {
      entityIds.value = []
      entityFilter.value = ''
    }
  })

  watch(entityFilter, (val) => {
    const id = String(val || '').trim()
    const next = id ? [id] : []
    if (next.join(',') === entityIds.value.join(',')) return
    entityIds.value = next
  })

  /** 实体筛选选项（按域收窄：能耗偏 sensor，其余取全量） */
  const entityFilterOptions = computed(() => {
    const entries = Object.entries(entitiesStore.entities || {})
    const filtered =
      metric.value === 'energy'
        ? entries.filter(([id]) => id.startsWith('sensor.'))
        : entries
    return filtered
      .slice(0, 800)
      .map(([id, entity]) => ({
        value: id,
        label: getEntityDisplayName(id, entity),
        hint: id,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'zh'))
  })

  /** 汇总卡片（当前周期 / 上一周期 / 差额 / 涨跌幅） */
  const summaryCells = computed(() => {
    const d = data.value
    if (!d) return []
    const t = d.totals
    const fmt = (n: number | null) => formatMetricNumber(metric.value, n)
    const deltaLabel = t.delta == null ? '—' : `${t.delta >= 0 ? '+' : ''}${fmt(t.delta)}`
    const pctLabel =
      t.deltaPct == null ? '—' : `${t.deltaPct >= 0 ? '+' : ''}${t.deltaPct}%`
    return [
      { key: 'current', label: d.periods.current.label, value: fmt(t.current), tone: 'sky' },
      { key: 'previous', label: d.periods.previous.label, value: fmt(t.previous), tone: 'muted' },
      { key: 'delta', label: '差额', value: deltaLabel, tone: t.delta >= 0 ? 'green' : 'red' },
      {
        key: 'pct',
        label: '涨跌幅',
        value: pctLabel,
        tone: t.deltaPct != null && t.deltaPct < 0 ? 'red' : 'green',
      },
    ]
  })

  /** 对比柱状图：X 轴标签（对齐两周期序列） */
  const chartCategories = computed(() => {
    const d = data.value
    if (!d) return []
    const cur = d.series.current
    const prev = d.series.previous
    const maxLen = Math.max(cur.length, prev.length)
    const labels: string[] = []
    for (let i = 0; i < maxLen; i++) {
      labels.push(cur[i]?.label || prev[i]?.label || String(i + 1))
    }
    return labels
  })

  const chartCurrentValues = computed(() => {
    const d = data.value
    if (!d) return []
    const cur = d.series.current
    const prev = d.series.previous
    const maxLen = Math.max(cur.length, prev.length)
    const values: Array<number | null> = []
    for (let i = 0; i < maxLen; i++) values.push(cur[i]?.value ?? null)
    return values
  })

  const chartPreviousValues = computed(() => {
    const d = data.value
    if (!d) return []
    const cur = d.series.current
    const prev = d.series.previous
    const maxLen = Math.max(cur.length, prev.length)
    const values: Array<number | null> = []
    for (let i = 0; i < maxLen; i++) values.push(prev[i]?.value ?? null)
    return values
  })

  /** 横向对比展示名：能耗/事件按实体友好名，环境按房间名 */
  function entityDisplayName(key: string) {
    if (metric.value === 'environment') return key || '—'
    const entity = entitiesStore.entities[key]
    return getEntityDisplayName(key, entity)
  }

  const byEntityRows = computed(() => {
    const d = data.value
    if (!Array.isArray(d?.byEntity)) return []
    const baseLabels = d.byEntity.map((row) => entityDisplayName(row.key))
    const dupCount = new Map<string, number>()
    for (const label of baseLabels) dupCount.set(label, (dupCount.get(label) || 0) + 1)
    return d.byEntity.map((row, i) => {
      let label = baseLabels[i] || row.key
      if ((dupCount.get(label) || 0) > 1) {
        const tail = String(row.key).includes('.')
          ? getEntityLeaf(row.key)
          : String(row.key)
        label = `${label} · ${String(tail || '').slice(-10)}`
      }
      return { ...row, label }
    })
  })

  const insights = computed(() => data.value?.insights || null)

  const insightNarrative = computed(() => {
    const d = data.value
    if (!d) return ''
    const unit = metricUnitLabel(metric.value, d.unit)
    const pct = d.totals.deltaPct
    const curLabel = d.periods.current.label
    const prevLabel = d.periods.previous.label
    const parts: string[] = []
    if (pct == null) {
      parts.push(`${curLabel}暂无足够的环比数据`)
    } else if (pct === 0) {
      parts.push(`${curLabel}与${prevLabel}基本持平`)
    } else if (pct > 0) {
      parts.push(`${curLabel}较${prevLabel}上升 ${pct}%`)
    } else {
      parts.push(`${curLabel}较${prevLabel}下降 ${Math.abs(pct)}%`)
    }
    const peak = d.insights?.peakDay
    if (peak) {
      parts.push(`峰值在 ${peak.label}（${formatMetricNumber(metric.value, peak.value)} ${unit}）`)
    }
    const riser = d.insights?.topRiser
    if (riser && riser.deltaPct != null && riser.deltaPct > 0) {
      parts.push(`涨幅最大：${entityDisplayName(riser.key)}（+${riser.deltaPct}%）`)
    }
    const faller = d.insights?.topFaller
    if (faller && faller.deltaPct != null && faller.deltaPct < 0) {
      parts.push(`降幅最大：${entityDisplayName(faller.key)}（${faller.deltaPct}%）`)
    }
    return parts.join('；')
  })

  const insightChips = computed(() => {
    const d = data.value
    if (!d) return []
    const unit = metricUnitLabel(metric.value, d.unit)
    const chips: Array<{ key: string; label: string; value: string; tone?: string }> = []
    if (d.insights?.peakDay) {
      chips.push({
        key: 'peak',
        label: '峰值日',
        value: `${d.insights.peakDay.label} · ${formatMetricNumber(metric.value, d.insights.peakDay.value)} ${unit}`,
        tone: 'amber',
      })
    }
    if (d.insights?.avgPerDay != null) {
      chips.push({
        key: 'avg',
        label: '日均',
        value: `${formatMetricNumber(metric.value, d.insights.avgPerDay)} ${unit}`,
        tone: 'sky',
      })
    }
    chips.push({
      key: 'active',
      label: '有效天数',
      value: String(d.insights?.activeDays ?? 0),
      tone: 'muted',
    })
    const ctx = energyContext.value
    if (metric.value === 'energy' && ctx) {
      if (ctx.budgetPct != null) {
        chips.push({
          key: 'budget',
          label: '预算进度',
          value:
            ctx.monthlyKwh != null
              ? `${Math.round(ctx.budgetPct)}%（${formatMetricNumber('energy', ctx.monthUsage)} / ${ctx.monthlyKwh} kWh）`
              : `${Math.round(ctx.budgetPct)}%`,
          tone: ctx.budgetPct >= 90 ? 'red' : ctx.budgetPct >= 70 ? 'amber' : 'green',
        })
      }
      if (ctx.projectedKwh != null) {
        chips.push({
          key: 'projected',
          label: '预计本月',
          value: `${formatMetricNumber('energy', ctx.projectedKwh)} kWh`,
          tone: 'sky',
        })
      }
      if (ctx.savingsYuan != null) {
        chips.push({
          key: 'savings',
          label: '估算节省',
          value: `${Math.round(ctx.savingsYuan * 10) / 10} 元/月`,
          tone: 'green',
        })
      }
      if (ctx.peakWow) {
        chips.push({
          key: 'peak-wow',
          label: '峰段周环比',
          value: `${ctx.peakWow.thisWeek} → ${ctx.peakWow.lastWeek} kWh`,
          tone: ctx.peakWow.improved ? 'green' : 'amber',
        })
      }
    }
    return chips
  })

  const rankShares = computed(() => {
    const rows = byEntityRows.value
    if (!rows.length) return []
    const top = Math.max(...rows.map((r) => r.current), 0.0001)
    return rows.slice(0, 8).map((r, idx) => ({
      key: r.key,
      label: r.label,
      current: r.current,
      pct: Math.max(4, Math.round((r.current / top) * 100)),
      rank: idx,
    }))
  })

  const dayTableRows = computed(() => {
    const d = data.value
    if (!d) return []
    const rows = chartCategories.value.map((label, i) => {
      const cur = chartCurrentValues.value[i]
      const prev = chartPreviousValues.value[i]
      const curNum = cur ?? 0
      const prevNum = prev ?? 0
      const delta = metric.value === 'environment' ? (cur != null && prev != null ? curNum - prevNum : null) : curNum - prevNum
      const pct =
        delta != null && prev != null && prevNum !== 0
          ? Math.round((delta / prevNum) * 1000) / 10
          : null
      return {
        key: `${label}-${i}`,
        label,
        current: cur,
        previous: prev,
        delta,
        deltaPct: pct,
      }
    })
    return sortRows(rows, daySortKey.value, daySortDir.value)
  })

  const entityTableRows = computed(() => {
    const rows = byEntityRows.value.map((row) => ({
      key: row.key,
      label: row.label,
      current: row.current,
      previous: row.previous,
      delta: row.delta,
      deltaPct: row.deltaPct,
    }))
    return sortRows(rows, entitySortKey.value, entitySortDir.value)
  })

  function toggleDaySort(key: ReportTableSortKey) {
    if (daySortKey.value === key) {
      daySortDir.value = daySortDir.value === 'asc' ? 'desc' : 'asc'
    } else {
      daySortKey.value = key
      daySortDir.value = key === 'label' ? 'asc' : 'desc'
    }
  }

  function toggleEntitySort(key: ReportTableSortKey) {
    if (entitySortKey.value === key) {
      entitySortDir.value = entitySortDir.value === 'asc' ? 'desc' : 'asc'
    } else {
      entitySortKey.value = key
      entitySortDir.value = key === 'label' ? 'asc' : 'desc'
    }
  }

  /** CSV 导出：洞察摘要 + 按天表 + 实体表，UTF-8 BOM 兼容 Excel */
  function exportCsv() {
    const d = data.value
    if (!d) return
    const unit = metricUnitLabel(metric.value, d.unit)
    const summaryLines = [
      ['指标', REPORT_METRIC_OPTIONS.find((o) => o.value === d.metric)?.label || d.metric],
      ['周期', `${d.periods.current.label} vs ${d.periods.previous.label}`],
      ['单位', unit],
      ['洞察', insightNarrative.value],
      ['当前合计', formatMetricNumber(metric.value, d.totals.current)],
      ['上期合计', formatMetricNumber(metric.value, d.totals.previous)],
      ['差额', d.totals.delta],
      ['涨跌幅(%)', d.totals.deltaPct ?? ''],
      ['峰值日', d.insights?.peakDay ? `${d.insights.peakDay.label} ${d.insights.peakDay.value}` : ''],
      ['日均', d.insights?.avgPerDay ?? ''],
      ['有效天数', d.insights?.activeDays ?? ''],
    ].map((row) => row.map(csvEscape).join(','))

    const dayHeader = ['日期', d.periods.current.label, d.periods.previous.label, '差额', '涨跌幅(%)']
    const dayLines = dayTableRows.value.map((row) =>
      [row.label, row.current ?? '', row.previous ?? '', row.delta ?? '', row.deltaPct ?? '']
        .map(csvEscape)
        .join(','),
    )

    const entityHeader = [
      metric.value === 'environment' ? '房间' : '设备',
      d.periods.current.label,
      d.periods.previous.label,
      '差额',
      '涨跌幅(%)',
    ]
    const entityLines = entityTableRows.value.map((row) =>
      [row.label, row.current, row.previous ?? '', row.delta, row.deltaPct ?? '']
        .map(csvEscape)
        .join(','),
    )

    const csv = [
      '摘要',
      summaryLines.join('\n'),
      '',
      '按天对比',
      dayHeader.map(csvEscape).join(','),
      dayLines.join('\n'),
      '',
      metric.value === 'environment' ? '房间对比' : '设备对比',
      entityHeader.map(csvEscape).join(','),
      entityLines.join('\n'),
    ].join('\n')

    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const date = new Date().toISOString().slice(0, 10)
    downloadBlob(blob, `report-${d.metric}-${d.granularity}-${date}.csv`)
  }

  function reload() {
    void load()
  }

  onMounted(() => {
    void load()
  })

  onUnmounted(() => {
    requestSeq++
  })

  return {
    metric,
    granularity,
    field,
    entityIds,
    entityFilter,
    entityFilterOptions,
    data,
    loading,
    showSkeleton,
    error,
    summaryCells,
    chartCategories,
    chartCurrentValues,
    chartPreviousValues,
    byEntityRows,
    insights,
    insightNarrative,
    insightChips,
    rankShares,
    dayTableRows,
    entityTableRows,
    daySortKey,
    daySortDir,
    entitySortKey,
    entitySortDir,
    toggleDaySort,
    toggleEntitySort,
    energyContext,
    deviceContext,
    metricUnitLabel,
    formatMetricNumber,
    reload,
    exportCsv,
  }
}
