/** 家居气候图表外壳：标题栏 + 加载/空态 */
<template>
  <header class="hcc-card__head">
    <div class="hcc-card__brand">
      <div class="hcc-card__glyph" aria-hidden="true">
        <Thermometer class="hcc-card__glyph-temp" />
        <Droplets class="hcc-card__glyph-hum" />
      </div>
      <div class="hcc-card__meta">
        <span class="hcc-card__title">{{ '全屋温湿度' }}</span>
        <span class="hcc-card__subtitle">{{ '近 24 小时' }}</span>
      </div>
    </div>
    <div class="hcc-card__tabs" role="tablist">
      <button
        v-for="opt in viewOptions"
        :key="opt.id"
        type="button"
        role="tab"
        class="widget-ignore-touch-min"
        :aria-selected="activeView === opt.id"
        :class="[
          'hcc-card__tab',
          `hcc-card__tab--${opt.id}`,
          activeView === opt.id && 'hcc-card__tab--active',
        ]"
        @click="activeView = opt.id"
      >
        {{ opt.label }}
      </button>
    </div>
  </header>

  <div v-if="stateVariant" class="hcc-card__state">
    <div v-if="stateVariant === 'loading'" class="hcc-card__spinner" />
    <Thermometer v-else-if="stateVariant === 'no-entities'" class="w-8 h-8 opacity-25" />
    <Droplets v-else class="w-8 h-8 opacity-25" />
    <span v-if="stateVariant === 'loading'">{{ '加载中…' }}</span>
    <template v-else-if="stateVariant === 'no-entities'">
      <span class="hcc-card__state-title">{{ '未配置传感器' }}</span>
      <span class="hcc-card__state-hint">{{ '请在微件设置中添加温度/湿度实体' }}</span>
    </template>
    <span v-else class="hcc-card__state-title">{{ emptyTitle }}</span>
  </div>
</template>

<script setup>
/**
 * HomeClimateChartChrome - 家居气候图表外壳组件
 * 职责：渲染图表标题栏、视图切换标签与加载/无实体/无数据三种空态。
 * Props:
 * - viewOptions：视图标签按钮列表（id + label）；
 * - stateVariant：状态枚举（'loading' / 'no-entities' / 'no-data' / null）；
 * - emptyTitle：无数据态展示文案。
 * v-model:
 * - activeView：当前激活视图，双向绑定到父级状态。
 */
import { Thermometer, Droplets } from '@lucide/vue'
import './styles/home-climate-chart.css'

defineProps({
  viewOptions: { type: Array, required: true },
  stateVariant: {
    type: String,
    default: null,
    validator: (v) => v == null || ['loading', 'no-entities', 'no-data'].includes(v),
  },
  emptyTitle: { type: String, default: '' },
})

const activeView = defineModel('activeView', { type: String, required: true })
</script>
