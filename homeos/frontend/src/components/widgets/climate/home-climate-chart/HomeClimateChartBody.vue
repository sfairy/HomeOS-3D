/** 家居气候图表主体：仅绘制曲线区 */
<template>
  <div class="hcc-card__body">
    <div class="hcc-card__plot">
      <div v-if="activeView === 'all'" class="hcc-card__axis-tags">
        <span class="hcc-card__axis-tag hcc-card__axis-tag--temp">{{ '温度 °C' }}</span>
        <span class="hcc-card__axis-tag hcc-card__axis-tag--hum">{{ '湿度 %' }}</span>
      </div>
      <div :ref="setChartRef" class="hcc-card__chart" />
    </div>
  </div>
</template>

<script setup>
/**
 * HomeClimateChartBody - 家居气候图表主体组件
 * 仅渲染曲线绘制区与双轴标签，图表实例由父级通过 setChartRef 注入。
 */
import './styles/home-climate-chart.css'

defineProps({
  activeView: { type: String, required: true },
  setChartRef: { type: Function, required: true },
})
</script>
