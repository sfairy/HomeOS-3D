<!--
组件：ReportsView.vue（统计报表，Requirement E6）
所属模块：frontend / src / views
职责：单屏 2×2 报表——周期对比 / 实体对比 / 按天明细 / 实体明细；支持筛选与 CSV。
-->
<script setup>
/**
 * 所属模块：frontend/views
 * 职责：渲染 views/ReportsView 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { ref, computed, watch, nextTick } from 'vue'
import { BarChart3 } from '@lucide/vue'
import HosSelect from '@/components/common/base/HosSelect.vue'
import SearchableSelect from '@/components/common/base/SearchableSelect.vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import ListPageHero from '@/components/common/list-page/ListPageHero.vue'
import ListPageMetrics from '@/components/common/list-page/ListPageMetrics.vue'
import { chartVerticalGradient } from '@/utils/chart/device-chart-theme'
import { useEchartsHost, axisLineStyle, splitLineStyle } from '@/composables/ui/useEchartsHost'
import {
  useReportsView,
  REPORT_METRIC_OPTIONS,
  REPORT_GRANULARITY_OPTIONS,
  REPORT_ENV_FIELD_OPTIONS,
} from '@/composables/life/useReportsView'

const {
  metric,
  granularity,
  field,
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
  insightNarrative,
  insightChips,
  dayTableRows,
  entityTableRows,
  daySortKey,
  daySortDir,
  entitySortKey,
  entitySortDir,
  toggleDaySort,
  toggleEntitySort,
  deviceContext,
  metricUnitLabel,
  formatMetricNumber,
  reload,
  exportCsv,
} = useReportsView()

const pageHint = computed(() => {
  const d = data.value
  if (!d) return '周期对比 · 实体排名 · 明细下钻 · CSV 导出'
  return (
    insightNarrative.value ||
    `${d.periods.current.label} vs ${d.periods.previous.label} · ${metricUnitLabel(metric.value, d.unit)}`
  )
})

/** 单屏：日表最多 7 行；实体表最多 6 行；图表 Top 5 */
const ENTITY_CHART_TOP = 5
const dayVisibleRows = computed(() => {
  const rows = dayTableRows.value
  if (rows.length <= 7) return rows
  return [...rows]
    .sort((a, b) => Number(b.current || 0) - Number(a.current || 0))
    .slice(0, 7)
})
const entityVisibleRows = computed(() => entityTableRows.value.slice(0, 6))
const dayTableHint = computed(() =>
  dayTableRows.value.length > 7
    ? `峰值 ${dayVisibleRows.value.length} 天 · 完整见 CSV`
    : '点击表头排序',
)
const entityTableHint = computed(() =>
  entityTableRows.value.length > 6
    ? `Top 6 / ${entityTableRows.value.length} · CSV`
    : '点击表头排序',
)

const compareChartRef = ref(null)
const entityChartRef = ref(null)

// 容器 DOM 会随骨架屏 v-if 重建：渲染成功后重绑 resize 观察器
const { schedule, disposeAll, getChartBase } = useEchartsHost({
  charts: {
    compare: { el: () => compareChartRef.value, build: buildCompareOption },
    entity: { el: () => entityChartRef.value, build: buildEntityOption },
  },
  rebindResizeOnRender: true,
})

const chartTooltip = {
  backgroundColor: 'rgba(12, 12, 18, 0.94)',
  borderColor: 'rgba(34, 211, 238, 0.32)',
  borderWidth: 1,
  padding: [8, 12],
  extraCssText: 'border-radius: 10px; box-shadow: 0 8px 28px rgba(0,0,0,0.35);',
  textStyle: { color: '#a5f3fc', fontSize: 12, fontWeight: 600 },
}

function yMax(values) {
  const nums = values.filter((v) => v != null && Number.isFinite(v))
  return Math.max(...nums, 0, 1)
}

