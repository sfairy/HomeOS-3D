/**
 * @file event-log-record-filter.util.ts
 * @module frontend/src/views
 */
/** 事件日志记录筛选 composable + 域预设（自 connection.internals 抽出） */
import { fetchEventStats } from '@/services/api/entities'
import { useEntitiesStore } from '@/stores/entities.store'
import { useChromeStore } from '@/stores/chrome.store'
import type { SystemConfig } from '@/types/system-config'
import { getEventLogConfig } from '@/utils/config/frontend-config'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { logger } from '@/utils/core/logger'
import { buildEventLogPerfRecommendations } from '@/utils/recommend/event-log-perf-recommend.util'
import type { EventLogStatsSnapshot } from '@/utils/recommend/types'
import {
  fetchSystemConfigFresh,
  handleSystemConfigPatchError,
  patchSystemConfig,
} from '@/composables/config/system-config-core.internals'
import { readEventLogRecordFilterState } from '@/composables/settings/connect/event-log-record-filter-state.util'
import {
  buildEventLogRecordRecommendations,
  mapEventLogRecordToInsight,
} from '@/utils/recommend/event-log-record-recommend.util'
import { computed, ref } from 'vue'

// ── useEventLogRecordFilter ──
/** 排除模式：常见噪声/高频变更域 */
const EVENT_LOG_RECORD_BLOCK_DOMAIN_PRESETS = [
  { key: 'sensor', label: 'sensor' },
  { key: 'binary_sensor', label: 'binary_sensor' },
  { key: 'device_tracker', label: 'device_tracker' },
  { key: 'update', label: 'update' },
  { key: 'camera', label: 'camera' },
  { key: 'image', label: 'image' },
  { key: 'event', label: 'event' },
] as const

/** 白名单模式：常见控制/交互域 */
const EVENT_LOG_RECORD_ALLOW_DOMAIN_PRESETS = [
  { key: 'light', label: 'light' },
  { key: 'switch', label: 'switch' },
  { key: 'climate', label: 'climate' },
  { key: 'cover', label: 'cover' },
  { key: 'fan', label: 'fan' },
  { key: 'media_player', label: 'media_player' },
  { key: 'lock', label: 'lock' },
  { key: 'scene', label: 'scene' },
] as const

