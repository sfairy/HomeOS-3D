<!--
  组件文件：SettingsSecurityModesPanel.vue
  所属模块：frontend/src/features/settings/automate
  组件职责：家庭自动化大类下的安防模式总控面板，包含「场景联动」和「全屋联动」两个
    Hub 子分区。场景联动下提供布防/撤防/夜间等安全预设切换、紧急场景卡片及导入导出；
    全屋联动下渲染联动逻辑编辑区。顶部有导入/导出按钮与未保存提示条，中部为模式 Tab
    与表单，底部依赖 SettingsPendingSaveAction 触发保存。
  主要 props / emits：
    - props activeTab：上级 Tab 路由名，用于同步 Hub 子分区路由
  依赖关系：调用 useSecurityModes composable 获取安防模式数据与联动配置（布防预设、紧急
    场景动作、awayLightPool 等）；依赖 useSettingsHubRouteSection 管理子分区路由；
    useRegisterSettingsTabPending 注册未保存提示。
  注意事项：保存按钮调用 composable 内部的安全布局持久化逻辑；导入会校验 JSON 格式并
    覆盖当前草稿；切换场景联动与全屋联动时草稿仍保留在内存，需显式点击保存或取消。
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="security-modes"
    icon-key="shield"
    accent="var(--module-accent-automation)"
    layout="single"
    page-class="sm-panel"
  >
    <template #actions>
      <button type="button" class="settings-btn-ghost text-xs" @click="exportModesJson">
        <Download class="w-3.5 h-3.5" /> {{ '导出' }}
      </button>
      <label
        class="settings-btn-ghost text-xs cursor-pointer"
        :class="importingModes && 'opacity-60 pointer-events-none'"
      >
        <Loader2 v-if="importingModes" class="w-3.5 h-3.5 animate-spin" />
        <Upload v-else class="w-3.5 h-3.5" /> {{ importingModes ? '导入中…' : '导入' }}
        <input
          type="file"
          accept="application/json,.json"
          class="hidden"
          :disabled="importingModes"
          @change="onImportFile"
        />
      </label>
      <SettingsPendingSaveAction
        v-if="hubSection === 'modes'"
        :pending="pendingChanges"
        save-text="保存安防场景"
        @save="saveSecurityLayout"
        @cancel="cancelSecurityChanges"
      />
    </template>

    <template #subnav>
      <SettingsHubSubnav v-model="hubSection" :sections="hubSections" />
    </template>

    <div v-if="pendingChanges > 0" class="settings-inline-save-bar">
      <SettingsPendingSaveAction
        :pending="pendingChanges"
        save-text="保存安防场景"
        @save="saveSecurityLayout"
        @cancel="cancelSecurityChanges"
      />
    </div>

    <template #tabs>
      <div v-if="hubSection === 'modes'" class="settings-page-inset settings-page-inset--tabs">
        <SettingsOrchTabs
          v-model="activeSmTab"
          :tabs="orchTabs"
          toolbar
          class="sm-modes-tabs-head"
        />
      </div>
    </template>

    <div v-if="hubSection === 'modes'" class="sm-modes-stage">
      <SettingsFlowBand
        :steps="securityModesFlowSteps"
        class="sm-flow-band"
        band-class="sm-flow-band__shell"
        collapsible
        default-collapsed
        toggle-label="流程概览"
        :collapsed-summary="securityModesFlowSummary"
      >
        <template #stats>
          <SettingsFlowStat
            :label="'当前'"
            :value="activeModeLabel"
            tone="sky"
            val-tone="sky"
          />
          <SettingsFlowStat
            :label="'待保存'"
            :value="pendingChanges || 0"
            :tone="pendingChanges ? 'amber' : 'secondary'"
            :val-tone="pendingChanges ? 'amber' : 'secondary'"
          />
        </template>
      </SettingsFlowBand>

      <div
        class="sm-modes-workspace"
        :style="{ '--sm-accent': isEmergencyTab ? '#ef4444' : modeAccent(activeSmTab) }"
      >
        <SettingsSecurityModesEmergencySection
          v-if="isEmergencyTab"
          embedded
          v-model:em-show-batch="emShowBatch"
          v-model:em-batch-domain="emBatchDomain"
          v-model:em-batch-service="emBatchService"
          v-model:em-batch-checked="emBatchChecked"
          :active-emergency-preset-id="activeEmergencyPresetId"
          :emergency-presets="emergencyPresets"
          :emergency-mode-summary="emergencyModeSummary"
          :emergency-brightness-track-style="emergencyBrightnessTrackStyle"
          :away-light-pool="awayLightPool"
          :light-entities-for-pool="lightEntitiesForPool"
          :all-domains="allDomains"
          :services-for-domain="servicesForDomain"
          :em-batch-entities="emBatchEntities"
          :apply-emergency-preset="applyEmergencyPreset"
          :toggle-emergency-light="toggleEmergencyLight"
          :import-away-light-pool="importAwayLightPool"
          :clear-emergency-light-pool="clearEmergencyLightPool"
          :add-emergency-action="addEmergencyAction"
          :toggle-em-check="toggleEmCheck"
          :apply-em-batch="applyEmBatch"
        />

        <SettingsSecurityModesModeCard
          v-for="mode in activeSmMode"
          :key="mode.key"
          embedded
          :mode-key="mode.key"
          :action-count="actionCount(mode)"
          :security-mode-presets="securityModePresets"
          :all-domains="allDomains"
          :mode-icon="modeIcon"
          :mode-icon-color="modeIconColor"
          :mode-bg="modeBg"
          :mode-accent="modeAccent"
          :services-for-domain="servicesForDomain"
          @apply-preset="applySecurityModePreset"
          @add-action="() => addSingleAction(mode)"
        />
      </div>
    </div>
  </SettingsPageShell>
