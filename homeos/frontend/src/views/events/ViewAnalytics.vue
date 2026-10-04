<!--
组件：EventsViewAnalytics.vue
所属模块：frontend / src / views
职责：事件历史「分析」子视图——渲染 KPI 卡 + 三个 ECharts 图表
      （域分布饼图 / 事件时序折线 / 高频实体横向条形）。
数据来源：父级透传 props.stats（后端聚合统计）；图表由本组件用 ECharts 直接渲染。
Props：
  - stats：后端聚合统计对象（byDomain / byTime / topEntities / total），可空。
  - hours：回溯窗口小时数，影响 KPI 均值与时间粒度（≤48h 按小时 / 否则按天）。
  - entityFilter / domainFilter：当前筛选条件，变化时触发图表重渲。
  - entityDisplayName / formatCount：实体友好名与计数格式化函数（由父级注入复用）。
Emits：
  - filter-by-domain：用户点击域饼图扇区时抛出，供父级联动筛选。
  - filter-by-entity：用户点击实体条形时抛出，供父级联动筛选。
关键交互：
  - 三张图表通过 useEchartsHost 统一调度渲染（schedule + onRendered 回调绑定点击事件）；
  - watch stats/hours/筛选 变化时调用 schedule 触发重渲。
-->
<template>
  <div class="ev-analytics">
    <div class="ev-analytics__glow ev-analytics__glow--tl" aria-hidden="true" />
    <div class="ev-analytics__glow ev-analytics__glow--br" aria-hidden="true" />

    <div class="ev-analytics__kpis">
      <article
        v-for="cell in kpiCells"
        :key="cell.key"
        class="ev-analytics__kpi"
        :class="cell.tone ? `ev-analytics__kpi--${cell.tone}` : ''"
      >
        <span class="ev-analytics__kpi-label">{{ cell.label }}</span>
        <strong
          class="ev-analytics__kpi-value"
          :class="cell.tone ? `ev-analytics__kpi-value--${cell.tone}` : ''"
        >
          {{ cell.value }}
        </strong>
        <span v-if="cell.hint" class="ev-analytics__kpi-hint">{{ cell.hint }}</span>
      </article>
    </div>

    <div class="ev-analytics__charts">
      <section class="ev-analytics__chart-card">
        <header class="ev-analytics__chart-head">
          <span class="ev-analytics__chart-title">活跃域分布</span>
          <span class="ev-analytics__chart-hint">点击筛选</span>
        </header>
        <div ref="domainChartRef" class="ev-analytics__chart" />
      </section>

      <section class="ev-analytics__chart-card">
        <header class="ev-analytics__chart-head">
          <span class="ev-analytics__chart-title">事件时序</span>
          <span class="ev-analytics__chart-hint">{{ hours <= 48 ? '按小时' : '按天' }}</span>
        </header>
        <div ref="timeChartRef" class="ev-analytics__chart" />
      </section>

      <section class="ev-analytics__chart-card ev-analytics__chart-card--wide">
        <header class="ev-analytics__chart-head">
          <span class="ev-analytics__chart-title">高频实体</span>
          <span class="ev-analytics__chart-hint">点击筛选</span>
        </header>
        <div ref="entityChartRef" class="ev-analytics__chart" />
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import {
  useEchartsHost,
  axisLineStyle,
  splitLineStyle,
  yMax,
} from '@/composables/ui/useEchartsHost'
import {
  buildDomainBuckets,
  buildEntityBuckets,
  buildTimeBuckets,
  computeEventAnalyticsSummary,
} from '@/views/events/analytics.util'

const props = defineProps({
  stats: { type: [Object, null], default: null },
  hours: { type: Number, default: 24 },
  entityFilter: { type: String, default: '' },
  domainFilter: { type: String, default: '' },
  entityDisplayName: { type: Function, required: true },
  formatCount: { type: Function, required: true },
})

const emit = defineEmits(['filter-by-domain', 'filter-by-entity'])

// 三张图表的 DOM 容器引用，由 useEchartsHost 接管渲染
const domainChartRef = ref(null)
const timeChartRef = ref(null)
const entityChartRef = ref(null)