export function useEventLogRecordFilter() {
  const chrome = useChromeStore()
  const entitiesStore = useEntitiesStore()

  const enabled = ref(false)
  const mode = ref<'block' | 'allow_domains'>('block')
  const blockDomains = ref<string[]>([])
  const allowDomains = ref<string[]>([])
  const blockEntityIds = ref<string[]>([])
  const saving = ref(false)
  const feedback = ref<{ ok?: boolean; message: string } | null>(null)
  const statsLoading = ref(false)
  const statsHours = ref(24)
  const eventStats = ref<EventLogStatsSnapshot | null>(null)

  const activeDomains = computed({
    get: () => (mode.value === 'allow_domains' ? allowDomains.value : blockDomains.value),
    set: (value: string[]) => {
      if (mode.value === 'allow_domains') allowDomains.value = value
      else blockDomains.value = value
    },
  })

  const domainPresets = computed(() =>
    mode.value === 'allow_domains'
      ? EVENT_LOG_RECORD_ALLOW_DOMAIN_PRESETS
      : EVENT_LOG_RECORD_BLOCK_DOMAIN_PRESETS,
  )

  const extraDomains = computed(() => {
    const presetKeys = new Set(domainPresets.value.map((item) => item.key))
    const fromStore = entitiesStore.domains || []
    return fromStore.filter((domain) => !(presetKeys as Set<string>).has(domain)).sort()
  })

  const entityDomains = computed(() => {
    const preset = [
      ...EVENT_LOG_RECORD_BLOCK_DOMAIN_PRESETS,
      ...EVENT_LOG_RECORD_ALLOW_DOMAIN_PRESETS,
    ].map((item) => item.key)
    const fromStore = entitiesStore.domains || []
    return [...new Set([...preset, ...fromStore])].sort()
  })

  const opsConfig = ref<Record<string, unknown>>({})
  let loadSeq = 0

  function applyOpsFromConfig(cfg: SystemConfig | null | undefined) {
    const state = readEventLogRecordFilterState(cfg)
    if (!state) return false
    enabled.value = state.enabled
    mode.value = state.mode
    blockDomains.value = state.blockDomains
    allowDomains.value = state.allowDomains
    blockEntityIds.value = state.blockEntityIds
    const ops = cfg?.ops || {}
    opsConfig.value = {
      ...ops,
      ingressCoalesceEnabled: cfg?.haConnector?.ingressCoalesceEnabled,
      eventlogRetentionDays: cfg?.retention?.eventLog,
    }
    return true
  }

  const recommendations = computed(() =>
    buildEventLogRecordRecommendations(eventStats.value, statsHours.value, {
      enabled: enabled.value,
      mode: mode.value,
      blockDomains: blockDomains.value,
      allowDomains: allowDomains.value,
      blockEntityIds: blockEntityIds.value,
    }),
  )

  const recordInsight = computed(() =>
    mapEventLogRecordToInsight(recommendations.value, mode.value),
  )

  const perfInsight = computed(() =>
    buildEventLogPerfRecommendations(eventStats.value, statsHours.value, {
      eventLogTierEnabled: opsConfig.value.eventLogTierEnabled !== false,
      eventLogSkipSensorTimeline: opsConfig.value.eventLogSkipSensorTimeline !== false,
      ingressCoalesceEnabled: opsConfig.value.ingressCoalesceEnabled !== false,
      eventLogRecordFilterEnabled: enabled.value,
      eventlogRetentionDays: Number(opsConfig.value.eventlogRetentionDays) || undefined,
    }),
  )

  const summaryParts = computed(() => {
    if (!enabled.value) return []
    const parts: string[] = []
    if (mode.value === 'allow_domains') {
      parts.push(
        allowDomains.value.length
          ? `仅记录 ${allowDomains.value.length} 个域`
          : '未选择允许域（不写入任何记录）',
      )
    } else {
      parts.push(
        blockDomains.value.length ? `排除 ${blockDomains.value.length} 个域` : '未排除任何域',
      )
    }
    if (blockEntityIds.value.length) {
      parts.push(`排除 ${blockEntityIds.value.length} 个实体`)
    }
    return parts
  })

  async function loadStats() {
    statsLoading.value = true
    try {
      const hours = getEventLogConfig().maxQueryHours || 24
      statsHours.value = hours
      const { data } = await fetchEventStats({ hours })
      eventStats.value =
        data && typeof data === 'object'
          ? {
              total: Number(data.total) || 0,
              byDomain: data.byDomain && typeof data.byDomain === 'object' ? data.byDomain : {},
              topEntities: Array.isArray(data.topEntities) ? data.topEntities : [],
            }
          : null
    } catch (e) {
      logger.debug('事件统计加载失败,跳过智能推荐', e)
      eventStats.value = null
    } finally {
      statsLoading.value = false
    }
  }

  /** 始终直连服务端拉取 ops，避免与 ConnectionPanel 并发 load 的 loadEpoch 竞态 */
  async function load() {
    const seq = ++loadSeq
    try {
      const cfg = await fetchSystemConfigFresh()
      if (seq !== loadSeq) return
      if (!applyOpsFromConfig(cfg)) {
        feedback.value = {
          ok: false,
          message: '无法读取筛选配置（请确认已使用 admin 账户登录）',
        }
      }
    } catch (e) {
      if (seq !== loadSeq) return
      logger.warn('加载事件记录筛选配置失败', e)
      feedback.value = { ok: false, message: '加载筛选配置失败，请刷新页面重试' }
    }
  }

  function toggleEnabled() {
    enabled.value = !enabled.value
  }

  function toggleDomain(domain: string) {
    const list = activeDomains.value
    const idx = list.indexOf(domain)
    if (idx >= 0) list.splice(idx, 1)
    else list.push(domain)
  }

  function applyPreset(domainKeys: string[]) {
    activeDomains.value = [...new Set([...activeDomains.value, ...domainKeys])]
  }

  function selectAllPresetDomains() {
    activeDomains.value = domainPresets.value.map((item) => item.key)
  }

  function clearDomains() {
    activeDomains.value = []
  }

  function addBlockEntity(entityId: string) {
    const id = String(entityId || '').trim()
    if (!id || blockEntityIds.value.includes(id)) return
    blockEntityIds.value = [...blockEntityIds.value, id]
  }

  function applyRecommendations() {
    const rec = recommendations.value
    if (!rec.hasActionable) return
    enabled.value = true
    if (rec.suggestedMode) mode.value = rec.suggestedMode
    if (mode.value === 'block' && rec.blockDomains.length) {
      applyPreset(rec.blockDomains.map((row) => row.domain))
    }
    if (rec.blockEntities.length) {
      blockEntityIds.value = [
        ...new Set([...blockEntityIds.value, ...rec.blockEntities.map((row) => row.entityId)]),
      ]
    }
    feedback.value = { ok: undefined, message: '已应用推荐，请确认后保存' }
  }

  function applyRecommendedDomain(domain: string) {
    enabled.value = true
    if (mode.value !== 'block') mode.value = 'block'
    toggleDomain(domain)
    feedback.value = { ok: undefined, message: `已加入排除域 ${domain}` }
  }

  function applyRecommendedEntity(entityId: string) {
    enabled.value = true
    addBlockEntity(entityId)
    feedback.value = { ok: undefined, message: `已加入排除实体 ${entityId}` }
  }

  function applyRecordBanner(banner: { id: string }) {
    if (banner.id === 'suggested-mode' && recommendations.value.suggestedMode) {
      mode.value = recommendations.value.suggestedMode
      feedback.value = { ok: undefined, message: '已切换筛选模式，请确认后保存' }
    }
  }

  function applyRecordChip(chip: { payload?: Record<string, unknown> }) {
    const domain = String(chip.payload?.domain || '').trim()
    const entityId = String(chip.payload?.entityId || '').trim()
    if (domain) applyRecommendedDomain(domain)
    else if (entityId) applyRecommendedEntity(entityId)
  }

  function handlePerfBanner(banner: { id: string }) {
    if (banner.id === 'enable-filter') {
      enabled.value = true
      feedback.value = { ok: undefined, message: '已启用筛选，请确认规则后保存' }
    }
  }

  async function save() {
    if (saving.value) return
    saving.value = true
    feedback.value = { message: '正在保存…' }
    const wantEnabled = enabled.value
    try {
      loadSeq++
      const cfg = await patchSystemConfig({
        ops: {
          eventLogRecordFilterEnabled: wantEnabled,
          eventLogRecordFilterMode: mode.value,
          eventLogRecordBlockDomains: [...blockDomains.value],
          eventLogRecordAllowDomains: [...allowDomains.value],
          eventLogRecordBlockEntityIds: [...blockEntityIds.value],
        },
      })
      if (!applyOpsFromConfig(cfg)) {
        const fresh = await fetchSystemConfigFresh()
        applyOpsFromConfig(fresh)
      }
      const savedEnabled = enabled.value
      feedback.value = {
        ok: savedEnabled === wantEnabled,
        message:
          savedEnabled === wantEnabled
            ? wantEnabled
              ? '已保存，新变更将按规则过滤写入'
              : '已关闭筛选，恢复默认记录策略'
            : '保存结果与预期不一致，请刷新后重试',
      }
    } catch (e) {
      if (await handleSystemConfigPatchError(e, chrome)) {
        await load()
        feedback.value = { ok: false, message: '配置已被其他终端修改，已重新加载' }
        return
      }
      feedback.value = { ok: false, message: getApiErrorMessage(e, '保存失败') }
    } finally {
      saving.value = false
    }
  }

  return {
    enabled,
    mode,
    blockDomains,
    allowDomains,
    blockEntityIds,
    entityDomains,
    domainPresets,
    extraDomains,
    activeDomains,
    summaryParts,
    recommendations,
    recordInsight,
    perfInsight,
    statsLoading,
    statsHours,
    eventStats,
    saving,
    feedback,
    load,
    loadStats,
    save,
    toggleEnabled,
    toggleDomain,
    applyPreset,
    selectAllPresetDomains,
    clearDomains,
    applyRecommendations,
    applyRecommendedDomain,
    applyRecommendedEntity,
    applyRecordBanner,
    applyRecordChip,
    handlePerfBanner,
  }
}
