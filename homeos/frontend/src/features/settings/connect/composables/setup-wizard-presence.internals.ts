/**
 * @file setup-wizard-presence.internals.ts
 * @module frontend/src/views
 */
/** 首装向导：在场 / 安防联动开关 */
import {
  handleSystemConfigPatchError,
  useSystemConfig,
} from '@/composables/config/system-config-core.internals'
import { loadPresenceHome } from '@/shared/presence/composables/load-presence-home'
import { useChromeStore } from '@/stores/chrome.store'
import type { PresenceHomeResponse, PresenceMember } from '@/shared/types/setup-wizard'
import { logger } from '@/shared/utils/core/logger'
import { formatPresenceDetailSummary } from '@/shared/presence/utils/display.util'
import { computed, ref, watch, type Ref } from 'vue'

export function useSetupWizardPresence(opts: {
  stepMeta: Ref<{ id: string }>
  notify: (text: string, ok?: boolean) => void
}) {
  const { stepMeta, notify } = opts
  const chrome = useChromeStore()
  const { load: loadSystemConfig, save: saveSystemConfig } = useSystemConfig()

  const presenceHome = ref<PresenceHomeResponse | null>(null)
  const presenceLoading = ref(false)
  const presenceLoaded = ref(false)
  const autoArmEnabled = ref(false)
  const autoUpgradeEnabled = ref(false)
  const presenceFlagSaving = ref(false)

  const presenceMembers = computed((): PresenceMember[] => {
    const list = presenceHome.value?.members
    return Array.isArray(list) ? list : []
  })

  const presenceAutoMode = computed(() => presenceHome.value?.autoMode !== false)

  const presenceSummary = computed(() =>
    formatPresenceDetailSummary(presenceMembers.value, {
      loading: presenceLoading.value,
      autoMode: presenceAutoMode.value,
      personCount: presenceHome.value?.persons?.length ?? 0,
    }),
  )

  const presenceAtHomeCount = computed(() => presenceMembers.value.filter((m) => m.atHome).length)

  function applyPresenceSecurityFlags(cfg: { security?: Record<string, unknown> } | null) {
    const sec = cfg?.security || {}
    autoArmEnabled.value = Boolean(sec.autoArmOnEveryoneLeft)
    autoUpgradeEnabled.value = Boolean(sec.autoUpgradeToAwayOnEveryoneLeft)
  }

  async function loadPresence() {
    presenceLoading.value = true
    try {
      const [presence, cfg] = await Promise.all([
        loadPresenceHome(),
        loadSystemConfig().catch(() => null),
      ])
      presenceHome.value = (presence as PresenceHomeResponse | null) ?? null
      if (!presence) {
        notify('加载在家状态失败', false)
      }
      applyPresenceSecurityFlags(cfg)
    } catch (e) {
      logger.error('加载人员 presence 失败', e)
      presenceHome.value = null
      notify('加载在家状态失败', false)
    } finally {
      presenceLoading.value = false
      presenceLoaded.value = true
    }
  }

  async function setPresenceSecurityFlag(
    key: 'autoArmOnEveryoneLeft' | 'autoUpgradeToAwayOnEveryoneLeft',
    next: boolean,
  ) {
    if (presenceFlagSaving.value) return false
    const prevArm = autoArmEnabled.value
    const prevUpgrade = autoUpgradeEnabled.value
    if (key === 'autoArmOnEveryoneLeft') autoArmEnabled.value = next
    else autoUpgradeEnabled.value = next
    presenceFlagSaving.value = true
    try {
      await saveSystemConfig({ security: { [key]: next } })
      const label =
        key === 'autoArmOnEveryoneLeft' ? '全员离家自动布防' : '居家/夜间升级为离家布防'
      notify(next ? `已开启：${label}` : `已关闭：${label}`)
      return true
    } catch (e) {
      autoArmEnabled.value = prevArm
      autoUpgradeEnabled.value = prevUpgrade
      logger.error('保存 Presence 安防开关失败', e)
      if (await handleSystemConfigPatchError(e, chrome)) {
        notify('配置已被其他终端修改，已重新加载', false)
        return false
      }
      notify('保存失败，请稍后重试', false)
      return false
    } finally {
      presenceFlagSaving.value = false
    }
  }

  async function toggleAutoArm() {
    return setPresenceSecurityFlag('autoArmOnEveryoneLeft', !autoArmEnabled.value)
  }

  async function toggleAutoUpgrade() {
    return setPresenceSecurityFlag(
      'autoUpgradeToAwayOnEveryoneLeft',
      !autoUpgradeEnabled.value,
    )
  }

  watch(stepMeta, (meta) => {
    if (meta.id === 'security') void loadPresence()
  })

  return {
    presenceHome,
    presenceLoading,
    presenceLoaded,
    autoArmEnabled,
    autoUpgradeEnabled,
    presenceFlagSaving,
    presenceMembers,
    presenceAutoMode,
    presenceSummary,
    presenceAtHomeCount,
    loadPresence,
    toggleAutoArm,
    toggleAutoUpgrade,
  }
}
