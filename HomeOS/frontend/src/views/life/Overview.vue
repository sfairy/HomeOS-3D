<!--
组件：LifeOverview.vue
所属模块：frontend / src / views
布局：左栏 KPI + 图表占满 + 读数一行；右栏模块 / 关注 / 提醒
职责：生活页「总览」子标签——聚合环境/能耗/看护/智能四大模块的关键指标与
      卡片入口，提供功率/房健康/环境趋势/能耗排名四张图与今日脉搏/关注流。
数据来源：
  - KPI / 房间健康桶 / 类别卡片 / 关爱告警 / 设备寿命 / 提醒来自 useLifeOverview；
  - 功率趋势/能耗排名/环境趋势/季节建议来自 useLifeOverviewAnalytics；
  - 生活指数/天气预警来自 useLifeIndices。
Emits：
  - navigate：点击侧栏模块卡片或脉搏条目时抛出目标 LifeTabId，由父级切标签。
关键交互：
  - 四张图通过 useEchartsHost 统一调度（room/rank/power/env）；
  - 模式/告警/建议/寿命/提醒按优先级拼装今日脉搏列表（最多 4 条）；
  - watch 各数据源变化触发 schedule 重渲。
-->
<template>
  <div class="life-overview">
    <div class="life-overview__content">
      <div class="life-overview__layout">
        <section class="life-overview__main">
          <div class="life-overview__main-glow life-overview__main-glow--tl" aria-hidden="true" />
          <div class="life-overview__main-glow life-overview__main-glow--br" aria-hidden="true" />

          <p v-if="analytics.error.value" class="life-overview__degrade" role="status">
            {{ analytics.error.value }}，部分图表暂不可用
            <button type="button" class="life-overview__degrade-retry" @click="analytics.reload">
              {{ '重试' }}
            </button>
          </p>

          <LifeKpiGrid
            v-if="analyticsKpis.length"
            variant="overview"
            class="life-overview__kpis"
            :kpis="analyticsKpis"
          />

          <div v-if="readingChips.length" class="life-overview__strip">
            <div
              v-for="(chip, idx) in readingChips"
              :key="chip.key"
              class="life-overview__chip"
              :class="chip.warn ? 'is-warn' : `is-tone-${idx % 4}`"
            >
              <span class="life-overview__chip-label">{{ chip.label }}</span>
              <strong class="life-overview__chip-val"
                >{{ chip.value
                }}<em v-if="chip.unit" class="life-overview__chip-unit">{{ chip.unit }}</em></strong
              >
            </div>
          </div>

          <article class="life-overview__hero">
            <LifeChartCard
              variant="overview"
              title="功率趋势"
              :hint="
                analytics.usingHaHistory.value
                  ? `近 ${analytics.chartHours.value}h · HA 历史`
                  : `近 ${analytics.chartHours.value}h`
              "
            >
              <div ref="powerChartRef" class="life-overview__chart" />
            </LifeChartCard>
          </article>

          <div class="life-overview__minis">
            <article class="life-overview__chart-card">
              <LifeChartCard
                variant="overview"
                title="房间健康"
                link-text="进入"
                link-class="life-overview__chart-link"
                @link-click="emit('navigate', 'env')"
              >
                <div ref="roomChartRef" class="life-overview__chart" />
              </LifeChartCard>
            </article>

            <article class="life-overview__chart-card">
              <LifeChartCard variant="overview" title="环境趋势" hint="近 14 天">
                <div ref="envChartRef" class="life-overview__chart" />
              </LifeChartCard>
            </article>

            <article class="life-overview__chart-card">
              <LifeChartCard
                variant="overview"
                title="能耗排名"
                link-text="进入"
                link-class="life-overview__chart-link"
                @link-click="emit('navigate', 'energy')"
              >
                <div ref="rankChartRef" class="life-overview__chart" />
              </LifeChartCard>
            </article>
          </div>
        </section>

        <aside class="life-overview__side">
          <section class="life-overview__stream">
            <div class="life-overview__stream-glow" aria-hidden="true" />
            <header class="life-overview__stream-head">
              <div>
                <h2 class="life-overview__stream-title">{{ '生活模块' }}</h2>
                <p class="life-overview__stream-sub">{{ '点击进入管理' }}</p>
              </div>
            </header>
            <div class="life-overview__cat-list">
              <button
                v-for="card in categoryCards"
                :key="card.id"
                type="button"
                class="life-overview__cat-card interactive-press"
                :style="{ '--cat-accent': card.accent }"
                @click="emit('navigate', card.id)"
              >
                <span class="life-overview__cat-accent" aria-hidden="true" />
                <span class="life-overview__cat-orb" aria-hidden="true">
                  <component :is="card.icon" class="life-overview__cat-icon" />
                </span>
                <div class="life-overview__cat-body">
                  <span class="life-overview__cat-label">{{ card.label }}</span>
                  <strong class="life-overview__cat-value">{{ card.value }}</strong>
                </div>
                <div class="life-overview__cat-meta">
                  <span
                    class="life-overview__pill"
                    :class="card.ok ? 'life-overview__pill--ok' : 'life-overview__pill--warn'"
                    >{{ card.status }}</span
                  >
                </div>
                <ChevronRight class="life-overview__cat-chevron w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </section>

          <section
            v-if="pulseItems.length"
            class="life-overview__stream life-overview__stream--pulse"
          >
            <div class="life-overview__stream-glow" aria-hidden="true" />
            <header class="life-overview__stream-head">
              <div>
                <h2 class="life-overview__stream-title">{{ '今日脉搏' }}</h2>
                <p class="life-overview__stream-sub">{{ '关爱 · 智能快讯' }}</p>
              </div>
            </header>
            <ul class="life-overview__pulse-list">
              <li v-for="item in pulseItems" :key="item.key" :class="`is-${item.tone}`">
                <button type="button" @click="emit('navigate', item.tab)">
                  <em>{{ item.tag }}</em>
                  <strong>{{ item.title }}</strong>
                  <span v-if="item.detail">{{ item.detail }}</span>
                </button>
              </li>
            </ul>
          </section>

          <section
            v-if="riskRoomStrip.length || lifeWarning?.active || lifeAttention.length || lifePrimaryPreview.length || lifeHeadline"
            class="life-overview__stream life-overview__stream--focus"
          >
            <div class="life-overview__stream-glow" aria-hidden="true" />
            <header class="life-overview__stream-head">
              <div>
                <h2 class="life-overview__stream-title">{{ '今日关注' }}</h2>
                <p class="life-overview__stream-sub">{{ '房间 · 生活指数' }}</p>
              </div>
              <button type="button" class="life-overview__chart-link" @click="emit('navigate', 'env')">
                {{ '环境' }}
              </button>
            </header>

            <div v-if="riskRoomStrip.length" class="life-overview__risk-list">
              <button
                v-for="room in riskRoomStrip"
                :key="room.roomId"
                type="button"
                class="life-overview__risk-item"
                @click="emit('navigate', 'env')"
              >
                <strong>{{ room.name }}</strong>
                <span>{{ room.riskLabel }}</span>
              </button>
            </div>

            <p v-if="lifeWarning?.active" class="life-overview__life-warn">
              {{ lifeWarning.title }}
              <template v-if="lifeWarning.details?.length"> · {{ lifeWarning.details[0] }}</template>
            </p>

            <div v-if="lifeAttention.length" class="life-overview__life-list">
              <button
                v-for="item in lifeAttention"
                :key="item.entityId"
                type="button"
                class="life-overview__life-item"
                :class="`is-${item.tone}`"
                :title="item.description || item.friendlyName"
                @click="emit('navigate', 'env')"
              >
                <strong>{{ item.label }}</strong>
                <span>{{ item.state }}</span>
              </button>
            </div>
            <div v-else-if="lifePrimaryPreview.length" class="life-overview__life-list">
              <button
                v-for="item in lifePrimaryPreview"
                :key="item.entityId"
                type="button"
                class="life-overview__life-item"
                :class="`is-${item.tone}`"
                @click="emit('navigate', 'env')"
              >
                <strong>{{ item.label }}</strong>
                <span>{{ item.state }}</span>
              </button>
            </div>
            <p v-else-if="lifeHeadline" class="life-overview__life-headline">
              <strong>{{ lifeHeadline.label }} · {{ lifeHeadline.value }}</strong>
              <span v-if="lifeHeadline.desc">{{ lifeHeadline.desc }}</span>
            </p>
          </section>

          <section
            v-if="analytics.seasonalTips.value.length"
            class="life-overview__stream life-overview__stream--tips"
          >
            <div class="life-overview__stream-glow" aria-hidden="true" />
            <header class="life-overview__stream-head">
              <div>
                <h2 class="life-overview__stream-title">{{ analytics.seasonalLabel.value }}</h2>
                <p class="life-overview__stream-sub">{{ '基于环境传感器' }}</p>
              </div>
            </header>
            <ul class="life-overview__tip-list">
              <li v-for="(tip, i) in analytics.seasonalTips.value" :key="i">{{ tip }}</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { ChevronRight } from '@lucide/vue'
