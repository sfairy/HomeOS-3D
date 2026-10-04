<!--
组件：SetupWizardPanel.vue
所属模块：frontend / src / views / settings / connect
职责：入门向导面板根容器。按流程编排连接 HA / 安防 / 能源 / 环境 / 户型 / 完成六步，
      通过 useSetupWizardPanel 管理步骤状态、进度与各步表单，并向环境步骤 provide 上下文。
关键依赖：
  - useSetupWizardPanel：向导核心状态与回调
  - SETUP_WIZARD_ENV_STEP_KEY：环境步骤 provide/inject 键
  - setup-wizard 子组件：Progress / StepHero / 各步骤 / Navigation
  - SettingsFlowBand / SettingsFlowStat：流程概览
数据来源：useSetupWizardPanel 内部状态 + 父级透传 activeTab
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="setup-wizard"
    icon-key="zap"
    accent="var(--module-accent-automation)"
    layout="single"
    page-class="setup-wizard-hub"
    body-class="setup-wizard-hub__body"
  >
    <template #actions>
      <button type="button" class="sw-refresh-btn" :disabled="loading" @click="refreshStatus">
        {{ loading ? '刷新中…' : '刷新状态' }}
      </button>
    </template>

    <div class="sw-workspace">
      <SettingsFlowBand
        :steps="wizardFlowSteps"
        class="sw-flow-band"
        band-class="sw-flow-band__shell"
        collapsible
        default-collapsed
        toggle-label="流程概览"
        :collapsed-summary="wizardFlowSummary"
      >
        <template #stats>
          <SettingsFlowStat
            :label="'进度'"
            :value="`${progress}%`"
            tone="accent"
            val-tone="accent"
          />
          <SettingsFlowStat
            :label="'当前步骤'"
            :value="stepMeta?.label || '—'"
            tone="sky"
            val-tone="sky"
          />
        </template>
      </SettingsFlowBand>

      <SetupWizardProgress
        :progress="progress"
        :learning-started-at="learningStartedAt"
        :learning-days="learningDays"
        :wizard-steps="wizardSteps"
        :current-step="currentStep"
        :status="status"
        :format-date="formatDate"
        @go-to-step="goToStep"
      />

      <SetupWizardStepHero :step-id="stepMeta.id" />

      <div :class="['sw-content', `sw-content--${stepTone}`]">
        <Transition name="sw-step" mode="out-in">
          <div :key="stepMeta.id" class="sw-content__inner">
            <SetupWizardConnectionStep v-if="stepMeta.id === 'connection'" :status="status" />

            <SetupWizardSecurityStep
              v-else-if="stepMeta.id === 'security'"
              v-model:doorbell-list="doorbellList"
              v-model:motion-entity-id="motionEntityId"
              :add-doorbell="addDoorbell"
              :remove-doorbell="removeDoorbell"
              :reduce-sensitivity="reduceSensitivity"
              :presence-members="presenceMembers"
              :presence-loading="presenceLoading"
              :presence-loaded="presenceLoaded"
              :presence-auto-mode="presenceAutoMode"
              :presence-summary="presenceSummary"
              :presence-at-home-count="presenceAtHomeCount"
              :auto-arm-enabled="autoArmEnabled"
              :auto-upgrade-enabled="autoUpgradeEnabled"
              :presence-flag-saving="presenceFlagSaving"
              :load-presence="loadPresence"
              :toggle-auto-arm="toggleAutoArm"
              :toggle-auto-upgrade="toggleAutoUpgrade"
              :member-initial="memberInitial"
              :member-tone="memberTone"
            />

            <SetupWizardEnergyStep
              v-else-if="stepMeta.id === 'energy'"
              v-model:meter-entity-id="meterEntityId"
              v-model:circuit-entity-ids="circuitEntityIds"
              :status="status"
              :validate-result="validateResult"
            />

            <SetupWizardEnvironmentStep
              v-else-if="stepMeta.id === 'environment'"
              :status="status"
              :infer-env-map="inferEnvMap"
            />

            <SetupWizardDashboardStep
              v-else-if="stepMeta.id === 'dashboard'"
              :status="status"
            />

            <SetupWizardCompleteStep
              v-else
              :wizard-steps="wizardSteps"
              :status="status"
              :learning-days="learningDays"
            />
          </div>
        </Transition>
      </div>

      <SetupWizardNavigation
        :current-step="currentStep"
        :saving="saving"
        :step-id="stepMeta.id"
        :hint="message"
        :hint-ok="messageOk"
        @prev="prevStep"
        @next="nextStep"
      />
    </div>
  </SettingsPageShell>
</template>

