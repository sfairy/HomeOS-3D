<!--
组件：NotificationsViewAnalytics.vue
所属模块：frontend / src / views / notifications
职责：通知中心「分析」面板。渲染 KPI 指标卡及多张统计图表（通知时序 / 已读未读 /
      来源分布 / 级别分布 / 来源排行），并对外暴露按来源、级别筛选的事件。
关键依赖：
  - useNotificationsViewAnalytics composable：负责图表 DOM 挂载、KPI 汇总与点击回调分发
  - NotificationStatsPayload / NotificationAnalyticsSummary：后端聚合数据契约
数据来源：父级页面传入的 notifications 列表、stats 统计与 summary 汇总对象
-->
<template>
  <div class="nc-analytics">
    <div class="nc-analytics__glow nc-analytics__glow--tl" aria-hidden="true" />
    <div class="nc-analytics__glow nc-analytics__glow--br" aria-hidden="true" />

    <div class="nc-analytics__kpis">
      <article
        v-for="cell in kpiCells"
        :key="cell.key"
        class="nc-analytics__kpi"
        :class="cell.tone ? `nc-analytics__kpi--${cell.tone}` : ''"
      >
        <span class="nc-analytics__kpi-label">{{ cell.label }}</span>
        <strong
          class="nc-analytics__kpi-value"
          :class="cell.tone ? `nc-analytics__kpi-value--${cell.tone}` : ''"
        >
          {{ cell.value }}
        </strong>
        <span v-if="cell.hint" class="nc-analytics__kpi-hint">{{ cell.hint }}</span>
      </article>
    </div>

    <div class="nc-analytics__charts">
      <section class="nc-analytics__chart-card">
        <header class="nc-analytics__chart-head">
          <span class="nc-analytics__chart-title">通知时序</span>
          <span class="nc-analytics__chart-hint">{{ hours <= 48 ? '按小时' : '按天' }}</span>
        </header>
        <div ref="timeChartRef" class="nc-analytics__chart" />
      </section>

      <section class="nc-analytics__chart-card">
        <header class="nc-analytics__chart-head">
          <span class="nc-analytics__chart-title">已读 / 未读</span>
          <span class="nc-analytics__chart-hint">已读率 {{ summary.readRate }}%</span>
        </header>
        <div ref="readChartRef" class="nc-analytics__chart" />
      </section>

      <section class="nc-analytics__chart-card">
        <header class="nc-analytics__chart-head">
          <span class="nc-analytics__chart-title">来源分布</span>
          <span class="nc-analytics__chart-hint">点击筛选</span>
        </header>
        <div ref="sourceChartRef" class="nc-analytics__chart" />
      </section>

      <section class="nc-analytics__chart-card">
        <header class="nc-analytics__chart-head">
          <span class="nc-analytics__chart-title">级别分布</span>
          <span class="nc-analytics__chart-hint">点击筛选级别</span>
        </header>
        <div ref="levelChartRef" class="nc-analytics__chart" />
      </section>

      <section class="nc-analytics__chart-card nc-analytics__chart-card--wide">
        <header class="nc-analytics__chart-head">
          <span class="nc-analytics__chart-title">来源排行</span>
          <span class="nc-analytics__chart-hint">推送送达 {{ summary.deliveryRate }}%</span>
        </header>
        <div ref="rankChartRef" class="nc-analytics__chart" />
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { toRefs } from 'vue'
import { useNotificationsViewAnalytics } from '@/composables/notifications/useNotificationsViewAnalytics'
import type {
  NotificationAnalyticsSummary,
  NotificationStatsPayload,
} from '@/utils/notification/analytics.util'

// 单条通知在分析视图所需的最小字段集合（来源 / 级别 / 创建时间）
type NotificationRow = {
  source?: string | null
  level?: string | null
  createdAt?: string | null
  time?: string | null
}

// 组件入参：通知列表、聚合统计、KPI 汇总及筛选上下文
const props = defineProps<{
  notifications: NotificationRow[]
  stats: NotificationStatsPayload | null
  summary: NotificationAnalyticsSummary
  hours: number
  activeSource: string
  formatCount: (n: number) => string
}>()

// 对外事件：用户点击图表后请求父级按来源或级别筛选通知列表
const emit = defineEmits<{
  'filter-by-source': [key: string]
  'filter-by-level': [level: string]
}>()

const { hours } = toRefs(props)
// 委托 composable 完成 5 张图表的挂载与 KPI 计算，并将图表点击事件桥接为 emit
const {
  sourceChartRef,
  levelChartRef,
  rankChartRef,
  timeChartRef,
  readChartRef,
  kpiCells,
  summary,
} = useNotificationsViewAnalytics(toRefs(props), (event, value) => {
  // 根据 composable 回传的事件类型分发到对应的 emit
  if (event === 'filter-by-source') emit('filter-by-source', value)
  else emit('filter-by-level', value)
})
</script>

<style src="@/assets/styles/list-page-analytics.css"></style>
<style scoped src="./styles/ViewAnalytics.css"></style>
