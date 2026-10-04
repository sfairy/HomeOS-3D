<!--
  WeatherHubPanel.vue
  所属模块：天气中心 Hub 面板
  职责：作为「天气中心」的容器面板，通过 WidgetHubHeader 提供多 Tab 切换，
        聚合展示当前天气（WeatherWidget）、气象预报（WeatherForecast）、
        生活指数（LifeIndices）与日出日落（SunInfo）。
        其中 Forecast / LifeIndices / SunInfo 采用异步加载以减小首屏体积。
  依赖：WeatherWidget / WidgetHubHeader / useHubTabs / 异步子部件。
-->
<template>
  <div class="widget-hub-root weather-hub-root">
    <!-- Hub 顶部 Tab 切换头 -->
    <WidgetHubHeader
      v-if="hubTabs.length"
      v-model="activeTab"
      accent="var(--premium-accent-cyan)"
      :tabs="hubTabs"
    />
    <div
      class="weather-hub-body"
      :class="{
        'weather-hub-body--scroll': hubBodyScroll,
        'weather-hub-body--sun': activeTab === 'sun',
      }"
    >
      <!-- 实时天气 -->
      <WeatherWidget
        v-if="activeTab === 'current'"
        class="widget-hub-panel weather-hub-panel"
        :config="config"
        :panel-visible="panelVisible"
        compact
      />
      <!-- 气象预报 -->
      <WeatherForecast
        v-if="activeTab === 'forecast'"
        embedded
        class="widget-hub-panel weather-hub-panel"
        :config="config"
        :panel-visible="panelVisible"
      />
      <!-- 生活指数（tianqi sensor.{station}_*） -->
      <LifeIndices
        v-if="activeTab === 'life'"
        embedded
        class="widget-hub-panel weather-hub-panel"
        :config="config"
        :panel-visible="panelVisible"
      />
      <!-- 日出日落 -->
      <SunInfo
        v-if="activeTab === 'sun'"
        embedded
        class="widget-hub-panel weather-hub-panel"
        :config="config"
        :panel-visible="panelVisible"
      />
    </div>
  </div>
</template>

<script setup>
/**
 * 天气中心 Hub 面板
 * 聚合天气相关多个子面板，通过 useHubTabs 管理可见 Tab 与激活状态。
 */
import { computed, defineAsyncComponent } from 'vue'
import WeatherWidget from '@/components/widgets/weather/Widget.vue'
import WidgetHubHeader from '@/components/widgets/shared/WidgetHubHeader.vue'
import { useHubTabs } from '@/composables/widget/useHubTabs'

/** 气象预报部件（异步加载） */
const WeatherForecast = defineAsyncComponent(
  () => import('@/components/widgets/weather/Forecast.vue'),
)
/** 生活指数部件（异步加载） */
const LifeIndices = defineAsyncComponent(
  () => import('@/components/widgets/weather/LifeIndices.vue'),
)
/** 日出日落部件（异步加载） */
const SunInfo = defineAsyncComponent(() => import('@/components/widgets/weather/SunInfo.vue'))

/**
 * 组件 Props
 * @property {Object} config - Hub 配置对象（含天气实体 ID 等），透传给各子部件
 * @property {boolean} panelVisible - 面板是否可见，控制子部件轮询行为
 * @property {string} defaultTab - 默认激活的 Tab key
 */
const props = defineProps({
  config: { type: Object, default: () => ({}) },
  panelVisible: { type: Boolean, default: true },
  defaultTab: { type: String, default: '' },
})

/**
 * 天气中心全部 Tab 定义
 * @type {Array<{key: string, label: string}>}
 */
const ALL_TABS = [
  { key: 'current', label: '实时' },
  { key: 'forecast', label: '预报' },
  { key: 'life', label: '生活' },
  { key: 'sun', label: '日出' },
]

/**
 * Hub Tab 管理器：根据 Hub 类型、配置与默认 Tab 计算可见 Tab 列表与当前激活 Tab。
 */
const { hubTabs, activeTab } = useHubTabs({
  hubType: 'weather',
  config: () => props.config,
  defaultTabProp: () => props.defaultTab,
  allTabs: ALL_TABS,
})

/** 预报/生活：Hub 外层滚动；实时/日出：卡片占满剩余高度 */
const hubBodyScroll = computed(
  () => activeTab.value !== 'current' && activeTab.value !== 'sun',
)
</script>

<style scoped src="../styles/widget-hub-embeds.css"></style>
