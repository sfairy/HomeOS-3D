<!--
  组件文件：HubOverview.vue
  所属模块：frontend/src/components/linkage
  组件职责：联动中心总览视图。左侧 analytics 区：analyticsKpiCells 四个 KPI 卡片（总览指标）+
    资产分布饼图（kindChartRef）、健康状态柱图（healthChartRef）、24h 执行时序折线图（timelineChartRef）；
    右侧 side 区：联动资产分类卡片列表 categoryCards（点击跳转 navigate 到对应 Tab）、
    最近执行分页列表 recentExecutions（使用 useFixedPagePagination，5 项/页）。
  主要 props / emits：
    - props.kpiCells / analyticsKpiCells / categoryCards / healthBuckets / kindBuckets：
      数据数组（KPI、分类卡片、ECharts buckets）；
    - props.executionTimeline / executionSummary / recentExecutions：执行时序与摘要；
    - props.loading / error：ApiQueryState 加载/错误态。
    - emit reload：错误态点击重试；emit navigate(kind)：点击资产分类卡片跳转对应管理页。
  依赖关系：ApiQueryState + VEmptyState（加载/错误/空态）；useFixedPagePagination（执行列表分页）；
    @lucide/vue ChevronRight 等图标；ECharts（kind/health/timeline 三个 ref 节点）；
    formatExecutionRelativeTime 时间格式化；RouterLink（跳转执行历史/设置）。