import LifeKpiGrid from '@/components/life/LifeKpiGrid.vue'
import LifeChartCard from '@/components/life/LifeChartCard.vue'
import { useEchartsHost, splitLineStyle } from '@/composables/ui/useEchartsHost'
import { useLifeOverview } from '@/composables/life/useLifeOverview'
import { useLifeOverviewAnalytics } from '@/composables/life/useLifeOverviewAnalytics'
import { useLifeIndices } from '@/composables/life/useLifeIndices'
import type { LifeTabId } from '@/composables/life/useLifeView'

const emit = defineEmits<{ navigate: [tab: LifeTabId] }>()

const {
  analyticsKpis,
  envMetrics,
  energyMetrics,
  categoryCards,
  roomHealthBuckets,
  riskRoomStrip,
  advisorTips,
  careAlerts,
  occupiedCount,
  carePresenceLoaded,
  lifespanItems,
  reminderItems,
  smartLoaded,
} = useLifeOverview()

const analytics = useLifeOverviewAnalytics()
const {
  attentionIndices: lifeAttention,
  headline: lifeHeadline,
  warning: lifeWarning,
  liveMetrics,
  primaryIndices,
} = useLifeIndices()

// 室外独有指标（AQI / 天气 / 降水等），与温湿度/PM2.5 区分避免重复
const outdoorOnlyMetrics = computed(() =>
  liveMetrics.value
    .filter((m) => !['temperature', 'humidity', 'pm25'].includes(m.key))
    .slice(0, 4),
)

