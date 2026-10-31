/**
 * @file bindings-recommend.internals.ts
 * @module frontend/src/features/settings/connect/composables
 */
/** 绑定设置：缺口推荐 */

import { computed, toRaw } from 'vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useChromeStore } from '@/stores/chrome.store'
import { systemConfigRef } from '@/composables/config/system-config-core.internals'
import { ACCOUNT_BINDING_SOURCE_LABELS } from '@/shared/constants/account-binding-meta'
import type { RecommendChip } from '@/shared/recommend/types/recommend.types'
import type { BindingGapItem } from '@homeos/shared'
import { collectBindingGaps, filterBindingGapsBySection, getEntityDomain } from '@homeos/shared'
import {
  buildBindingsRecommendations,
  collectBoundHazardIds,
  type BindingsRecommendEntity,
  type BindingsRecommendSection,
} from '@/shared/recommend/utils/bindings-recommend.util'

// ── useBindingsRecommend ──
export function useBindingsRecommend(serverGaps: () => BindingGapItem[]) {
  const entitiesStore = useEntitiesStore()
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()

  const bindingGapItems = computed(() => {
    const layout = layoutStore.layoutConfig
    const local = collectBindingGaps({
      haConfig: layout.haConfig || {},
      statsSensors: layout.statsSensors || {},
      envSensorMap: systemConfigRef.value?.envSensorMap || {},
      dashboardFooterItems: layout.dashboardFooter?.items,
      formatEnergyLabel: (cat) => ACCOUNT_BINDING_SOURCE_LABELS[cat] || cat,
    })
    const merged = new Map<string, BindingGapItem>()
    for (const gap of [...serverGaps(), ...local]) {
      if (gap?.id) merged.set(gap.id, gap)
    }
    return [...merged.values()]
  })

  /**
   * 危险传感器候选实体：buildBindingsRecommendations 只在危险分节消费 entities，
   * 且自身按 domain 过滤 binary_sensor，因此这里预过滤可保持 chips 完全一致。
   * 读取 toRaw 快照避免逐键响应式依赖；失效源为 binary_sensor 域 epoch ——
   * 该域任意实体的状态/属性变更与增删都会在 patchDerivedChanges 同步递增。
   */
  const hazardCandidateEntities = computed<BindingsRecommendEntity[]>(() => {
    void entitiesStore.getDomainEpoch('binary_sensor')
    const raw = toRaw(entitiesStore.entities)
    const out: BindingsRecommendEntity[] = []
    for (const ent of Object.values(raw)) {
      if (!ent) continue
      const entityId = String(ent.entity_id || '').trim()
      if (!entityId || getEntityDomain(entityId) !== 'binary_sensor') continue
      out.push({ entity_id: entityId, attributes: ent.attributes })
    }
    return out
  })

  /** 已绑定危险传感器集合：haConfig 数组原地 push 也会使该 computed 失效 */
  const boundHazardIds = computed(() => collectBoundHazardIds(layoutStore.layoutConfig.haConfig))

  type BindingsRecommendCacheEntry = {
    gaps: BindingGapItem[]
    bound: Set<string>
    entities: BindingsRecommendEntity[] | null
    result: ReturnType<typeof buildBindingsRecommendations>
  }
  const EMPTY_HAZARD_IDS = new Set<string>()
  const recommendCache = new Map<BindingsRecommendSection, BindingsRecommendCacheEntry>()

  function bindingGapItemsFor(section: BindingsRecommendSection) {
    return filterBindingGapsBySection(bindingGapItems.value, section)
  }

  function recommendationsFor(section: BindingsRecommendSection) {
    const includeHazardChips = section === 'overview' || section === 'security'
    const gaps = bindingGapItems.value
    // 非危险分节完全不读取实体集合：entities 变化不会触发这些分节重算
    const entities = includeHazardChips ? hazardCandidateEntities.value : null
    const bound = includeHazardChips ? boundHazardIds.value : EMPTY_HAZARD_IDS
    const cached = recommendCache.get(section)
    if (cached && cached.gaps === gaps && cached.entities === entities && cached.bound === bound) {
      return cached.result
    }
    const result = buildBindingsRecommendations({
      gaps,
      entities: entities ?? [],
      boundHazardIds: bound,
      section,
      includeGapChips: false,
      includeHazardChips,
    })
    recommendCache.set(section, { gaps, entities, bound, result })
    return result
  }

  /** 概览默认推荐（全量缺口 meta + 危险传感器 chips，不含缺口 chips） */
  const recommendations = computed(() => recommendationsFor('overview'))

  function applyChip(chip: Pick<RecommendChip, 'label' | 'payload'> & { route?: string }) {
    const kind = String(chip.payload?.kind || '')
    const entityId = String(chip.payload?.entityId || '').trim()
    if (!entityId || !kind) return false
    const hc = layoutStore.layoutConfig.haConfig
    const key =
      kind === 'smoke'
        ? 'hazardSmokeEntityIds'
        : kind === 'gas'
          ? 'hazardGasEntityIds'
          : 'hazardLeakEntityIds'
    if (!Array.isArray(hc[key])) hc[key] = []
    if (hc[key].includes(entityId)) return false
    hc[key].push(entityId)
    chrome.notify(`已添加 ${chip.label || entityId}`, 'success')
    return true
  }

  function applyAll() {
    const chips = (recommendationsFor('security').groups || [])
      .filter((g) => g.id === 'hazard-sensors')
      .flatMap((g) => g.chips)
    let added = 0
    for (const chip of chips) {
      if (applyChip(chip)) added++
    }
    if (added > 0) chrome.notify(`已添加 ${added} 个传感器绑定`, 'success')
  }

  return {
    bindingGapItems,
    bindingGapItemsFor,
    recommendations,
    recommendationsFor,
    applyChip,
    applyAll,
  }
}
