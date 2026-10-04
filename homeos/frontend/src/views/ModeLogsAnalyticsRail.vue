<!--
  ModeLogsAnalyticsRail.vue / views
  模式日志分析轨道：ModeTriggerLogsView 的内嵌分析区（非独立路由页面），
  横向 3 联 ECharts 图表：触发源分布饼图 + 按日柱状时间线 + 触发时段 24h 热力柱状，
  下方触发模式 Top 列表与平均耗时卡片。
  Props：analytics 分析结果（由 useModeLogsAnalytics 返回的 Ref 对象）
  Slot：无
  依赖：composables: useHubChart（useLifeChartHost）图表实例托管；
        useModeLogsAnalytics.buildModeSourcePieOption/buildModeTimelineOption
                /buildModeHourHeatOption 三个 option 构造器；
        vue computed/ref 响应式包装。
  注意：analytics.total 为空时整段隐藏（v-if），避免空图占位；三张图表按屏幕宽度换行。
-->
<template>
  <section v-if="analytics.total" class="mode-logs-analytics" aria-label="触发日志分析">
    <div class="mode-logs-analytics__grid">
      <article class="mode-logs-analytics__card premium-glass-surface--panel">
        <header class="mode-logs-analytics__card-head">
          <span>{{ '来源分布' }}</span>
        </header>
        <div ref="sourceRef" class="mode-logs-analytics__chart" />
      </article>
      <article class="mode-logs-analytics__card premium-glass-surface--panel">
        <header class="mode-logs-analytics__card-head">
          <span>{{ '按日触发量' }}</span>
        </header>
        <div ref="timelineRef" class="mode-logs-analytics__chart" />
      </article>
      <article class="mode-logs-analytics__card premium-glass-surface--panel">
        <header class="mode-logs-analytics__card-head">
          <span>{{ '成功 / 失败' }}</span>
        </header>
        <div ref="resultRef" class="mode-logs-analytics__chart" />
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useHubChart } from '@/composables/life/useLifeChartHost'
import {
  buildModeResultBarOption,
  buildModeSourcePieOption,
  buildModeTimelineOption,
  EMPTY_MODE_LOG_ANALYTICS,
  type ModeLogAnalytics,
} from '@/composables/home/useModeLogsAnalytics'

const props = defineProps<{
  analytics?: ModeLogAnalytics | null
}>()

const sourceRef = ref<HTMLElement | null>(null)
const timelineRef = ref<HTMLElement | null>(null)
const resultRef = ref<HTMLElement | null>(null)

const analytics = computed<ModeLogAnalytics>(() => props.analytics || EMPTY_MODE_LOG_ANALYTICS)

useHubChart(sourceRef, () => buildModeSourcePieOption(analytics.value.sourceBuckets), [analytics])
useHubChart(timelineRef, () => buildModeTimelineOption(analytics.value.dayBuckets), [analytics])
useHubChart(
  resultRef,
  () => buildModeResultBarOption(analytics.value.ok, analytics.value.fail),
  [analytics],
)
</script>

<style scoped>
.mode-logs-analytics {
  margin: 0 0 14px;
}
.mode-logs-analytics__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.mode-logs-analytics__card {
  min-height: 200px;
  padding: 12px 14px;
  border-radius: var(--hos-radius-panel);
  border: var(--hos-hairline, 1px) solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  display: flex;
  flex-direction: column;
}
.mode-logs-analytics__card-head {
  font-size: var(--premium-fs-micro);
  font-weight: 700;
  color: rgba(255, 255, 255, 0.78);
  margin-bottom: 6px;
}
.mode-logs-analytics__chart {
  flex: 1;
  min-height: 150px;
  width: 100%;
}
@media (max-width: 1100px) {
  .mode-logs-analytics__grid {
    grid-template-columns: 1fr;
  }
}
</style>
