/**
 * @file security-modes-core.internals.ts
 * @module frontend/src/views
 */
/** composables：安防模式 / 联动 / 展示逻辑 */
import type { Component } from 'vue'
import { applySecurityModesLayoutSlice, liveSecurityModesLayoutSlice, pickSecurityModesLayoutSlice } from '@/features/settings/composables/display/layout-dashboard.internals'
import { afterLayoutCancelSync, pauseGlobalPendingChanges, resumeGlobalPendingChanges, syncGlobalLayoutPendingSnapshot, useSettingsPendingChanges } from '@/features/settings/composables/pending.internals'
import { getEmergencyPresets, normalizeSecurityEmergency } from '@/constants/security-emergency'
import { getSecurityModePresets } from '@/constants/security-mode-presets'
import { useEntitiesStore } from '@/stores/entities.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import { downloadBlob } from '@/utils/core/misc.util'
import { domainIndexToArray, getEntityDisplayName } from '@/utils/entity/derived.util'
import { sliderTrackStyle } from '@/utils/ui/progress-bar.util'
import { securityModeTabEmoji } from '@/utils/settings/tab-emoji.util'
import { servicesForDomain } from '@/utils/registry/widget-catalog'
import { Home, Moon, Shield, ShieldOff } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'

// ── useSecurityModes ──
const EMERGENCY_TAB = 'emergency'

