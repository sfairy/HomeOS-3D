import { type Component, computed, onMounted, ref, watch, type Ref } from 'vue'
import {
  applySecurityModesLayoutSlice,
  liveSecurityModesLayoutSlice,
  pickSecurityModesLayoutSlice,
} from '@/features/settings/groups/appearance/use-layout'
import {
  afterLayoutCancelSync,
  pauseGlobalPendingChanges,
  resumeGlobalPendingChanges,
  syncGlobalLayoutPendingSnapshot,
  useSettingsPendingChanges,
} from '@/features/settings/kernel/pending.internals'
import { getEmergencyPresets, normalizeSecurityEmergency } from '@/domain/layout/constants/security-emergency'
import {
  getSecurityModePresets,
  getSecurityLinkageFlagRows,
  getSecurityLinkageParamRows,
  getSecurityLinkagePresets,
} from '@/kernel/index'
import { useChromeStore } from '@/kernel/ui/chrome/chrome-store'
import { useLayoutStore } from '@/domain/layout/store/layout.store'
import { downloadBlob } from '@/kernel/core/misc'
import { securityModeTabEmoji } from '@/kernel/settings'
import { servicesForDomain } from '@/kernel/registry/widget-catalog'
import {
  Home,
  Moon,
  Shield,
  ShieldOff,
  Blinds,
  Fan,
  Lightbulb,
  ToggleRight,
  Droplets,
  Flame,
  Gauge,
  Wind,
  Zap,
  Lamp,
  Link2,
} from '@lucide/vue'
import { useEntitiesStore } from '@/domain/entity/store/entities.store'
import { domainIndexToArray, getEntityDisplayName } from '@/domain/entity/derived'
import { sliderTrackStyle } from '@/kernel/ui/progress-bar'
import { createDefaultWholeHomeOff } from '@/kernel/index'
import { fetchAdvisorForgotten } from '@/kernel/http/index'
import type { RecommendChip } from '@/domain/recommend/recommend.types'
import { buildWholeHomeOffRecommendations } from '@/domain/recommend/whole-home-off-recommend'
import { useHomeosSceneOptions } from '@/features/home-mode/index'
import { useHazardBindingStatus } from '@/features/security/index'
import {
  idsToSingleEntity,
  joinCommaEntityIds,
  parseCommaEntityIds,
  singleEntityToIds,
} from '@/domain/entity/comma-entity-ids'
import { collectHazardBindingSummary, detectHazardBindingConflicts } from '@homeos/shared'
import {
  handleSystemConfigPatchError,
  patchSystemConfig,
  useSystemConfig,
} from '@/domain/layout/system-config-core.internals'
import { withBackendBootRetry } from '@/kernel/core/api-boot-retry'
import { isBackendUnreachableError } from '@/kernel/core/error-message'
import { logger } from '@/kernel/core/logger'
import { formatPresenceBadgeSummary } from '@/features/presence/display'
import { sanitizePresencePersonsForSave } from '@/features/presence/person'
import { SETTINGS_ROUTES } from '@/kernel/registry/settings-route'

/* ── 原 security-modes-core.internals.ts 的实现 ── */
/** composables：安防模式核心逻辑 */

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
    revertSilently,
  } = useSettingsPendingChanges({
    snapshot: initialSecurityConfig,
    current: () => liveSecurityModesLayoutSlice(layoutStore.layoutConfig),
    ready: () => layoutStore.isConfigLoaded,
    applyBaseline: (baseline) => {
      applySecurityModesLayoutSlice(
        layoutStore.layoutConfig,
        baseline as ReturnType<typeof pickSecurityModesLayoutSlice>,
      )
      afterLayoutCancelSync(layoutStore.layoutConfig)
    },
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
    mode.actions = preset.actions.map(
      (action: { entity_id?: string; domain?: string; service?: string; service_data?: Record<string, unknown> }) => ({
        ...action,
        service_data: action.service_data ? { ...action.service_data } : undefined,
      }),
    )
    chrome.notify(`已应用「${preset.name}」预设（${mode.actions.length} 条动作，请映射实体后保存布局）`, 'success')
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
          const incoming = Array.isArray(data?.modes) ? data.modes : Array.isArray(data) ? data : null
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
          chrome.notify(merged ? `已导入 ${merged} 个安防场景` : '未找到可合并的场景 key', merged ? 'success' : 'info')
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
    revertSecurityDraft: revertSilently,
  }
}