<script setup>
import { provide, computed } from 'vue'
import {
  PlugZap,
  Shield,
  Zap,
  Thermometer,
  LayoutTemplate,
  CheckCircle,
} from '@lucide/vue'
import SettingsPageShell from '@/components/common/page-shell/SettingsPageShell.vue'
import SettingsFlowBand from '@/views/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/views/settings/shared/layout/SettingsFlowStat.vue'
import SetupWizardProgress from '@/views/settings/connect/setup-wizard/SetupWizardProgress.vue'
import SetupWizardStepHero from '@/views/settings/connect/setup-wizard/SetupWizardStepHero.vue'
import SetupWizardConnectionStep from '@/views/settings/connect/setup-wizard/SetupWizardConnectionStep.vue'
import SetupWizardSecurityStep from '@/views/settings/connect/setup-wizard/SetupWizardSecurityStep.vue'
import SetupWizardEnergyStep from '@/views/settings/connect/setup-wizard/SetupWizardEnergyStep.vue'
import SetupWizardEnvironmentStep from '@/views/settings/connect/setup-wizard/SetupWizardEnvironmentStep.vue'
import SetupWizardDashboardStep from '@/views/settings/connect/setup-wizard/SetupWizardDashboardStep.vue'
import SetupWizardCompleteStep from '@/views/settings/connect/setup-wizard/SetupWizardCompleteStep.vue'
import SetupWizardNavigation from '@/views/settings/connect/setup-wizard/SetupWizardNavigation.vue'
import { SETUP_WIZARD_ENV_STEP_KEY } from '@/views/settings/connect/setup-wizard/context'
import { useSetupWizardPanel } from '@/composables/settings/connect/setup-wizard.internals'

// 入参：当前激活的设置 Tab
const props = defineProps({
  activeTab: { type: String, default: 'setup-wizard' },
})

// 向导核心：环境步骤上下文、向导实例、步骤列表、日期格式化与成员展示
const { envStep, wizard, wizardSteps, formatDate, memberInitial, memberTone } = useSetupWizardPanel(
  () => props.activeTab,
)

// 向环境步骤子组件 provide 上下文
provide(SETUP_WIZARD_ENV_STEP_KEY, envStep)

// 从向导实例解构步骤状态、进度、各步表单与回调
const {
  currentStep,
  stepMeta,
  progress,
  loading,
  saving,
  status,
  validateResult,
  message,
  messageOk,
  meterEntityId,
  circuitEntityIds,
  motionEntityId,
  doorbellList,
  learningDays,
  learningStartedAt,
  refreshStatus,
  nextStep,
  prevStep,
  goToStep,
  reduceSensitivity,
  addDoorbell,
  removeDoorbell,
  inferEnvMap,
  presenceMembers,
  presenceLoading,
  presenceLoaded,
  presenceAutoMode,
  presenceSummary,
  presenceAtHomeCount,
  autoArmEnabled,
  autoUpgradeEnabled,
  presenceFlagSaving,
  loadPresence,
  toggleAutoArm,
  toggleAutoUpgrade,
} = wizard

// 步骤 id 到主题色调的映射，用于内容区配色
const STEP_TONES = {
  connection: 'sky',
  security: 'rose',
  energy: 'amber',
  environment: 'teal',
  dashboard: 'sky',
  complete: 'emerald',
}

// 当前步骤的主题色调（用于内容区配色）
const stepTone = computed(() => STEP_TONES[stepMeta.value?.id] || 'emerald')

// 流程概览折叠态摘要文案
const wizardFlowSummary = computed(
  () => `${progress.value}% · ${stepMeta.value?.label || '—'}`,
)

// 流程概览步骤定义：连接 HA / 安防基础 / 能源计量 / 环境映射 / 户型收藏 / 完成
const wizardFlowSteps = computed(() => {
  const steps = status.value?.steps || {}
  return [
    {
      label: '连接 HA',
      meta: steps.connection?.done ? '已完成' : '进行中',
      icon: PlugZap,
      tone: steps.connection?.done ? 'emerald' : 'in',
    },
    {
      label: '安防基础',
      meta: `${presenceAtHomeCount.value || 0} 人在场`,
      icon: Shield,
      tone: steps.security?.done ? 'emerald' : 'sky',
    },
    {
      label: '能源计量',
      meta: meterEntityId.value ? '已绑定' : '待配置',
      icon: Zap,
      tone: steps.energy?.done ? 'emerald' : 'amber',
    },
    {
      label: '环境映射',
      meta: '房间/传感器',
      icon: Thermometer,
      tone: steps.environment?.done ? 'emerald' : 'mid',
    },
    {
      label: '户型收藏',
      meta: steps.dashboard?.done ? '已就绪' : '可选',
      icon: LayoutTemplate,
      tone: steps.dashboard?.done ? 'emerald' : 'sky',
    },
    {
      label: '完成',
      meta: `${progress.value}% · ${learningDays.value}天`,
      icon: CheckCircle,
      tone: steps.complete?.done ? 'out' : 'secondary',
    },
  ]
})
</script>

<style scoped src="./styles/SetupWizardPanel.css"></style>
