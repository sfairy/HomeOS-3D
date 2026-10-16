/**
 * @file security-modes-hazard.internals.ts
 * @module frontend/src/views
 */
/** 安防：危险品/隐患绑定 */
import type { Ref } from 'vue'
import { computed } from 'vue'
import { useHomeosSceneOptions } from '@/features/home-mode'
import { useHazardBindingStatus } from '@/features/security'
import { idsToSingleEntity, joinCommaEntityIds, parseCommaEntityIds, singleEntityToIds } from '@/shared/entity/utils/comma-entity-ids.util'
import { collectHazardBindingSummary, detectHazardBindingConflicts } from '@homeos/shared'
import { Droplets, Fan, Flame, Gauge, Wind, Zap } from '@lucide/vue'

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
