/**
 * 全屋温湿度：图表下方逐房间文字摘要（`客厅 25.8° 35%`）。
 *
 * 行数由已绑定的温湿度实体决定：同一房间的温度 / 湿度折叠为一行，只有单一读数的
 * 房间只显示对应数值；房间多到放不下时本区域自身滚动，不挤压图表高度。
 *
 * 配色策略：**图标与数值共用等级色**。单元格整体吃 `--hcc-level-color`，
 * 图标压到 0.72 透明度当标识，数字满色当读数；同一行的温度与湿度分别按各自
 * 指标分级（偏冷蓝 → 舒适绿 → 偏热红），异常房间靠颜色直接跳出。
 */
<template>
  <div class="hcc-card__summary" role="list" aria-label="房间温湿度">
    <div
      v-for="row in rows"
      :key="row.key"
      class="hcc-card__summary-row"
      role="listitem"
      :aria-label="describeRow(row)"
    >
      <span class="hcc-card__summary-name" aria-hidden="true" :title="row.name">
        {{ row.name }}
      </span>

      <!-- 读数成组右对齐：外面包一层，靠 margin-left:auto 吸收空隙，
           这样温度列与湿度列在每一行都落在同一个右边界上 -->
      <span class="hcc-card__summary-values" aria-hidden="true">
        <span
          v-if="row.temperature !== null"
          :class="['hcc-card__summary-cell', levelClass('temp', row.temperatureLevel)]"
        >
          <Thermometer class="hcc-card__summary-icon" :stroke-width="2" />
          <span class="hcc-card__summary-value">
            {{ formatSummaryValue(row.temperature, 'temp') }}
          </span>
          <i class="hcc-card__summary-unit">°</i>
        </span>
        <span v-else class="hcc-card__summary-cell is-placeholder" />

        <span
          v-if="row.humidity !== null"
          :class="['hcc-card__summary-cell', levelClass('hum', row.humidityLevel)]"
        >
          <Droplets class="hcc-card__summary-icon" :stroke-width="2" />
          <span class="hcc-card__summary-value">
            {{ formatSummaryValue(row.humidity, 'hum') }}
          </span>
          <i class="hcc-card__summary-unit">%</i>
        </span>
        <span v-else class="hcc-card__summary-cell is-placeholder" />
      </span>
    </div>
  </div>
</template>

<script setup>
/**
 * HomeClimateChartSummary - 图表下方逐房间读数摘要。
 * 纯展示组件：行数据由 useHomeClimateChart 聚合，这里只负责格式化、分级配色与排版。
 */
import { Droplets, Thermometer } from '@lucide/vue'
import { formatSummaryValue } from './echarts.util'
import './styles/home-climate-chart.css'

defineProps({
  /** ClimateSummaryRow[]：{ key, name, temperature, humidity, temperatureLevel, humidityLevel } */
  rows: { type: Array, required: true },
})

/**
 * 分级 → CSS 类名。
 * 温度和湿度用两套前缀（`is-temp-*` / `is-hum-*`），因为同一 key（comfortable）
 * 在两边的色板不同，合并会让选择器互相打架。
 */
function levelClass(kind, level) {
  return level ? `is-${kind}-${level.key}` : `is-${kind}-unknown`
}

/**
 * 把一行读数拼成读屏文案：视觉上是 `客厅 25.8° 35%`，符号与图标对读屏不友好，
 * 因此数值统一补上「度 / %」两个字，并把等级名一并念出来。
 */
function describeRow(row) {
  const parts = [row.name]
  if (row.temperature !== null) {
    const level = row.temperatureLevel ? `（${row.temperatureLevel.label}）` : ''
    parts.push(`温度 ${formatSummaryValue(row.temperature, 'temp')} 度${level}`)
  }
  if (row.humidity !== null) {
    const level = row.humidityLevel ? `（${row.humidityLevel.label}）` : ''
    parts.push(`湿度 ${formatSummaryValue(row.humidity, 'hum')}%${level}`)
  }
  if (parts.length === 1) parts.push('暂无读数')
  return parts.join(' ')
}
</script>
