<!--
组件：LifeSmartTab.vue
所属模块：frontend / src / views
职责：生活页「智能」子标签——左栏复用 SmartHubPanel，右栏拼装 KPI / 状态芯片 /
      自动化健康（成功率仪表+TOP 自动化）/ 时段曲线（失败+习惯活跃）/ 峰段周环比 /
      今日建议 / 日程·寿命卡片。
数据来源：
  - KPI / 建议 / 提醒 / 设备寿命来自 useLifeOverview；
  - 自动化统计 / 时段曲线 / 峰段对比 / 习惯状态来自 useLifeSmartAnalytics；
  - Hub 子标签切换经 useLifeHubPanelTab（默认 overview）。
关键交互：
  - 点击图表链接切到 Hub 的 analytics/habits/advisor/overview 子标签；
  - 四张图通过 useHubChart 自动渲染，依赖各自数据源；
  - 状态芯片仅在自动化失败或习惯待办时显示，避免与 KPI 重复。
-->
<template>
  <div class="life-module life-module--split life-module--smart life-smart">
    <section class="life-module__workspace life-module__panel life-smart__hero">
      <SmartHubPanel
        embed
        :default-tab="panelTab"
        :tab-select-token="tabSelectToken"
        :panel-visible="true"
      />
    </section>

    <aside class="life-module__analytics life-smart__rail">
      <div class="life-module__analytics-glow" aria-hidden="true" />

      <LifeKpiGrid class="life-smart__kpis" :kpis="kpis" />

      <LifeStatusChips v-if="statusChips.length" variant="smart" :chips="statusChips" />

      <div class="life-smart__stack">
        <article class="life-smart__card life-smart__card--charts">
          <LifeChartCard
            title="自动化健康"
            link-text="分析"
            link-class="life-smart__link"
            @link-click="selectPanelTab('analytics')"
          >
            <div class="life-smart__chart-row">
              <div ref="gaugeRef" class="life-smart__spark life-smart__spark--gauge" />
              <div class="life-smart__chart-meta">
                <p v-if="analytics.automation.value">
                  <strong>{{ analytics.automation.value.totalExecutions }}</strong>
                  <span>{{ '近窗执行' }}</span>
                </p>
                <p v-if="analytics.automation.value">
                  <strong class="is-fail">{{ analytics.automation.value.failureCount }}</strong>
                  <span>{{ '失败' }}</span>
                </p>
                <p v-if="analytics.savingsYuan.value != null">
                  <strong class="is-save">{{ `¥${analytics.savingsYuan.value}` }}</strong>
                  <span>{{ '规则估算月省' }}</span>
                </p>
                <p v-else-if="!analytics.isAdmin.value" class="life-smart__chart-note">
                  {{ '需管理员查看执行分析' }}
                </p>
                <p v-else-if="!analytics.loading.value" class="life-smart__chart-note">
                  {{ '暂无执行采样' }}
                </p>
              </div>
            </div>
            <div v-if="analytics.topAutomations.value.length" class="life-smart__top-list">
              <button
                v-for="row in analytics.topAutomations.value.slice(0, 4)"
                :key="row.name"
                type="button"
                class="life-smart__top-item"
                @click="selectPanelTab('analytics')"
              >
                <strong>{{ row.name }}</strong>
                <span>{{ `${row.executions} 次` }}</span>
                <em>{{ `${Number(row.successRate).toFixed(0)}%` }}</em>
              </button>
            </div>
          </LifeChartCard>
        </article>

        <article
          v-if="showHourCharts || analytics.loading.value"
          class="life-smart__card life-smart__card--chart"
          :class="{ 'life-smart__card--compact': !showHourCharts }"
        >
          <LifeChartCard
            title="时段曲线"
            link-text="习惯"
            link-class="life-smart__link"
            @link-click="selectPanelTab('habits')"
          >
            <div
              v-if="showHourCharts"
              class="life-smart__dual-charts"
              :class="{ 'life-smart__dual-charts--single': !(hasFailSignal && hasHabitSignal) }"
            >
              <div v-show="hasFailSignal">
                <span class="life-module__chart-title">{{ '失败' }}</span>
                <div ref="failChartRef" class="life-smart__spark life-smart__spark--half" />
              </div>
              <div v-show="hasHabitSignal">
                <span class="life-module__chart-title">{{ '习惯活跃' }}</span>
                <div ref="habitChartRef" class="life-smart__spark life-smart__spark--half" />
              </div>
            </div>
            <p v-else class="life-module__empty life-module__empty--inline">{{ '加载中…' }}</p>
          </LifeChartCard>
        </article>

        <article
          v-if="analytics.peakCompare.value"
          class="life-smart__card life-smart__card--chart"
        >
          <LifeChartCard title="峰段周环比">
            <template #action>
              <span
                class="life-smart__chip"
                :class="analytics.peakCompare.value.improved ? 'is-ok' : 'is-warn'"
              >
                {{ analytics.peakCompare.value.improved ? '改善' : '升高' }}
              </span>
            </template>
            <div ref="peakChartRef" class="life-smart__spark life-smart__spark--short" />
            <p v-if="analytics.peakCompare.value.note" class="life-smart__chart-note">
              {{ analytics.peakCompare.value.note }}
            </p>
          </LifeChartCard>
        </article>

        <article v-if="advisorTips.length" class="life-smart__card">
          <LifeChartCard
            title="今日建议"
            link-text="建议"
            link-class="life-smart__link"
            @link-click="selectPanelTab('advisor')"
          >
            <ul class="life-smart__tips">
              <li
                v-for="(tip, i) in advisorTips.slice(0, 4)"
                :key="i"
                :class="`is-tone-${i % 3}`"
              >
                <strong>{{ tip.title }}</strong>
                <p v-if="tip.message">{{ tip.message }}</p>
              </li>
            </ul>
          </LifeChartCard>
        </article>

        <article
          v-if="reminderItems.length || lifespanItems.length"
          class="life-smart__card"
        >
          <LifeChartCard
            title="日程 · 寿命"
            link-text="日程"
            link-class="life-smart__link"
            :link-to="scheduleRoute"
          >
            <div class="life-smart__split-lists">
              <ul v-if="reminderItems.length" class="life-smart__list">
                <li
                  v-for="(item, idx) in reminderItems.slice(0, 4)"
                  :key="item.id"
                  :class="item.type === 'medication' ? 'is-med' : `is-tone-${idx % 3}`"
                >
                  <strong>{{ item.title }}</strong>
                  <span>{{ item.time }}</span>
                </li>
              </ul>
              <div v-if="lifespanItems.length" class="life-smart__devices">
                <button
                  v-for="item in lifespanItems.slice(0, 4)"
                  :key="item.id"
                  type="button"
                  class="life-smart__device"
                  :class="item.warn ? 'is-warn' : 'is-ok'"
                  @click="selectPanelTab('overview')"
                >
                  <strong>{{ item.name }}</strong>
                  <span>{{ item.level }}</span>
                </button>
              </div>
            </div>
          </LifeChartCard>
        </article>
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import SmartHubPanel from '@/components/widgets/orchestrator/SmartHubPanel.vue'
import LifeKpiGrid from '@/components/life/LifeKpiGrid.vue'
import LifeStatusChips from '@/components/life/LifeStatusChips.vue'
import LifeChartCard from '@/components/life/LifeChartCard.vue'
import { useLifeOverview } from '@/composables/life/useLifeOverview'
import { useLifeHubPanelTab } from '@/composables/life/useLifeHubPanelTab'
import { useLifeSmartAnalytics } from '@/composables/life/useLifeSmartAnalytics'
import { useHubChart } from '@/composables/life/useLifeChartHost'
import {
  buildHourAreaOption,
  buildPeakCompareOption,
  buildSuccessRateGaugeOption,
} from '@/utils/chart/life-charts.util'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'