-->
<template>
  <div class="linkage-overview">
    <div class="linkage-overview__content">
      <ApiQueryState
        :loading="loading && !hasAnyData"
        :error="error"
        error-title="联动总览加载失败"
        tone="violet"
        @retry="emit('reload')"
      >
        <div class="linkage-overview__layout">
          <section class="linkage-overview__analytics">
            <div class="linkage-overview__analytics-glow linkage-overview__analytics-glow--tl" aria-hidden="true" />
            <div class="linkage-overview__analytics-glow linkage-overview__analytics-glow--br" aria-hidden="true" />

            <div v-if="analyticsKpiCells.length" class="linkage-overview__kpis">
              <article
                v-for="cell in analyticsKpiCells"
                :key="cell.key"
                class="linkage-overview__kpi"
                :class="cell.tone ? `linkage-overview__kpi--${cell.tone}` : ''"
              >
                <span class="linkage-overview__kpi-label">{{ cell.label }}</span>
                <strong
                  class="linkage-overview__kpi-value"
                  :class="cell.tone ? `linkage-overview__kpi-value--${cell.tone}` : ''"
                >
                  {{ cell.value }}
                </strong>
                <span v-if="cell.hint" class="linkage-overview__kpi-hint">{{ cell.hint }}</span>
              </article>
            </div>

            <div class="linkage-overview__charts">
              <article class="linkage-overview__chart-card">
                <header class="linkage-overview__chart-head">
                  <span class="linkage-overview__chart-title">{{ '资产分布' }}</span>
                  <span class="linkage-overview__chart-hint">{{ '点击跳转' }}</span>
                </header>
                <div ref="kindChartRef" class="linkage-overview__chart" />
              </article>

              <article class="linkage-overview__chart-card">
                <header class="linkage-overview__chart-head">
                  <span class="linkage-overview__chart-title">{{ '健康状态' }}</span>
                  <span class="linkage-overview__chart-hint">{{ 'HomeOS 本地' }}</span>
                </header>
                <div ref="healthChartRef" class="linkage-overview__chart" />
              </article>

              <article class="linkage-overview__chart-card linkage-overview__chart-card--wide">
                <header class="linkage-overview__chart-head">
                  <span class="linkage-overview__chart-title">{{ '执行时序' }}</span>
                  <span class="linkage-overview__chart-hint">{{
                    `近 24h · 成功率 ${executionSummary.successRate}%`
                  }}</span>
                </header>
                <div ref="timelineChartRef" class="linkage-overview__chart" />
              </article>
            </div>
          </section>

          <aside class="linkage-overview__side">
            <section class="linkage-overview__stream linkage-overview__stream--cats">
              <div class="linkage-overview__stream-glow" aria-hidden="true" />
              <header class="linkage-overview__stream-head">
                <div>
                  <h2 class="linkage-overview__stream-title">{{ '联动资产' }}</h2>
                  <p class="linkage-overview__stream-sub">{{ '点击进入管理' }}</p>
                </div>
              </header>
              <div class="linkage-overview__cat-list">
                <button
                  v-for="card in categoryCards"
                  :key="card.kind"
                  type="button"
                  class="linkage-overview__cat-card interactive-press"
                  :style="{ '--cat-accent': card.accent }"
                  @click="emit('navigate', card.kind)"
                >
                  <span class="linkage-overview__cat-accent" aria-hidden="true" />
                  <span class="linkage-overview__cat-orb">{{ card.emoji }}</span>
                  <div class="linkage-overview__cat-body">
                    <span class="linkage-overview__cat-label">{{ card.label }}</span>
                    <strong class="linkage-overview__cat-value">{{ card.total }}</strong>
                  </div>
                  <div class="linkage-overview__cat-meta">
                    <span
                      v-if="card.attention"
                      class="linkage-overview__pill linkage-overview__pill--warn"
                      >{{ `${card.attention} 关注` }}</span
                    >
                    <span
                      v-else-if="card.drift"
                      class="linkage-overview__pill linkage-overview__pill--danger"
                      >{{ `${card.drift} 漂移` }}</span
                    >
                    <span v-else class="linkage-overview__pill linkage-overview__pill--ok">{{
                      '正常'
                    }}</span>
                  </div>
                  <ChevronRight class="linkage-overview__cat-chevron w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </section>

            <section class="linkage-overview__stream linkage-overview__stream--exec">
              <div class="linkage-overview__stream-glow" aria-hidden="true" />
              <header class="linkage-overview__stream-head">
                <div>
                  <h2 class="linkage-overview__stream-title">{{ '执行历史' }}</h2>
                  <p class="linkage-overview__stream-sub">{{
                    recentExecutions.length
                      ? `近 24h · 成功率 ${executionSummary.successRate}%`
                      : '暂无执行记录'
                  }}</p>
                </div>
                <router-link
                  :to="SETTINGS_ROUTES.executionHistory()"
                  class="linkage-overview__stream-link"
                >
                  {{ '全部' }}
                </router-link>
              </header>
              <div class="linkage-overview__stream-body">
                <p v-if="!recentExecutions.length" class="linkage-overview__empty">{{ '暂无记录' }}</p>
                <ul
                  v-else
                  class="linkage-overview__exec-list linkage-overview__exec-list--paged"
                  :style="{ '--exec-rows': String(EXEC_PAGE_SIZE) }"
                >
                  <li
                    v-for="record in pagedExecutions"
                    :key="record.id"
                    class="linkage-overview__exec-item"
                  >
                    <span
                      class="linkage-overview__exec-accent"
                      :class="
                        record.success
                          ? 'linkage-overview__exec-accent--ok'
                          : 'linkage-overview__exec-accent--fail'
                      "
                      aria-hidden="true"
                    />
                    <div class="linkage-overview__exec-main">
                      <span class="linkage-overview__exec-name">{{
                        executionDisplayName(record)
                      }}</span>
                      <span class="linkage-overview__exec-type">{{
                        record.detail || typeLabel(record.type)
                      }}</span>
                    </div>
                    <span class="linkage-overview__exec-time">{{
                      formatRelativeTime(record.executedAt)
                    }}</span>
                  </li>
                </ul>
              </div>
              <footer v-if="execTotalPages > 1" class="linkage-overview__exec-pager">
                <button
                  type="button"
                  class="list-page__btn"
                  :disabled="!execCanPrev"
                  @click="execPrevPage"
                >
                  {{ '上一页' }}
                </button>
                <span class="list-page__muted">
                  {{ execPageLabel }}（共 {{ recentExecutions.length }} 条 · 每页 {{ EXEC_PAGE_SIZE }}）
                </span>
                <button
                  type="button"
                  class="list-page__btn"
                  :disabled="!execCanNext"
                  @click="execNextPage"
                >
                  {{ '下一页' }}
                </button>
              </footer>
            </section>
          </aside>
        </div>
      </ApiQueryState>
    </div>
  </div>
