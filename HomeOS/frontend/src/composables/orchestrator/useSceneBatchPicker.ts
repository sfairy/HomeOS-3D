/**
 * @file frontend\src\composables\orchestrator\useSceneBatchPicker.ts
 * @module src
 */
import { computed, ref, watch, type Ref } from 'vue'
import { getEntityDomain } from '@homeos/shared'
import {
  applyBatchParamsToSceneEntity,
  applyPresetDefaultsForDomain,
} from '@/utils/orchestrator/scene-batch-apply.util'
import { useEntitiesStore } from '@/stores/entities.store'
import type { SceneEntityForm } from '@/utils/orchestrator/scene-yaml-form.util'

const SCENE_BATCH_COMMON_DOMAINS = new Set([
  'light',
  'switch',
  'cover',
  'climate',
  'fan',
  'media_player',
  'lock',
  'vacuum',
  'humidifier',
  'input_boolean',
  'input_select',
  'input_number',
  'binary_sensor',
])

interface SceneBatchPickerDeps {
  batchEntities: Ref<Array<{ entity_id: string; name?: string }>>
  selectedBatchIds: Ref<string[]>
  batchState: Ref<string>
  batchBrightness: Ref<number | null>
  batchColorTemp: Ref<number | null>
  batchRgbColor: Ref<string>
  batchTransition: Ref<number | null>
  batchEffect: Ref<string>
  batchFilter: Ref<string>
  batchDomain: Ref<string>
  batchPosition: Ref<number | null>
  batchTemperature: Ref<number | null>
  batchHvacMode: Ref<string>
  batchVolume: Ref<number | null>
  batchSource: Ref<string>
  batchFanPercentage: Ref<number | null>
  batchOption: Ref<string>
  batchValue: Ref<number | null>
  batchHumidity: Ref<number | null>
  batchCode: Ref<string>
  batchFanSpeed: Ref<string>
  showBatchPicker: Ref<boolean>
  entities: Ref<SceneEntityForm[]>
  newEntityDefaults: () => SceneEntityForm
  resultMsg: Ref<string>
  resultOk: Ref<boolean>
  dismissAfter: (ms: number) => void
}