// 注册三张图表并统一调度：每张图提供「取 DOM」+「构造 option」两个回调，
// onRendered 钩子在渲染完成后绑定点击事件以联动筛选
const { schedule, get, getChartBase } = useEchartsHost({
  charts: {
    domain: { el: () => domainChartRef.value, build: buildDomainOption },
    time: { el: () => timeChartRef.value, build: buildTimeOption },
    entity: { el: () => entityChartRef.value, build: buildEntityOption },
  },
  onRendered: bindChartClicks,
})

// 数据加工：把后端 stats 规整为图表桶与 KPI 汇总（见 analytics.util.ts）
const domainBuckets = computed(() => buildDomainBuckets(props.stats?.byDomain))
const timeBuckets = computed(() => buildTimeBuckets(props.stats?.byTime))
const entityBuckets = computed(() =>
  buildEntityBuckets(props.stats?.topEntities, props.entityDisplayName, 8),
)
const summary = computed(() => computeEventAnalyticsSummary(props.stats, props.hours))

// KPI 卡：基于 summary 拼装六格（总量/活跃域/峰值时段/均值/最热域/最热实体）
const kpiCells = computed(() => {
  const s = summary.value
  return [
    {
      key: 'total',
      label: '事件总量',
      value: props.formatCount(s.total),
      hint: `${props.hours}h 窗口`,
      tone: 'accent',
    },
    {
      key: 'domains',
      label: '活跃域',
      value: String(s.domainCount),
      hint: s.topDomain ? `${s.topDomain} ${props.formatCount(s.topDomainCount)}` : '—',
      tone: 'sky',
    },
    {
      key: 'peak',
      label: '峰值时段',
      value: s.peakTimeLabel || '—',
      hint: s.peakTimeCount ? `${props.formatCount(s.peakTimeCount)} 次` : '暂无',
      tone: s.peakTimeCount ? 'warn' : 'muted',
    },
    {
      key: 'avg',
      label: '均值',
      value: s.avgPerHour != null ? `${s.avgPerHour}/h` : '—',
      hint: s.topEntityId ? '最高频实体' : '—',
      tone: 'muted',
    },
    {
      key: 'top-domain',
      label: '最热域',
      value: s.topDomain || '—',
      hint: s.topDomainCount ? props.formatCount(s.topDomainCount) : '',
      tone: 'accent',
    },
    {
      key: 'top-entity',
      label: '最热实体',
      value: s.topEntityId ? props.entityDisplayName(s.topEntityId).slice(0, 8) : '—',
      hint: s.topEntityCount ? props.formatCount(s.topEntityCount) : '',
      tone: 'pink',
    },
  ]
})

// 三图共用 tooltip 样式（深底 + 青色字 + 毛玻璃边框）
const chartTooltip = {
  backgroundColor: 'rgba(12, 12, 18, 0.94)',
  borderColor: 'rgba(34, 211, 238, 0.32)',
  borderWidth: 1,
  padding: [8, 12],
  extraCssText:
    'border-radius: 10px; backdrop-filter: blur(12px); box-shadow: 0 8px 28px rgba(0,0,0,0.35);',
  textStyle: { color: '#a5f3fc', fontSize: 12, fontWeight: 600 },
}

/** 实体条形图的纵向渐变填充：顶部实色 + 底部半透明，营造发光感。 */
function barGradient(color) {
  return {
    type: 'linear',
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color },
      { offset: 1, color: `${color}66` },
    ],
  }
}

/** 域分布饼图 option：空数据时给单条「暂无」占位避免空白。 */
function buildDomainOption() {
  const buckets = domainBuckets.value.filter((b) => b.count > 0)
  const data = buckets.length
    ? buckets.map((b) => ({ name: b.domain, value: b.count, itemStyle: { color: b.color } }))
    : [{ name: '暂无', value: 1, itemStyle: { color: '#64748b' } }]
  return {
    ...getChartBase(),
    tooltip: { ...chartTooltip, trigger: 'item' },
    series: [
      {
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['50%', '54%'],
        label: { color: 'rgba(255,255,255,0.65)', fontSize: 10, fontWeight: 600 },
        itemStyle: { borderRadius: 4, borderColor: 'rgba(0,0,0,0.35)', borderWidth: 1 },
        data,
      },
    ],
  }
}

