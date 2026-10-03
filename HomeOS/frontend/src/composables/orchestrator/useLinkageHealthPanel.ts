/**
 * 联动健康面板：快照加载、冲突消解、时间线与图表衍生数据
 */
import { ref, computed, onMounted } from 'vue'
import { fetchLinkageHealth, resolveLinkageConflicts } from '@/services/api/system'
import { useDriftRepair } from '@/composables/orchestrator/useDriftRepair'
import { formatShortDateTimeOrDash } from '@/utils/format/locale-format.util'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { notifyError } from '@/services/notify'
import { displayEntityStateLabel } from '@/constants/entity-state-labels'
import { homeModeLogSourceLabel } from '@homeos/shared'
import { useEntitiesStore } from '@/stores/entities.store'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import type { LifeTrendPoint } from '@/composables/life/useLifeOverviewAnalytics'

type LinkageMember = {
  id: string
  name: string
  atHome: boolean
}

type LinkageSnapshot = {
  energyAutoLinkage?: {
    enabled?: boolean
    gaps?: string[]
  }
  weatherAutoLinkage?: {
    enabled?: boolean
    gaps?: string[]
  }
  security?: {
    mode?: string
    anyoneHome?: boolean
    atHomeCount?: number
    members?: LinkageMember[]
  }
  haSync?: {
    connected?: boolean
    ha_version?: string
  }
  drift?: unknown[]
  /** 内置「模板 × 家庭模式」冲突（无 kind）与通用实体操作冲突（kind='entity-conflict'）的混合数组 */
  conflicts?: Array<{
    templateId?: string
    automationName?: string
    automationId?: string
    modeName?: string
    reason?: string
    // 通用实体冲突字段（kind === 'entity-conflict'）
    kind?: string
    entityId?: string
    actionType?: string
    automationIds?: string[]
    automationNames?: string[]
    sceneIds?: string[]
    sceneNames?: string[]
    scriptIds?: string[]
    scriptNames?: string[]
  }>
  /** 通用实体冲突扫描统计：checked=参与比较的联动器数，skipped=解析失败/无操作实体的联动器数 */
  entityConflictScan?: {
    checked?: number
    skipped?: number
    skippedNames?: string[]
  }
  linkageFailures?: Array<{ id: string; detail: string }>
  eventTimeline?: Array<{ at: string; kind: string; label: string; meta?: string }>
  modeTriggers?: Array<{
    id: string
    modeName: string
    source: string
    success: boolean
  }>
  ruleHistory?: Array<{
    ruleId: string
    ruleName: string
    entries?: Array<{ at: string; condition: string }>
  }>
  checkedAt?: string
}

