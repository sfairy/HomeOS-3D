/**
 * @file security-modes-emergency.internals.ts
 * @module frontend/src/views
 */
/** 安防模式：紧急场景配置 */
import { getEmergencyPresets, normalizeSecurityEmergency } from '@/shared/constants/security-emergency'
import { useEntitiesStore } from '@/stores/entities.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import { domainIndexToArray, getEntityDisplayName } from '@/shared/entity/utils/derived.util'
import { sliderTrackStyle } from '@/shared/utils/ui/progress-bar.util'
import { computed, ref } from 'vue'

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
