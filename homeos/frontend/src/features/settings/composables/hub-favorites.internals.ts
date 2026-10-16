/**
 * @file hub-favorites.internals.ts
 * @module frontend/src/views
 */
/** 收藏 Hub */
import { countQuickActionBatteryLow, countQuickActionClimateActive, countQuickActionDomainActive, countQuickActionLightsOn, countQuickActionOffline } from '@/composables/device/group-counts.util'
import { useEntitiesStore } from '@/stores/entities.store'
import { useLayoutStore } from '@/stores/layout.store'
import { getEntityDisplayName } from '@/shared/entity/utils/derived.util'
import { buildFavoritesRecommendations } from '@/shared/recommend/utils/favorites-recommend.util'
import type { FavoriteCategoryMeta } from '@/shared/utils/registry/favorites-categories.config'
import { FAVORITE_CATEGORIES, FAVORITE_CATEGORY_GROUPS, FAVORITE_CATEGORY_MAP } from '@/shared/utils/registry/favorites-categories.config'
import { computed, ref } from 'vue'

type QuickActionEntities = Parameters<typeof countQuickActionLightsOn>[0]
type QuickActionUi = Parameters<typeof countQuickActionLightsOn>[1]

// ── useFavoritesHub ──
type FavoriteFilter = 'all' | 'configured' | 'empty'

interface FavoriteCategoryView extends FavoriteCategoryMeta {
  count: number
  configured: boolean
  liveLabel: string
  liveCount: number
  previewNames: string[]
}

function favoriteIdsForDomain(fe: Record<string, string[] | undefined>, domain: string): string[] {
  if (domain === 'offline') {
    return [...new Set([...(fe.offline || []), ...(fe.other || [])])]
  }
  return fe[domain] || []
}

export function useFavoritesHub() {
  const entitiesStore = useEntitiesStore()
  const layoutStore = useLayoutStore()
  const filter = ref<FavoriteFilter>('all')

  const statsSensors = computed(() => layoutStore.layoutConfig.statsSensors || {})
  const quickActionStats = computed(() => {
    const s = statsSensors.value
    return { lights: s.lights, climates: s.climates, battery: s.battery, offline: s.offline }
  })

  function favoriteCount(domain: string) {
    const fe = layoutStore.layoutConfig.favoriteEntities || {}
    return favoriteIdsForDomain(fe, domain).length
  }

  function resolveLiveStat(domain: string, count: number): { label: string; count: number } {
    if (domain === 'battery' || domain === 'offline') void entitiesStore.derivedEpoch
    else void entitiesStore.getDomainEpoch(domain)
    if (count === 0) return { label: '', count: 0 }

    if (domain === 'light') {
      const n = countQuickActionLightsOn(
        entitiesStore as unknown as QuickActionEntities,
        layoutStore as unknown as QuickActionUi,
        quickActionStats.value,
      )
      return n > 0 ? { label: '开', count: n } : { label: '', count: 0 }
    }
    if (domain === 'climate') {
      const n = countQuickActionClimateActive(
        entitiesStore as unknown as QuickActionEntities,
        layoutStore as unknown as QuickActionUi,
        quickActionStats.value,
      )
      return n > 0 ? { label: '运行', count: n } : { label: '', count: 0 }
    }
    if (domain === 'battery') {
      const n = countQuickActionBatteryLow(
        entitiesStore as unknown as QuickActionEntities,
        layoutStore as unknown as QuickActionUi,
      )
      return n > 0 ? { label: '低电量', count: n } : { label: '', count: 0 }
    }
    if (domain === 'offline') {
      const n = countQuickActionOffline(
        entitiesStore as unknown as QuickActionEntities,
        layoutStore as unknown as QuickActionUi,
        quickActionStats.value,
      )
      return n > 0 ? { label: '离线', count: n } : { label: '', count: 0 }
    }

    const meta = FAVORITE_CATEGORY_MAP[domain]
    if (meta?.activeStates?.length) {
      const n = countQuickActionDomainActive(
        domain,
        meta.activeStates,
        entitiesStore as unknown as QuickActionEntities,
        layoutStore as unknown as QuickActionUi,
        quickActionStats.value,
      )
      const labelMap: Record<string, string> = {
        switch: '开',
        cover: '开',
        media_player: '播放',
        fan: '运行',
        lock: '未锁',
      }
      return n > 0 ? { label: labelMap[domain] || '活跃', count: n } : { label: '', count: 0 }
    }
    return { label: '', count: 0 }
  }

  function previewNames(domain: string, limit = 3): string[] {
    void entitiesStore.getDomainEpoch(domain)
    const fe = layoutStore.layoutConfig.favoriteEntities || {}
    const ids = favoriteIdsForDomain(fe, domain).slice(0, limit)
    return ids.map((id) => {
      const ent = entitiesStore.entities[id]
      const name = getEntityDisplayName(id, ent)
      return name.length > 12 ? `${name.slice(0, 11)}…` : name
    })
  }

  const categoryViews = computed<FavoriteCategoryView[]>(() =>
    FAVORITE_CATEGORIES.map((cat) => {
      const count = favoriteCount(cat.id)
      const live = resolveLiveStat(cat.id, count)
      return {
        ...cat,
        count,
        configured: count > 0,
        liveLabel: live.label,
        liveCount: live.count,
        previewNames: previewNames(cat.id),
      }
    }),
  )

  const filteredCategories = computed(() => {
    if (filter.value === 'configured') return categoryViews.value.filter((c) => c.configured)
    if (filter.value === 'empty') return categoryViews.value.filter((c) => !c.configured)
    return categoryViews.value
  })

  const totalFavoriteCount = computed(() =>
    categoryViews.value.reduce((sum, cat) => sum + cat.count, 0),
  )

  const configuredCategoryCount = computed(
    () => categoryViews.value.filter((c) => c.configured).length,
  )

  const completionPct = computed(() =>
    Math.round((configuredCategoryCount.value / FAVORITE_CATEGORIES.length) * 100),
  )

  const recommendations = computed(() =>
    buildFavoritesRecommendations({
      stats: null,
      favoriteEntities: layoutStore.layoutConfig.favoriteEntities || {},
    }),
  )

  function addRecommendedEntity(entityId: string, domain: string) {
    const fe = layoutStore.layoutConfig.favoriteEntities || {}
    if (!Array.isArray(fe[domain])) fe[domain] = []
    if (!fe[domain]!.includes(entityId)) fe[domain]!.push(entityId)
  }

  function applyRecommendationChip(chip: { payload?: Record<string, unknown> }) {
    const entityId = String(chip.payload?.entityId || '').trim()
    const domain = String(chip.payload?.domain || '').trim()
    if (entityId && domain) addRecommendedEntity(entityId, domain)
  }

  function applyAllRecommendations() {
    for (const group of recommendations.value.groups || []) {
      for (const chip of group.chips) applyRecommendationChip(chip)
    }
  }

  return {
    filter,
    categoryViews,
    filteredCategories,
    totalFavoriteCount,
    configuredCategoryCount,
    completionPct,
    recommendations,
    applyRecommendationChip,
    applyAllRecommendations,
    categoryGroupSummary: Object.values(FAVORITE_CATEGORY_GROUPS).join(' · '),
  }
}

