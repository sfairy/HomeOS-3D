<!--
组件：SettingsRenderingSection.vue
所属模块：frontend / src / views / settings / display
职责：高级渲染区段。配置毛玻璃效果（auto/static/native）、户型图渲染策略
      （auto/dom/canvas）与智能性能档位开关（FPS 自动降档/升档）。
关键依赖：
  - SettingsCard / SettingsFlowBand / SettingsFlowStat：卡片与流程概览
  - useLayoutStore：读写 layoutConfig.glassEffect / floorplanRenderer / smartPerformanceMode
数据来源：layoutStore.layoutConfig（渲染相关字段）
-->
<template>
  <SettingsCard full static>
    <SettingsFlowBand
      :steps="renderFlowSteps"
      class="render-flow-band"
      band-class="render-flow-band__shell"
      collapsible
      default-collapsed
      toggle-label="渲染流程"
      :collapsed-summary="renderFlowSummary"
    >
      <template #stats>
        <SettingsFlowStat
          :label="'毛玻璃'"
          :value="glassLabel"
          tone="accent"
          val-tone="accent"
        />
        <SettingsFlowStat
          :label="'智能档位'"
          :value="layoutConfig.smartPerformanceMode ? '自动' : '固定'"
          :tone="layoutConfig.smartPerformanceMode ? 'emerald' : 'secondary'"
          :val-tone="layoutConfig.smartPerformanceMode ? 'emerald' : 'secondary'"
        />
      </template>
    </SettingsFlowBand>

    <div class="render-options">
      <section class="render-panel render-panel--violet">
        <header class="render-panel__head">
          <div class="render-panel__icon">
            <Layers class="w-4 h-4" />
          </div>
          <div class="min-w-0">
            <h4 class="render-panel__title">{{ '毛玻璃效果' }}</h4>
            <p class="render-panel__desc">{{ '弹窗与面板的 backdrop-filter 开销' }}</p>
          </div>
        </header>
        <div class="render-choices">
          <button
            v-for="opt in glassOptions"
            :key="opt.value"
            type="button"
            :class="choiceClass('glassEffect', opt.value)"
            @click="layoutConfig.glassEffect = opt.value"
          >
            <span class="render-choice__label">{{ opt.label }}</span>
            <span class="render-choice__hint">{{ opt.hint }}</span>
          </button>
        </div>
      </section>

      <section class="render-panel render-panel--sky">
        <header class="render-panel__head">
          <div class="render-panel__icon">
            <LayoutGrid class="w-4 h-4" />
          </div>
          <div class="min-w-0">
            <h4 class="render-panel__title">{{ '户型图渲染' }}</h4>
            <p class="render-panel__desc">{{ '热点图层的 DOM / Canvas2D 策略' }}</p>
          </div>
        </header>
        <div class="render-choices">
          <button
            v-for="opt in floorplanOptions"
            :key="opt.value"
            type="button"
            :class="choiceClass('floorplanRenderer', opt.value)"
            @click="layoutConfig.floorplanRenderer = opt.value"
          >
            <span class="render-choice__label">{{ opt.label }}</span>
            <span class="render-choice__hint">{{ opt.hint }}</span>
          </button>
        </div>
      </section>
    </div>

    <div class="render-smart">
      <div class="render-smart__body">
        <div class="render-smart__icon">
          <Gauge class="w-4 h-4" />
        </div>
        <div class="min-w-0">
          <p class="render-smart__title">{{ '智能性能档位' }}</p>
          <p class="render-smart__desc">
            {{ 'FPS 持续低于 45 自动降至 medium，恢复至 55 以上 30 秒后回 high' }}
          </p>
        </div>
      </div>
      <button
        type="button"
        class="render-toggle"
        :class="{ 'render-toggle--on': layoutConfig.smartPerformanceMode }"
        role="switch"
        :aria-checked="layoutConfig.smartPerformanceMode ? 'true' : 'false'"
        aria-label="智能性能档位"
        @click="layoutConfig.smartPerformanceMode = !layoutConfig.smartPerformanceMode"
      >
        <span
          class="render-toggle__thumb"
          :class="{ 'render-toggle__thumb--on': layoutConfig.smartPerformanceMode }"
        />
      </button>
    </div>
  </SettingsCard>
</template>

<script setup>
import { computed } from 'vue'
import { Monitor, Layers, LayoutGrid, Gauge, Zap } from '@lucide/vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsFlowBand from '@/views/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/views/settings/shared/layout/SettingsFlowStat.vue'
import { useLayoutStore } from '@/stores/layout.store'

const layoutStore = useLayoutStore()
const layoutConfig = layoutStore.layoutConfig

// 毛玻璃效果选项
const glassOptions = [
  { value: 'auto', label: '自动', hint: '触屏设备自动使用 static' },
  { value: 'static', label: '伪毛玻璃', hint: 'CSS 渐变模拟，省 GPU' },
  { value: 'native', label: '实时 blur', hint: '原生 backdrop-filter' },
]

// 户型图渲染策略选项
const floorplanOptions = [
  { value: 'auto', label: '自动', hint: '≥40 热点时走 Canvas2D' },
  { value: 'dom', label: '标准 DOM', hint: '每热点独立状态订阅' },
  { value: 'canvas', label: '强制 Canvas2D', hint: '批量绘制，大户型更流畅' },
]

// 毛玻璃效果当前标签
const glassLabel = computed(
  () => glassOptions.find((o) => o.value === (layoutConfig.glassEffect || 'auto'))?.label || '自动',
)
// 户型图渲染当前标签
const floorplanLabel = computed(
  () =>
    floorplanOptions.find((o) => o.value === (layoutConfig.floorplanRenderer || 'auto'))?.label ||
    '自动',
)

// 渲染流程折叠态摘要文案
const renderFlowSummary = computed(() => {
  const mode = layoutConfig.smartPerformanceMode ? '智能档' : '固定档'
  return `${glassLabel.value} · ${floorplanLabel.value} · ${mode}`
})

// 渲染流程步骤：毛玻璃 → 户型图渲染 → 智能性能 → 显卡/帧率 → 即时生效
const renderFlowSteps = computed(() => [
  { label: '毛玻璃', meta: glassLabel.value, icon: Layers, tone: 'in' },
  { label: '户型图渲染', meta: floorplanLabel.value, icon: LayoutGrid, tone: 'sky' },
  {
    label: '智能性能',
    meta: layoutConfig.smartPerformanceMode ? '自动降档' : '固定档位',
    icon: Gauge,
    tone: 'mid',
  },
  { label: '显卡/帧率', meta: '45/55 阈值', icon: Zap, tone: 'exec' },
  { label: '即时生效', meta: 'layoutConfig', icon: Monitor, tone: 'out' },
])

// 选项按钮样式（高亮当前选中值）
function choiceClass(field, value) {
  const active = (layoutConfig[field] || 'auto') === value
  return ['render-choice', active && 'render-choice--active']
}
</script>

<style scoped src="./styles/settings-rendering-section.css"></style>