/* ── 原 security-modes-emergency.internals.ts 的实现 ── */
/** 安防模式：紧急场景配置 */

export function useSecurityModesEmergency() {
  const entitiesStore = useEntitiesStore()
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()

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
    // 切换档位只改执行策略，**不清空**自定义动作：notify_only 下动作不执行，
    // 用户切回 custom / full_home 时原配置仍在（此前会被永久删除）。
    Object.assign(cfg, preset.apply, { mode: presetId })
    chrome.notify(`已切换为「${preset.name}」`, 'success')
  }

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

  return {
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
  }
}

/* ── 原 security-modes-extras.internals.ts 的实现 ── */
/** 安防：全屋断电等扩展 */

// ── useWholeHomeOffSection ──
type WholeHomeOffDomainKey = 'lights' | 'covers' | 'climate' | 'switches'

interface DomainCard {
  key: WholeHomeOffDomainKey
  label: string
  icon: Component
  tone: 'amber' | 'sky' | 'cyan' | 'violet'
}

const domainCards: DomainCard[] = [
  { key: 'lights', label: '灯光', icon: Lightbulb, tone: 'amber' },
  { key: 'covers', label: '窗帘', icon: Blinds, tone: 'violet' },
  { key: 'climate', label: '空调/风扇', icon: Fan, tone: 'cyan' },
  { key: 'switches', label: '开关', icon: ToggleRight, tone: 'sky' },
]

export function useWholeHomeOffSection() {
  const layoutStore = useLayoutStore()
  const wholeHomeOff = computed(() => layoutStore.layoutConfig.wholeHomeOff)

  const entityDomains = ['light', 'cover', 'climate', 'fan', 'switch'] as const

  const enabledDomainCount = computed(() => domainCards.filter((d) => wholeHomeOff.value[d.key]).length)

  watch(
    () => layoutStore.layoutConfig.wholeHomeOff,
    (v) => {
      if (!v || typeof v !== 'object') {
        pauseGlobalPendingChanges()
        layoutStore.layoutConfig.wholeHomeOff = createDefaultWholeHomeOff()
        syncGlobalLayoutPendingSnapshot(layoutStore.layoutConfig)
        resumeGlobalPendingChanges()
      }
    },
    { immediate: true },
  )

  return {
    wholeHomeOff,
    entityDomains,
    domainCards,
    enabledDomainCount,
  }
}

// ── useWholeHomeOffRecommend ──
export function useWholeHomeOffRecommend() {
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()
  const loading = ref(false)
  const forgotten = ref<Array<{ entityId: string; friendlyName?: string }>>([])

  async function loadForgotten() {
    loading.value = true
    try {
      const { data } = await fetchAdvisorForgotten()
      forgotten.value = Array.isArray(data)
        ? data
            .map((row) => ({
              entityId: String(row.entityId || row.entity_id || ''),
              friendlyName: row.friendlyName || row.name,
            }))
            .filter((row) => row.entityId)
        : []
    } catch {
      forgotten.value = []
    } finally {
      loading.value = false
    }
  }

  const recommendations = computed(() =>
    buildWholeHomeOffRecommendations({
      forgottenEntities: forgotten.value.map((row) => ({
        entityId: row.entityId,
        name: row.friendlyName,
      })),
      excludeEntityIds: layoutStore.layoutConfig.wholeHomeOff?.excludeEntities || [],
    }),
  )

  function applyChip(chip: RecommendChip) {
    const entityId = String(chip.payload?.entityId || '').trim()
    if (!entityId) return
    const list = layoutStore.layoutConfig.wholeHomeOff.excludeEntities || []
    if (list.includes(entityId)) return
    list.push(entityId)
    layoutStore.layoutConfig.wholeHomeOff.excludeEntities = list
    chrome.notify(`已加入排除列表：${chip.label}`, 'success')
  }

  function applyAll() {
    const chips = (recommendations.value.groups || []).flatMap((g) => g.chips)
    let added = 0
    for (const chip of chips) {
      const entityId = String(chip.payload?.entityId || '').trim()
      const list = layoutStore.layoutConfig.wholeHomeOff.excludeEntities || []
      if (entityId && !list.includes(entityId)) {
        list.push(entityId)
        added++
      }
    }
    if (added > 0) {
      layoutStore.layoutConfig.wholeHomeOff.excludeEntities = [
        ...new Set(layoutStore.layoutConfig.wholeHomeOff.excludeEntities || []),
      ]
      chrome.notify(`已添加 ${added} 个排除实体`, 'success')
    }
  }

  onMounted(() => {
    void loadForgotten()
  })

  return {
    loading,
    recommendations,
    applyChip,
    applyAll,
    refresh: loadForgotten,
  }
}