function valueFormatter() {
  const unit = data.value?.unit ? ` ${data.value.unit}` : ''
  return (params) => {
    const label = Array.isArray(params) ? params[0]?.name : params?.name
    const rows = (Array.isArray(params) ? params : [params])
      .map((p) => `${p.marker}${p.seriesName}：<b>${p.value ?? '—'}</b>${unit}`)
      .join('<br/>')
    return `${label || ''}<br/>${rows}`
  }
}

function buildCompareOption() {
  const categories = chartCategories.value
  const currentLabel = data.value?.periods?.current?.label || '当前周期'
  const previousLabel = data.value?.periods?.previous?.label || '上一周期'
  return {
    ...getChartBase(),
    legend: {
      top: 0,
      right: 0,
      itemWidth: 10,
      itemHeight: 8,
      textStyle: { color: 'rgba(255,255,255,0.55)', fontSize: 10 },
    },
    grid: {
      left: 8,
      right: 8,
      top: 28,
      bottom: categories.length > 14 ? 28 : 8,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: categories,
      axisLine: axisLineStyle,
      axisTick: { show: false },
      axisLabel: {
        color: 'rgba(255,255,255,0.58)',
        fontSize: 10,
        interval: categories.length > 12 ? Math.floor(categories.length / 7) : 0,
        hideOverlap: true,
      },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: yMax([...chartCurrentValues.value, ...chartPreviousValues.value]),
      minInterval: 1,
      axisLine: { show: false },
      splitLine: splitLineStyle,
      axisLabel: { color: 'rgba(255,255,255,0.58)', fontSize: 10 },
    },
    series: [
      {
        name: currentLabel,
        type: 'bar',
        barMaxWidth: 16,
        barGap: '30%',
        itemStyle: {
          color: chartVerticalGradient('#22d3ee', 0.95, 0.35),
          borderRadius: [3, 3, 0, 0],
        },
        data: chartCurrentValues.value,
      },
      {
        name: previousLabel,
        type: 'bar',
        barMaxWidth: 16,
        itemStyle: { color: 'rgba(148,163,184,0.45)', borderRadius: [3, 3, 0, 0] },
        data: chartPreviousValues.value,
      },
    ],
    tooltip: { ...chartTooltip, trigger: 'axis', formatter: valueFormatter() },
  }
}

function buildEntityOption() {
  const rows = byEntityRows.value.slice(0, ENTITY_CHART_TOP)
  // 自上而下：当前值最高的在上
  const ordered = [...rows].reverse()
  const labels = ordered.length
    ? ordered.map((r) => String(r.label).slice(0, 14))
    : ['暂无']
  const currentLabel = data.value?.periods?.current?.label || '当前'
  const previousLabel = data.value?.periods?.previous?.label || '上期'
  return {
    ...getChartBase(),
    legend: {
      top: 0,
      right: 0,
      itemWidth: 10,
      itemHeight: 8,
      textStyle: { color: 'rgba(255,255,255,0.55)', fontSize: 10 },
    },
    grid: { left: 8, right: 20, top: 28, bottom: 4, containLabel: true },
    xAxis: {
      type: 'value',
      min: 0,
      max: yMax(ordered.flatMap((r) => [r.current, r.previous ?? 0])),
      splitLine: splitLineStyle,
      axisLabel: { color: 'rgba(255,255,255,0.58)', fontSize: 10 },
    },
    yAxis: {
      type: 'category',
      data: labels,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 11,
        width: 96,
        overflow: 'truncate',
        interval: 0,
      },
    },
    series: [
      {
        name: currentLabel,
        type: 'bar',
        barMaxWidth: 12,
        barCategoryGap: '48%',
        itemStyle: {
          color: chartVerticalGradient('#22d3ee', 0.95, 0.35),
          borderRadius: [0, 3, 3, 0],
        },
        data: ordered.map((r) => r.current),
        label: {
          show: true,
          position: 'right',
          color: 'rgba(255,255,255,0.55)',
          fontSize: 10,
          formatter: ({ value }) => (value == null ? '' : String(value)),
        },
      },
      {
        name: previousLabel,
        type: 'bar',
        barMaxWidth: 12,
        itemStyle: { color: 'rgba(148,163,184,0.4)', borderRadius: [0, 3, 3, 0] },
        data: ordered.map((r) => r.previous ?? 0),
      },
    ],
    tooltip: { ...chartTooltip, trigger: 'axis', formatter: valueFormatter() },
  }
}