// 读数一行：环境指标 4 + 能耗指标 2 + 室外指标 2 拼装，warn 用于异常高亮
type ReadingChip = { key: string; label: string; value: string | number; unit?: string; warn?: boolean }
const readingChips = computed<ReadingChip[]>(() => [
  ...envMetrics.value.slice(0, 4).map((m) => ({
    key: `env-${m.key}`,
    label: m.label,
    value: m.value,
    unit: m.unit,
    warn: m.warn,
  })),
  ...energyMetrics.value.slice(0, 2).map((m) => ({
    key: `eng-${m.key}`,
    label: m.label,
    value: m.value,
    unit: m.unit,
  })),
  ...outdoorOnlyMetrics.value.slice(0, 2).map((m) => ({
    key: `out-${m.key}`,
    label: m.label,
    value: m.value,
    unit: m.unit,
  })),
])
// 生活指数预览：仅在无关注指数时显示前 4 条主要指数作为关注区占位
const lifePrimaryPreview = computed(() => {
  if (lifeAttention.value.length) return []
  return primaryIndices.value.slice(0, 4)
})

// 今日脉搏：按优先级聚合关爱在室/告警/智能建议/设备寿命/日程提醒，最多 4 条
const pulseItems = computed(() => {
  const rows: Array<{
    key: string
    tag: string
    title: string
    detail?: string
    tab: LifeTabId
    tone: 'ok' | 'warn' | 'info'
  }> = []
  if (carePresenceLoaded.value) {
    rows.push({
      key: 'presence',
      tag: '关爱',
      title: occupiedCount.value ? `${occupiedCount.value} 间在室` : '全屋无人',
      tab: 'care',
      tone: occupiedCount.value ? 'info' : 'ok',
    })
  }
  if (careAlerts.value[0]) {
    rows.push({
      key: 'alert',
      tag: '告警',
      title: careAlerts.value[0].label,
      detail: careAlerts.value[0].time,
      tab: 'care',
      tone: 'warn',
    })
  }
  if (advisorTips.value[0]) {
    rows.push({
      key: 'advisor',
      tag: '建议',
      title: advisorTips.value[0].title,
      detail: advisorTips.value[0].message || undefined,
      tab: 'smart',
      tone: 'info',
    })
  }
  const lifeWarn = lifespanItems.value.find((i) => i.warn)
  if (lifeWarn) {
    rows.push({
      key: 'lifespan',
      tag: '设备',
      title: lifeWarn.name,
      detail: lifeWarn.level,
      tab: 'smart',
      tone: 'warn',
    })
  } else if (smartLoaded.value && reminderItems.value[0]) {
    rows.push({
      key: 'reminder',
      tag: '日程',
      title: reminderItems.value[0].title,
      detail: reminderItems.value[0].time,
      tab: 'smart',
      tone: 'ok',
    })
  }
  return rows.slice(0, 4)
})