</template>

<script setup>
import { ref, computed } from 'vue'
import SettingsPageShell from '@/components/common/page-shell/SettingsPageShell.vue'
import SettingsSecurityModesEmergencySection from '@/features/settings/automate/SettingsSecurityModesEmergencySection.vue'
import SettingsSecurityModesModeCard from '@/features/settings/automate/SettingsSecurityModesModeCard.vue'
import SettingsHubSubnav from '@/features/settings/shared/layout/SettingsHubSubnav.vue'
import { Download, Upload, Loader2, Shield, ListChecks, Save, Radio } from '@lucide/vue'
import { useSecurityModes } from '@/features/settings/composables/automate/security-modes-core.internals'
import SettingsOrchTabs from '@/features/settings/shared/layout/SettingsOrchTabs.vue'
import SettingsPendingSaveAction from '@/features/settings/shared/SettingsPendingSaveAction.vue'
import SettingsFlowBand from '@/features/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/features/settings/shared/layout/SettingsFlowStat.vue'
import { useSettingsHubRouteSection } from '@/features/settings/composables/hub-ui.internals'
import { useRegisterSettingsTabPending } from '@/features/settings/composables/pending.internals'

const props = defineProps({ activeTab: { type: String, default: 'security-modes' } })

const hubSection = ref('modes')
const importingModes = ref(false)

const hubSections = computed(() => [
  { id: 'modes', label: '场景联动', emoji: '🛡️' },
])

useSettingsHubRouteSection(hubSection, hubSections, {
  tabId: 'security-modes',
  activeTab: () => props.activeTab,
})

const {
  activeSmTab,
  activeSmMode,
  isEmergencyTab,
  activeEmergencyPresetId,
  emergencyPresets,
  awayLightPool,
  emergencyBrightnessTrackStyle,
  emergencyModeSummary,
  lightEntitiesForPool,
  applyEmergencyPreset,
  applySecurityModePreset,
  securityModePresets,
  toggleEmergencyLight,
  importAwayLightPool,
  clearEmergencyLightPool,
  allDomains,
  emShowBatch,
  emBatchDomain,
  emBatchService,
  emBatchChecked,
  emBatchEntities,
  toggleEmCheck,
  applyEmBatch,
  addEmergencyAction,
  orchTabs,
  modeIcon,
  modeIconColor,
  modeBg,
  modeAccent,
  servicesForDomain,
  exportModesJson,
  importModesJson,
  saveSecurityLayout,
  cancelSecurityChanges,
  pendingChanges,
} = useSecurityModes()

useRegisterSettingsTabPending('security-modes', () => pendingChanges.value > 0)

const activeModeLabel = computed(() => {
  const tab = orchTabs.value.find((t) => t.id === activeSmTab.value)
  return tab?.label || activeSmTab.value || '—'
})

const activeModeActionCount = computed(() => {
  if (isEmergencyTab.value) {
    const tab = orchTabs.value.find((t) => t.id === activeSmTab.value)
    return tab?.count || 0
  }
  const mode = activeSmMode.value?.[0]
  return mode?.actions?.length || 0
})

const securityModesFlowSummary = computed(() => {
  const pending = pendingChanges.value
  return `${activeModeLabel.value} · ${pending ? `${pending} 待保存` : '已同步'}`
})

const securityModesFlowSteps = computed(() => [
  {
    label: '选择场景',
    meta: activeModeLabel.value,
    icon: Shield,
    tone: 'in',
  },
  {
    label: '配置动作',
    meta: `${activeModeActionCount.value} 条联动`,
    icon: ListChecks,
    tone: 'sky',
  },
  {
    label: '保存配置',
    meta: pendingChanges.value ? `${pendingChanges.value} 待写` : '已同步',
    icon: Save,
    tone: 'mid',
  },
  {
    label: '切换生效',
    meta: '安防模式触发',
    icon: Radio,
    tone: 'out',
  },
])

function actionCount(mode) {
  return mode.actions?.length || 0
}

function addSingleAction(mode) {
  if (!mode.actions) mode.actions = []
  mode.actions.push({ entity_id: '', domain: '', service: '' })
}

async function onImportFile(e) {
  const file = e.target?.files?.[0]
  if (!file) return
  importingModes.value = true
  try {
    await importModesJson(file)
  } catch {
    // importModesJson 内部已弹出错误提示，此处静默处理
  } finally {
    importingModes.value = false
    e.target.value = ''
  }
}
</script>
<style src="./styles/security-modes.css"></style>