/** 事件时序折线 option：横轴按桶数自适应旋转/稀疏，纵轴取 yMax 防抖动。 */
function buildTimeOption() {
  const buckets = timeBuckets.value
  const counts = buckets.map((b) => b.count)
  return {
    ...getChartBase(),
    grid: { left: 36, right: 12, top: 16, bottom: buckets.length > 8 ? 36 : 24 },
    xAxis: {
      type: 'category',
      data: buckets.map((b) => b.label),
      axisLine: axisLineStyle,
      axisTick: { show: false },
      axisLabel: {
        color: 'rgba(255,255,255,0.58)',
        fontSize: 9,
        interval: buckets.length > 12 ? Math.floor(buckets.length / 8) : 0,
        rotate: buckets.length > 10 ? 32 : 0,
      },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: yMax(counts),
      minInterval: 1,
      axisLine: { show: false },
      splitLine: splitLineStyle,
      axisLabel: { color: 'rgba(255,255,255,0.58)', fontSize: 10 },
    },
    series: [
      {
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        data: counts,
        lineStyle: { width: 2.5, color: '#22d3ee' },
        itemStyle: { color: '#22d3ee', borderColor: '#0ea5e9', borderWidth: 1 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(34, 211, 238, 0.35)' },
              { offset: 1, color: 'rgba(34, 211, 238, 0.02)' },
            ],
          },
        },
      },
    ],
    tooltip: { ...chartTooltip, trigger: 'axis' },
  }
}

function buildEntityOption() {
  const buckets = entityBuckets.value
  const labels = buckets.length ? buckets.map((b) => b.label.slice(0, 10)) : ['暂无']
  const values = buckets.length ? buckets.map((b) => b.count) : [0]
  // 条形配色取对应域分布桶的颜色，循环复用，与饼图色相一致
  return {
    ...getChartBase(),
    grid: {
      left: 56,
      right: 16,
      top: 8,
      bottom: 8,
      outerBoundsMode: 'same',
      outerBoundsContain: 'axisLabel',
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: yMax(values),
      splitLine: splitLineStyle,
      axisLabel: { color: 'rgba(255,255,255,0.58)', fontSize: 10 },
    },
    yAxis: {
      type: 'category',
      data: labels,
      axisLine: { show: false },
      axisLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 10 },
    },
    series: [
      {
        type: 'bar',
        data: values.map((value, i) => ({
          value,
          itemStyle: {
            color: barGradient(
              domainBuckets.value[i % domainBuckets.value.length]?.color || '#22d3ee',
            ),
            borderRadius: [0, 6, 6, 0],
          },
        })),
        barWidth: 10,
      },
    ],
    tooltip: { ...chartTooltip, trigger: 'axis' },
  }
}

/** 图表渲染完成回调：为饼图与条形图绑定点击事件以联动父级筛选；先 off 防重复。 */
function bindChartClicks() {
  const domainChart = get('domain')
  const entityChart = get('entity')
  domainChart?.off('click')
  entityChart?.off('click')
  domainChart?.on('click', (params) => {
    const domain = params?.name
    if (domain && domain !== '暂无') emit('filter-by-domain', domain)
  })
  entityChart?.on('click', (params) => {
    const idx = params?.dataIndex
    const row = entityBuckets.value[idx]
    if (row?.entityId) emit('filter-by-entity', row.entityId)
  })
}

// 监听数据与筛选变化触发重渲：deep 监听 stats 因其后端对象引用可能不变
watch(
  [() => props.stats, () => props.hours, () => props.entityFilter, () => props.domainFilter],
  () => {
    schedule()
  },
  { deep: true },
)
</script>

<style src="@/assets/styles/list-page-analytics.css"></style>
<style scoped src="./styles/ViewAnalytics.css"></style>
