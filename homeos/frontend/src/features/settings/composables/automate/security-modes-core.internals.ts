/**
 * @file security-modes-core.internals.ts
 * @module frontend/src/views
 */
/** composables：安防模式核心逻辑 */
import type { Component } from 'vue'
import { applySecurityModesLayoutSlice, liveSecurityModesLayoutSlice, pickSecurityModesLayoutSlice } from '@/features/settings/composables/display/layout-dashboard.internals'
import { afterLayoutCancelSync, pauseGlobalPendingChanges, resumeGlobalPendingChanges, syncGlobalLayoutPendingSnapshot, useSettingsPendingChanges } from '@/composables/settings-kernel/pending.internals'
import { getEmergencyPresets, normalizeSecurityEmergency } from '@/shared/constants/security-emergency'
import { getSecurityModePresets } from '@/shared/constants/security-mode-presets'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import { downloadBlob } from '@/shared/utils/core/misc.util'
import { securityModeTabEmoji } from '@/shared/utils/settings/tab-emoji.util'
import { servicesForDomain } from '@/shared/utils/registry/widget-catalog'
import { Home, Moon, Shield, ShieldOff } from '@lucide/vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useSecurityModesEmergency } from '@/features/settings/composables/automate/security-modes-emergency.internals'


// ── useSecurityModes ──
const EMERGENCY_TAB = 'emergency'

