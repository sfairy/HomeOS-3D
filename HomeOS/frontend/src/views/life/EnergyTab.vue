<!--
组件：LifeEnergyTab.vue
所属模块：frontend / src / views
职责：生活页「能耗」子标签——左栏复用 EnergyDashboard，右栏拼装 KPI / 峰值芯片 /
      账户余额 / 功率趋势图 / 能耗排名条形。
数据来源：
  - KPI 与账户余额来自 useLifeOverview（tabMetricCells / energyMetrics）；
  - 功率趋势、排名、缓存降级标志来自 useLifeOverviewAnalytics；
  - Hub 子标签切换经 useLifeHubPanelTab（默认 overview）。
关键交互：
  - 点击图表链接切到 Hub 的 overview / analytics 子标签；
  - useHubChart 在挂载时自动渲染功率趋势折线图，依赖 analytics.powerTrend；
  - 余额卡片按账户数自适应单列/多列网格。
-->
<template>
  <div class="life-module life-module--split life-module--energy life-energy">
    <section class="life-module__workspace life-module__panel life-energy__hero">
      <EnergyDashboard
        embed
        :floating-compact="false"
        :panel-visible="true"
        :default-tab="panelTab"
        :tab-select-token="tabSelectToken"
      />
    </section>

    <aside class="life-module__analytics life-energy__rail">
      <div class="life-module__analytics-glow" aria-hidden="true" />

      <LifeKpiGrid v-if="kpis.length" class="life-module__kpis" :kpis="kpis" />

      <div v-if="peakChips.length" class="life-module__chip-row">
        <span
          v-for="chip in peakChips"
          :key="chip.key"
          class="life-module__stat-chip"
          :class="chip.key === 'peak' ? 'is-amber' : 'is-sky'"
        >
          <em>{{ chip.label }}</em>
          <strong>{{ chip.value }}</strong>
        </span>
        <span v-if="analytics.redisDegraded.value" class="life-module__stat-chip is-warn">
          <em>{{ '缓存' }}</em>
          <strong>{{ analytics.usingHaHistory.value ? 'HA 历史' : '降级' }}</strong>
        </span>
      </div>

      <article v-if="energyMetrics.length" class="life-module__metric-card life-energy__balances">
        <LifeChartCard
          title="账户余额"
          link-text="总览"
          link-class="life-module__chart-link"
          @link-click="selectPanelTab('overview')"
        >
          <div class="life-module__metric-grid" :class="balanceGridClass">
            <div
              v-for="(m, idx) in energyMetrics"
              :key="m.key"
              class="life-module__metric"
              :class="`life-module__metric--tone-${idx % 4}`"
            >
              <span class="life-module__metric-label">{{ m.label }}</span>
              <span class="life-module__metric-val"
                >{{ m.value
                }}<span v-if="m.unit" class="life-module__metric-unit">{{ m.unit }}</span></span
              >
            </div>
          </div>
        </LifeChartCard>
      </article>

      <div class="life-module__charts">
        <article class="life-module__chart-card life-module__chart-card--tall">
          <LifeChartCard title="功率趋势" :hint="powerHint">
            <div ref="powerChartRef" class="life-module__chart" />
            <p v-if="!analytics.powerTrend.value.length" class="life-module__empty">
              <template v-if="analytics.loading.value">{{ '加载中…' }}</template>
              <template v-else>
                {{ '暂无功率采样。' }}
                <RouterLink class="life-module__empty-link" :to="bindingsHref">{{
                  '去绑定电表/能源实体'
                }}</RouterLink>
              </template>
            </p>
          </LifeChartCard>
        </article>

        <article v-if="rankShares.length" class="life-module__board-card">
          <LifeChartCard
            title="能耗排名 · 占比"
            link-text="分析"
            link-class="life-module__chart-link"
            @link-click="selectPanelTab('analytics')"
          >
            <div class="life-module__bars">
              <div
                v-for="(row, idx) in rankShares"
                :key="row.entityId"
                class="life-module__bar-row"
                :class="`life-module__bar-row--rank-${Math.min(idx, 4)}`"
              >
                <div class="life-module__bar-label">
                  <span class="life-module__bar-name">{{ row.name }}</span>
                  <strong>{{ `${row.kwh.toFixed(2)} kWh` }}</strong>
                </div>
                <div class="life-module__bar-track">
                  <i :style="{ width: `${row.pct}%` }" />
                </div>
              </div>
            </div>
          </LifeChartCard>
        </article>

        <article v-else class="life-module__chart-card life-module__chart-card--compact">
          <LifeChartCard title="能耗排名">
            <p class="life-module__empty life-module__empty--inline">
              <template v-if="analytics.loading.value">{{ '加载中…' }}</template>
              <template v-else>
                {{ '暂无排名数据。' }}
                <RouterLink class="life-module__empty-link" :to="bindingsHref">{{
                  '去绑定配置'
                }}</RouterLink>
              </template>
            </p>
          </LifeChartCard>
        </article>
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { RouterLink } from 'vue-router'
import EnergyDashboard from '@/components/widgets/energy/Dashboard.vue'
import LifeKpiGrid from '@/components/life/LifeKpiGrid.vue'
import LifeChartCard from '@/components/life/LifeChartCard.vue'
import { useLifeOverview } from '@/composables/life/useLifeOverview'
import { useLifeOverviewAnalytics } from '@/composables/life/useLifeOverviewAnalytics'
import { useLifeHubPanelTab } from '@/composables/life/useLifeHubPanelTab'
import { useHubChart } from '@/composables/life/useLifeChartHost'
import { buildPowerTrendOption } from '@/utils/chart/life-charts.util'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'

