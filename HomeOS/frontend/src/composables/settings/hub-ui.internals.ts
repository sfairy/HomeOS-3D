/**
 * 设置面板 Hub UI 组合式函数
 * 
 * 所属模块：设置 - 通用组合式函数
 * 职责：提供设置面板中各类 Hub 的 UI 相关组合式函数，包括路由同步、环境传感器映射、
 *       收藏夹管理、草稿保存等功能
 * 依赖：
 *   - ../system/composables/system-config.internals - 系统配置错误处理
 *   - ./env-sensor-map.internals - 环境传感器映射
 *   - ./pending.internals - 未保存更改管理
 *   - ./hub-viewport.internals - 视口相关功能
 *   - Vue / vue-router - 响应式与路由
 */
import { handleSystemConfigPatchError } from '@/composables/config/system-config-core.internals'
import { flushWeatherEffectsIfDirty } from './hub-backup-orchestrator.internals'
import { getEnvSensorFields, useEnvSensorMap } from './env-sensor-map.internals'
import { useRegisterSettingsTabPending, useSettingsHubPending } from './pending.internals'
import { useSettingsSidebarReentryReset } from '@/composables/ui/hub-viewport.internals'
import { countQuickActionBatteryLow, countQuickActionClimateActive, countQuickActionDomainActive, countQuickActionLightsOn, countQuickActionOffline } from '@/utils/device/group-counts.util'
import { useEntitiesStore } from '@/stores/entities.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import { downloadBlob } from '@/utils/core/misc.util'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import { notifyError } from '@/services/notify'
import { buildFavoritesRecommendations } from '@/utils/recommend/favorites-recommend.util'
import type { FavoriteCategoryMeta } from '@/utils/registry/favorites-categories.config'
import { FAVORITE_CATEGORIES, FAVORITE_CATEGORY_GROUPS, FAVORITE_CATEGORY_MAP } from '@/utils/registry/favorites-categories.config'
import { envRoomTabEmoji } from '@/utils/settings/tab-emoji.util'
import { clonePlain } from '@/utils/core/clone-plain.util'
import type { ComputedRef, Ref } from 'vue'
import { computed, nextTick, onMounted, ref, unref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

type QuickActionEntities = Parameters<typeof countQuickActionLightsOn>[0]
type QuickActionUi = Parameters<typeof countQuickActionLightsOn>[1]

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

// ── useSettingsEnvHub ──
type SettingsEnvHubTabId = 'rooms' | 'env-health'

/** rooms / env-health 共享 pending 基线，避免双 Tab 各自快照导致状态不一致 */
const sharedEnvSnapshot = ref<Record<string, unknown> | null>(null)

interface UseSettingsEnvHubOptions {
  tabId: SettingsEnvHubTabId
  activeTab: () => string
  saveSuccessMessage: string
}

/** useSettingsEnvHub：函数，按签名入参返回处理结果。 */
export function useSettingsEnvHub(options: UseSettingsEnvHubOptions) {
  const { tabId, activeTab, saveSuccessMessage } = options
  const chrome = useChromeStore()
  const entitiesStore = useEntitiesStore()
  const roomsSection = ref('catalog')
  const bindingsEnvTab = ref('rooms')
  const envRoomTab = ref('')

  const envSensorFieldList = computed(() =>
    Object.values(getEnvSensorFields()).map((f) => ({
      ...f,
      shortLabel:
        f.key === 'temperature'
          ? '温度'
          : f.key === 'humidity'
            ? '湿度'
            : f.key === 'pm25'
              ? 'PM2.5'
              : f.key === 'co2'
                ? 'CO₂'
                : 'TVOC',
    })),
  )

  const {
    sensorMap,
    roomList: envRoomList,
    loading: envLoading,
    saving: envSaving,
    load: loadEnvMap,
    save: saveEnvMap,
    applyInference,
    removeRoom: removeEnvRoom,
    restoreHiddenRooms,
    hiddenRoomCount,
    exportCsv: exportEnvCsvFn,
    importCsv: importEnvCsvFn,
    refreshHaAreas,
    registryDegraded,
    registryError,
  } = useEnvSensorMap()

  const {
    pendingCount: envPendingChanges,
    takeSnapshot: takeEnvSnapshot,
    confirmAndRevert,
    runHubMount,
  } = useSettingsHubPending({
    snapshot: sharedEnvSnapshot,
    current: () => sensorMap.value,
    ready: () => sharedEnvSnapshot.value != null,
  })

  useRegisterSettingsTabPending(tabId, () => envPendingChanges.value > 0)

  const bindingsEnvTabs = computed(() => [
    {
      id: 'rooms',
      label: '房间传感器',
      emoji: '📍',
      accent: '#34d399',
      count: envRoomList.value.length || undefined,
    },
    { id: 'io', label: '导入导出', emoji: '✨', accent: '#fbbf24' },
  ])

  const envRoomTabs = computed(() =>
    envRoomList.value.map((room) => ({
      id: room.id,
      label: sensorMap.value[room.id]?.label?.trim() || room.defaultLabel,
      emoji: envRoomTabEmoji(room.id),
      accent: room.fixed ? '#34d399' : '#38bdf8',
    })),
  )

  const activeEnvRoom = computed(() => envRoomList.value.find((r) => r.id === envRoomTab.value))

  const roomsSubnavSections = computed(() => [
    {
      id: 'catalog',
      label: '房间目录',
      emoji: '📋',
      accent: '#34d399',
      badge: envRoomList.value.length || '',
    },
    {
      id: 'mobile',
      label: '竖屏房间',
      emoji: '📱',
      accent: '#a78bfa',
    },
    { id: 'scopes', label: '应用范围', emoji: '🔗', accent: '#38bdf8' },
  ])

  watch(envRoomTabs, (tabs) => {
    if (!tabs.length) {
      if (envRoomTab.value) envRoomTab.value = ''
      return
    }
    if (!tabs.some((t) => t.id === envRoomTab.value)) {
      envRoomTab.value = tabs[0].id
    }
  })

  function focusEnvRoomTab(roomId: string | undefined) {
    const tabs = envRoomList.value
    if (!tabs.length) {
      envRoomTab.value = ''
      return
    }
    if (roomId && tabs.some((t) => t.id === roomId)) {
      envRoomTab.value = roomId
      return
    }
    envRoomTab.value = tabs[0].id
  }

  function resetEnvHubTabs() {
    if (tabId === 'rooms') roomsSection.value = 'catalog'
    bindingsEnvTab.value = 'rooms'
    focusEnvRoomTab(envRoomList.value[0]?.id)
  }

  useSettingsSidebarReentryReset(activeTab, tabId, resetEnvHubTabs)

  function snapshotEnvConfig() {
    takeEnvSnapshot(sensorMap.value)
  }

  async function handleRemoveEnvRoom(roomId: string | undefined) {
    const room = envRoomList.value.find((r) => r.id === (roomId || activeEnvRoom.value?.id))
    if (!room) return
    const label = sensorMap.value[room.id]?.label?.trim() || room.defaultLabel
    const ok = await chrome.confirm(
      `确定隐藏房间「${label}」？隐藏后可通过「恢复隐藏」找回，传感器绑定会保留。`,
      '隐藏房间',
      { confirmText: '隐藏', type: 'danger' },
    )
    if (!ok) return
    const removedId = room.id
    const removedIdx = envRoomList.value.findIndex((r) => r.id === removedId)
    if (!removeEnvRoom(removedId)) return
    await nextTick()
    const tabs = envRoomList.value
    if (!tabs.length) {
      envRoomTab.value = ''
    } else {
      const nextIdx = Math.min(removedIdx >= 0 ? removedIdx : 0, tabs.length - 1)
      envRoomTab.value = tabs[nextIdx].id
    }
    chrome.notify(`已隐藏房间「${label}」`, 'info')
  }

  function handleRestoreHiddenRooms() {
    const n = restoreHiddenRooms()
    if (!n) {
      chrome.notify('没有可恢复的隐藏房间', 'info')
      return
    }
    focusEnvRoomTab(envRoomList.value[0]?.id)
    chrome.notify(`已恢复 ${n} 个隐藏房间`, 'success')
  }

  function inferEnvMap() {
    const { matchedCount } = applyInference(entitiesStore.entities)
    chrome.notify(
      matchedCount
        ? `智能推断完成，已自动匹配 ${matchedCount} 个实体（含环境传感器与快捷规则设备），请核对后保存`
        : '未找到可匹配的实体，可尝试检查实体的 area_id 或 device_class 属性',
      matchedCount ? 'success' : 'info',
    )
  }

  function exportEnvCsv() {
    const blob = new Blob([exportEnvCsvFn()], { type: 'text/csv;charset=utf-8' })
    downloadBlob(blob, `env-sensors-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  async function onEnvCsvFile(ev: Event) {
    const input = ev.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    try {
      const n = importEnvCsvFn(await file.text())
      chrome.notify(`已导入 ${n} 个房间映射，请核对后保存`, 'success')
    } catch (e) {
      chrome.notify((e as { message?: string })?.message || 'CSV 解析失败', 'error')
    }
  }

  async function cancelEnvChanges() {
    await confirmAndRevert(chrome, (baseline) => {
      const next = clonePlain(baseline || {})
      for (const key of Object.keys(sensorMap.value)) {
        delete sensorMap.value[key]
      }
      Object.assign(sensorMap.value, next)
      focusEnvRoomTab(envRoomList.value[0]?.id)
    })
  }

  async function saveEnvMapWithNotify() {
    const ok = await saveEnvMap()
    if (ok) snapshotEnvConfig()
    chrome.notify(ok ? saveSuccessMessage : '保存失败，请稍后重试', ok ? 'success' : 'error')
    return ok
  }

  runHubMount({
    mountKey: 'env-hub',
    syncLayout: 'first-only',
    init: async () => {
      await loadEnvMap()
      focusEnvRoomTab(envRoomTab.value)
    },
    afterMount: () => {
      if (sharedEnvSnapshot.value == null) {
        snapshotEnvConfig()
      }
    },
  })

  async function refreshHaAreasFromHa() {
    const count = await refreshHaAreas()
    chrome.notify(
      count ? `已同步 ${count} 个 HA 区域` : '未能获取 HA 区域列表',
      count ? 'success' : 'warning',
    )
  }

  return {
    roomsSection,
    bindingsEnvTab,
    envRoomTab,
    envLoading,
    envSaving,
    envPendingChanges,
    envRoomList,
    bindingsEnvTabs,
    envRoomTabs,
    activeEnvRoom,
    sensorMap,
    envSensorFieldList,
    roomsSubnavSections,
    hiddenRoomCount,
    handleRemoveEnvRoom,
    handleRestoreHiddenRooms,
    inferEnvMap,
    exportEnvCsv,
    onEnvCsvFile,
    saveEnvMapWithNotify,
    cancelEnvChanges,
    refreshHaAreas: refreshHaAreasFromHa,
    registryDegraded,
    registryError,
  }
}

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

/** useFavoritesHub：函数，按签名入参返回处理结果。 */
export function useFavoritesHub() {
  const entitiesStore = useEntitiesStore()
  const layoutStore = useLayoutStore()
  const filter = ref<FavoriteFilter>('all')

  const floors = computed(() => layoutStore.layoutConfig.floors || [])
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
        floors,
        quickActionStats.value,
      )
      return n > 0 ? { label: '开', count: n } : { label: '', count: 0 }
    }
    if (domain === 'climate') {
      const n = countQuickActionClimateActive(
        entitiesStore as unknown as QuickActionEntities,
        layoutStore as unknown as QuickActionUi,
        floors,
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
        floors,
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
        floors,
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

/** useDraftObjectField：函数，按签名入参返回处理结果。 */
export function useDraftObjectField<T extends Record<string, unknown>>(
  getDraft: () => T,
): {
  field<K extends keyof T>(key: K): ComputedRef<T[K]>
} {
  return {
    field(key) {
      return computed({
        get: () => getDraft()[key],
        set: (val) => {
          getDraft()[key] = val
        },
      })
    },
  }
}

// ── useSettingsSave ──
/** useSettingsSave：函数，按签名入参返回处理结果。 */
export function useSettingsSave() {
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()
  const saving = ref(false)

  async function runSave(
    fn: () => unknown | Promise<unknown>,
    {
      errorContext,
      onError,
    }: { errorContext?: string; onError?: (error: unknown) => unknown | Promise<unknown> } = {},
  ) {
    saving.value = true
    try {
      return await fn()
    } catch (e) {
      if (await handleSystemConfigPatchError(e, chrome)) {
        if (onError) await onError(e)
        return false
      }
      if (onError) {
        await onError(e)
        return false
      }
      notifyError(e, errorContext || '保存设置')
      return false
    } finally {
      saving.value = false
    }
  }

  async function onSave(options?: { errorContext?: string; onError?: (error: unknown) => void }) {
    return runSave(async () => {
      const ok = await layoutStore.saveConfig()
      // saveConfig 失败时已 toast 并返回 false（不抛异常）
      if (!ok) return false
      // General 页天气特效与 layout 分库：侧栏保存时一并 flush
      return flushWeatherEffectsIfDirty()
    }, options)
  }

  return { saving, onSave, runSave }
}