/* ── 原 security-modes-hazard.internals.ts 的实现 ── */
/** 安防：危险品/隐患绑定 */

// ── useHazardBindingsSection ──
interface HazardBindingsSectionModels {
  hazardSmokeEntityIds: Ref<string[]>
  hazardGasEntityIds: Ref<string[]>
  hazardLeakEntityIds: Ref<string[]>
  hazardEmergencySceneId: Ref<string>
  hazardGasValveEntityId: Ref<string>
  hazardWaterValveEntityId: Ref<string>
  hazardExhaustFanEntityIds: Ref<string>
}

export function useHazardBindingsSection(models: HazardBindingsSectionModels) {
  const {
    hazardSmokeEntityIds,
    hazardGasEntityIds,
    hazardLeakEntityIds,
    hazardEmergencySceneId,
    hazardGasValveEntityId,
    hazardWaterValveEntityId,
    hazardExhaustFanEntityIds,
  } = models

  const { scenes, loading: scenesLoading, labelsForSceneIds } = useHomeosSceneOptions({ includeEmpty: false })

  const hazardStatusConfig = computed(() => ({
    hazardSmokeEntityIds: hazardSmokeEntityIds.value,
    hazardGasEntityIds: hazardGasEntityIds.value,
    hazardLeakEntityIds: hazardLeakEntityIds.value,
    hazardGasValveEntityId: hazardGasValveEntityId.value,
    hazardWaterValveEntityId: hazardWaterValveEntityId.value,
    hazardExhaustFanEntityIds: hazardExhaustFanEntityIds.value,
  }))

  const { rows: statusRows } = useHazardBindingStatus(hazardStatusConfig)

  const emergencySceneIds = computed({
    get: () => parseCommaEntityIds(hazardEmergencySceneId.value),
    set: (ids: string[]) => {
      hazardEmergencySceneId.value = joinCommaEntityIds(ids)
    },
  })

  const sceneStaticOptions = computed(() =>
    scenes.value.map((scene) => ({
      id: scene.id,
      label: scene.name || scene.id,
      hint: scene.runOnHa ? 'HA 执行' : undefined,
    })),
  )

  const gasValveIds = computed({
    get: () => singleEntityToIds(hazardGasValveEntityId.value),
    set: (ids: string[]) => {
      hazardGasValveEntityId.value = idsToSingleEntity(ids)
    },
  })

  const waterValveIds = computed({
    get: () => singleEntityToIds(hazardWaterValveEntityId.value),
    set: (ids: string[]) => {
      hazardWaterValveEntityId.value = idsToSingleEntity(ids)
    },
  })

  const exhaustFanIds = computed({
    get: () => parseCommaEntityIds(hazardExhaustFanEntityIds.value),
    set: (ids: string[]) => {
      hazardExhaustFanEntityIds.value = joinCommaEntityIds(ids)
    },
  })

  const sensorBindingCount = computed(() => {
    const summary = collectHazardBindingSummary({
      hazardSmokeEntityIds: hazardSmokeEntityIds.value,
      hazardGasEntityIds: hazardGasEntityIds.value,
      hazardLeakEntityIds: hazardLeakEntityIds.value,
    })
    return summary.smoke.length + summary.gas.length + summary.leak.length
  })

  const bindingConflicts = computed(() =>
    detectHazardBindingConflicts({
      hazardSmokeEntityIds: hazardSmokeEntityIds.value,
      hazardGasEntityIds: hazardGasEntityIds.value,
      hazardLeakEntityIds: hazardLeakEntityIds.value,
    }),
  )

  const KIND_LABELS: Record<string, string> = { smoke: '烟感', gas: '燃气', leak: '水浸' }

  const bindingConflictText = computed(() =>
    bindingConflicts.value
      .map((conflict) => `${conflict.entityId}（${conflict.kinds.map((k) => KIND_LABELS[k] || k).join('、')}）`)
      .join('；'),
  )

  const hazardActionSummary = computed(() => {
    const parts: string[] = []
    if (hazardGasValveEntityId.value?.trim()) parts.push(`燃气关阀 → ${hazardGasValveEntityId.value.trim()}`)
    else if (sensorBindingCount.value) parts.push('燃气关阀 → valve.gas_main（默认）')
    if (hazardWaterValveEntityId.value?.trim()) parts.push(`漏水关阀 → ${hazardWaterValveEntityId.value.trim()}`)
    else if (hazardLeakEntityIds.value?.length) parts.push('漏水关阀 → valve.water_main（默认）')
    if (exhaustFanIds.value.length) parts.push(`排风 → ${joinCommaEntityIds(exhaustFanIds.value)}`)
    else if (hazardSmokeEntityIds.value?.length || hazardGasEntityIds.value?.length)
      parts.push('排风 → fan.exhaust（默认）')
    if (emergencySceneIds.value.length) {
      parts.push(`紧急场景 → ${labelsForSceneIds(emergencySceneIds.value).join('、')}`)
    }
    return parts.length ? parts.join(' · ') : ''
  })

  function entityCountLabel(ids: string[]) {
    const count = (Array.isArray(ids) ? ids : []).filter(Boolean).length
    return count ? `${count} 个` : '未选择'
  }

  type SensorKind = 'smoke' | 'gas' | 'leak'

  function sensorFieldStatus(kind: SensorKind, ids: string[]) {
    if (!(Array.isArray(ids) ? ids : []).filter(Boolean).length) {
      return { statusLabel: '未选择', statusTone: 'muted' as const }
    }
    const kindRows = statusRows.value.filter((row) => row.kind === kind)
    if (kindRows.some((row) => row.status === 'alert')) return { statusLabel: '告警', statusTone: 'alert' as const }
    if (kindRows.some((row) => row.status === 'offline')) return { statusLabel: '离线', statusTone: 'offline' as const }
    return { statusLabel: '正常', statusTone: 'ok' as const }
  }

  const sensorFields = computed(() => [
    {
      key: 'smoke',
      label: '烟感实体',
      tone: 'rose',
      icon: Flame,
      deviceClass: 'smoke',
      placeholder: '点击选择烟感实体',
      ids: hazardSmokeEntityIds.value,
      ...sensorFieldStatus('smoke', hazardSmokeEntityIds.value),
      onUpdate: (nextIds: string[]) => {
        hazardSmokeEntityIds.value = nextIds
      },
    },
    {
      key: 'gas',
      label: '燃气传感器',
      tone: 'amber',
      icon: Wind,
      deviceClass: 'gas',
      placeholder: '点击选择燃气传感器',
      ids: hazardGasEntityIds.value,
      ...sensorFieldStatus('gas', hazardGasEntityIds.value),
      onUpdate: (nextIds: string[]) => {
        hazardGasEntityIds.value = nextIds
      },
    },
    {
      key: 'leak',
      label: '水浸传感器',
      tone: 'cyan',
      icon: Droplets,
      deviceClass: 'moisture',
      placeholder: '点击选择水浸传感器',
      ids: hazardLeakEntityIds.value,
      ...sensorFieldStatus('leak', hazardLeakEntityIds.value),
      onUpdate: (nextIds: string[]) => {
        hazardLeakEntityIds.value = nextIds
      },
    },
  ])

  const actionFields = computed(() => [
    {
      key: 'gas-valve',
      label: '燃气关阀实体',
      tone: 'amber',
      icon: Gauge,
      domains: ['valve', 'switch'],
      maxSelection: 1,
      placeholder: '点击选择燃气关阀实体',
      ids: gasValveIds.value,
      countLabel: entityCountLabel(gasValveIds.value),
      onUpdate: (nextIds: string[]) => {
        gasValveIds.value = nextIds
      },
    },
    {
      key: 'water-valve',
      label: '漏水关阀实体',
      tone: 'cyan',
      icon: Droplets,
      domains: ['valve', 'switch'],
      maxSelection: 1,
      placeholder: '点击选择漏水关阀实体',
      ids: waterValveIds.value,
      countLabel: entityCountLabel(waterValveIds.value),
      onUpdate: (nextIds: string[]) => {
        waterValveIds.value = nextIds
      },
    },
    {
      key: 'exhaust',
      label: '排风实体',
      tone: 'sky',
      icon: Fan,
      domains: ['fan', 'switch'],
      maxSelection: 0,
      placeholder: '点击选择排风实体',
      ids: exhaustFanIds.value,
      countLabel: entityCountLabel(exhaustFanIds.value),
      onUpdate: (nextIds: string[]) => {
        exhaustFanIds.value = nextIds
      },
    },
    {
      key: 'scenes',
      label: '紧急场景',
      tone: 'violet',
      icon: Zap,
      staticOptions: sceneStaticOptions.value,
      maxSelection: 0,
      placeholder: scenesLoading.value ? '正在加载场景…' : '点击选择紧急场景（可多选）',
      hint: scenesLoading.value ? '' : '触发时将依次执行所选 HomeOS 场景',
      ids: emergencySceneIds.value,
      countLabel: entityCountLabel(emergencySceneIds.value),
      onUpdate: (nextIds: string[]) => {
        emergencySceneIds.value = nextIds
      },
    },
  ])

  const drillButtons = [
    { kind: 'smoke' as const, shortLabel: '烟雾演习', tone: 'rose', icon: Flame },
    { kind: 'gas' as const, shortLabel: '燃气演习', tone: 'amber', icon: Wind },
    { kind: 'leak' as const, shortLabel: '漏水演习', tone: 'cyan', icon: Droplets },
  ]

  return {
    bindingConflicts,
    bindingConflictText,
    sensorBindingCount,
    sensorFields,
    actionFields,
    drillButtons,
    hazardActionSummary,
    statusRows,
  }
}

