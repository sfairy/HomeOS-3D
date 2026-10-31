/**
 * @file alert-rules-recommend.internals.ts
 * @module frontend/src/features/settings/interact/composables
 */
/** 告警规则：基于事件日志的推荐芯片 */

import { computed, onMounted } from 'vue'
import { useEventLogStats } from '@/shared/recommend/composables/useEventLogStats'
import { buildAlertRulesRecommendations } from '@/shared/recommend/utils/alert-rules-recommend.util'
import type { RecommendChip } from '@/shared/recommend/types/recommend.types'

export function useAlertRulesRecommend(
  existingEntityIds: () => Set<string>,
  addEntityTtsAlert: (entityId: string) => boolean,
) {
  const { statsLoading, eventStats, loadStats } = useEventLogStats()

  const recommendations = computed(() =>
    buildAlertRulesRecommendations({
      stats: eventStats.value,
      existingEntityIds: existingEntityIds(),
    }),
  )

  function applyChip(chip: RecommendChip) {
    const entityId = String(chip.payload?.entityId || '').trim()
    if (!entityId) return
    addEntityTtsAlert(entityId)
  }

  function applyAll() {
    const chips = (recommendations.value.groups || []).flatMap((group) => group.chips)
    for (const chip of chips) applyChip(chip)
  }

  onMounted(() => {
    void loadStats()
  })

  return {
    statsLoading,
    recommendations,
    applyChip,
    applyAll,
    refresh: loadStats,
  }
}