</template>

<script setup>
/**
 * LinkageHubOverview - 联动中心总览组件
 * 职责：以图表 + 流式列表的形式展示联动资产分布、健康状态、近 24 小时执行时序与最近执行记录。
 * 关键依赖：
 * - useEchartsHost 统一管理 echarts 渲染与 resize 调度；
 * - useFixedPagePagination 实现执行记录固定每页大小的分页；
 * - schedulePoll 全局轮询，页面隐藏时自动暂停相对时间刷新。
 * 关键交互：
 * - 点击资产分布饼图或资产卡片触发 navigate 事件，由父级路由跳转到对应管理页；
 * - 报告加载失败时 ApiQueryState 提供 retry 入口，触发 reload 事件。
 */
import '@/assets/styles/linkage-hub-overview.css'
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { ChevronRight } from '@lucide/vue'
import { useEchartsHost, splitLineStyle } from '@/composables/ui/useEchartsHost'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import {
  executionHistoryTypeLabel,
  executionHistoryDisplayName,
  formatExecutionRelativeTime,
} from '@/utils/orchestrator/execution-history-display.util'
import { useFixedPagePagination } from '@/composables/ui/hub-viewport.internals'
import { schedulePoll } from '@/utils/core/poll-scheduler'

const EXEC_PAGE_SIZE = 4

const props = defineProps({
  kpiCells: { type: Array, default: () => [] },
  analyticsKpiCells: { type: Array, default: () => [] },
  categoryCards: { type: Array, default: () => [] },
  healthBuckets: { type: Array, default: () => [] },
  kindBuckets: { type: Array, default: () => [] },
  executionTimeline: { type: Array, default: () => [] },
  executionSummary: { type: Object, default: () => ({ total: 0, successRate: 100 }) },
  recentExecutions: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
})

const emit = defineEmits(['reload', 'navigate'])

const execCount = computed(() => props.recentExecutions.length)

const {
  totalPages: execTotalPages,
  canPrev: execCanPrev,
  canNext: execCanNext,
  pageLabel: execPageLabel,
  prevPage: execPrevPage,
  nextPage: execNextPage,
  sliceItems: sliceExecutions,
} = useFixedPagePagination({
  itemCount: execCount,
  perPage: EXEC_PAGE_SIZE,
})

const pagedExecutions = computed(() => sliceExecutions(props.recentExecutions))

/** 驱动相对时间文案（刚刚 / N 分钟前）随时间刷新 */
const nowTick = ref(Date.now())
// 相对时间刷新任务取消函数（注册到全局调度器，页面隐藏时自动暂停）
let relativeTimeCancel = null

function formatRelativeTime(iso) {
  void nowTick.value
  return formatExecutionRelativeTime(iso)
}

const kindChartRef = ref(null)
const healthChartRef = ref(null)
const timelineChartRef = ref(null)

// 保持原语义：resize 观察与渲染共用调度 owner；echarts 由宿主惰性加载（分包）
const { schedule, bindResize, getChartBase } = useEchartsHost({
  charts: {
    kind: {
      el: () => kindChartRef.value,
      build: buildKindOption,
      onInit: (chart) => {
        chart.off('click')
        chart.on('click', (params) => {
          const bucket = props.kindBuckets.find((b) => b.label === params.name)
          if (bucket) emit('navigate', bucket.kind)
        })
      },
    },
    health: { el: () => healthChartRef.value, build: buildHealthOption },
    timeline: { el: () => timelineChartRef.value, build: buildTimelineOption },
  },
  sharedResizeOwner: true,
})

const chartTooltip = {
  backgroundColor: 'rgba(12, 12, 18, 0.94)',
  borderColor: 'rgba(191, 90, 242, 0.32)',
  borderWidth: 1,
  padding: [8, 12],
  extraCssText:
    'border-radius: 10px; backdrop-filter: blur(12px); box-shadow: 0 8px 28px rgba(0,0,0,0.35);',
  textStyle: { color: '#e9d5ff', fontSize: 12, fontWeight: 600 },
}

const hasAnyData = computed(
  () =>
    props.kindBuckets.some((b) => b.total > 0) ||
    props.recentExecutions.length > 0 ||
    props.executionTimeline.some((b) => b.total > 0),
)

