/**
 * @file EarthquakeHistoryAnalytics.vue
 * @module components/earthquake
 * @brief 地震历史数据分析面板
 *
 * 职责：
 * - 渲染地震历史数据的 KPI 摘要与多张 ECharts 图表
 * - 依据 tab 切换 global（全球）/ local（本地附近）两种数据视角
 * - 图表容器 ref 通过 composable 注入并初始化 ECharts 实例
 *
 * 依赖：
 * - vue：toRefs 用于保持 props 响应性
 * - @/composables/earthquake/useEarthquakeHistoryAnalytics：聚合 KPI/图表逻辑
 * - 外部样式 ./styles/HistoryAnalytics.css
 */
<template>
  <div class="eq-analytics">
    <!-- 装饰性辉光，仅作背景视觉，aria-hidden 避免读屏干扰 -->
    <div class="eq-analytics__glow eq-analytics__glow--tl" aria-hidden="true" />
    <div class="eq-analytics__glow eq-analytics__glow--br" aria-hidden="true" />

    <!-- KPI 卡片组：展示总数、平均震级、最大震级等关键指标 -->
    <div class="eq-analytics__kpis">
      <article
        v-for="cell in kpiCells"
        :key="cell.key"
        class="eq-analytics__kpi"
        :class="cell.tone ? `eq-analytics__kpi--${cell.tone}` : ''"
      >
        <span class="eq-analytics__kpi-label">{{ cell.label }}</span>
        <strong
          class="eq-analytics__kpi-value"
          :class="cell.tone ? `eq-analytics__kpi-value--${cell.tone}` : ''"
        >
          {{ cell.value }}
        </strong>
        <span v-if="cell.hint" class="eq-analytics__kpi-hint">{{ cell.hint }}</span>
      </article>
    </div>

    <!-- 图表网格：四张卡片分别承载不同维度的可视化 -->
    <div class="eq-analytics__charts">
      <!-- 卡片 1：震级分布直方图 -->
      <section class="eq-analytics__chart-card">
        <header class="eq-analytics__chart-head">
          <span class="eq-analytics__chart-title">震级分布</span>
        </header>
        <div ref="magChartRef" class="eq-analytics__chart"></div>
      </section>

      <!-- 卡片 2：距离分布（本地视角显示"距离分布"，全球视角显示"距家分布"） -->
      <section class="eq-analytics__chart-card">
        <header class="eq-analytics__chart-head">
          <span class="eq-analytics__chart-title">{{
            tab === 'local' ? '距离分布' : '距家分布'
          }}</span>
        </header>
        <div ref="distChartRef" class="eq-analytics__chart"></div>
      </section>

      <!-- 卡片 3：事件时间分布，观察地震发生的时间规律 -->
      <section class="eq-analytics__chart-card">
        <header class="eq-analytics__chart-head">
          <span class="eq-analytics__chart-title">事件分布</span>
        </header>
        <div ref="timeChartRef" class="eq-analytics__chart"></div>
      </section>

      <!-- 卡片 4：本地视角显示"高频震中"，全球视角显示"深度分布" -->
      <section class="eq-analytics__chart-card">
        <header class="eq-analytics__chart-head">
          <span class="eq-analytics__chart-title">{{
            tab === 'local' ? '高频震中' : '深度分布'
          }}</span>
        </header>
        <div ref="extraChartRef" class="eq-analytics__chart"></div>
      </section>
    </div>
  </div>
</template>

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 HistoryAnalytics 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { toRefs } from 'vue'
import { useEarthquakeHistoryAnalytics } from '@/composables/earthquake/useEarthquakeHistoryAnalytics'

/**
 * Props 定义
 * @property {Array}  items  - 历史地震事件数组（由父组件传入，已按时间倒序）
 * @property {string} tab    - 数据视角，'global' 全球 / 'local' 本地附近
 * @property {string} period - 统计周期，'day' / 'week' / 'month' / 'year'
 */
const props = defineProps({
  items: { type: Array, default: () => [] },
  tab: { type: String, default: 'global' },
  period: { type: String, default: 'day' },
})

// toRefs 保持响应性，使 composable 内 watch 能追踪 tab/period 变化
const { tab } = toRefs(props)

/**
 * 解构出图表容器 ref 与 KPI 数据
 * - magChartRef / distChartRef / timeChartRef / extraChartRef：四张图表的 DOM 引用
 * - kpiCells：KPI 卡片数据（label/value/hint/tone）
 */
const { magChartRef, distChartRef, timeChartRef, extraChartRef, kpiCells } =
  useEarthquakeHistoryAnalytics(toRefs(props))
</script>

<style scoped src="./styles/HistoryAnalytics.css"></style>