export function useSecurityModes() {
  const entitiesStore = useEntitiesStore()
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()

  const activeSmTab = ref('armed_away')
  const securityModesList = computed(() => layoutStore.layoutConfig.securityModes || [])
  const activeSmMode = computed(() =>
    securityModesList.value.filter((m) => m.key === activeSmTab.value),
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

  function ensureSecurityEmergency() {
    const lc = layoutStore.layoutConfig
    if (!lc.securityEmergency || typeof lc.securityEmergency !== 'object') {
      lc.securityEmergency = normalizeSecurityEmergency({})
      return lc.securityEmergency
    }
    const cfg = lc.securityEmergency
    if (!cfg.mode) {
      Object.assign(cfg, normalizeSecurityEmergency({ ...cfg }))
    }
    return cfg
  }

  const emergencyConfig = computed(() => ensureSecurityEmergency())

  const activeEmergencyPresetId = computed(() => ensureSecurityEmergency().mode || 'full_home')

  const awayLightPool = computed(() => layoutStore.layoutConfig.awaySimulationLightPool || [])

  const effectiveEmergencyLightPool = computed(() => {
    const own = emergencyConfig.value.lightPool || []
    if (own.length) return own
    return awayLightPool.value
  })

  const emergencyBrightnessTrackStyle = computed(() => {
    const v = Math.min(100, Math.max(20, Number(emergencyConfig.value.lightBrightnessPct) || 100))
    return sliderTrackStyle({
      value: v,
      min: 20,
      max: 100,
      variant: 'danger',
      trackColor: 'rgba(255,255,255,0.1)',
    })
  })

  const emergencyModeSummary = computed(() => {
    const cfg = emergencyConfig.value
    const preset = getEmergencyPresets().find((p) => p.id === cfg.mode)
    const parts = [preset?.name || cfg.mode]
    if (cfg.mode === 'key_areas') {
      parts.push(`灯池 ${effectiveEmergencyLightPool.value.length} 盏`)
    }
    if (cfg.mode !== 'notify_only' && cfg.mode !== 'custom') {
      parts.push(`亮度 ${cfg.lightBrightnessPct}%`)
    }
    if (cfg.autoArmAway) parts.push('自动布防')
    if (cfg.actions?.length) parts.push(`+${cfg.actions.length} 自定义`)
    return parts.join(' · ')
  })

  const lightEntitiesForPool = computed(() =>
    domainIndexToArray(entitiesStore.domainEntityIndex.get('light'))
      .sort()
      .map((eid) => {
        const ent = entitiesStore.entities[eid]
        return {
          eid,
          name: getEntityDisplayName(eid, ent),
        }
      }),
  )

  const emShowBatch = ref(false)
  const emBatchDomain = ref<string>('')
  const emBatchService = ref<string>('')
  const emBatchChecked = ref<string[]>([])

  const allDomains = computed(() => [...entitiesStore.domains].sort())

  function emBatchEntities() {
    const d = emBatchDomain.value
    if (!d) return []
    return domainIndexToArray(entitiesStore.domainEntityIndex.get(d))
      .sort()
      .map((eid) => {
        const ent = entitiesStore.entities[eid]
        const name = getEntityDisplayName(eid, ent)
        return { eid, name }
      })
  }

  function toggleEmCheck(eid: string) {
    const arr = emBatchChecked.value
    const idx = arr.indexOf(eid)
    if (idx >= 0) arr.splice(idx, 1)
    else arr.push(eid)
  }

  function applyEmBatch() {
    if (!emBatchDomain.value || !emBatchService.value) {
      chrome.notify('请先选择域与服务', 'warning')
      return
    }
    if (!emBatchChecked.value.length) {
      chrome.notify('请至少勾选一个实体', 'warning')
      return
    }
    const cfg = emergencyConfig.value
    if (!cfg.actions) cfg.actions = []
    for (const eid of emBatchChecked.value) {
      cfg.actions.push({
        entity_id: eid,
        domain: emBatchDomain.value,
        service: emBatchService.value,
      })
    }
    emBatchChecked.value = []
    emShowBatch.value = false
  }

  function applyEmergencyPreset(presetId: string) {
    const preset = getEmergencyPresets().find((p) => p.id === presetId)
    if (!preset) return
    const cfg = ensureSecurityEmergency()
    Object.assign(cfg, preset.apply, { mode: presetId })
    if (presetId === 'notify_only') {
      cfg.actions = []
      cfg.appendBuiltin = false
    }
    chrome.notify(`已切换为「${preset.name}」`, 'success')
  }

  function applySecurityModePreset(modeKey: string) {
    const preset = getSecurityModePresets()[modeKey]
    if (!preset) return
    const midx = securityModesList.value.findIndex((m) => m.key === modeKey)
    if (midx < 0) return
    const mode = layoutStore.layoutConfig.securityModes[midx]
    mode.actions = preset.actions.map((a: { entity_id?: string; domain?: string; service?: string; service_data?: Record<string, unknown> }) => ({
      ...a,
      service_data: a.service_data ? { ...a.service_data } : undefined,
    }))
    chrome.notify(
      `已应用「${preset.name}」预设（${mode.actions.length} 条动作，请映射实体后保存布局）`,
      'success',
    )
  }

  const securityModeLinks = computed(() => {
    const lc = layoutStore.layoutConfig
    if (!lc.securityModeLinks || typeof lc.securityModeLinks !== 'object') {
      lc.securityModeLinks = { armed_away: '', armed_home: '', armed_night: '', disarmed: '' }
    }
    return lc.securityModeLinks
  })

  function toggleEmergencyLight(eid: string) {
    const pool = emergencyConfig.value.lightPool || (emergencyConfig.value.lightPool = [])
    const idx = pool.indexOf(eid)
    if (idx >= 0) pool.splice(idx, 1)
    else pool.push(eid)
  }

  function importAwayLightPool() {
    const src = awayLightPool.value
    if (!src.length) {
      chrome.notify('离家模拟灯池为空，请先在浮动组件 或集成绑定中配置', 'warning')
      return
    }
    emergencyConfig.value.lightPool = [...src]
    chrome.notify(`已导入 ${src.length} 盏灯到紧急灯池`, 'success')
  }

  function clearEmergencyLightPool() {
    emergencyConfig.value.lightPool = []
  }

  function addEmergencyAction() {
    const cfg = emergencyConfig.value
    if (!cfg.actions) cfg.actions = []
    cfg.actions.push({ entity_id: '', domain: '', service: '' })
  }

  function emergencyActionCount() {
    return emergencyConfig.value.actions?.length || 0
  }

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
      modes: securityModesList.value.map((m) => ({
        key: m.key,
        name: m.name,
        icon: m.icon,
        actions: (m.actions || []).map((a) => ({
          entity_id: a.entity_id || '',
          domain: a.domain || '',
          service: a.service || '',
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
        actions: (cfg.actions || []).map((a) => ({
          entity_id: a.entity_id || '',
          domain: a.domain || '',
          service: a.service || '',
          service_data: a.service_data || undefined,
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
            const idx = modes.findIndex((m) => m.key === item.key)
            if (idx < 0) continue
            if (item.name) modes[idx].name = item.name
            if (item.icon) modes[idx].icon = item.icon
            if (Array.isArray(item.actions)) {
              modes[idx].actions = item.actions.map(
                (a: {
                  entity_id?: string
                  domain?: string
                  service?: string
                  service_data?: Record<string, unknown>
                }) => ({
                entity_id: a.entity_id || '',
                domain: a.domain || '',
                service: a.service || '',
                service_data: a.service_data || undefined,
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
        } catch (e) {
          chrome.notify('导入失败：JSON 格式无效', 'error')
          reject(e)
        }
      }
      reader.onerror = reject
      reader.readAsText(file)
    })
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

// ── useSecurityLinkage ──


