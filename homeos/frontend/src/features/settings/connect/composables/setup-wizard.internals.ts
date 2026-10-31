/**
 * @file setup-wizard.internals.ts
 * @module frontend/src/views
 */
/** 首装向导面板 */
import { useEnvSensorMap } from '@/features/settings/shared/composables/env-sensor-map.internals'
import { formatLocaleDate } from '@/shared/utils/format/locale-format.util'
import { useSettingsHubRouteSection } from '@/features/settings/shared/composables/hub-ui.internals'
import { useSetupWizardEnvStep } from '@/features/settings/connect/composables/setup-wizard-env.internals'
import { useSetupWizard } from '@/features/settings/connect/composables/setup-wizard-core.internals'
import { computed, onMounted, ref } from 'vue'

// ── useSetupWizardPanel ──
const STEP_LABELS: Record<string, string> = {
  complete: '完成',
  connection: '连接 HA',
  energy: '主电表',
  environment: '环境传感器',
  security: '安防绑定',
}

const PRESENCE_MEMBER_TONES = ['cyan', 'violet', 'emerald', 'amber', 'rose']

export function useSetupWizardPanel(activeTab: () => string) {
  const envMap = useEnvSensorMap()
  const envStep = useSetupWizardEnvStep(envMap)
  const wizard = useSetupWizard(envMap, envStep)

  useSettingsHubRouteSection(ref(''), wizard.STEPS, {
    tabId: 'setup-wizard',
    activeTab,
    onApply: (sec: string) => {
      const idx = wizard.STEPS.value.findIndex((s: { id: string }) => s.id === sec)
      if (idx >= 0) wizard.goToStep(idx)
    },
  })

  const wizardSteps = computed(() =>
    wizard.STEPS.value.map((s) => ({
      ...s,
      label: STEP_LABELS[s.id] ?? s.label,
    })),
  )

  function formatDate(iso: string) {
    try {
      return formatLocaleDate(iso)
    } catch {
      return iso
    }
  }

  function memberInitial(name: string) {
    const s = String(name || '').trim()
    return s ? s.charAt(0).toUpperCase() : '?'
  }

  function memberTone(idx: number) {
    return PRESENCE_MEMBER_TONES[idx % PRESENCE_MEMBER_TONES.length]
  }

  onMounted(() => wizard.init())

  return {
    envMap,
    envStep,
    wizard,
    wizardSteps,
    formatDate,
    memberInitial,
    memberTone,
  }
}

export { useSetupWizardEnvStep } from '@/features/settings/connect/composables/setup-wizard-env.internals'
export { useSetupWizard } from '@/features/settings/connect/composables/setup-wizard-core.internals'