function typeLabel(type) {
  return executionHistoryTypeLabel(type)
}

function executionDisplayName(record) {
  return executionHistoryDisplayName(record)
}

function buildKindOption() {
  const data = props.kindBuckets.filter((b) => b.total > 0)
  return {
    ...getChartBase(),
    tooltip: { ...chartTooltip, trigger: 'item' },
    series: [
      {
        type: 'pie',
        radius: ['44%', '70%'],
        center: ['50%', '54%'],
        padAngle: 2,
        label: { color: 'rgba(255,255,255,0.68)', fontSize: 10, fontWeight: 600 },
        itemStyle: { borderRadius: 5, borderColor: 'rgba(0,0,0,0.35)', borderWidth: 1 },
        data: data.length
          ? data.map((b) => ({ name: b.label, value: b.total, itemStyle: { color: b.accent } }))
          : [{ name: '暂无', value: 1, itemStyle: { color: '#64748b' } }],
      },
    ],
  }
}

function buildHealthOption() {
  const data = props.healthBuckets.filter((b) => b.count > 0)
  return {
    ...getChartBase(),
    tooltip: { ...chartTooltip, trigger: 'item' },
    series: [
      {
        type: 'pie',
        radius: ['44%', '70%'],
        center: ['50%', '54%'],
        padAngle: 2,
        label: { color: 'rgba(255,255,255,0.68)', fontSize: 10, fontWeight: 600 },
        itemStyle: { borderRadius: 5, borderColor: 'rgba(0,0,0,0.35)', borderWidth: 1 },
        data: data.length
          ? data.map((b) => ({ name: b.label, value: b.count, itemStyle: { color: b.color } }))
          : [{ name: '暂无', value: 1, itemStyle: { color: '#64748b' } }],
      },
    ],
  }
}

function buildTimelineOption() {
  const labels = props.executionTimeline.map((b) => b.label)
  const totals = props.executionTimeline.map((b) => b.total)
  const max = Math.max(...totals, 1)
  return {
    ...getChartBase(),
    grid: { left: 32, right: 10, top: 12, bottom: labels.length > 10 ? 28 : 22 },
    tooltip: { ...chartTooltip, trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: labels,
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.07)' } },
      axisTick: { show: false },
      axisLabel: {
        color: 'rgba(255,255,255,0.58)',
        fontSize: 9,
        interval: Math.max(0, Math.floor(labels.length / 6) - 1),
      },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max,
      minInterval: 1,
      axisLine: { show: false },
      splitLine: splitLineStyle,
      axisLabel: { color: 'rgba(255,255,255,0.58)', fontSize: 9 },
    },
    series: [
      {
        name: '成功',
        type: 'bar',
        stack: 'exec',
        barMaxWidth: 14,
        itemStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: '#34d399' },
              { offset: 1, color: 'rgba(52, 211, 153, 0.35)' },
            ],
          },
          borderRadius: [0, 0, 0, 0],
        },
        data: props.executionTimeline.map((b) => Math.max(0, b.total - b.failures)),
      },
      {
        name: '失败',
        type: 'bar',
        stack: 'exec',
        barMaxWidth: 14,
        itemStyle: { color: '#f87171', borderRadius: [4, 4, 0, 0] },
        data: props.executionTimeline.map((b) => b.failures),
      },
    ],
  }
}

watch(
  () => [props.kindBuckets, props.healthBuckets, props.executionTimeline],
  () => {
    schedule()
  },
  { deep: true },
)

watch(
  () => props.loading && !hasAnyData.value,
  (showSkeleton) => {
    if (!showSkeleton) {
      nextTick(() => {
        bindResize()
        schedule()
      })
    }
  },
)

onMounted(() => {
  // 经全局调度器每 30 秒刷新相对时间
  relativeTimeCancel = schedulePoll(
    'hub-overview:relative-time',
    () => {
      nowTick.value = Date.now()
    },
    30_000,
  )
})

onUnmounted(() => {
  if (relativeTimeCancel) {
    relativeTimeCancel()
    relativeTimeCancel = null
  }
})
</script>
