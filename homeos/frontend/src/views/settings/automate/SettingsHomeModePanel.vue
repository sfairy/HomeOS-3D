<!--
组件：SettingsHomeModePanel.vue
所属模块：frontend / src / views / settings / automate
职责：「居家模式」设置面板入口。以 SettingsPageShell 单列布局承载 HomeModePanel，
      并在页头保存条上挂载 SettingsPendingSaveAction，桥接到 home-mode 编辑器。
关键依赖：
  - SettingsPageShell：通用设置页壳（标题/图标/操作槽/滚动控制）
  - SettingsPendingSaveAction：待保存操作条
  - useHomeModePanelBridge：获取 home-mode 面板的待保存/保存中状态与保存/取消回调
  - HomeModePanelSection：实际的居家模式编辑器
数据来源：useHomeModePanelBridge 返回的响应式状态
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="home-mode"
    icon-key="house"
    accent="var(--module-accent-home-mode, #fbbf24)"
    layout="single"
    :scroll-body="false"
    body-class="settings-page__stage--workspace settings-home-mode-workspace"
  >
    <template v-if="panelBridge" #actions>
      <SettingsPendingSaveAction
        :pending="pendingCount"
        :saving="saving"
        save-text="保存模式"
        saving-text="保存中…"
        @save="panelBridge.onSave"
        @cancel="panelBridge.onCancel"
      />
    </template>

    <div class="settings-page-inset settings-home-mode-workspace__main">
      <!-- 模式 Tab + 编辑区同属一块外层卡片（不再拆到 #tabs） -->
      <HomeModePanel embedded class="home-mode-panel-host flex-1 min-h-0 h-full overflow-hidden" />
    </div>
  </SettingsPageShell>
</template>

<script setup>
import { computed, unref } from 'vue'
import SettingsPageShell from '@/components/common/page-shell/SettingsPageShell.vue'
import SettingsPendingSaveAction from '@/views/settings/shared/SettingsPendingSaveAction.vue'
import { useHomeModePanelBridge } from '@/composables/home-mode/editor.internals'
import HomeModePanel from '@/views/settings/automate/home-mode/HomeModePanelSection.vue'

// 入参：当前激活的 Tab ID（默认 home-mode）
defineProps({ activeTab: { type: String, default: 'home-mode' } })

// 桥接到 home-mode 编辑器的待保存状态与保存/取消回调
const panelBridge = useHomeModePanelBridge()

// 待保存条目数与保存中状态，用于驱动 SettingsPendingSaveAction
const pendingCount = computed(() => unref(panelBridge.value?.pendingCount) ?? 0)
const saving = computed(() => Boolean(unref(panelBridge.value?.saving)))
</script>
<style src="./home-mode/styles/HomeMode.css"></style>
