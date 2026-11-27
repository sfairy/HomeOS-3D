import { exportSystemConfig, importSystemConfig } from '@/kernel/http/index'
import { useAuthStore } from '@/domain/auth/auth.store'
import { useChromeStore } from '@/kernel/ui/chrome/chrome-store'
import { useLayoutStore } from '@/domain/layout/store/layout.store'
import { reloadFrontendConfig } from '@/kernel/config/frontend-config'
import { downloadBlob } from '@/kernel/core/misc'
import { getApiErrorMessage } from '@/kernel/core/error-message'
import type { NotifyType } from '@/kernel/notify'
import {
  getIndependentPendingTabIds,
  globalLayoutPendingCount,
  useRegisterSettingsTabPending,
  useSettingsHubPending,
} from '@/features/settings/kernel/pending.internals'
import { tabLabel } from '@/kernel/registry/settings-nav'
import { ref, computed, nextTick, watch, type ComputedRef, type Ref, onMounted, unref } from 'vue'
import { getEnvSensorFields, useEnvSensorMap } from '@/features/settings/shared/env-sensor-map'
import { useSettingsSidebarReentryReset } from '@/kernel/ui/hub-viewport'
import { useEntitiesStore } from '@/domain/entity/store/entities.store'
import { envRoomTabEmoji } from '@/kernel/settings'
import { clonePlain } from '@/kernel/core/clone-plain'
import {
  countQuickActionBatteryLow,
  countQuickActionClimateActive,
  countQuickActionDomainActive,
  countQuickActionLightsOn,
  countQuickActionOffline,
} from '@/domain/entity/utils/device-group'
import { getEntityDisplayName } from '@/domain/entity/derived'
import { buildFavoritesRecommendations } from '@/domain/recommend/favorites-recommend'
import {
  type FavoriteCategoryMeta,
  FAVORITE_CATEGORIES,
  FAVORITE_CATEGORY_GROUPS,
  FAVORITE_CATEGORY_MAP,
} from '@/kernel/registry/favorites-categories.config'
import { useRoute, useRouter } from 'vue-router'

/* ── 原 hub-backup-orchestrator.internals.ts 的实现 ── */
/** composables：配置与档案备份 */

// ── useAppConfigBackup ──
/** AppConfig 备份③：导出 / 导入（与 SystemConfigPanel 共用 API） */
export function useAppConfigBackup(options: { notify?: boolean } = {}) {
  const { notify = true } = options
  const chrome = useChromeStore()
  const appConfigExporting = ref(false)
  const appConfigImporting = ref(false)

  function tip(message: string, type: NotifyType, duration?: number) {
    if (notify) chrome.notify(message, type, duration)
  }

  async function exportAppConfig() {
    appConfigExporting.value = true
    try {
      const { data } = await exportSystemConfig()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      downloadBlob(blob, `homeos-appconfig-${new Date().toISOString().slice(0, 10)}.json`)
      tip('系统参数已导出', 'success')
      return true
    } catch (e) {
      tip(getApiErrorMessage(e, '系统参数导出失败'), 'error')
      return false
    } finally {
      appConfigExporting.value = false
    }
  }

  async function importAppConfigFromText(raw: unknown) {
    const text = String(raw || '').trim()
    if (!text) {
      tip('请选择备份文件或粘贴 JSON', 'warning')
      return false
    }
    appConfigImporting.value = true
    try {
      const payload = JSON.parse(text)
      const config = payload.config || payload
      const replace = await chrome.confirm(
        '选择「确定」= 全量替换（需 confirm）；「取消」= 合并更新已有分区',
        '系统参数导入',
        { type: 'danger' },
      )
      const body = replace
        ? { config, schemaVersion: payload.schemaVersion, mode: 'replace', confirm: true }
        : { config, schemaVersion: payload.schemaVersion, mode: 'merge' }
      await importSystemConfig(body)
      await reloadFrontendConfig()
      tip(replace ? '系统参数已全量导入' : '系统参数已合并导入', 'success', 5000)
      return replace ? 'replace' : 'merge'
    } catch (e) {
      const errorMessage = getApiErrorMessage(e, '')
      tip(typeof errorMessage === 'string' ? errorMessage.slice(0, 120) : '系统参数导入失败', 'error')
      return false
    } finally {
      appConfigImporting.value = false
    }
  }

  return {
    appConfigExporting,
    appConfigImporting,
    exportAppConfig,
    importAppConfigFromText,
  }
}