/** useLinkageHealthPanel：函数，按签名入参返回处理结果。 */
export function useLinkageHealthPanel() {
  const loading = ref(true)
  const error = ref('')
  const data = ref<LinkageSnapshot | null>(null)
  const expandedRuleId = ref('')
  const resolving = ref(false)
  const entitiesStore = useEntitiesStore()

  const drift = useDriftRepair()

  const modeLabel = computed(() => {
    const mode = data.value?.security?.mode
    if (!mode) return '—'
    return displayEntityStateLabel('alarm_control_panel', mode)
  })

  const members = computed<LinkageMember[]>(() => {
    const list = data.value?.security?.members
    return Array.isArray(list) ? list : []
  })

  const issueCount = computed(() => {
    const d = data.value
    if (!d) return 0
    return (
      (d.conflicts?.length || 0) +
      (d.linkageFailures?.length || 0) +
      (d.drift?.length || 0) +
      (d.energyAutoLinkage && !d.energyAutoLinkage.enabled ? 1 : 0) +
      (d.weatherAutoLinkage?.gaps?.length ? 1 : 0)
    )
  })

  /** 内置「模板 × 家庭模式」冲突（无 kind 字段的旧结构项） */
  const builtinConflicts = computed(() =>
    (data.value?.conflicts || []).filter((c) => c.kind !== 'entity-conflict'),
  )

  /** 通用实体操作冲突（kind === 'entity-conflict'） */
  const entityConflicts = computed(() =>
    (data.value?.conflicts || []).filter((c) => c.kind === 'entity-conflict'),
  )

  /** 合并所有涉及联动器名称（自动化/场景/脚本），用于实体冲突展示 */
  function conflictEntityNames(c: {
    automationNames?: string[]
    sceneNames?: string[]
    scriptNames?: string[]
  }) {
    return [...(c.automationNames || []), ...(c.sceneNames || []), ...(c.scriptNames || [])]
  }

  function conflictEntityLabel(entityId?: string) {
    if (!entityId) return ''
    return getEntityDisplayName(entityId, entitiesStore.entities[entityId])
  }

  function conflictReason(c: { entityId?: string; reason?: string }) {
    const raw = String(c.reason || '')
    const eid = c.entityId
    if (!eid || !raw.includes(eid)) return raw
    return raw.split(eid).join(conflictEntityLabel(eid))
  }

  const healthScore = computed(() => {
    const d = data.value
    if (!d) return 0
    let score = 100
    if (d.energyAutoLinkage && !d.energyAutoLinkage.enabled) score -= 12
    if (d.weatherAutoLinkage?.gaps?.length) score -= 8
    if (!d.haSync?.connected) score -= 25
    score -= Math.min(30, (d.conflicts?.length || 0) * 8)
    score -= Math.min(25, (d.linkageFailures?.length || 0) * 5)
    score -= Math.min(20, (d.drift?.length || 0) * 4)
    return Math.max(0, score)
  })

  const statusTone = computed(() => {
    if (issueCount.value >= 3 || healthScore.value < 60) return 'warn'
    if (issueCount.value > 0 || healthScore.value < 85) return 'soft'
    return 'ok'
  })

  const statusText = computed(() => {
    if (issueCount.value > 0) return `${issueCount.value} 项需关注`
    return '联动闭环正常'
  })

  const eventSeries = computed<LifeTrendPoint[]>(() => {
    const hours = Array.from({ length: 24 }, (_, h) => ({
      label: String(h).padStart(2, '0'),
      value: 0,
    }))
    for (const ev of data.value?.eventTimeline || []) {
      const t = Date.parse(ev.at)
      if (!Number.isFinite(t)) continue
      hours[new Date(t).getHours()].value += 1
    }
    return hours
  })

  const timeline = computed(() =>
    (data.value?.eventTimeline || []).slice(0, 8).map((ev, idx) => ({
      ...ev,
      key: `${ev.kind}-${ev.at}-${idx}`,
      time: formatShortDateTimeOrDash(ev.at, { use24h: true }),
      kindLabel: timelineKindLabel(ev.kind),
      label: formatTimelineLabel(ev),
    })),
  )

  function formatTimelineLabel(ev: { kind: string; label: string; meta?: string }) {
    if (!ev?.label) return ''
    if (ev.kind === 'mode_trigger') {
      const parts = String(ev.label).split(' · ')
      if (parts.length >= 2) {
        parts[1] = homeModeLogSourceLabel(parts[1])
        return parts.join(' · ')
      }
    }
    if (ev.kind === 'sync_drift' && ev.meta) {
      const scopeLabel = drift.domainLabel[ev.meta] || ev.meta
      return String(ev.label).replace(String(ev.meta), scopeLabel)
    }
    return ev.label
  }

  function timelineKindLabel(kind: string) {
    if (kind === 'linkage_failure') return '联动失败'
    if (kind === 'mode_trigger') return '模式触发'
    if (kind === 'sync_drift') return '同步漂移'
    return '其他'
  }

  async function load() {
    loading.value = true
    error.value = ''
    try {
      const { data: res } = await fetchLinkageHealth()
      data.value = (res || null) as LinkageSnapshot | null
    } catch (e) {
      error.value = getApiErrorMessage(e, '加载失败')
      data.value = null
    } finally {
      loading.value = false
    }
  }

  async function resolveConflicts() {
    if (resolving.value) return
    resolving.value = true
    try {
      await resolveLinkageConflicts()
      await load()
    } catch (e) {
      notifyError(e, '冲突消解失败')
    } finally {
      resolving.value = false
    }
  }

  function toggleRule(ruleId: string) {
    expandedRuleId.value = expandedRuleId.value === ruleId ? '' : ruleId
  }

  onMounted(load)

  return {
    loading,
    error,
    data,
    expandedRuleId,
    resolving,
    modeLabel,
    members,
    issueCount,
    healthScore,
    statusTone,
    statusText,
    eventSeries,
    timeline,
    builtinConflicts,
    entityConflicts,
    conflictEntityNames,
    conflictEntityLabel,
    conflictReason,
    load,
    resolveConflicts,
    toggleRule,
    formatShortDateTimeOrDash,
    homeModeLogSourceLabel,
    driftItems: drift.driftItems,
    scanning: drift.scanning,
    repairing: drift.repairing,
    wizardStep: drift.wizardStep,
    repairLog: drift.repairLog,
    scanError: drift.scanError,
    scanDrift: drift.scanDrift,
    repairOne: drift.repairOne,
    repairAll: drift.repairAll,
    domainLabel: drift.domainLabel,
  }
}
