<template>
  <!-- 居家环境面板：复用 EnvironmentHealthPanel，仅做默认 tab 与标题适配 -->
  <EnvironmentHealthPanel
    class="he-embed"
    :config="config"
    :panel-visible="panelVisible"
    :default-tab="healthDefaultTab"
    :tab-select-token="tabSelectToken"
    :embedded="embedded"
    title="居家环境"
    hub-type="homeEnvironment"
  />
</template>

<script setup>
/**
 * @file HomeEnvironmentPanel.vue
 * @module widgets/climate
 * @description 居家环境面板入口组件。
 *              作为「居家环境」Hub 的根容器，复用 EnvironmentHealthPanel 通用实现，
 *              仅在外层做默认 tab 映射与标题定制，避免重复实现环境健康相关逻辑。
 * @dependencies
 *  - vue: 提供 computed 计算属性
 *  - ./EnvironmentHealthPanel.vue: 环境健康面板核心实现
 */
import { computed } from 'vue'
import EnvironmentHealthPanel from './EnvironmentHealthPanel.vue'

const props = defineProps({
  defaultTab: { type: String, default: '' },
  tabSelectToken: { type: Number, default: 0 },
  config: { type: Object, default: () => ({}) },
  panelVisible: { type: Boolean, default: true },
  embedded: { type: Boolean, default: false },
})

// 环境健康合法 tab：总览 / 生活指数 / 舒适度 / 趋势 / 房间 / 昼夜节律
const HEALTH_TABS = new Set(['overview', 'life', 'comfort', 'trend', 'rooms', 'circadian'])

// 当前生效的默认 tab：直接使用外部 props.defaultTab，无效值回落「健康总览」
const healthDefaultTab = computed(() => {
  const tab = String(props.defaultTab || '')
  return HEALTH_TABS.has(tab) ? tab : 'overview'
})
</script>

<style scoped src="./styles/climate-hub.css"></style>