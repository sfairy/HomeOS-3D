/**
 * 组件：HomeModePanelSection.vue
 *
 * 职责：家庭模式配置面板根容器。组合空状态、模式 Tab 工具栏、上下文概览与编辑工作区，
 *      通过 useHomeModePanel 统一管理加载/草稿/批量/触发/日志等状态，并向编辑器桥接
 *      保存与 Tab 操作供外层壳层调用。
 * 关键依赖：
 *  - useHomeModePanel：面板核心状态与回调
 *  - setHomeModePanelBridge：向编辑器 composable 透传保存/Tab 桥接
 *  - HomeModeEmptyState / HomeModeTabsToolbar / HomeModeContextBar / HomeModeEditorWorkspace
 * 数据来源：useHomeModePanel 内部状态 + 父级透传的 embedded / externalModeToolbar
 */
<script setup>
/**
 * 职责：渲染 views/HomeModePanelSection 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { computed, onScopeDispose } from 'vue'
import { RouterLink } from 'vue-router'
import { setHomeModePanelBridge } from '@/composables/home-mode/editor.internals'
import { useHomeModePanel } from '@/composables/settings/automate/home-mode-panel.internals'
import HomeModeEmptyState from '@/views/settings/automate/home-mode/HomeModeEmptyState.vue'
import HomeModeTabsToolbar from '@/views/settings/automate/home-mode/HomeModeTabsToolbar.vue'
import HomeModeContextBar from '@/views/settings/automate/home-mode/HomeModeContextBar.vue'
import HomeModeEditorWorkspace from '@/views/settings/automate/home-mode/HomeModeEditorWorkspace.vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'

// 入参：是否嵌入设置页；externalModeToolbar 为 true 时模式 Tab 由外层壳层渲染
const props = defineProps({
  embedded: { type: Boolean, default: false },
  /** 设置页独立路由：模式 Tab 由外层同卡片渲染；为 true 时面板内不重复渲染 */
  externalModeToolbar: { type: Boolean, default: false },
})

const homeModeAccentVars = computed(() => {
  const rgb = 'var(--module-accent-home-mode-rgb, 251, 191, 36)'
  return {
    '--page-accent': 'var(--module-accent-home-mode, #fbbf24)',
    '--page-accent-rgb': rgb,
    '--page-accent-secondary': 'var(--module-accent-home-mode-sub, #fb7185)',
    '--page-accent-secondary-rgb': 'var(--module-accent-home-mode-sub-rgb, 251, 113, 133)',
    '--page-accent-bg': `rgba(${rgb}, 0.12)`,
    '--page-accent-bg-strong': `rgba(${rgb}, 0.18)`,
    '--page-accent-border': `rgba(${rgb}, 0.22)`,
    '--page-accent-glow': `rgba(${rgb}, 0.16)`,
    '--page-accent-text': 'var(--module-accent-home-mode, #fbbf24)',
  }
})

const {
  isAdmin,
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
  isAdmin,
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
      :is-admin="isAdmin"
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
        :is-admin="isAdmin"
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
