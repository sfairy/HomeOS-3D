/**
 * @file security-modes-linkage.internals.ts
 * @module frontend/src/views
 */
/** composables：安防联动配置与展示 */
import type { Ref } from 'vue'
import { handleSystemConfigPatchError, patchSystemConfig, useSystemConfig } from '@/composables/config/system-config-core.internals'
import {
  getSecurityLinkageFlagRows,
  getSecurityLinkageParamRows,
  getSecurityLinkagePresets,
} from '@/shared/constants/security-linkage-presets'
import { useChromeStore } from '@/stores/chrome.store'
import { withBackendBootRetry } from '@/shared/utils/core/api-boot-retry.util'
import { isBackendUnreachableError } from '@/shared/utils/core/error-message'
import { logger } from '@/shared/utils/core/logger'
import { formatPresenceBadgeSummary } from '@/shared/presence/utils/display.util'
import { sanitizePresencePersonsForSave } from '@/shared/presence/utils/person.util'
import { SETTINGS_ROUTES } from '@/shared/utils/registry/settings-route.util'
import { Home, Lamp, Link2 } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'


// ── useSecurityLinkage ──
/** useSecurityLinkage：函数，按签名入参返回处理结果。 */
export function useSecurityLinkage() {
  const chrome = useChromeStore()
  const { load: loadSystemConfig } = useSystemConfig()
  const loading = ref(false)
  const loadError = ref<string>('')
  const security = ref<Record<string, boolean>>({
    linkAwaySimOnArmAway: false,
    linkHomeModeOnSecurityChange: true,
    autoArmOnEveryoneLeft: false,
    autoUpgradeToAwayOnEveryoneLeft: false,
    autoDisarmOnFirstHome: false,
  })

  const presets = computed(() => getSecurityLinkagePresets())
  const paramRows = computed(() => getSecurityLinkageParamRows())
  const flagRows = computed(() => getSecurityLinkageFlagRows())

  const enabledCount = computed(
    () => flagRows.value.filter((flagRow) => security.value[flagRow.key]).length,
  )

  let linkageLoaded = false

  function readSecurityFlags(data: { security?: Record<string, unknown> } | null | undefined) {
    const sec = data?.security || {}
    return {
      linkAwaySimOnArmAway: !!sec.linkAwaySimOnArmAway,
      linkHomeModeOnSecurityChange: !!sec.linkHomeModeOnSecurityChange,
      autoArmOnEveryoneLeft: !!sec.autoArmOnEveryoneLeft,
      autoUpgradeToAwayOnEveryoneLeft: !!sec.autoUpgradeToAwayOnEveryoneLeft,
      autoDisarmOnFirstHome: !!sec.autoDisarmOnFirstHome,
    }
  }

  async function refresh({
    bootRetry = false,
    silent = false,
  }: { bootRetry?: boolean; silent?: boolean } = {}) {
    const showLoading = !silent && !linkageLoaded
    if (showLoading) {
      loading.value = true
      loadError.value = ''
    }
    try {
      const fetchConfig = () => loadSystemConfig({ force: true })
      const data = bootRetry ? await withBackendBootRetry(fetchConfig) : await fetchConfig()
      security.value = readSecurityFlags(data)
      linkageLoaded = true
    } catch (error) {
      if (isBackendUnreachableError(error)) {
        logger.warn('刷新安防联动配置失败(后端不可用)', error)
        if (showLoading || !linkageLoaded) loadError.value = '后端暂不可用，联动配置加载失败'
      } else {
        logger.warn('刷新安防联动配置失败', error)
        if (showLoading || !linkageLoaded) loadError.value = '联动配置加载失败'
      }
    } finally {
      if (showLoading) loading.value = false
    }
  }

  async function setPresetEnabled(presetId: string, enabled: boolean) {
    const preset = presets.value.find((presetEntry) => presetEntry.id === presetId)
    if (!preset) return false
    try {
      const patch = enabled ? preset.config : preset.offConfig
      await patchSystemConfig({ security: patch })
      security.value = {
        ...security.value,
        [preset.configKey]: enabled,
      }
      chrome.notify(enabled ? preset.successMessage : preset.offMessage, 'success')
      return true
    } catch (error) {
      if (await handleSystemConfigPatchError(error, chrome)) {
        await refresh({ silent: true })
        return false
      }
      await refresh({ silent: true })
      chrome.notify('保存联动配置失败', 'error')
      return false
    }
  }

  async function enablePreset(presetId: string) {
    return setPresetEnabled(presetId, true)
  }

  async function togglePreset(presetId: string) {
    const preset = presets.value.find((presetEntry) => presetEntry.id === presetId)
    if (!preset) return false
    return setPresetEnabled(presetId, !security.value[preset.configKey])
  }

  async function toggleFlag(key: string) {
    if (!(key in security.value)) return false
    const next = !security.value[key]
    try {
      await patchSystemConfig({ security: { [key]: next } })
      security.value = { ...security.value, [key]: next }
      const label = flagRows.value.find((flagRow) => flagRow.key === key)?.label || key
      chrome.notify(next ? `已启用：${label}` : `已关闭：${label}`, 'success')
      return true
    } catch (error) {
      if (await handleSystemConfigPatchError(error, chrome)) {
        await refresh({ silent: true })
        return false
      }
      await refresh({ silent: true })
      chrome.notify('保存联动配置失败', 'error')
      return false
    }
  }

  /** 打开指定联动开关（已开启则 noop）；供对照表写入时确保反向联动生效 */
  async function ensureFlagOn(key: string) {
    if (!(key in security.value)) return false
    if (security.value[key]) return true
    try {
      await patchSystemConfig({ security: { [key]: true } })
      security.value = { ...security.value, [key]: true }
      const label = flagRows.value.find((flagRow) => flagRow.key === key)?.label || key
      chrome.notify(`已自动启用：${label}`, 'success')
      return true
    } catch (error) {
      if (await handleSystemConfigPatchError(error, chrome)) {
        await refresh({ silent: true })
        return false
      }
      await refresh({ silent: true })
      chrome.notify('启用联动失败', 'error')
      return false
    }
  }

  onMounted(() => refresh({ bootRetry: true }))

  return {
    loading,
    loadError,
    security,
    presets,
    paramRows,
    flagRows,
    enabledCount,
    enablePreset,
    togglePreset,
    toggleFlag,
    ensureFlagOn,
    refresh,
  }
}