// ── useProfileManagement ──
/** 显示方案管理：新建 / 切换 / 删除（备份与还原由统一的「备份与恢复」入口承载）。 */
export function useProfileManagement() {
  const authStore = useAuthStore()
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()

  const showCreateProfile = ref(false)
  const newProfileName = ref<string>('')

  async function switchToProfile(id: string) {
    if (!authStore.isAuthenticated) return
    const name = id === 'default' ? '默认系统方案' : id
    // switchProfile 会重新拉取整份布局：未保存的全局布局改动与独立保存页的草稿都会丢失，
    // 确认框必须点名这件事，否则用户只会看到「切换后页面可能需要重新加载」。
    const pendingTabs = getIndependentPendingTabIds()
    const layoutPending = globalLayoutPendingCount.value
    const pendingParts: string[] = []
    if (layoutPending > 0) pendingParts.push(`全局布局 ${layoutPending} 项`)
    if (pendingTabs.length) pendingParts.push(`「${pendingTabs.map((t) => tabLabel(t)).join('、')}」`)
    const pendingHint = pendingParts.length
      ? `\n\n注意：当前有未保存的更改（${pendingParts.join('、')}），切换方案后这些修改将丢失。`
      : ''
    const confirmed = await chrome.confirm(
      `确定要切换到方案 "${name}" 吗？切换后页面可能需要重新加载。${pendingHint}`,
      '切换显示方案',
      pendingParts.length ? { type: 'danger', confirmText: '丢弃并切换', cancelText: '留在当前方案' } : undefined,
    )
    if (confirmed) {
      try {
        await layoutStore.switchProfile(id)
        chrome.notify(`已成功加载方案: ${name}`, 'success')
      } catch (e) {
        chrome.notify(getApiErrorMessage(e, '切换方案失败'), 'error')
      }
    }
  }

  async function onDeleteProfile(id: string) {
    const name = id === 'default' ? '默认系统方案' : id
    const confirmed = await chrome.confirm(`确定要彻底删除方案 "${name}" 吗？此操作不可撤销！`, '危险操作', {
      type: 'danger',
    })
    if (confirmed && authStore.isAuthenticated) {
      try {
        await layoutStore.deleteProfile(id)
        chrome.notify(`方案 ${name} 已被移除`, 'success')
      } catch (e) {
        chrome.notify(getApiErrorMessage(e, '删除方案失败'), 'error')
      }
    }
  }

  async function createNewProfile() {
    if (!newProfileName.value.trim()) {
      chrome.notify('请输入方案 ID', 'warning')
      return
    }
    if (authStore.isAuthenticated) {
      try {
        await layoutStore.createProfile(newProfileName.value.trim())
        newProfileName.value = ''
        showCreateProfile.value = false
      } catch (e) {
        chrome.notify(getApiErrorMessage(e, '创建方案失败'), 'error')
      }
    }
  }

  return {
    showCreateProfile,
    newProfileName,
    switchToProfile,
    onDeleteProfile,
    createNewProfile,
  }
}

/* ── 原 hub-env.internals.ts 的实现 ── */
/** rooms / env-health Hub */

// ── useSettingsEnvHub ──
type SettingsEnvHubTabId = 'rooms' | 'env-health'

/** rooms / env-health 共享 pending 基线，避免双 Tab 各自快照导致状态不一致 */
const sharedEnvSnapshot = ref<Record<string, unknown> | null>(null)

interface UseSettingsEnvHubOptions {
  tabId: SettingsEnvHubTabId
  activeTab: () => string
  saveSuccessMessage: string
}

