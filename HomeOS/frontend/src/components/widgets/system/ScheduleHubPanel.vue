<!--
  ScheduleHubPanel.vue
  所属模块：日程中心 Hub 面板
  职责：作为「日程中心」的容器面板，通过 HubPanelLayout 提供多 Tab 切换，
        聚合展示日程提醒（CalendarWidget）与语音命令（VoiceCommand）两个子部件。
  依赖：HubPanelLayout（共享布局）、CalendarWidget、VoiceCommand。
-->
<template>
  <HubPanelLayout
    title="日程中心"
    accent="var(--premium-accent-amber)"
    :icon-component="Calendar"
    hub-type="scheduleHub"
    :all-tabs="ALL_HUB_TABS"
    :default-tab="defaultTab"
    :config="config"
  >
    <!-- 默认插槽：根据当前激活的 Tab 渲染日程或语音子部件 -->
    <template #default="{ activeTab }">
      <!-- 日程提醒部件 -->
      <CalendarWidget
        v-if="activeTab === 'schedule'"
        class="widget-hub-panel sch-embed"
        embedded
        :panel-visible="panelVisible"
      />
      <!-- 语音命令部件 -->
      <VoiceCommand
        v-else
        class="widget-hub-panel sch-embed"
        embedded
        :panel-visible="panelVisible"
      />
    </template>
  </HubPanelLayout>
</template>

<script setup>
/**
 * 日程中心 Hub 面板
 * 通过 HubPanelLayout 容器聚合日程提醒与语音命令两个子面板，按 Tab 切换显示。
 */
import { Calendar } from '@lucide/vue'
import CalendarWidget from '@/components/widgets/system/CalendarWidget.vue'
import VoiceCommand from '@/components/widgets/voice/Command.vue'
import HubPanelLayout from '@/components/widgets/shared/HubPanelLayout.vue'

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
 * 日程中心全部 Tab 定义
 * @type {Array<{key: string, label: string}>}
 */
const ALL_HUB_TABS = [
  { key: 'schedule', label: '日程' },
  { key: 'voice', label: '语音' },
]
</script>

<style scoped>
/* 嵌入式日程/语音部件的内边距与高度适配 */
.sch-embed :deep(.calendar-widget),
.sch-embed :deep(.voice-cmd) {
  padding: 2px 10px 10px;
  height: 100%;
}
</style>
