<!--
  ModeLogsAnalyticsRail.vue / features/home-mode/components
  模式日志分析轨道：ModeTriggerLogsPage 的内嵌分析区（非独立路由页面），
  横向 3 联 ECharts 图表：触发源分布饼图 + 按日柱状时间线 + 触发时段 24h 热力柱状，
  下方触发模式 Top 列表与平均耗时卡片。
  归属：日志页的私有子件，随页面走本域相对导入，不进域根 barrel。
-->
<template>
  <section v-if="analytics.total" class="mode-logs-analytics" aria-label="触发日志分析">
    <!--
      窄屏（≤1100px）默认折叠。

      改前三张图在 1100 以下会从「一排三张」变成「一列三张」，每张 min-height 200px，
      光图表就占掉 600px+ —— 用户滚三屏才够得着下面的日志列表本身，而那才是这页的主体。
      宽屏仍然是常开 + summary 隐藏，视觉与改前一致。
    -->
    <details class="mode-logs-analytics__disclosure" :open="open" @toggle="onToggle">
      <summary class="mode-logs-analytics__summary">
        <span class="mode-logs-analytics__summary-title">分析图表</span>
        <span class="mode-logs-analytics__summary-hint">{{ open ? '收起' : '展开来源 / 按日 / 成败三张图' }}</span>
      </summary>
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
    </details>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useHubChart } from '@/composables/life/useLifeChartHost'
import { useCanvasMetrics } from '@/composables/ui/useCanvasMetrics'
// 域内相对导入：引用自己的域根 barrel 会被 feature-self-barrel 门禁判违规。
import {
  buildModeResultBarOption,
  buildModeSourcePieOption,
  buildModeTimelineOption,
  EMPTY_MODE_LOG_ANALYTICS,
  type ModeLogAnalytics,
} from '../composables/useModeLogsAnalytics'

const props = defineProps<{
  analytics?: ModeLogAnalytics | null
}>()

const sourceRef = ref<HTMLElement | null>(null)
const timelineRef = ref<HTMLElement | null>(null)
const resultRef = ref<HTMLElement | null>(null)

const analytics = computed<ModeLogAnalytics>(() => props.analytics || EMPTY_MODE_LOG_ANALYTICS)

useHubChart(sourceRef, () => buildModeSourcePieOption(analytics.value.sourceBuckets), [analytics])
useHubChart(timelineRef, () => buildModeTimelineOption(analytics.value.dayBuckets), [analytics])
useHubChart(resultRef, () => buildModeResultBarOption(analytics.value.ok, analytics.value.fail), [analytics])

/**
 * 折叠状态：宽屏常开、窄屏默认收起。
 *
 * 之所以用 JS 而不是纯 CSS：`<details>` 的展开/收起是 DOM 状态（`open` 属性），
 * CSS 只能控制 summary 的显隐，无法把已收起的 `<details>` 重新摊开 —— 从窄屏拉到宽屏时
 * 图表会「消失」，用户只能手动点开。这里跟随**画布宽度**（与下方 scoped 样式里的
 * `@container hos-canvas` 同源）自动同步，用户手动点过之后在同一个断点内保持自己的选择。
 */
const { isNarrow } = useCanvasMetrics()
const open = ref(true)

/** 用户手动点 summary 时同步进 `open`，否则 `:open` 绑定会把用户的点击「改回去」。 */
function onToggle(event: Event): void {
  open.value = (event.target as HTMLDetailsElement).open
}

watch(isNarrow, (narrow) => {
  open.value = !narrow
})
</script>

<style scoped>
.mode-logs-analytics {
  margin: 0 0 14px;
}
.mode-logs-analytics__disclosure {
  margin: 0;
}
/* 宽屏不需要折叠入口：summary 隐藏，`<details>` 由 JS 保常在展开态。 */
.mode-logs-analytics__summary {
  display: none;
}
.mode-logs-analytics__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.mode-logs-analytics__card {
  min-height: 200px;
  padding: 12px 14px;
  border-radius: var(--hos-r-3);
  border: var(--hos-hairline, 1px) solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  display: flex;
  flex-direction: column;
}
.mode-logs-analytics__card-head {
  font-size: var(--hos-fs-2);
  font-weight: 700;
  color: rgba(255, 255, 255, 0.78);
  margin-bottom: 6px;
}
.mode-logs-analytics__chart {
  flex: 1;
  min-height: 150px;
  width: 100%;
}
@container hos-canvas (max-width: 1100px) {
  .mode-logs-analytics__grid {
    grid-template-columns: 1fr;
  }
  /* 折叠入口只在小屏出现：宽屏常开，多一个入口只是噪音。 */
  .mode-logs-analytics__summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 9px 14px;
    border-radius: var(--hos-r-3);
    border: var(--hos-hairline, 1px) solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.03);
    color: rgba(255, 255, 255, 0.78);
    font-size: var(--hos-fs-2);
    cursor: pointer;
    list-style: none;
    /* 触控目标下限（WCAG 2.5.5）：纯文字行高容易压到 32px 以下。 */
    min-height: 44px;
  }
  .mode-logs-analytics__summary::-webkit-details-marker {
    display: none;
  }
  .mode-logs-analytics__summary-title {
    font-weight: 700;
  }
  .mode-logs-analytics__summary-hint {
    font-size: var(--hos-fs-1);
    color: rgba(255, 255, 255, 0.5);
  }
  /* 展开后图表与折叠条之间留一口气，避免贴死。 */
  .mode-logs-analytics__disclosure[open] .mode-logs-analytics__grid {
    margin-top: 10px;
  }
}
</style>
