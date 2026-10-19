<!--
  「居家模式」设置面板入口。以 SettingsPageShell 单列布局承载 HomeModePanel，
  并在页头保存条上挂载 SettingsPendingSaveAction，桥接到 home-mode 编辑器。
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="home-mode"
    icon-key="house"
    accent="var(--hos-color-accent)"
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
import SettingsPageShell from '@/components/common/settings-page-shell/SettingsPageShell.vue'
import SettingsPendingSaveAction from '@/features/settings/shared/SettingsPendingSaveAction.vue'
import { useHomeModePanelBridge } from '@/features/home-mode'
import { HomeModePanel } from '@/features/home-mode'

defineProps({ activeTab: { type: String, default: 'home-mode' } })

// 桥接到 home-mode 编辑器的待保存状态与保存/取消回调
const panelBridge = useHomeModePanelBridge()

// 待保存条目数与保存中状态，用于驱动 SettingsPendingSaveAction
const pendingCount = computed(() => unref(panelBridge.value?.pendingCount) ?? 0)
const saving = computed(() => Boolean(unref(panelBridge.value?.saving)))
</script>
<style src="./styles/home-mode-embed.css"></style>
