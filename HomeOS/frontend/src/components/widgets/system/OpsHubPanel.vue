<!--
  OpsHubPanel.vue
  所属模块：运维中心 Hub 面板
  职责：作为「运维中心」的容器面板，通过 HubPanelLayout 提供多 Tab 切换，
        聚合展示设备健康、设备用量热力图、系统监控、HA 同步状态等运维相关子部件。
  依赖：HubPanelLayout（共享布局）、DeviceHealthPanel / DeviceUsageHeatmap /
        SystemMonitor / HaSyncStatusCard（异步加载的子部件）。
-->
<template>
  <HubPanelLayout
    title="运维中心"
    accent="var(--premium-accent-violet)"
    :icon-component="Cpu"
    hub-type="opsHub"
    :all-tabs="ALL_HUB_TABS"
    :default-tab="defaultTab"
    :config="config"
  >
    <!-- 默认插槽：根据当前激活的 Tab 渲染对应子部件 -->
    <template #default="{ activeTab }">
      <!-- 设备健康面板 -->
      <DeviceHealthPanel
        v-if="activeTab === 'health'"
        class="widget-hub-panel ops-embed"
        embedded
      />
      <!-- 设备用量热力图 -->
      <DeviceUsageHeatmap
        v-else-if="activeTab === 'usage'"
        class="widget-hub-panel ops-embed"
        embedded
        :panel-visible="panelVisible"
      />
      <!-- 系统资源监控 -->
      <SystemMonitor
        v-else-if="activeTab === 'system'"
        class="widget-hub-panel ops-embed"
        embedded
        :panel-visible="panelVisible"
      />
      <!-- HA 同步状态卡片（默认 Tab） -->
      <HaSyncStatusCard v-else class="widget-hub-panel ops-embed" embedded />
    </template>
  </HubPanelLayout>
</template>

<script setup>
/**
 * 运维中心 Hub 面板
 * 通过 HubPanelLayout 容器聚合运维相关的多个子面板，按 Tab 切换显示。
 * 子部件采用 defineAsyncComponent 异步加载以减小首屏体积。
 */
import { defineAsyncComponent } from 'vue'
import { Cpu } from '@lucide/vue'
import HubPanelLayout from '@/components/widgets/shared/HubPanelLayout.vue'

/** 设备健康面板（异步加载） */
const DeviceHealthPanel = defineAsyncComponent(
  () => import('@/components/widgets/device/HealthPanel.vue'),
)
/** 设备用量热力图（异步加载） */
const DeviceUsageHeatmap = defineAsyncComponent(
  () => import('@/components/widgets/device/UsageHeatmap.vue'),
)
/** 系统监控面板（异步加载） */
const SystemMonitor = defineAsyncComponent(
  () => import('@/components/widgets/system/Monitor.vue'),
)
/** HA 同步状态卡片（异步加载） */
const HaSyncStatusCard = defineAsyncComponent(
  () => import('@/components/widgets/orchestrator/HaSyncStatusCard.vue'),
)

/**
 * 组件 Props
 * @property {string} defaultTab - 默认激活的 Tab key（空字符串表示使用 HubPanelLayout 默认值）
 * @property {Object} config - Hub 配置对象，透传给 HubPanelLayout
 * @property {boolean} panelVisible - 面板是否可见，用于控制子部件的轮询/刷新行为
 */
defineProps({
  defaultTab: { type: String, default: '' },
  config: { type: Object, default: () => ({}) },
  panelVisible: { type: Boolean, default: true },
})

/**
 * 运维中心全部 Tab 定义
 * @type {Array<{key: string, label: string}>}
 */
const ALL_HUB_TABS = [
  { key: 'health', label: '设备' },
  { key: 'usage', label: '用量' },
  { key: 'system', label: '系统' },
  { key: 'sync', label: '同步' },
]
</script>

<style scoped src="../styles/widget-hub-embeds.css"></style>