/** useSceneBatchPicker：函数，按签名入参返回处理结果。 */
export function useSceneBatchPicker(deps: SceneBatchPickerDeps) {
  const entitiesStore = useEntitiesStore()
  const batchCommonOnly = ref(true)

  const filteredBatchEntities = computed(() => {
    let list = deps.batchEntities.value
    if (batchCommonOnly.value) {
      list = list.filter((e) => SCENE_BATCH_COMMON_DOMAINS.has(getEntityDomain(e.entity_id)))
    }
    if (deps.batchDomain.value) {
      list = list.filter((e) => e.entity_id.startsWith(deps.batchDomain.value + '.'))
    }
    const q = deps.batchFilter.value.toLowerCase().trim()
    if (q) {
      list = list.filter((e) => {
        const name = e.name || ''
        return name.toLowerCase().includes(q) || e.entity_id.toLowerCase().includes(q)
      })
    }
    return list
  })

  const enrichedBatchEntities = computed(() =>
    filteredBatchEntities.value.map((e) => {
      const domain = getEntityDomain(e.entity_id)
      const live = entitiesStore.entities[e.entity_id]
      const state = live?.state ?? 'unknown'
      const isOn = state === 'on' || (domain === 'climate' && state !== 'off')
      return {
        entity_id: e.entity_id,
        label: batchEntityLabel(e),
        domain,
        domainShort: shortBatchDomain(e.entity_id),
        state,
        isOn,
      }
    }),
  )

  const selectedBatchSet = computed(() => new Set(deps.selectedBatchIds.value))

  const batchDomains = computed(() => {
    const set = new Set<string>()
    for (const e of deps.batchEntities.value) set.add(getEntityDomain(e.entity_id))
    return [...set].sort()
  })

  const selectedBatchDomains = computed(() => {
    if (!deps.selectedBatchIds.value.length) return new Set<string>()
    return new Set(deps.selectedBatchIds.value.map((id) => getEntityDomain(id)))
  })

  /** 类型筛选优先；否则已选实体 domain 一致时推断 */
  const presetDomain = computed(() => {
    if (deps.batchDomain.value) return deps.batchDomain.value
    if (selectedBatchDomains.value.size === 1) return [...selectedBatchDomains.value][0]
    return ''
  })

  const showAdvancedPresets = computed(() => {
    const d = presetDomain.value
    if (!d) return false
    return [
      'light',
      'cover',
      'climate',
      'media_player',
      'fan',
      'input_select',
      'input_number',
      'humidifier',
      'lock',
      'vacuum',
      'alarm_control_panel',
    ].includes(d)
  })

  const showPresetBar = computed(
    () => deps.selectedBatchIds.value.length > 0 || !!deps.batchDomain.value,
  )

  function syncBatchPresetDefaults() {
    const domain = presetDomain.value
    if (!domain) return
    const next = applyPresetDefaultsForDomain(domain, {
      brightness: deps.batchBrightness.value,
      colorTemp: deps.batchColorTemp.value,
      position: deps.batchPosition.value,
      temperature: deps.batchTemperature.value,
      fanPercentage: deps.batchFanPercentage.value,
      humidity: deps.batchHumidity.value,
      volume: deps.batchVolume.value,
    })
    deps.batchBrightness.value = next.brightness
    deps.batchColorTemp.value = next.colorTemp
    deps.batchPosition.value = next.position
    deps.batchTemperature.value = next.temperature
    deps.batchFanPercentage.value = next.fanPercentage
    deps.batchHumidity.value = next.humidity
    deps.batchVolume.value = next.volume
  }

  watch(presetDomain, () => syncBatchPresetDefaults())
  watch(deps.showBatchPicker, (open) => {
    if (open) syncBatchPresetDefaults()
  })

  function shortBatchDomain(entityId: string) {
    const d = getEntityDomain(entityId)
    if (d === 'binary_sensor') return 'binary'
    if (d === 'alarm_control_panel') return 'alarm'
    if (d === 'media_player') return 'media'
    if (d === 'input_boolean') return 'in_bool'
    if (d === 'input_select') return 'in_sel'
    if (d === 'input_number') return 'in_num'
    return d.length > 7 ? d.slice(0, 6) : d
  }

  function batchEntityLabel(e: { entity_id: string; name?: string }) {
    const name = (e.name || '').trim()
    if (name && name !== e.entity_id) return name
    return e.entity_id.split('.').slice(1).join('.') || e.entity_id
  }

  function selectAllFiltered() {
    deps.selectedBatchIds.value = filteredBatchEntities.value.map((e) => e.entity_id)
  }

  function clearBatchSelection() {
    deps.selectedBatchIds.value = []
  }

  function toggleBatchEntity(e: { entity_id: string }) {
    const idx = deps.selectedBatchIds.value.indexOf(e.entity_id)
    if (idx >= 0) deps.selectedBatchIds.value.splice(idx, 1)
    else deps.selectedBatchIds.value.push(e.entity_id)
  }

  function applyBatch() {
    if (deps.selectedBatchIds.value.length === 0) return
    const existing = new Set(
      (deps.entities.value || [])
        .map((e) => String(e.entityId || '').trim())
        .filter(Boolean),
    )
    const batch = {
      state: deps.batchState.value,
      brightness: deps.batchBrightness.value,
      colorTemp: deps.batchColorTemp.value,
      rgbColor: deps.batchRgbColor.value || '',
      transition: deps.batchTransition.value,
      effect: deps.batchEffect.value || '',
      position: deps.batchPosition.value,
      temperature: deps.batchTemperature.value,
      hvacMode: deps.batchHvacMode.value || '',
      volume: deps.batchVolume.value,
      source: deps.batchSource.value || '',
      fanPercentage: deps.batchFanPercentage.value,
      option: deps.batchOption.value || '',
      value: deps.batchValue.value,
      humidity: deps.batchHumidity.value,
      code: deps.batchCode.value || '',
      fanSpeed: deps.batchFanSpeed.value || '',
    }
    let added = 0
    let skipped = 0
    for (const eid of deps.selectedBatchIds.value) {
      if (existing.has(eid)) {
        skipped += 1
        continue
      }
      const ent = applyBatchParamsToSceneEntity(eid, batch, deps.newEntityDefaults())
      deps.entities.value.push(ent)
      existing.add(eid)
      added += 1
    }
    deps.selectedBatchIds.value = []
    deps.batchState.value = 'on'
    deps.batchBrightness.value = null
    deps.batchColorTemp.value = null
    deps.batchRgbColor.value = ''
    deps.batchTransition.value = null
    deps.batchEffect.value = ''
    deps.batchPosition.value = null
    deps.batchTemperature.value = null
    deps.batchHvacMode.value = ''
    deps.batchVolume.value = null
    deps.batchSource.value = ''
    deps.batchFanPercentage.value = null
    deps.batchOption.value = ''
    deps.batchValue.value = null
    deps.batchHumidity.value = null
    deps.batchCode.value = ''
    deps.batchFanSpeed.value = ''
    deps.batchFilter.value = ''
    deps.batchDomain.value = ''
    deps.showBatchPicker.value = false
    deps.resultMsg.value =
      skipped > 0
        ? `已批量添加 ${added} 个实体（跳过 ${skipped} 个已存在）`
        : `已批量添加 ${added} 个实体`
    deps.resultOk.value = true
    deps.dismissAfter(2000)
  }

  return {
    batchCommonOnly,
    enrichedBatchEntities,
    selectedBatchSet,
    batchDomains,
    presetDomain,
    showAdvancedPresets,
    showPresetBar,
    selectAllFiltered,
    clearBatchSelection,
    toggleBatchEntity,
    applyBatch,
  }
}
