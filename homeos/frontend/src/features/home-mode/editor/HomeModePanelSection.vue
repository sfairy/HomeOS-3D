<script setup>
import { computed, onScopeDispose } from 'vue'
import { RouterLink } from 'vue-router'
import { setHomeModePanelBridge } from '@/features/home-mode'
import { useHomeModePanel } from '../composables/home-mode-panel.internals'
import HomeModeEmptyState from './HomeModeEmptyState.vue'
import HomeModeTabsToolbar from './HomeModeTabsToolbar.vue'
import HomeModeContextBar from './HomeModeContextBar.vue'
import HomeModeEditorWorkspace from './HomeModeEditorWorkspace.vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'

const props = defineProps({
  embedded: { type: Boolean, default: false },
  /** 设置页独立路由：模式 Tab 由外层同卡片渲染；为 true 时面板内不重复渲染 */
  externalModeToolbar: { type: Boolean, default: false },
})

const homeModeAccentVars = computed(() => {
  const rgb = 'var(--hos-color-accent-rgb)'
  return {
    '--hos-color-accent-rgb': rgb,
    '--hos-color-accent-strong': 'var(--hos-color-info)',
    '--hos-color-accent-soft': `rgba(${rgb}, 0.12)`,
    '--hos-color-accent-soft-strong': `rgba(${rgb}, 0.18)`,
    '--hos-color-accent-line': `rgba(${rgb}, 0.22)`,
    '--hos-glow-accent-soft': `rgba(${rgb}, 0.16)`,
  }
})

const {
  loading,
  modesLoadError,
  modeTabs,
  displayModeTabs,
  activeTab,
  activeMode,
  activeDraft,
  activeDraftDirty,
  pendingModeChanges,
  activeSection,
  sectionTabs,
  contextLoadWarnings,
  contextPills,
  showPresetSidebar,
  modePresets,
  presetInstalling,
  actionTemplates,
  exclusiveGroupOptions,
  homeModeIconOptions,
  allDomains,
  showBatch,
  batchDomain,
  batchService,
  batchChecked,
  servicesForDomain,
  batchEntities,
  triggerTypeOptions,
  actionKindOptions,
  savedScenes,
  savedScripts,
  triggerLogs,
  execHistory,
  saving,
  acting,
  onModeReorder,
  handleSeed,
  handleCreate,
  exportModesJson,
  onImportFile,
  installPreset,
  onKindChange,
  handleDuplicate,
  handleAddAction,
  handleAddTrigger,
  handleApplyTemplate,
  toggleBatchCheck,
  onBatchDomainChange,
  applyBatch,
  cancelBatch,
  actionFocusEpoch,
  actionFocusIndex,
  triggerFocusEpoch,
  triggerFocusIndex,
  handleSave,
  handleCancelDraft,
  handleActivate,
  handleDeactivate,
  handleDelete,
  switchTab,
  focusSection,
  fetchModes,
} = useHomeModePanel()

const showModeToolbar = computed(() => !loading.value && modeTabs.value.length > 0)

setHomeModePanelBridge({
  pendingCount: pendingModeChanges,
  saving,
  onSave: handleSave,
  onCancel: handleCancelDraft,
  showModeToolbar,
  activeTab,
  displayModeTabs,
  switchTab,
  onModeReorder,
  handleSeed,
  handleCreate,
  exportModesJson,
  onImportFile,
})

onScopeDispose(() => setHomeModePanelBridge(null))
</script>

<template>
  <div
    :class="[
      'home-mode-panel',
      embedded && 'home-mode-panel--embedded',
      'flex flex-col h-full overflow-hidden',
    ]"
    :style="homeModeAccentVars"
  >
    <div
      v-if="!embedded"
      class="flex items-center justify-between px-6 py-3 border-b border-white/[0.06] shrink-0"
    >
      <div>
        <h2 class="text-sm font-bold text-white">{{ '家庭模式' }}</h2>
        <p class="text-[12px] hp-text-tertiary mt-0.5">
          {{ '可视化配置设备动作与自动触发器，激活前自动快照便于恢复' }}
        </p>
        <RouterLink to="/mode-logs" class="home-mode-logs-promo">{{
          '查看模式触发日志 →'
        }}</RouterLink>
      </div>
    </div>

    <ApiQueryState
      :loading="loading"
      :error="modesLoadError"
      error-title="加载家庭模式失败"
      tone="sky"
      @retry="fetchModes"
    >
    <HomeModeEmptyState
      v-if="!modeTabs.length"
      :show-preset-sidebar="showPresetSidebar"
      :mode-presets="modePresets"
      :preset-installing="presetInstalling"
      @seed="handleSeed"
      @create="handleCreate"
      @install-preset="installPreset"
    />

    <template v-else>
      <HomeModeTabsToolbar
        v-if="!props.externalModeToolbar"
        :active-tab="activeTab"
        :display-mode-tabs="displayModeTabs"
        @update:active-tab="switchTab"
        @reorder="onModeReorder"
        @seed="handleSeed"
        @export="exportModesJson"
        @import="onImportFile"
        @create="handleCreate"
      />

      <HomeModeContextBar
        :context-load-warnings="contextLoadWarnings"
        :context-pills="contextPills"
        :embedded="embedded"
        @pill-click="focusSection"
      />

      <HomeModeEditorWorkspace
        v-if="activeDraft"
        v-model:active-section="activeSection"
        v-model:batch-domain="batchDomain"
        v-model:batch-service="batchService"
        :active-tab="activeTab"
        :active-mode="activeMode"
        v-model:active-draft="activeDraft"
        :active-draft-dirty="activeDraftDirty"
        :section-tabs="sectionTabs"
        :show-preset-sidebar="showPresetSidebar"
        :mode-presets="modePresets"
        :preset-installing="presetInstalling"
        :home-mode-icon-options="homeModeIconOptions"
        :exclusive-group-options="exclusiveGroupOptions"
        :action-templates="actionTemplates"
        :show-batch="showBatch"
        :all-domains="allDomains"
        :batch-checked="batchChecked"
        :services-for-domain="servicesForDomain"
        :batch-entities="batchEntities"
        :action-kind-options="actionKindOptions"
        :saved-scenes="savedScenes"
        :saved-scripts="savedScripts"
        :trigger-type-options="triggerTypeOptions"
        :trigger-logs="triggerLogs"
        :exec-history="execHistory"
        :saving="saving"
        :acting="acting"
        :action-focus-epoch="actionFocusEpoch"
        :action-focus-index="actionFocusIndex"
        :trigger-focus-epoch="triggerFocusEpoch"
        :trigger-focus-index="triggerFocusIndex"
        :embedded="embedded"
        @apply-template="handleApplyTemplate"
        @duplicate="handleDuplicate"
        @toggle-batch="showBatch = !showBatch"
        @add-action="handleAddAction"
        @batch-domain-change="onBatchDomainChange"
        @apply-batch="applyBatch"
        @cancel-batch="cancelBatch"
        @batch-select-all="batchChecked = batchEntities().map((e) => e.eid)"
        @batch-clear="batchChecked = []"
        @toggle-batch-check="toggleBatchCheck"
        @kind-change="onKindChange"
        @add-trigger="handleAddTrigger"
        @save="handleSave"
        @cancel="handleCancelDraft"
        @activate="handleActivate"
        @deactivate="handleDeactivate"
        @delete="handleDelete"
        @install-preset="installPreset"
      />
    </template>
    </ApiQueryState>
  </div>
</template>

<style scoped src="./styles/HomeMode.css"></style>