/* ── 原 security-modes-linkage.internals.ts 的实现 ── */
/** composables：安防联动配置与展示 */

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
    calendarArmOnAway: false,
    calendarUpgradeToAway: false,
    autoDisarmOnFirstHome: false,
  })

  const presets = computed(() => getSecurityLinkagePresets())
  const paramRows = computed(() => getSecurityLinkageParamRows())
  const flagRows = computed(() => getSecurityLinkageFlagRows())

  const enabledCount = computed(() => flagRows.value.filter((flagRow) => security.value[flagRow.key]).length)

  let linkageLoaded = false

  function readSecurityFlags(data: { security?: Record<string, unknown> } | null | undefined) {
    const sec = data?.security || {}
    return {
      linkAwaySimOnArmAway: !!sec.linkAwaySimOnArmAway,
      linkHomeModeOnSecurityChange: !!sec.linkHomeModeOnSecurityChange,
      autoArmOnEveryoneLeft: !!sec.autoArmOnEveryoneLeft,
      autoUpgradeToAwayOnEveryoneLeft: !!sec.autoUpgradeToAwayOnEveryoneLeft,
      calendarArmOnAway: !!sec.calendarArmOnAway,
      calendarUpgradeToAway: !!sec.calendarUpgradeToAway,
      autoDisarmOnFirstHome: !!sec.autoDisarmOnFirstHome,
    }
  }

  async function refresh({ bootRetry = false, silent = false }: { bootRetry?: boolean; silent?: boolean } = {}) {
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

  const configuredPersonCount = computed(() => sanitizePresencePersonsForSave(presencePersons.value).length)

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
