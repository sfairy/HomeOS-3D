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
    const count = (Array.isArray(ids) ? ids : []).filter(Boolean).length
    return count ? `${count} 个` : '未选择'
  }

  type SensorKind = 'smoke' | 'gas' | 'leak'

  function sensorFieldStatus(kind: SensorKind, ids: string[]) {
    if (!(Array.isArray(ids) ? ids : []).filter(Boolean).length) {
      return { statusLabel: '未选择', statusTone: 'muted' as const }
    }
    const kindRows = statusRows.value.filter((row) => row.kind === kind)
    if (kindRows.some((row) => row.status === 'alert'))
      return { statusLabel: '告警', statusTone: 'alert' as const }
    if (kindRows.some((row) => row.status === 'offline'))
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
