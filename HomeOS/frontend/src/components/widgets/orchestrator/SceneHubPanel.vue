<template>
  <!-- 场景中心 Hub：在收藏与历史之间切换 -->
  <HubPanelLayout
    title="场景中心"
    accent="var(--premium-accent-amber)"
    :icon-component="Sparkles"
    hub-type="sceneHub"
    :all-tabs="ALL_HUB_TABS"
    :default-tab="defaultTab"
    :config="config"
  >
    <template #default="{ activeTab }">
      <!-- 收藏 Tab：展示收藏的场景 -->
      <FavoriteScenesRow
        v-if="activeTab === 'scenes'"
        class="widget-hub-panel"
        floating
        show-when-empty
      />
      <!-- 历史 Tab：复用执行历史面板，预设为场景类型 -->
      <ExecutionHistoryPanel v-else class="widget-hub-panel" embedded preset="scene" />
    </template>
  </HubPanelLayout>
</template>

<script setup>
/**
 * @file 场景中心面板 (SceneHubPanel)
 * @module widgets/orchestrator
 * @description
 *   场景中心 Hub，提供"收藏场景"与"场景执行历史"两个 Tab。
 *   复用 HubPanelLayout 外壳与 ExecutionHistoryPanel（preset=scene）。
 * @dependencies
 *   - @/components/widgets/shared/HubPanelLayout Hub 外壳布局
 *   - @/components/dashboard/FavoriteScenesRow 收藏场景行
 *   - @/components/widgets/orchestrator/ExecutionHistoryPanel 执行历史（场景预设）
 */
import { Sparkles } from '@lucide/vue'
import FavoriteScenesRow from '@/components/dashboard/FavoriteScenesRow.vue'
import ExecutionHistoryPanel from '@/components/widgets/orchestrator/ExecutionHistoryPanel.vue'
import HubPanelLayout from '@/components/widgets/shared/HubPanelLayout.vue'

defineProps({
  /** 默认激活的 Tab */
  defaultTab: { type: String, default: '' },
  /** Hub 配置对象 */
  config: { type: Object, default: () => ({}) },
})

/** Hub 全部 Tab 定义：收藏 / 历史 */
const ALL_HUB_TABS = [
  { key: 'scenes', label: '收藏' },
  { key: 'history', label: '历史' },
]
</script>