export function useSettingsEnvHub(options: UseSettingsEnvHubOptions) {
  const { tabId, activeTab, saveSuccessMessage } = options
  const chrome = useChromeStore()
  const entitiesStore = useEntitiesStore()
  const roomsSection = ref('catalog')
  const bindingsEnvTab = ref('rooms')
  const envRoomTab = ref('')

  const envSensorFieldList = computed(() =>
    Object.values(getEnvSensorFields()).map((field) => ({
      ...field,
      shortLabel:
        field.key === 'temperature'
          ? '温度'
          : field.key === 'humidity'
            ? '湿度'
            : field.key === 'pm25'
              ? 'PM2.5'
              : field.key === 'co2'
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
    revertSilently: revertEnvSilently,
    runHubMount,
  } = useSettingsHubPending({
    snapshot: sharedEnvSnapshot,
    current: () => sensorMap.value,
    ready: () => sharedEnvSnapshot.value != null,
    applyBaseline: (baseline) => {
      const next = clonePlain(baseline || {})
      for (const key of Object.keys(sensorMap.value)) {
        delete sensorMap.value[key]
      }
      Object.assign(sensorMap.value, next)
    },
  })

  // 第三参数：确认离开后真正回滚房间映射草稿
  useRegisterSettingsTabPending(tabId, () => envPendingChanges.value > 0, revertEnvSilently)

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

  const activeEnvRoom = computed(() => envRoomList.value.find((room) => room.id === envRoomTab.value))

  const roomsSubnavSections = computed(() => [
    {
      id: 'catalog',
      label: '房间目录',
      emoji: '📋',
      accent: '#34d399',
      badge: envRoomList.value.length || '',
    },
    { id: 'scopes', label: '应用范围', emoji: '🔗', accent: '#38bdf8' },
  ])

  watch(envRoomTabs, (tabs) => {
    if (!tabs.length) {
      if (envRoomTab.value) envRoomTab.value = ''
      return
    }
    if (!tabs.some((tabEntry) => tabEntry.id === envRoomTab.value)) {
      envRoomTab.value = tabs[0].id
    }
  })

  function focusEnvRoomTab(roomId: string | undefined) {
    const tabs = envRoomList.value
    if (!tabs.length) {
      envRoomTab.value = ''
      return
    }
    if (roomId && tabs.some((tabEntry) => tabEntry.id === roomId)) {
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
    const room = envRoomList.value.find((candidateRoom) => candidateRoom.id === (roomId || activeEnvRoom.value?.id))
    if (!room) return
    const label = sensorMap.value[room.id]?.label?.trim() || room.defaultLabel
    const ok = await chrome.confirm(
      `确定隐藏房间「${label}」？隐藏后可通过「恢复隐藏」找回，传感器绑定会保留。`,
      '隐藏房间',
      { confirmText: '隐藏', type: 'danger' },
    )
    if (!ok) return
    const removedId = room.id
    const removedIdx = envRoomList.value.findIndex((roomEntry) => roomEntry.id === removedId)
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
    const restoredCount = restoreHiddenRooms()
    if (!restoredCount) {
      chrome.notify('没有可恢复的隐藏房间', 'info')
      return
    }
    focusEnvRoomTab(envRoomList.value[0]?.id)
    chrome.notify(`已恢复 ${restoredCount} 个隐藏房间`, 'success')
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
      const importedCount = importEnvCsvFn(await file.text())
      chrome.notify(`已导入 ${importedCount} 个房间映射，请核对后保存`, 'success')
    } catch (error) {
      chrome.notify((error as { message?: string })?.message || 'CSV 解析失败', 'error')
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
    chrome.notify(count ? `已同步 ${count} 个 HA 区域` : '未能获取 HA 区域列表', count ? 'success' : 'warning')
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

/* ── 原 hub-favorites.internals.ts 的实现 ── */
/** 收藏 Hub */

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

function favoriteIdsForDomain(favoriteEntities: Record<string, string[] | undefined>, domain: string): string[] {
  if (domain === 'offline') {
    return [...new Set([...(favoriteEntities.offline || []), ...(favoriteEntities.other || [])])]
  }
  return favoriteEntities[domain] || []
}

export function useFavoritesHub() {
  const entitiesStore = useEntitiesStore()
  const layoutStore = useLayoutStore()
  const filter = ref<FavoriteFilter>('all')

  const statsSensors = computed(() => layoutStore.layoutConfig.statsSensors || {})
  const quickActionStats = computed(() => {
    const stats = statsSensors.value
    return { lights: stats.lights, climates: stats.climates, battery: stats.battery, offline: stats.offline }
  })

  function favoriteCount(domain: string) {
    const favoriteEntities = layoutStore.layoutConfig.favoriteEntities || {}
    return favoriteIdsForDomain(favoriteEntities, domain).length
  }

  function resolveLiveStat(domain: string, count: number): { label: string; count: number } {
    if (domain === 'battery' || domain === 'offline') void entitiesStore.derivedEpoch
    else void entitiesStore.getDomainEpoch(domain)
    if (count === 0) return { label: '', count: 0 }

    if (domain === 'light') {
      const activeCount = countQuickActionLightsOn(
        entitiesStore as unknown as QuickActionEntities,
        layoutStore as unknown as QuickActionUi,
        quickActionStats.value,
      )
      return activeCount > 0 ? { label: '开', count: activeCount } : { label: '', count: 0 }
    }
    if (domain === 'climate') {
      const activeCount = countQuickActionClimateActive(
        entitiesStore as unknown as QuickActionEntities,
        layoutStore as unknown as QuickActionUi,
        quickActionStats.value,
      )
      return activeCount > 0 ? { label: '运行', count: activeCount } : { label: '', count: 0 }
    }
    if (domain === 'battery') {
      const activeCount = countQuickActionBatteryLow(
        entitiesStore as unknown as QuickActionEntities,
        layoutStore as unknown as QuickActionUi,
      )
      return activeCount > 0 ? { label: '低电量', count: activeCount } : { label: '', count: 0 }
    }
    if (domain === 'offline') {
      const activeCount = countQuickActionOffline(
        entitiesStore as unknown as QuickActionEntities,
        layoutStore as unknown as QuickActionUi,
        quickActionStats.value,
      )
      return activeCount > 0 ? { label: '离线', count: activeCount } : { label: '', count: 0 }
    }

    const meta = FAVORITE_CATEGORY_MAP[domain]
    if (meta?.activeStates?.length) {
      const activeCount = countQuickActionDomainActive(
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
      return activeCount > 0 ? { label: labelMap[domain] || '活跃', count: activeCount } : { label: '', count: 0 }
    }
    return { label: '', count: 0 }
  }

  function previewNames(domain: string, limit = 3): string[] {
    void entitiesStore.getDomainEpoch(domain)
    const favoriteEntities = layoutStore.layoutConfig.favoriteEntities || {}
    const ids = favoriteIdsForDomain(favoriteEntities, domain).slice(0, limit)
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
    if (filter.value === 'configured') return categoryViews.value.filter((categoryView) => categoryView.configured)
    if (filter.value === 'empty') return categoryViews.value.filter((categoryView) => !categoryView.configured)
    return categoryViews.value
  })

  const totalFavoriteCount = computed(() => categoryViews.value.reduce((sum, cat) => sum + cat.count, 0))

  const configuredCategoryCount = computed(
    () => categoryViews.value.filter((categoryView) => categoryView.configured).length,
  )

  const completionPct = computed(() => Math.round((configuredCategoryCount.value / FAVORITE_CATEGORIES.length) * 100))

  const recommendations = computed(() =>
    buildFavoritesRecommendations({
      stats: null,
      favoriteEntities: layoutStore.layoutConfig.favoriteEntities || {},
    }),
  )

  function addRecommendedEntity(entityId: string, domain: string) {
    const favoriteEntities = layoutStore.layoutConfig.favoriteEntities || {}
    if (!Array.isArray(favoriteEntities[domain])) favoriteEntities[domain] = []
    if (!favoriteEntities[domain]!.includes(entityId)) favoriteEntities[domain]!.push(entityId)
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

/* ── 原 hub-ui.internals.ts 的实现 ── */
/** 设置面板 Hub UI：路由 section 同步与草稿字段 */

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
    const nextTab = tabId || (typeof route.query.tab === 'string' && route.query.tab ? route.query.tab : undefined)
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
// 请从新路径导入：import { useSettingsSave } from '@/features/settings/kernel/save.internals'