const roomChartRef = ref<HTMLElement | null>(null)
const rankChartRef = ref<HTMLElement | null>(null)
const powerChartRef = ref<HTMLElement | null>(null)
const envChartRef = ref<HTMLElement | null>(null)

// 该页 resize 观察仅做实例 resize，实例未创建时不回补渲染（保持原有语义）
const { schedule, getChartBase } = useEchartsHost({
  charts: {
    room: { el: () => roomChartRef.value, build: buildRoomOption },
    rank: { el: () => rankChartRef.value, build: buildRankOption },
    power: { el: () => powerChartRef.value, build: buildPowerOption },
    env: { el: () => envChartRef.value, build: buildEnvOption },
  },
  resizeFallbackRender: false,
})

// 四图共用 tooltip 样式（深底 + 青绿字 + 毛玻璃边框）
const chartTooltip = {
  backgroundColor: 'rgba(12, 12, 18, 0.94)',
  borderColor: 'rgba(45, 212, 191, 0.32)',
  borderWidth: 1,
  padding: [8, 12] as [number, number],
  extraCssText:
    'border-radius: 10px; backdrop-filter: blur(12px); box-shadow: 0 8px 28px rgba(0,0,0,0.35);',
  textStyle: { color: '#ccfbf1', fontSize: 12, fontWeight: 600 },
}

/** 房间健康饼图 option：按健康桶配色，空数据给单条「暂无」占位。 */
function buildRoomOption() {
  const data = roomHealthBuckets.value.filter((b) => b.count > 0)
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

/** 能耗排名横向条形 option：取前 6 名，纵轴显示设备名，横向琥珀色渐变填充。 */
function buildRankOption() {
  const rows = analytics.ranking.value.filter((r) => r.kwh > 0).slice(0, 6)
  const names = rows.map((r) => r.name)
  const values = rows.map((r) => r.kwh)
  return {
    ...getChartBase(),
    grid: { left: 72, right: 16, top: 8, bottom: 8 },
    tooltip: { ...chartTooltip, trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: {
      type: 'value',
      axisLine: { show: false },
      splitLine: splitLineStyle,
      axisLabel: { color: 'rgba(255,255,255,0.58)', fontSize: 9 },
    },
    yAxis: {
      type: 'category',
      data: names.length ? names : ['暂无'],
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 10 },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 12,
        data: values.length ? values : [0],
        itemStyle: {
          borderRadius: [0, 4, 4, 0],
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 1,
            y2: 0,
            colorStops: [
              { offset: 0, color: 'rgba(251, 191, 36, 0.35)' },
              { offset: 1, color: '#fbbf24' },
            ],
          },
        },
      },
    ],
  }
}

