/**
 * @file security-modes-extras.internals.ts
 * @module frontend/src/views
 */
/** 安防：全屋断电等扩展 */
import type { Component } from 'vue'
import { computed, onMounted, ref, watch } from 'vue'
import { pauseGlobalPendingChanges, resumeGlobalPendingChanges, syncGlobalLayoutPendingSnapshot } from '@/composables/settings-kernel/pending.internals'
import { createDefaultWholeHomeOff } from '@/shared/constants/whole-home-off'
import { fetchAdvisorForgotten } from '@/services/api/system'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import type { RecommendChip } from '@/shared/recommend/types/recommend.types'
import { buildWholeHomeOffRecommendations } from '@/shared/recommend/utils/whole-home-off-recommend.util'
import { Blinds, Fan, Lightbulb, ToggleRight } from '@lucide/vue'

// ── useWholeHomeOffSection ──
type WholeHomeOffDomainKey = 'lights' | 'covers' | 'climate' | 'switches'

interface DomainCard {
  key: WholeHomeOffDomainKey
  label: string
  icon: Component
  tone: 'amber' | 'sky' | 'cyan' | 'violet'
}

const domainCards: DomainCard[] = [
  { key: 'lights', label: '灯光', icon: Lightbulb, tone: 'amber' },
  { key: 'covers', label: '窗帘', icon: Blinds, tone: 'violet' },
  { key: 'climate', label: '空调/风扇', icon: Fan, tone: 'cyan' },
  { key: 'switches', label: '开关', icon: ToggleRight, tone: 'sky' },
]

export function useWholeHomeOffSection() {
  const layoutStore = useLayoutStore()
  const wholeHomeOff = computed(() => layoutStore.layoutConfig.wholeHomeOff)

  const entityDomains = ['light', 'cover', 'climate', 'fan', 'switch'] as const

  const enabledDomainCount = computed(
    () => domainCards.filter((d) => wholeHomeOff.value[d.key]).length,
  )

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


export { useHazardBindingsSection } from '@/features/settings/composables/automate/security-modes-hazard.internals'
