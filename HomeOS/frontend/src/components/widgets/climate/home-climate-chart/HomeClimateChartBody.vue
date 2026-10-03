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
 * 职责：仅渲染曲线绘制区与双轴标签，图表实例由父级通过 setChartRef 注入。
 * Props:
 * - activeView：当前视图（'all' / 'temperature' / 'humidity'），决定是否显示双轴标签；
 * - setChartRef：父级提供的 ref 回调，用于挂载 ECharts 容器。
 */
import './styles/home-climate-chart.css'

defineProps({
  activeView: { type: String, required: true },
  setChartRef: { type: Function, required: true },
})
</script>