// ── useSettingsSecurityModesLinkageDisplay ──
const PRESET_ICONS: Record<string, typeof Lamp> = { Lamp, Home }

/** useSettingsSecurityModesLinkageDisplay：函数，按签名入参返回处理结果。 */
export function useSettingsSecurityModesLinkageDisplay(opts: {
  presencePersons: Ref<unknown[]>
  autoMode: Ref<boolean>
  presencePreview: Ref<{ members?: unknown[]; atHomeCount?: number } | null | undefined>
}) {
  const { presencePersons, autoMode, presencePreview } = opts

  const configuredPersonCount = computed(
    () => sanitizePresencePersonsForSave(presencePersons.value).length,
  )

  const personStatCount = computed(() => {
    if (!autoMode.value) return configuredPersonCount.value
    return presencePreview.value?.members?.length ?? 0
  })

  const atHomeCount = computed(() => presencePreview.value?.atHomeCount ?? 0)

  const presenceModeLabel = computed(() =>
    autoMode.value ? '自动跟踪' : `${configuredPersonCount.value || personStatCount.value} 位人员`,
  )

  const presenceStatusLabel = computed(() => {
    const summary = formatPresenceBadgeSummary(presencePreview.value)
    return summary || '待配置'
  })

  function presetIcon(name: string) {
    return PRESET_ICONS[name] || Link2
  }

  function paramRoute(route: string) {
    if (route === 'params') return SETTINGS_ROUTES.params('security')
    return SETTINGS_ROUTES.securityModes('linkage')
  }

  return {
    configuredPersonCount,
    personStatCount,
    atHomeCount,
    presenceModeLabel,
    presenceStatusLabel,
    presetIcon,
    paramRoute,
  }
}


