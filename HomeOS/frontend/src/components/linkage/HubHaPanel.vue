<template>
  <!-- LinkageHubHaPanel 联动中心 HA 面板：展示 Home Assistant 联动相关内容 -->
  <div class="linkage-hub__ha-panel">
    <SceneScriptPanel :default-tab="lockDomain" :lock-domain="lockDomain" hub-mode />
  </div>
</template>

<script setup>
/**
 * LinkageHubHaPanel - 联动中心 HA 面板组件
 * 功能特性：
 * - 展示 HA 自动化/场景等
 * - 同步状态显示
 * - 用于联动中心页面
 */
import { defineAsyncComponent } from 'vue'

const SceneScriptPanel = defineAsyncComponent(
  () => import('@/components/widgets/orchestrator/SceneScriptPanel.vue'),
)

defineProps({
  lockDomain: {
    type: String,
    required: true,
    validator: (v) => ['scene', 'script', 'automation'].includes(v),
  },
})
</script>
