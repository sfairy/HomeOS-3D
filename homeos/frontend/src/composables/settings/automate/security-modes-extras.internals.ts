/**
 * @file security-modes-extras.internals.ts
 * @module frontend/src/views
 */
/** composables：合并自全家断电区 / 推荐 / 危险绑定区（自 security-modes.internals.ts 拆出） */
import type { Component, Ref } from 'vue'
import { pauseGlobalPendingChanges, resumeGlobalPendingChanges, syncGlobalLayoutPendingSnapshot } from '@/composables/settings/pending.internals'
import { useHomeosSceneOptions } from '@/composables/home-mode/useHomeosSceneOptions'
import { useHazardBindingStatus } from '@/composables/security/useHazardBindingStatus'
import { WHOLE_HOME_OFF_ROLE_OPTIONS, createDefaultWholeHomeOff } from '@/constants/whole-home-off'
import { fetchAdvisorForgotten } from '@/services/api/system'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import type { WholeHomeOffRole } from '@/types/whole-home-off'
import { idsToSingleEntity, joinCommaEntityIds, parseCommaEntityIds, singleEntityToIds } from '@/utils/entity/comma-entity-ids.util'
import type { RecommendChip } from '@/utils/recommend/types'
import { buildWholeHomeOffRecommendations } from '@/utils/recommend/whole-home-off-recommend.util'
import { collectHazardBindingSummary, detectHazardBindingConflicts } from '@homeos/shared'
import { Blinds, Droplets, Fan, Flame, Gauge, Lightbulb, ToggleRight, Wind, Zap } from '@lucide/vue'
import { computed, onMounted, ref, watch } from 'vue'

// ── useWholeHomeOffSection ──
type WholeHomeOffDomainKey = 'lights' | 'covers' | 'climate' | 'switches'

interface DomainCard {
  key: WholeHomeOffDomainKey
  label: string
  icon: Component
  tone: 'amber' | 'sky' | 'cyan' | 'violet'
}

const ROLE_LABELS: Record<WholeHomeOffRole, string> = {
  admin: '管理员',
  adult: '成人',
  child: '儿童',
  guest: '访客',
}

const domainCards: DomainCard[] = [
  { key: 'lights', label: '灯光', icon: Lightbulb, tone: 'amber' },
  { key: 'covers', label: '窗帘', icon: Blinds, tone: 'violet' },
  { key: 'climate', label: '空调/风扇', icon: Fan, tone: 'cyan' },
  { key: 'switches', label: '开关', icon: ToggleRight, tone: 'sky' },
]

export function useWholeHomeOffSection() {
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()
  const wholeHomeOff = computed(() => layoutStore.layoutConfig.wholeHomeOff)

  const entityDomains = ['light', 'cover', 'climate', 'fan', 'switch'] as const

  const enabledDomainCount = computed(
    () => domainCards.filter((d) => wholeHomeOff.value[d.key]).length,
  )

  function roleLabel(role: WholeHomeOffRole) {
    return ROLE_LABELS[role] ?? role
  }

  function roleActive(role: WholeHomeOffRole) {
    return (wholeHomeOff.value.roles || []).includes(role)
  }

  function toggleRole(role: WholeHomeOffRole) {
    const list = [...(wholeHomeOff.value.roles || [])]
    const idx = list.indexOf(role)
    if (idx >= 0) {
      if (list.length <= 1) {
        chrome.notify('至少保留一个可用角色', 'warning')
        return
      }
      list.splice(idx, 1)
    } else {
      list.push(role)
    }
    wholeHomeOff.value.roles = list
  }

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
    WHOLE_HOME_OFF_ROLE_OPTIONS,
    roleLabel,
    roleActive,
    toggleRole,
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

  const {
    scenes,
    loading: scenesLoading,
    labelsForSceneIds,
  } = useHomeosSceneOptions({ includeEmpty: false })

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
    scenes.value.map((s) => ({
      id: s.id,
      label: s.name || s.id,
      hint: s.runOnHa ? 'HA 执行' : undefined,
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
      .map((c) => `${c.entityId}（${c.kinds.map((k) => KIND_LABELS[k] || k).join('、')}）`)
      .join('；'),
  )

  const hazardActionSummary = computed(() => {
    const parts: string[] = []
    if (hazardGasValveEntityId.value?.trim())
      parts.push(`燃气关阀 → ${hazardGasValveEntityId.value.trim()}`)
    else if (sensorBindingCount.value) parts.push('燃气关阀 → valve.gas_main（默认）')
    if (hazardWaterValveEntityId.value?.trim())
      parts.push(`漏水关阀 → ${hazardWaterValveEntityId.value.trim()}`)
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
    const n = (Array.isArray(ids) ? ids : []).filter(Boolean).length
    return n ? `${n} 个` : '未选择'
  }

  type SensorKind = 'smoke' | 'gas' | 'leak'

  function sensorFieldStatus(kind: SensorKind, ids: string[]) {
    if (!(Array.isArray(ids) ? ids : []).filter(Boolean).length) {
      return { statusLabel: '未选择', statusTone: 'muted' as const }
    }
    const kindRows = statusRows.value.filter((r) => r.kind === kind)
    if (kindRows.some((r) => r.status === 'alert'))
      return { statusLabel: '告警', statusTone: 'alert' as const }
    if (kindRows.some((r) => r.status === 'offline'))
      return { statusLabel: '离线', statusTone: 'offline' as const }
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
      onUpdate: (v: string[]) => {
        hazardSmokeEntityIds.value = v
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
      onUpdate: (v: string[]) => {
        hazardGasEntityIds.value = v
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
      onUpdate: (v: string[]) => {
        hazardLeakEntityIds.value = v
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
      onUpdate: (v: string[]) => {
        gasValveIds.value = v
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
      onUpdate: (v: string[]) => {
        waterValveIds.value = v
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
      onUpdate: (v: string[]) => {
        exhaustFanIds.value = v
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
      onUpdate: (v: string[]) => {
        emergencySceneIds.value = v
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
