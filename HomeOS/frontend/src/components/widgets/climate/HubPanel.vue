<template>
  <div class="widget-hub-root">
    <!-- 头部：仅在非嵌入式模式下展示，包含「趋势/控制/建议」三个 tab -->
    <WidgetHubHeader
      v-if="!embedded"
      v-model="activeTab"
      title="气候中心"
      accent="var(--premium-accent-cyan)"
      :tabs="hubTabs"
    >
      <template #icon
        ><ThermometerSun class="w-3.5 h-3.5" style="color: var(--premium-accent-cyan)"
      /></template>
    </WidgetHubHeader>
    <!-- 趋势 tab：环境趋势面板，传递当前趋势子 tab -->
    <ClimateTrendPanel
      v-if="activeTab === 'trend'"
      class="widget-hub-panel ch-embed"
      embedded
      :config="config"
      :panel-visible="panelVisible"
      :default-tab="trendSubTab"
    />
    <!-- 控制 tab：气候控制卡片 -->
    <ClimateCard v-else-if="activeTab === 'control'" class="widget-hub-panel ch-embed" embedded />
    <!-- 建议 tab：自适应气候建议面板（默认） -->
    <AdaptiveClimatePanel v-else class="widget-hub-panel ch-embed" embedded />
  </div>
</template>

<script setup>
/**
 * @file ClimateHubPanel.vue
 * @module widgets/climate
 * @description 气候中心 Hub 面板：聚合「趋势 / 控制 / 建议」三大子模块，
 *              支持嵌入式与独立展示两种模式，通过 useHubTabs 维护 tab 持久化状态。
 * @dependencies
 *  - vue: computed 计算属性
 *  - @lucide/vue: ThermometerSun 图标
 *  - ./TrendPanel.vue: 环境趋势面板
 *  - ./Card.vue: 气候控制卡片
 *  - ./AdaptiveClimatePanel.vue: 自适应气候建议面板
 *  - @/components/widgets/shared/WidgetHubHeader.vue: 通用 Hub 头部
 *  - @/composables/widget/useHubTabs: Hub tab 持久化 composable
 */
import { computed } from 'vue'
import { ThermometerSun } from '@lucide/vue'
import ClimateTrendPanel from './TrendPanel.vue'
import ClimateCard from './Card.vue'
import AdaptiveClimatePanel from './AdaptiveClimatePanel.vue'
import WidgetHubHeader from '@/components/widgets/shared/WidgetHubHeader.vue'
import { useHubTabs } from '@/composables/widget/useHubTabs'

const props = defineProps({
  defaultTab: { type: String, default: '' },
  config: { type: Object, default: () => ({}) },
  panelVisible: { type: Boolean, default: true },
  embedded: { type: Boolean, default: false },
})

// 气候中心全部 tab 配置：趋势 / 控制 / 建议
const ALL_HUB_TABS = [
  { key: 'trend', label: '趋势' },
  { key: 'control', label: '控制' },
  { key: 'adaptive', label: '建议' },
]

/**
 * 解析 defaultTab：未知值兜底为 control。
 * @param {string} raw 外部传入的 defaultTab 原始值
 * @returns {string} 归一化后的合法 tab key
 */
function mapClimateDefaultTab(raw) {
  const tab = raw || props.config?.defaultTab || 'control'
  return ALL_HUB_TABS.some((t) => t.key === tab) ? tab : 'control'
}

// 通过 useHubTabs 维护 tab 选中状态，并支持配置持久化
const { hubTabs, activeTab } = useHubTabs({
  hubType: 'climateHub',
  config: () => props.config,
  defaultTabProp: () => mapClimateDefaultTab(props.defaultTab),
  allTabs: ALL_HUB_TABS,
})

/**
 * 计算趋势子 tab：
 *  - 当外部指定 metrics 时透传给 ClimateTrendPanel
 *  - 其他情况统一回退到 multi（多路温度）
 */
const trendSubTab = computed(() => {
  const raw = props.defaultTab || props.config?.defaultTab || 'multi'
  if (raw === 'metrics') return 'metrics'
  return 'multi'
})
</script>

<style scoped src="./styles/climate-hub.css"></style>