const { tabMetricCells, energyMetrics } = useLifeOverview()
const analytics = useLifeOverviewAnalytics()
const { panelTab, tabSelectToken, selectPanelTab } = useLifeHubPanelTab('overview')
const bindingsHref = SETTINGS_ROUTES.bindings()

const kpis = computed(() => tabMetricCells.value.energy || [])

// 余额网格列数：仅 1 个账户时切到单列布局，避免单元格被拉宽
const balanceGridClass = computed(() =>
  energyMetrics.value.length <= 1 ? 'life-module__metric-grid--cols-1' : '',
)

// 功率趋势图副标题：HA 历史回填模式下额外标注「HA 历史」
const powerHint = computed(() => {
  const hours = analytics.chartHours.value
  if (analytics.usingHaHistory.value) return `近 ${hours}h · HA 历史`
  return `近 ${hours}h`
})

// 峰值芯片：从功率趋势序列中找出峰值与最新值，分别展示当前功率与峰值功率
const peakChips = computed(() => {
  const series = analytics.powerTrend.value || []
  if (!series.length) return [] as Array<{ key: string; label: string; value: string }>
  let peak = series[0]
  for (const p of series) if (p.value > peak.value) peak = p
  const latest = series[series.length - 1]
  return [
    { key: 'now', label: '当前功率', value: `${latest.value.toFixed(0)} W` },
    { key: 'peak', label: '峰值功率', value: `${peak.value.toFixed(0)} W` },
  ]
})

// 能耗排名占比：以最大值为 100% 基线，最小宽度 4% 保证短条仍可见
const rankShares = computed(() => {
  const rows = analytics.ranking.value || []
  if (!rows.length) return []
  const top = Math.max(...rows.map((r) => r.kwh), 0.0001)
  return rows.slice(0, 5).map((r) => ({
    ...r,
    pct: Math.max(4, Math.round((r.kwh / top) * 100)),
  }))
})

const powerChartRef = ref<HTMLElement | null>(null)

useHubChart(
  powerChartRef,
  () => buildPowerTrendOption(analytics.powerTrend.value),
  [() => analytics.powerTrend.value],
)
</script>