const { tabMetricCells, advisorTips, reminderItems, lifespanItems } = useLifeOverview()

const analytics = useLifeSmartAnalytics()

const { panelTab, tabSelectToken, selectPanelTab } = useLifeHubPanelTab('overview')
const scheduleRoute = SETTINGS_ROUTES.smartServices('schedule')

const kpis = computed(() => tabMetricCells.value.smart || [])

/** 判断小时序列是否有信号：任一时刻 value > 0 即视为有数据，用于决定双图显隐。 */
function hourSeriesHasSignal(rows: Array<{ value: number }> | undefined) {
  return (rows || []).some((r) => Number(r.value) > 0)
}

const hasFailSignal = computed(() => hourSeriesHasSignal(analytics.failuresByHour.value))
const hasHabitSignal = computed(() => hourSeriesHasSignal(analytics.habitActivity.value))
const showHourCharts = computed(() => hasFailSignal.value || hasHabitSignal.value)

/** 仅自动化/习惯增量，不重复 KPI 建议/提醒/设备计数 */
const statusChips = computed(() => {
  const chips: Array<{ key: string; label: string; value: number | string }> = []
  const fail = analytics.automation.value?.failureCount ?? 0
  if (fail > 0) chips.push({ key: 'fail', label: '失败', value: fail })
  if (analytics.habitNeedsBaseline.value) {
    chips.push({ key: 'baseline', label: '习惯', value: '学习中' })
  } else if (analytics.habitPending.value > 0) {
    chips.push({ key: 'habit', label: '习惯待办', value: analytics.habitPending.value })
  }
  return chips
})

const gaugeRef = ref<HTMLElement | null>(null)
const failChartRef = ref<HTMLElement | null>(null)
const habitChartRef = ref<HTMLElement | null>(null)
const peakChartRef = ref<HTMLElement | null>(null)

useHubChart(
  gaugeRef,
  () =>
    buildSuccessRateGaugeOption(
      analytics.automation.value?.successRate ?? 0,
      analytics.automation.value?.totalExecutions ?? 0,
    ),
  [() => analytics.automation.value],
)

useHubChart(
  failChartRef,
  () =>
    buildHourAreaOption(analytics.failuresByHour.value, {
      accent: '#fb7185',
      name: '失败次数',
      emptyLabel: '暂无失败',
    }),
  [() => analytics.failuresByHour.value],
)

useHubChart(
  habitChartRef,
  () =>
    buildHourAreaOption(analytics.habitActivity.value, {
      accent: '#fbbf24',
      name: '活跃度',
      emptyLabel: '学习中',
    }),
  [() => analytics.habitActivity.value],
)

useHubChart(
  peakChartRef,
  () => {
    const peak = analytics.peakCompare.value
    return buildPeakCompareOption(peak?.thisWeek ?? 0, peak?.lastWeek ?? 0)
  },
  [() => analytics.peakCompare.value],
)
</script>
