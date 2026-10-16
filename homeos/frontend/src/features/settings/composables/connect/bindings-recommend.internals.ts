/**
 * @file bindings-recommend.internals.ts
 * @module frontend/src/features/settings/composables/connect
 */
/** 绑定设置：缺口推荐 */

import { computed } from 'vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useChromeStore } from '@/stores/chrome.store'
import { systemConfigRef } from '@/composables/config/system-config-core.internals'
import { ACCOUNT_BINDING_SOURCE_LABELS } from '@/shared/constants/account-binding-meta'
import type { RecommendChip } from '@/shared/recommend/types/recommend.types'
import type { BindingGapItem } from '@homeos/shared'
import { collectBindingGaps, filterBindingGapsBySection } from '@homeos/shared'
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

  const recommendEntities = computed(() =>
    Object.values(entitiesStore.entities).flatMap((ent): BindingsRecommendEntity[] => {
      const entityId = String(ent?.entity_id || '').trim()
      return entityId ? [{ entity_id: entityId, attributes: ent?.attributes }] : []
    }),
  )

  function bindingGapItemsFor(section: BindingsRecommendSection) {
    return filterBindingGapsBySection(bindingGapItems.value, section)
  }

  function recommendationsFor(section: BindingsRecommendSection) {
    return buildBindingsRecommendations({
      gaps: bindingGapItems.value,
      entities: recommendEntities.value,
      boundHazardIds: collectBoundHazardIds(layoutStore.layoutConfig.haConfig),
      section,
      includeGapChips: false,
      includeHazardChips: section === 'overview' || section === 'security',
    })
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