function sortMark(activeKey, key, dir) {
  if (activeKey !== key) return ''
  return dir === 'asc' ? ' ↑' : ' ↓'
}

function fmtCell(value) {
  return formatMetricNumber(metric.value, value)
}

function fmtDelta(value) {
  if (value == null || !Number.isFinite(value)) return '—'
  const text = formatMetricNumber(metric.value, value)
  return value > 0 ? `+${text}` : text
}

function fmtPct(value) {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value > 0 ? '+' : ''}${value}%`
}

watch(
  [data, metric, granularity, field, byEntityRows],
  () => nextTick(() => schedule()),
  { deep: true },
)

watch(showSkeleton, (skeleton, wasSkeleton) => {
  if (skeleton) {
    disposeAll()
  } else if (wasSkeleton) {
    nextTick(() => schedule())
  }
})
</script>

<template>
  <div
    class="list-page reports-view"
    :style="{
      '--page-accent': 'var(--module-accent-events)',
      '--page-accent-rgb': 'var(--module-accent-events-rgb)',
      '--page-accent-secondary': 'var(--module-accent-events-sub)',
    }"
  >
    <ListPageHero :title="'统计报表'" :hint="pageHint" tone="sky">
      <template #icon>
        <BarChart3 class="w-5 h-5" />
      </template>
      <template #stats>
        <ListPageMetrics v-if="!loading || data" :cells="summaryCells" />
      </template>
      <template #toolbar>
        <div class="reports-view__toolbar" role="toolbar" :aria-label="'报表工具栏'">
          <HosSelect
            v-model="metric"
            variant="inline"
            trigger-class="reports-view__filter"
            :title="'指标'"
          >
            <option v-for="opt in REPORT_METRIC_OPTIONS" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </HosSelect>
          <HosSelect
            v-model="granularity"
            variant="inline"
            trigger-class="reports-view__filter reports-view__filter--period"
            :title="'对比周期'"
          >
            <option
              v-for="opt in REPORT_GRANULARITY_OPTIONS"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </option>
          </HosSelect>
          <HosSelect
            v-if="metric === 'environment'"
            v-model="field"
            variant="inline"
            trigger-class="reports-view__filter"
            :title="'环境字段'"
          >
            <option v-for="opt in REPORT_ENV_FIELD_OPTIONS" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </HosSelect>
          <div v-else class="reports-view__entity-filter">
            <SearchableSelect
              v-model="entityFilter"
              variant="list-page"
              :options="entityFilterOptions"
              :placeholder="'实体'"
              :empty-text="'无匹配实体'"
              :clear-aria="'清除实体筛选'"
              :toggle-aria="'展开实体列表'"
              select-only
            />
          </div>
          <div
            v-if="metric === 'environment'"
            class="reports-view__toolbar-spacer"
            aria-hidden="true"
          />
          <button
            type="button"
            class="list-page__btn reports-view__btn"
            :disabled="loading || !data"
            @click="exportCsv"
          >
            {{ '导出' }}
          </button>
          <button
            type="button"
            class="list-page__btn list-page__btn--primary reports-view__btn"
            :disabled="loading"
            @click="reload"
          >
            {{ loading ? '…' : '刷新' }}
          </button>
        </div>
      </template>
    </ListPageHero>

    <section class="list-page__panel reports-view__panel">
      <div class="list-page__panel-body reports-view__panel-body">
        <ApiQueryState
          :loading="showSkeleton"
          :error="error"
          tone="sky"
          error-title="报表加载失败"
          @retry="reload"
        >
          <div v-if="data" class="reports-view__body">
            <div v-if="insightChips.length" class="reports-view__chips" :title="insightNarrative">
              <span
                v-for="chip in insightChips"
                :key="chip.key"
                class="reports-view__chip"
                :class="chip.tone && `is-${chip.tone}`"
              >
                <em>{{ chip.label }}</em>
                <strong>{{ chip.value }}</strong>
              </span>
              <template v-if="metric === 'device' && deviceContext?.domainBreakdown?.length">
                <span
                  v-for="row in deviceContext.domainBreakdown.slice(0, 3)"
                  :key="`d-${row.domain}`"
                  class="reports-view__chip is-muted"
                >
                  <em>{{ row.domain }}</em>
                  <strong>{{ row.count }}</strong>
                </span>
              </template>
            </div>

            <div class="reports-view__grid">
              <section class="reports-view__card">
                <header class="reports-view__card-head">
                  <h3>{{ '周期对比' }}</h3>
                  <span>{{ data.periods.current.label }} vs {{ data.periods.previous.label }}</span>
                </header>
                <div ref="compareChartRef" class="reports-view__chart" />
              </section>

              <section class="reports-view__card">
                <header class="reports-view__card-head">
                  <h3>{{ metric === 'environment' ? '房间对比' : '设备对比' }}</h3>
                  <span>Top {{ Math.min(byEntityRows.length, ENTITY_CHART_TOP) }}</span>
                </header>
                <div ref="entityChartRef" class="reports-view__chart" />
              </section>

              <section class="reports-view__card">
                <header class="reports-view__card-head">
                  <h3>{{ '按天明细' }}</h3>
                  <span>{{ dayTableHint }}</span>
                </header>
                <div class="reports-view__table-wrap">
                  <table class="reports-view__table">
                    <thead>
                      <tr>
                        <th @click="toggleDaySort('label')">
                          {{ `日期${sortMark(daySortKey, 'label', daySortDir)}` }}
                        </th>
                        <th @click="toggleDaySort('current')">
                          {{ `${data.periods.current.label}${sortMark(daySortKey, 'current', daySortDir)}` }}
                        </th>
                        <th @click="toggleDaySort('previous')">
                          {{ `${data.periods.previous.label}${sortMark(daySortKey, 'previous', daySortDir)}` }}
                        </th>
                        <th @click="toggleDaySort('delta')">
                          {{ `差额${sortMark(daySortKey, 'delta', daySortDir)}` }}
                        </th>
                        <th @click="toggleDaySort('deltaPct')">
                          {{ `涨跌${sortMark(daySortKey, 'deltaPct', daySortDir)}` }}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="row in dayVisibleRows" :key="row.key">
                        <td>{{ row.label }}</td>
                        <td>{{ fmtCell(row.current) }}</td>
                        <td>{{ fmtCell(row.previous) }}</td>
                        <td
                          :class="{
                            'is-up': row.delta > 0,
                            'is-down': row.delta != null && row.delta < 0,
                          }"
                        >
                          {{ fmtDelta(row.delta) }}
                        </td>
                        <td
                          :class="{
                            'is-up': row.deltaPct > 0,
                            'is-down': row.deltaPct != null && row.deltaPct < 0,
                          }"
                        >
                          {{ fmtPct(row.deltaPct) }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <section class="reports-view__card">
                <header class="reports-view__card-head">
                  <h3>{{ metric === 'environment' ? '房间明细' : '设备明细' }}</h3>
                  <span>{{ entityTableHint }}</span>
                </header>
                <div class="reports-view__table-wrap">
                  <table class="reports-view__table">
                    <thead>
                      <tr>
                        <th @click="toggleEntitySort('label')">
                          {{
                            `${metric === 'environment' ? '房间' : '设备'}${sortMark(entitySortKey, 'label', entitySortDir)}`
                          }}
                        </th>
                        <th @click="toggleEntitySort('current')">
                          {{ `${data.periods.current.label}${sortMark(entitySortKey, 'current', entitySortDir)}` }}
                        </th>
                        <th @click="toggleEntitySort('previous')">
                          {{ `${data.periods.previous.label}${sortMark(entitySortKey, 'previous', entitySortDir)}` }}
                        </th>
                        <th @click="toggleEntitySort('delta')">
                          {{ `差额${sortMark(entitySortKey, 'delta', entitySortDir)}` }}
                        </th>
                        <th @click="toggleEntitySort('deltaPct')">
                          {{ `涨跌${sortMark(entitySortKey, 'deltaPct', entitySortDir)}` }}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-if="!entityVisibleRows.length">
                        <td colspan="5" class="is-empty">{{ '暂无数据' }}</td>
                      </tr>
                      <tr v-for="row in entityVisibleRows" :key="row.key">
                        <td :title="row.key">{{ row.label }}</td>
                        <td>{{ fmtCell(row.current) }}</td>
                        <td>{{ fmtCell(row.previous) }}</td>
                        <td :class="{ 'is-up': row.delta > 0, 'is-down': row.delta < 0 }">
                          {{ fmtDelta(row.delta) }}
                        </td>
                        <td
                          :class="{
                            'is-up': row.deltaPct != null && row.deltaPct > 0,
                            'is-down': row.deltaPct != null && row.deltaPct < 0,
                          }"
                        >
                          {{ fmtPct(row.deltaPct) }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </div>

          <div v-else-if="!loading" class="reports-view-empty">
            <p class="reports-view-empty__title">{{ '暂无数据' }}</p>
            <p class="reports-view-empty__desc">
              {{ '当前指标在所选周期内没有可聚合的数据，请切换指标或周期后重试' }}
            </p>
          </div>
        </ApiQueryState>
      </div>
    </section>
  </div>
</template>

<style scoped>
.reports-view.list-page {
  overflow: hidden;
  scrollbar-gutter: auto;
  gap: 8px;
  padding-block: 10px;
}

.reports-view :deep(.list-page__stats) {
  margin-top: 8px;
  gap: 6px;
}

.reports-view :deep(.list-page__toolbar-block) {
  margin-top: 8px;
  padding-top: 8px;
  display: block;
}

/* 单层工具栏：移动端强制一行，过窄可横向轻滑 */
.reports-view__toolbar {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-width: 0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.reports-view__toolbar::-webkit-scrollbar {
  display: none;
}

.reports-view__toolbar-spacer {
  flex: 1 1 4px;
  min-width: 4px;
}

.reports-view__toolbar > :deep(.hos-select--inline) {
  flex: 0 0 auto;
  width: auto;
  max-width: none;
  min-width: 0;
}

.reports-view__toolbar > :deep(.hos-select--inline .hos-select__trigger) {
  width: max-content;
  max-width: 28vw;
  min-height: 36px;
  padding: 6px 8px;
  border-radius: var(--hos-radius-card);
}

.reports-view__toolbar > :deep(.hos-select--inline .hos-select__value) {
  overflow: hidden;
  text-overflow: ellipsis;
}

:deep(.reports-view__filter) {
  min-width: 0;
  justify-content: space-between;
}

:deep(.reports-view__filter--period .hos-select__value) {
  max-width: 7.2em;
}

.reports-view__entity-filter {
  flex: 1 1 88px;
  min-width: 72px;
  max-width: none;
}

.reports-view__entity-filter :deep(.ss-wrap) {
  width: 100%;
  min-width: 0;
}

.reports-view__entity-filter :deep(.ss-input-row) {
  min-height: 36px;
  border-radius: var(--hos-radius-card);
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
}

.reports-view__entity-filter :deep(.ss-input--list-page) {
  padding: 6px 6px 6px 8px;
  font-size: 12px;
  font-weight: 600;
}

.reports-view__entity-filter :deep(.ss-clear),
.reports-view__entity-filter :deep(.ss-toggle) {
  min-height: 36px;
  height: 36px;
  width: 28px;
  min-width: 28px;
}

.reports-view__btn {
  flex: 0 0 auto;
  min-height: 36px;
  padding: 6px 10px;
  border-radius: var(--hos-radius-card);
  white-space: nowrap;
}

@media (max-width: 720px) {
  .reports-view__toolbar {
    gap: 5px;
  }

  .reports-view__toolbar > :deep(.hos-select--inline .hos-select__trigger) {
    max-width: 26vw;
    padding: 6px 6px;
    font-size: 12px;
  }

  .reports-view__entity-filter {
    flex: 1 1 64px;
    min-width: 64px;
  }

  .reports-view__btn {
    padding: 6px 8px;
    font-size: 12px;
  }
}

.reports-view__panel {
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
}

.reports-view__panel-body {
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
}

.reports-view__body {
  flex: 1 1 0;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
}

.reports-view__chips {
  flex-shrink: 0;
  display: flex;
  flex-wrap: nowrap;
  gap: 6px;
  overflow: hidden;
  padding: 2px 0;
}

.reports-view__chip {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  padding: 4px 9px;
  border-radius: var(--hos-radius-pill);
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  font-size: 11px;
  color: rgba(255, 255, 255, 0.72);
  white-space: nowrap;
  flex-shrink: 0;
}

.reports-view__chip em {
  font-style: normal;
  color: var(--hos-text-secondary);
}

.reports-view__chip strong {
  font-weight: 700;
  color: rgba(255, 255, 255, 0.92);
}

.reports-view__chip.is-sky {
  border-color: rgba(56, 189, 248, 0.28);
  background: rgba(56, 189, 248, 0.1);
}

.reports-view__chip.is-amber {
  border-color: rgba(251, 191, 36, 0.28);
  background: rgba(251, 191, 36, 0.1);
}

.reports-view__chip.is-green {
  border-color: rgba(52, 211, 153, 0.28);
  background: rgba(52, 211, 153, 0.1);
}

.reports-view__chip.is-red {
  border-color: rgba(248, 113, 113, 0.28);
  background: rgba(248, 113, 113, 0.1);
}

.reports-view__chip.is-muted {
  opacity: 0.85;
}

/* 核心：等分 2×2，单屏填满 */
.reports-view__grid {
  flex: 1 1 0;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
  overflow: hidden;
}

.reports-view__card {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: var(--hos-radius-card);
  border: 1px solid rgba(255, 255, 255, 0.08);
  background:
    linear-gradient(160deg, rgba(255, 255, 255, 0.035) 0%, rgba(0, 0, 0, 0.22) 100%);
  padding: 10px 12px;
}

.reports-view__card-head {
  flex-shrink: 0;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.reports-view__card-head h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.88);
}

.reports-view__card-head span {
  font-size: 11px;
  color: var(--hos-text-secondary);
  white-space: nowrap;
}

.reports-view__chart {
  flex: 1 1 0;
  min-height: 0;
  width: 100%;
}

.reports-view__table-wrap {
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.reports-view__table {
  width: 100%;
  height: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 12px;
}

.reports-view__table th,
.reports-view__table td {
  padding: 7px 8px;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.reports-view__table th {
  cursor: pointer;
  user-select: none;
  color: var(--hos-text-secondary);
  font-weight: 700;
  background: rgba(8, 10, 16, 0.55);
}

.reports-view__table th:hover {
  color: rgba(255, 255, 255, 0.85);
}

.reports-view__table td {
  color: rgba(255, 255, 255, 0.8);
  font-variant-numeric: tabular-nums;
}

.reports-view__table td.is-up {
  color: #6ee7b7;
}

.reports-view__table td.is-down {
  color: #fca5a5;
}

.reports-view__table td.is-empty {
  text-align: center;
  color: var(--hos-text-secondary);
  padding: 20px 8px;
}

.reports-view-empty {
  flex: 1;
  display: grid;
  place-content: center;
  text-align: center;
  gap: 6px;
}

.reports-view-empty__title {
  margin: 0;
  font-size: var(--premium-fs-body-sm);
  font-weight: 700;
  color: rgba(255, 255, 255, 0.7);
}

.reports-view-empty__desc {
  margin: 0;
  font-size: var(--premium-fs-micro);
  color: var(--hos-text-secondary);
}

@media (max-width: 1100px) {
  .reports-view__grid {
    grid-template-columns: 1fr;
    grid-template-rows: repeat(4, minmax(0, 1fr));
  }
}
</style>