export function useSecurityModes() {
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()

  const activeSmTab = ref('armed_away')
  const securityModesList = computed(() => layoutStore.layoutConfig.securityModes || [])
  const activeSmMode = computed(() =>
    securityModesList.value.filter((modeEntry) => modeEntry.key === activeSmTab.value),
  )
  const isEmergencyTab = computed(() => activeSmTab.value === EMERGENCY_TAB)

  // --- 脏检测：统一接入 useSettingsPendingChanges ---
  const initialSecurityConfig = ref(null)
  const {
    pendingCount: pendingChanges,
    takeSnapshot: takeSecuritySnapshot,
    confirmAndRevert,
  } = useSettingsPendingChanges({
    snapshot: initialSecurityConfig,
    current: () => liveSecurityModesLayoutSlice(layoutStore.layoutConfig),
    ready: () => layoutStore.isConfigLoaded,
  })

  function snapshotSecurityConfig() {
    takeSecuritySnapshot(pickSecurityModesLayoutSlice(layoutStore.layoutConfig))
  }

  const emergency = useSecurityModesEmergency()
  const {
    emergencyConfig,
    activeEmergencyPresetId,
    awayLightPool,
    effectiveEmergencyLightPool,
    emergencyBrightnessTrackStyle,
    emergencyModeSummary,
    lightEntitiesForPool,
    emShowBatch,
    emBatchDomain,
    emBatchService,
    emBatchChecked,
    emBatchEntities,
    toggleEmCheck,
    applyEmBatch,
    applyEmergencyPreset,
    toggleEmergencyLight,
    importAwayLightPool,
    clearEmergencyLightPool,
    addEmergencyAction,
    emergencyActionCount,
    allDomains,
    ensureSecurityEmergency,
  } = emergency

  async function applySecurityModePreset(modeKey: string) {
    const preset = getSecurityModePresets()[modeKey]
    if (!preset) return
    const midx = securityModesList.value.findIndex((modeEntry) => modeEntry.key === modeKey)
    if (midx < 0) return
    const mode = layoutStore.layoutConfig.securityModes[midx]
    const existing = mode.actions?.length || 0
    // 预设当前刻意是空的（设备情景交给家庭模式）：直接应用会把用户已配的动作清空。
    if (existing > 0) {
      const ok = await chrome.confirm(
        preset.actions.length
          ? `应用「${preset.name}」会覆盖当前 ${existing} 条动作，继续？`
          : `「${preset.name}」预设不包含动作，应用后会清空当前 ${existing} 条动作，继续？`,
        '应用预设',
        { type: 'danger', confirmText: '覆盖并应用' },
      )
      if (!ok) return
    }
    mode.actions = preset.actions.map((action: { entity_id?: string; domain?: string; service?: string; service_data?: Record<string, unknown> }) => ({
      ...action,
      service_data: action.service_data ? { ...action.service_data } : undefined,
    }))
    chrome.notify(
      `已应用「${preset.name}」预设（${mode.actions.length} 条动作，请映射实体后保存布局）`,
      'success',
    )
  }

  const securityModeLinks = computed(() => {
    const layoutConfig = layoutStore.layoutConfig
    if (!layoutConfig.securityModeLinks || typeof layoutConfig.securityModeLinks !== 'object') {
      layoutConfig.securityModeLinks = { armed_away: '', armed_home: '', armed_night: '', disarmed: '' }
    }
    return layoutConfig.securityModeLinks
  })

  function modeIcon(key: string) {
    const map: Record<string, Component> = {
      armed_away: Shield,
      armed_home: Home,
      armed_night: Moon,
      disarmed: ShieldOff,
    }
    return map[key] || Shield
  }

  function modeIconColor(key: string) {
    const map: Record<string, string> = {
      armed_away: 'text-red-400',
      armed_home: 'text-amber-400',
      armed_night: 'text-violet-400',
      disarmed: 'text-emerald-400',
    }
    return map[key] || 'text-gray-400'
  }

  function modeBg(key: string) {
    const map: Record<string, string> = {
      armed_away: 'bg-red-500/10',
      armed_home: 'bg-amber-500/10',
      armed_night: 'bg-violet-500/10',
      disarmed: 'bg-emerald-500/10',
    }
    return map[key] || 'bg-gray-500/10'
  }

  const modeAccent = (key: string) =>
    (
      ({
        armed_away: '#f87171',
        armed_home: '#fbbf24',
        armed_night: '#a78bfa',
        disarmed: '#34d399',
      }) as Record<string, string>
    )[key] || '#94a3b8'

  const orchTabs = computed(() => {
    const modeTabs = securityModesList.value.map((mode) => ({
      id: mode.key,
      label: mode.name,
      emoji: securityModeTabEmoji(mode.key),
      count: mode.actions?.length || 0,
      accent: modeAccent(mode.key),
    }))
    return [
      ...modeTabs,
      {
        id: EMERGENCY_TAB,
        label: '紧急求助',
        emoji: securityModeTabEmoji('emergency'),
        count: emergencyActionCount(),
        accent: '#ef4444',
      },
    ]
  })

  function exportModesJson() {
    const cfg = emergencyConfig.value
    const payload: Record<string, unknown> = {
      version: 3,
      exportedAt: new Date().toISOString(),
      modes: securityModesList.value.map((modeEntry) => ({
        key: modeEntry.key,
        name: modeEntry.name,
        icon: modeEntry.icon,
        actions: (modeEntry.actions || []).map((action) => ({
          entity_id: action.entity_id || '',
          domain: action.domain || '',
          service: action.service || '',
          service_data: action.service_data || undefined,
        })),
      })),
      emergency: {
        mode: cfg.mode,
        appendBuiltin: !!cfg.appendBuiltin,
        appendMode: cfg.appendMode || 'full_home',
        lightBrightnessPct: cfg.lightBrightnessPct,
        lightPool: [...(cfg.lightPool || [])],
        autoArmAway: !!cfg.autoArmAway,
        useBuiltinFallback: cfg.useBuiltinFallback !== false,
        actions: (cfg.actions || []).map((action) => ({
          entity_id: action.entity_id || '',
          domain: action.domain || '',
          service: action.service || '',
          service_data: action.service_data || undefined,
        })),
      },
      securityModeLinks: { ...securityModeLinks.value },
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    downloadBlob(blob, `homeos-security-modes-${Date.now()}.json`)
    chrome.notify('安防场景已导出', 'success')
  }

  function importModesJson(file: File) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = async () => {
        try {
          const data = JSON.parse(String(reader.result ?? ''))
          const incoming = Array.isArray(data?.modes)
            ? data.modes
            : Array.isArray(data)
              ? data
              : null
          if (!incoming?.length) throw new Error('无效格式')
          const modes = layoutStore.layoutConfig.securityModes || []
          let merged = 0
          for (const item of incoming) {
            if (!item?.key) continue
            const idx = modes.findIndex((modeEntry) => modeEntry.key === item.key)
            if (idx < 0) continue
            if (item.name) modes[idx].name = item.name
            if (item.icon) modes[idx].icon = item.icon
            if (Array.isArray(item.actions)) {
              modes[idx].actions = item.actions.map(
                (action: {
                  entity_id?: string
                  domain?: string
                  service?: string
                  service_data?: Record<string, unknown>
                }) => ({
                entity_id: action.entity_id || '',
                domain: action.domain || '',
                service: action.service || '',
                service_data: action.service_data || undefined,
              }),
              )
              merged++
            }
          }
          if (data.emergency && typeof data.emergency === 'object') {
            Object.assign(
              emergencyConfig.value,
              normalizeSecurityEmergency({
                ...emergencyConfig.value,
                ...data.emergency,
              }),
            )
          }
          if (data.securityModeLinks && typeof data.securityModeLinks === 'object') {
            Object.assign(securityModeLinks.value, data.securityModeLinks)
          }
          const saved = await layoutStore.saveLayout()
          if (!saved) {
            resolve(merged)
            return
          } // saveConfig 已弹出失败提示
          snapshotSecurityConfig()
          syncGlobalLayoutPendingSnapshot(layoutStore.layoutConfig)
          chrome.notify(
            merged ? `已导入 ${merged} 个安防场景` : '未找到可合并的场景 key',
            merged ? 'success' : 'info',
          )
          resolve(merged)
        } catch (error) {
          chrome.notify('导入失败：JSON 格式无效', 'error')
          reject(error)
        }
      }
      reader.onerror = reject
      reader.readAsText(file)
    })
  }

  /**
   * 保存前清洗动作：统计缺实体/缺服务的条目并合并完全重复的动作。
   * 返回 invalid>0 时调用方必须中止保存（后端会静默跳过这些动作）。
   */
  function sanitizeActionsForSave(): { invalid: number; duplicates: number } {
    let invalid = 0
    let duplicates = 0
    const sanitize = <T extends { entity_id?: string; domain?: string; service?: string }>(
      actions: T[] | undefined,
    ): T[] => {
      const seen = new Set<string>()
      const kept: T[] = []
      for (const action of actions || []) {
        const entityId = String(action?.entity_id || '').trim()
        const service = String(action?.service || '').trim()
        const domain = String(action?.domain || '').trim()
        if (!entityId || !service) {
          invalid++
          kept.push(action)
          continue
        }
        const key = `${domain}|${service}|${entityId}`
        if (seen.has(key)) {
          duplicates++
          continue
        }
        seen.add(key)
        kept.push({ ...action, entity_id: entityId, service, domain })
      }
      return kept
    }
    for (const mode of securityModesList.value) {
      mode.actions = sanitize(mode.actions)
    }
    if (emergencyConfig.value.actions) {
      emergencyConfig.value.actions = sanitize(emergencyConfig.value.actions)
    }
    return { invalid, duplicates }
  }

  async function cancelSecurityChanges() {
    await confirmAndRevert(
      chrome,
      (baseline) => {
        applySecurityModesLayoutSlice(
          layoutStore.layoutConfig,
          baseline as ReturnType<typeof pickSecurityModesLayoutSlice>,
        )
      },
      { onReverted: () => afterLayoutCancelSync(layoutStore.layoutConfig) },
    )
  }

  async function saveSecurityLayout() {
    const { invalid, duplicates } = sanitizeActionsForSave()
    if (invalid > 0) {
      // 空实体/空服务的动作在后端会被静默跳过：保存了等于「看起来配了、实际不会执行」。
      chrome.notify(`有 ${invalid} 条动作缺少实体或服务，已阻止保存，请补全后再试`, 'error')
      return
    }
    if (duplicates > 0) {
      chrome.notify(`已自动合并 ${duplicates} 条重复动作`, 'info')
    }
    const ok = await layoutStore.saveLayout()
    if (!ok) return // saveConfig 已弹出失败提示
    snapshotSecurityConfig()
    syncGlobalLayoutPendingSnapshot(layoutStore.layoutConfig)
    chrome.notify('安防场景已保存', 'success')
  }

  // 初始化：在 pause 期间预写 ensureSecurityEmergency / securityModeLinks 默认结构，
  // 再 sync 快照，避免 computed 首次求值时产生的默认值写入被误判为脏。
  onMounted(() => {
    pauseGlobalPendingChanges()
    ensureSecurityEmergency()
    // 触发 securityModeLinks computed 以写入默认结构（与原逻辑一致）
    void securityModeLinks.value
    syncGlobalLayoutPendingSnapshot(layoutStore.layoutConfig)
    snapshotSecurityConfig()
    resumeGlobalPendingChanges()
  })

  // 配置未加载完成时拍的基线可能是空结构：加载完成后重拍一次，
  // 否则整页会被误判为「已修改」，保存按钮常亮且取消会写回空配置。
  watch(
    () => layoutStore.isConfigLoaded,
    (loaded) => {
      if (!loaded) return
      syncGlobalLayoutPendingSnapshot(layoutStore.layoutConfig)
      snapshotSecurityConfig()
    },
  )

  return {
    activeSmTab,
    securityModesList,
    activeSmMode,
    isEmergencyTab,
    emergencyConfig,
    activeEmergencyPresetId,
    emergencyPresets: computed(() => getEmergencyPresets()),
    awayLightPool,
    effectiveEmergencyLightPool,
    emergencyBrightnessTrackStyle,
    emergencyModeSummary,
    lightEntitiesForPool,
    applyEmergencyPreset,
    applySecurityModePreset,
    securityModePresets: computed(() => getSecurityModePresets()),
    securityModeLinks,
    toggleEmergencyLight,
    importAwayLightPool,
    clearEmergencyLightPool,
    emShowBatch,
    emBatchDomain,
    emBatchService,
    emBatchChecked,
    emBatchEntities,
    toggleEmCheck,
    applyEmBatch,
    addEmergencyAction,
    emergencyActionCount,
    allDomains,
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
    snapshotSecurityConfig,
  }
}


export { useSecurityLinkage, useSettingsSecurityModesLinkageDisplay } from '@/features/settings/composables/automate/security-modes-linkage.internals'
