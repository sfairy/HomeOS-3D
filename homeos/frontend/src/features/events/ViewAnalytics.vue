<!--
  事件历史「分析」子视图——渲染 KPI 卡 + 三个 ECharts 图表
  （域分布饼图 / 事件时序折线 / 高频实体横向条形）。
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
} from '@/shared/events/utils/analytics.util'
import { entityDomainLabel } from '@/shared/constants/entity-domain-meta'
import {
  chartAxisLabel,
  chartBarGradient,
  chartTooltip,
  getChartPalette,
} from '@/shared/utils/chart/chart-palette'

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
      tone: 'info',
    },
    {
      key: 'peak',
      label: '峰值时段',
      value: s.peakTimeLabel || '—',
      hint: s.peakTimeCount ? `${props.formatCount(s.peakTimeCount)} 次` : '暂无',
      tone: s.peakTimeCount ? 'warning' : 'muted',
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
      tone: 'danger',
    },
  ]
})

/** 三图共用 canonical tooltip（暖铜描边 + 正文色文字）。 */
function eventTooltip() {
  return chartTooltip()
}

/** 域分布饼图 option：空数据时给单条「暂无」占位避免空白。 */
function buildDomainOption() {
  const buckets = domainBuckets.value.filter((b) => b.count > 0)
  // 域数量多时合并尾部为「其他」，避免饼图标签互相遮挡；只保留前 6 个可点击域。
  // 卡片宽度有限，超过 6 个扇区时即使合并尾部，标签仍会挤成一团。
  const head = buckets.slice(0, 6)
  const tail = buckets.slice(8)
  const merged = head.map((b) => ({
    name: entityDomainLabel(b.domain),
    value: b.count,
    domain: b.domain,
    itemStyle: { color: b.color },
  }))
  if (tail.length) {
    merged.push({
      name: '其他',
      value: tail.reduce((sum, b) => sum + b.count, 0),
      domain: '',
      itemStyle: { color: getChartPalette().fg3 },
    })
  }
  const data = merged.length
    ? merged
    : [{ name: '暂无', value: 1, domain: '', itemStyle: { color: getChartPalette().fg3 } }]
  const palette = getChartPalette()
  const total = data.reduce((sum, item) => sum + item.value, 0)
  const countOf = (name) => data.find((item) => item.name === name)?.value ?? 0
  return {
    ...getChartBase(),
    tooltip: { ...eventTooltip(), trigger: 'item' },
    // 环形图改为「左环 + 右图例」：域缩写带引线铺在环外时，在 430px 宽的卡片里
    // 必然互相压成一条斜线（见 1600×900 事件页），改成图例列表后每个域名和数值都能读全。
    legend: {
      show: true,
      type: 'scroll',
      orient: 'vertical',
      right: 4,
      top: 'middle',
      itemWidth: 8,
      itemHeight: 8,
      itemGap: 8,
      icon: 'circle',
      pageIconColor: palette.accent,
      pageIconInactiveColor: palette.fg3,
      pageTextStyle: { color: palette.fg2, fontSize: 10 },
      textStyle: { color: palette.fg2, fontSize: 10, fontWeight: 500 },
      formatter: (name) => `${name}  ${props.formatCount(countOf(name))}`,
    },
    graphic: [
      {
        type: 'text',
        left: '19%',
        top: '43%',
        silent: true,
        style: {
          text: props.formatCount(total),
          fill: palette.fg1,
          fontSize: 16,
          fontWeight: 700,
          textAlign: 'center',
        },
      },
      {
        type: 'text',
        left: '19%',
        top: '54%',
        silent: true,
        style: { text: '事件', fill: palette.fg3, fontSize: 10, textAlign: 'center' },
      },
    ],
    series: [
      {
        type: 'pie',
        radius: ['42%', '66%'],
        center: ['26%', '52%'],
        // 标签全部收进图例，扇区上不再画文字/引线，彻底消除重叠。
        label: { show: false },
        labelLine: { show: false },
        emphasis: { scaleSize: 4 },
        itemStyle: {
          borderRadius: 6,
          borderColor: getChartPalette().bgElev1,
          borderWidth: 2,
        },
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
    grid: { left: 44, right: 16, top: 18, bottom: buckets.length > 8 ? 40 : 26 },
    xAxis: {
      type: 'category',
      data: buckets.map((b) => b.label),
      axisLine: axisLineStyle,
      axisTick: { show: false },
      axisLabel: {
        ...chartAxisLabel(),
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
      axisLabel: chartAxisLabel(),
    },
    series: [
      {
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        data: counts,
        lineStyle: { width: 2, color: getChartPalette().accent },
        itemStyle: {
          color: getChartPalette().accent,
          borderColor: getChartPalette().bgElev1,
          borderWidth: 1.5,
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: `${getChartPalette().accent}52` },
              { offset: 1, color: `${getChartPalette().accent}00` },
            ],
          },
        },
      },
    ],
    tooltip: { ...eventTooltip(), trigger: 'axis' },
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
      axisLabel: chartAxisLabel(),
    },
    yAxis: {
      type: 'category',
      data: labels,
      axisLine: { show: false },
      axisLabel: chartAxisLabel(),
    },
    series: [
      {
        type: 'bar',
        data: values.map((value, i) => ({
          value,
          itemStyle: {
            color: chartBarGradient(
              domainBuckets.value[i % domainBuckets.value.length]?.color || getChartPalette().accent,
            ),
            borderRadius: [0, 6, 6, 0],
          },
        })),
        barWidth: 12,
      },
    ],
    tooltip: { ...eventTooltip(), trigger: 'axis' },
  }
}

/** 图表渲染完成回调：为饼图与条形图绑定点击事件以联动父级筛选；先 off 防重复。 */
function bindChartClicks() {
  const domainChart = get('domain')
  const entityChart = get('entity')
  domainChart?.off('click')
  entityChart?.off('click')
  domainChart?.on('click', (params) => {
    const domain = params?.data?.domain
    if (domain) emit('filter-by-domain', domain)
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