/** 功率趋势折线 option：横轴按点数稀疏化轴标签，纵轴取 max 防抖。 */
function buildPowerOption() {
  const points = analytics.powerTrend.value
  const labels = points.map((p) => p.label)
  const values = points.map((p) => p.value)
  const max = Math.max(...values, 1)
  return {
    ...getChartBase(),
    grid: { left: 36, right: 12, top: 12, bottom: labels.length > 24 ? 28 : 22 },
    tooltip: { ...chartTooltip, trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: labels.length ? labels : ['—'],
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.07)' } },
      axisTick: { show: false },
      axisLabel: {
        color: 'rgba(255,255,255,0.58)',
        fontSize: 9,
        interval: Math.max(0, Math.floor(labels.length / 8) - 1),
      },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max,
      axisLine: { show: false },
      splitLine: splitLineStyle,
      axisLabel: { color: 'rgba(255,255,255,0.58)', fontSize: 9 },
    },
    series: [
      {
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: values.length ? values : [0],
        lineStyle: { width: 2, color: '#fbbf24' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(251, 191, 36, 0.28)' },
              { offset: 1, color: 'rgba(251, 191, 36, 0.02)' },
            ],
          },
        },
      },
    ],
  }
}

/** 环境趋势双轴折线 option：左轴温度(℃) + 右轴湿度(%)，近 14 天。 */
function buildEnvOption() {
  const days = analytics.envTrend.value
  const labels = days.map((d) => (d.date ? d.date.slice(5) : ''))
  const temps = days.map((d) => (d.avgTemperature == null ? null : d.avgTemperature))
  const hums = days.map((d) => (d.avgHumidity == null ? null : d.avgHumidity))
  return {
    ...getChartBase(),
    grid: { left: 36, right: 36, top: 28, bottom: 22 },
    legend: {
      top: 0,
      right: 8,
      textStyle: { color: 'rgba(255,255,255,0.55)', fontSize: 10 },
      itemWidth: 10,
      itemHeight: 6,
    },
    tooltip: { ...chartTooltip, trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: labels.length ? labels : ['—'],
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.07)' } },
      axisTick: { show: false },
      axisLabel: { color: 'rgba(255,255,255,0.58)', fontSize: 9 },
    },
    yAxis: [
      {
        type: 'value',
        name: '℃',
        nameTextStyle: { color: 'rgba(255,255,255,0.58)', fontSize: 9 },
        axisLine: { show: false },
        splitLine: splitLineStyle,
        axisLabel: { color: 'rgba(255,255,255,0.58)', fontSize: 9 },
      },
      {
        type: 'value',
        name: '%',
        nameTextStyle: { color: 'rgba(255,255,255,0.58)', fontSize: 9 },
        axisLine: { show: false },
        splitLine: { show: false },
        axisLabel: { color: 'rgba(255,255,255,0.58)', fontSize: 9 },
      },
    ],
    series: [
      {
        name: '温度',
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: temps.length ? temps : [null],
        lineStyle: { width: 2, color: '#2dd4bf' },
      },
      {
        name: '湿度',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        showSymbol: false,
        data: hums.length ? hums : [null],
        lineStyle: { width: 2, color: '#38bdf8' },
      },
    ],
  }
}

// 监听四图数据源与加载态变化触发 schedule 重渲
watch(
  [
    roomHealthBuckets,
    () => analytics.ranking.value,
    () => analytics.powerTrend.value,
    () => analytics.envTrend.value,
    () => analytics.loading.value,
  ],
  () => schedule(),
  { deep: true },
)
</script>

<style scoped>
.life-overview__degrade {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px;
  padding: 8px 12px;
  border-radius: var(--hos-radius-card);
  font-size: 13px;
  background: color-mix(in srgb, #f59e0b 16%, transparent);
  color: #fde68a;
}
.life-overview__degrade-retry {
  margin-left: auto;
  padding: 4px 8px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, #fff 20%, transparent);
}
</style>
