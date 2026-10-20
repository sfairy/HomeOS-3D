/**
 * @file hub-ui.internals.ts
 * @module frontend/src/views
 */
/** 设置面板 Hub UI：路由 section 同步与草稿字段 */
import type { ComputedRef, Ref } from 'vue'
import { computed, onMounted, unref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

// ── useSettingsHubRouteSection ──
interface HubSection {
  id: string
}

interface UseSettingsHubRouteSectionOptions {
  tabId?: string
  activeTab?: Ref<string | undefined> | (() => string | undefined) | string
  when?: () => boolean
  onApply?: (sec: string) => void | Promise<void>
}

/**
 * Hub 子导航与 URL ?section= 双向同步（支持 keep-alive 与跨 Tab 深链）
 */
export function useSettingsHubRouteSection(
  sectionRef: Ref<string>,
  sectionsSource: Ref<HubSection[] | undefined> | HubSection[],
  { tabId, activeTab, when, onApply }: UseSettingsHubRouteSectionOptions = {},
) {
  const route = useRoute()
  const router = useRouter()
  let syncingFromRoute = false

  function resolveActiveTab() {
    if (activeTab != null) {
      const value = typeof activeTab === 'function' ? activeTab() : unref(activeTab)
      if (value != null && value !== '') return value
    }
    const tab = route.query.tab
    return typeof tab === 'string' ? tab : undefined
  }

  function sectionIds() {
    const sections = unref(sectionsSource)
    return new Set((sections || []).map((s) => s.id))
  }

  function isOnSettingsRoute() {
    return route.name === 'settings' || route.path === '/settings'
  }

  async function applyFromRoute() {
    if (!isOnSettingsRoute()) return
    if (when && !when()) return
    if (tabId && resolveActiveTab() !== tabId) return
    const sec = route.query.section
    if (typeof sec !== 'string' || !sectionIds().has(sec)) return
    syncingFromRoute = true
    try {
      if (onApply) {
        await onApply(sec)
      } else {
        sectionRef.value = sec
      }
    } finally {
      syncingFromRoute = false
    }
  }

  function syncSectionToRoute(sec: string) {
    if (syncingFromRoute) return
    // keep-alive 停用后 watch 仍可能触发；禁止把 settings query 写到 /devices、/security 等
    if (!isOnSettingsRoute()) return
    if (when && !when()) return
    if (tabId && resolveActiveTab() !== tabId) return
    const ids = sectionIds()
    if (!ids.has(sec)) return
    const current = typeof route.query.section === 'string' ? route.query.section : ''
    if (current === sec) return
    const nextTab =
      tabId ||
      (typeof route.query.tab === 'string' && route.query.tab ? route.query.tab : undefined)
    router.replace({
      path: '/settings',
      query: {
        ...route.query,
        ...(nextTab ? { tab: nextTab } : {}),
        section: sec,
      },
    })
  }

  watch(() => route.query.section, applyFromRoute)
  watch(
    () => [resolveActiveTab(), route.query.section],
    ([tab]) => {
      if (tab === tabId) applyFromRoute()
    },
  )
  watch(sectionRef, (sec) => {
    if (typeof sec === 'string' && sec) syncSectionToRoute(sec)
  })
  onMounted(applyFromRoute)
}

export function useDraftObjectField<T extends Record<string, unknown>>(
  getDraft: () => T,
): {
  field<K extends keyof T>(key: K): ComputedRef<T[K]>
} {
  return {
    field(key) {
      return computed({
        get: () => getDraft()[key],
        set: (nextValue) => {
          getDraft()[key] = nextValue
        },
      })
    },
  }
}

// ── useSettingsSave ──
// 已下沉至 @/composables/settings-kernel/save.internals（绑 useLayoutStore，无法进 shared，
// 且需被 features/home-mode 等「内嵌编辑面板」域平等共用，故落跨层池）。
// 请从新路径导入：import { useSettingsSave } from '@/composables/settings-kernel/save.internals'

export { useSettingsEnvHub } from '@/features/settings/composables/hub-env.internals'
export { useFavoritesHub } from '@/features/settings/composables/hub-favorites.internals'
