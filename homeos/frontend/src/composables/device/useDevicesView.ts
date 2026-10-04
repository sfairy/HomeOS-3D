/**
 * @file useDevicesView.ts
 * @module frontend/src/composables
 */
import { entityMatchesAreaFilter, getEntityDomain, resolveEntityArea } from '@homeos/shared'
import type { HaEntityState, HaEntityView } from '@/types/entity-store'
import type { DeviceListItem, DeviceFilterState } from '@/types/device'
import { ref, computed, onMounted, watch, toRaw } from 'vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useDeviceSearchOptions } from '@/composables/entity/useDeviceSearchOptions'
import { useChromeStore } from '@/stores/chrome.store'
import { useAuthStore } from '@/stores/auth.store'
import { useRouter, useRoute } from 'vue-router'
import { getLargeEntityThreshold, configEpoch } from '@/utils/config/frontend-config'
import { usePaginatedEntityList } from '@/composables/entity/usePaginatedEntityList'
import { useRouteEntityProjection } from '@/composables/entity/useRouteEntityProjection'
import { useEnsureVisibleEntities } from '@/composables/entity/useEnsureVisibleEntities'
import { resolveListRowEntity } from '@/utils/entity/projection-row.util'
import { logger } from '@/utils/core/logger'
import { getEntityDisplayName, collectIndexedEntityIds } from '@/utils/entity/derived.util'
import { getDomainLabel } from '@/utils/device/domain-labels.util'
import { appNotify } from '@/utils/bridge/store-bridge'

const FILTER_STORAGE_KEY = 'homeos:devices-filter'
const TOGGLE_DOMAINS = new Set(['light', 'switch', 'fan', 'cover', 'lock', 'input_boolean'])
const PREFERRED_DOMAINS = [
  'light',
  'climate',
  'cover',
  'switch',
  'sensor',
  'binary_sensor',
  'media_player',
  'camera',
]

/**
 * /devices 列表 REST 分页回退阈值。
 * 内存态列表在任一实体变更时全量重建 + 中文排序，实体较多时成本显著，
 * 因此比全局 largeEntityThreshold 更早回退到 REST 分页（服务端过滤/排序）。
 */
const DEVICES_REST_FALLBACK_THRESHOLD = 1000

const DEVICES_VIEW_PAGE_ACCENT_STYLE = {
  '--page-accent': 'var(--module-accent-devices)',
  '--page-accent-rgb': 'var(--module-accent-devices-rgb)',
  '--page-accent-secondary': 'var(--module-accent-devices-sub)',
  '--page-accent-secondary-rgb': 'var(--module-accent-devices-sub-rgb)',
} as Record<string, string>

export function useDevicesView() {
  const entitiesStore = useEntitiesStore()
  const authStore = useAuthStore()
  const chrome = useChromeStore()
  const router = useRouter()
  const route = useRoute()
  const query = ref('')
  const activeDomain = ref('all')
  const selectedIds = ref<string[]>([])
  const pageTab = ref<'list' | 'analytics'>('list')

  const currentFilter = ref<DeviceFilterState>({
    status: 'all',
    room: '',
    sort: 'name-asc',
    controllableOnly: true,
  })

  // room 直接作为 area_id 使用（会话中仅存储有效的区域 id）
  const resolvedRoomFilter = computed(() => String(currentFilter.value.room || '').trim())

  onMounted(() => {
    const view = String(route.query.view || '')
    if (view === 'analytics') pageTab.value = 'analytics'
    try {
      const raw = sessionStorage.getItem(FILTER_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as DeviceFilterState
        currentFilter.value = {
          ...currentFilter.value,
          ...parsed,
          controllableOnly: parsed.controllableOnly ?? true,
        }
      }
    } catch {
      // 忽略：sessionStorage 不可用或解析失败
    }
  })

  watch(
    currentFilter,
    (val) => {
      try {
        sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(val))
      } catch {
        // 忽略：sessionStorage 不可用或解析失败
      }
    },
    { deep: true },
  )

  const useRestList = computed(() => {
    configEpoch.value
    // 设备列表专用阈值：比全局派生阈值更早切 REST 分页，避免大列表全量重建
    return entitiesStore.totalCount > Math.min(getLargeEntityThreshold(), DEVICES_REST_FALLBACK_THRESHOLD)
  })

  watch(pageTab, (tab) => {
    const nextView = tab === 'analytics' ? 'analytics' : undefined
    const current = String(route.query.view || '') || undefined
    if (current === nextView) return
    const nextQuery = { ...route.query }
    if (nextView) nextQuery.view = nextView
    else delete nextQuery.view
    router.replace({ query: nextQuery })
  })

  watch(
    () => route.query.view,
    (view) => {
      const nextTab = String(view || '') === 'analytics' ? 'analytics' : 'list'
      if (pageTab.value !== nextTab) pageTab.value = nextTab
    },
  )

  const {
    items: restEntities,
    total: restTotal,
    page: restPage,
    totalPages: restTotalPages,
    loading: restLoading,
    error: restError,
    errorDetail: restErrorDetail,
    refresh: restRefresh,
  } = usePaginatedEntityList({
    domain: activeDomain,
    search: query,
    filter: currentFilter,
    roomAreaId: resolvedRoomFilter,
  })

  function mapEntityRow(
    e: HaEntityView & { entity_id: string },
    options?: { preferProjection?: boolean; rawEntities?: Record<string, HaEntityState> },
  ): DeviceListItem | null {
    const key = e.entity_id || ''
    if (!key) return null
    const preferProjection = options?.preferProjection ?? true
    const src = preferProjection ? resolveListRowEntity(key, e) : e
    if (!src) return null
    // 非响应式读取实体属性：列表重算时机由下方按域/全局 epoch 订阅控制，
    // 避免逐实体键订阅导致单个实体变更触发整列表重建
    const rawMap = options?.rawEntities ?? toRaw(entitiesStore.entities)
    const rawAttrs = rawMap[key]?.attributes
    const mergedAttrs = { ...rawAttrs, ...src.attributes }
    const domain = getEntityDomain(key)
    const batteryLevel = mergedAttrs?.battery_level ?? src.attributes?.battery_level
    return {
      entity_id: key,
      domain,
      name: getEntityDisplayName(key, src),
      state: src.state || '',
      area: resolveEntityArea(mergedAttrs),
      unavailable: src.state === 'unavailable' || src.state === 'unknown',
      toggleable: TOGGLE_DOMAINS.has(domain) && authStore.canControl(key),
      // 「可控」按实体鉴权判定，与是否具备控制弹窗解耦：
      // 弹窗裁剪后，开关/传感器等仍应出现在默认设备列表中（是否弹窗由控制宿主决定）。
      controllable: authStore.canControl(key),
      batteryLevel: typeof batteryLevel === 'number' ? batteryLevel : null,
      lastChanged: src.last_changed,
    }
  }

  /**
   * 排序结果 memo：仅当实体 ID 集合变化时重排，状态变更（epoch 递增）不再触发 O(n log n) 中文排序。
   * 名称排序不随状态变化，ID 集不变即可安全复用排序结果。
   */
  let lastSortedIdsKey = ''
  let lastSortedIds: string[] = []
  function memoizedSortedIds(ids: string[]): string[] {
    // ids 来自派生索引，顺序稳定；以全量 join 签名判断集合是否变化（O(n) 远低于排序 O(n log n)）
    const key = ids.join('\u0000')
    if (key === lastSortedIdsKey) return lastSortedIds
    lastSortedIdsKey = key
    const rawEntities = toRaw(entitiesStore.entities)
    lastSortedIds = [...ids].sort((a, b) =>
      getEntityDisplayName(a, rawEntities[a]).localeCompare(
        getEntityDisplayName(b, rawEntities[b]),
        'zh',
      ),
    )
    return lastSortedIds
  }

  const memoryItems = computed(() => {
    if (useRestList.value) return []
    const dom = activeDomain.value
    if (dom !== 'all') {
      // 按域订阅：仅本域实体变更时重算本域列表，其他域变更不触发本列表重建
      void entitiesStore.getDomainEpoch(dom)
    } else {
      void entitiesStore.derivedEpoch
    }
    const ids = collectIndexedEntityIds(entitiesStore.domainEntityIndex, {
      domain: dom === 'all' ? 'all' : dom,
    })
    if (!ids?.length) return []
    const list: DeviceListItem[] = []
    // 非响应式读取实体：重算时机由上方 epoch 订阅控制，单实体变更不再逐键触发整列表重算
    const rawEntities = toRaw(entitiesStore.entities)
    for (const key of memoizedSortedIds(ids)) {
      const ent = rawEntities[key]
      if (!ent) continue
      const row = mapEntityRow({ ...ent, entity_id: key }, { rawEntities })
      if (row) list.push(row)
    }
    return list
  })

  const { options: searchOptions, onDropdownOpen: onSearchOpen } = useDeviceSearchOptions({
    useRest: useRestList,
    domain: activeDomain,
    memoryItems,
  })

  function onSearchSelect(value: string | undefined) {
    if (!value) return
    if (value.includes('.')) query.value = value
  }

  const restItems = computed((): DeviceListItem[] =>
    restEntities.value
      .map((entity) => mapEntityRow(entity))
      .filter((item): item is DeviceListItem => item !== null),
  )
  const allItems = computed(() => (useRestList.value ? restItems.value : memoryItems.value))

  const filtered = computed((): DeviceListItem[] => {
    let result: DeviceListItem[] = allItems.value

    if (!useRestList.value) {
      const q = query.value.trim().toLowerCase()
      const status = currentFilter.value.status
      const room = resolvedRoomFilter.value
      const sort = currentFilter.value.sort

      result = allItems.value.filter((item): item is DeviceListItem => {
        if (!item) return false
        if (activeDomain.value !== 'all' && item.domain !== activeDomain.value) return false
        if (!q) return true
        return item.name.toLowerCase().includes(q) || item.entity_id.toLowerCase().includes(q)
      })

      if (status === 'online') {
        result = result.filter((i) => !i.unavailable)
      } else if (status === 'offline') {
        result = result.filter((i) => i.unavailable)
      } else if (status === 'low-battery') {
        result = result.filter((i) => i.batteryLevel != null && i.batteryLevel <= 20)
      }

      if (room) {
        result = result.filter((i) =>
          entityMatchesAreaFilter(
            i.area ? { area_id: i.area.id, area_name: i.area.name } : undefined,
            room,
          ),
        )
      }

      if (sort === 'name-asc') {
        result = [...result].sort((a, b) => a.name.localeCompare(b.name, 'zh'))
      } else if (sort === 'name-desc') {
        result = [...result].sort((a, b) => b.name.localeCompare(a.name, 'zh'))
      } else if (sort === 'status') {
        result = [...result].sort((a, b) => {
          if (a.unavailable !== b.unavailable) return a.unavailable ? 1 : -1
          return a.name.localeCompare(b.name, 'zh')
        })
      } else if (sort === 'last-changed') {
        result = [...result].sort((a, b) => {
          const ta = a.lastChanged ? new Date(a.lastChanged).getTime() : 0
          const tb = b.lastChanged ? new Date(b.lastChanged).getTime() : 0
          return tb - ta
        })
      }
    }

    if (!useRestList.value && currentFilter.value.controllableOnly) {
      result = result.filter((i) => i.controllable)
    }

    return result
  })

  watch([filtered, activeDomain, query, currentFilter, restPage], () => {
    const visible = new Set(filtered.value.map((i) => i.entity_id))
    selectedIds.value = selectedIds.value.filter((id) => visible.has(id))
  })

  useRouteEntityProjection(() => filtered.value.map((i) => i.entity_id))
  useEnsureVisibleEntities(() => filtered.value.map((i) => i.entity_id))

  const domainTabs = computed(() => {
    if (useRestList.value) {
      const tabs = [{ id: 'all', label: '全部', count: null as number | null }]
      for (const d of PREFERRED_DOMAINS) {
        tabs.push({ id: d, label: getDomainLabel(d), count: null })
      }
      return tabs
    }
    const counts = new Map<string, number>()
    for (const item of memoryItems.value) {
      counts.set(item.domain, (counts.get(item.domain) || 0) + 1)
    }
    const tabs = [{ id: 'all', label: '全部', count: memoryItems.value.length }]
    for (const d of PREFERRED_DOMAINS) {
      if (counts.has(d)) tabs.push({ id: d, label: getDomainLabel(d), count: counts.get(d)! })
    }
    for (const [d, c] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
      if (!PREFERRED_DOMAINS.includes(d)) tabs.push({ id: d, label: getDomainLabel(d), count: c })
    }
    return tabs
  })

  const totalCount = computed(() =>
    useRestList.value ? restTotal.value : memoryItems.value.length,
  )

  const deviceStatCells = computed(() => {
    const cells = [
      {
        key: 'total',
        label: useRestList.value ? '实体总数' : '全部设备',
        value: String(totalCount.value),
      },
      {
        key: 'visible',
        label: activeDomain.value === 'all' ? '当前列表' : getDomainLabel(activeDomain.value),
        value: String(filtered.value.length),
        tone: 'sky',
      },
    ]
    if (selectedIds.value.length) {
      cells.push({
        key: 'selected',
        label: '已选',
        value: String(selectedIds.value.length),
        tone: 'amber',
      })
    }
    if (useRestList.value && restTotalPages.value > 1) {
      cells.push({
        key: 'page',
        label: '分页',
        value: `${restPage.value}/${restTotalPages.value}`,
        tone: 'muted',
      })
    }
    return cells
  })

  function applyDomainFromAnalytics(domain: string) {
    pageTab.value = 'list'
    activeDomain.value = domain
    appNotify(`已筛选域：${getDomainLabel(domain)}`, 'success', 2500)
  }

  function applyEntityFromAnalytics(entityId: string) {
    pageTab.value = 'list'
    query.value = entityId
    appNotify(
      `已定位设备：${getEntityDisplayName(entityId, entitiesStore.entities[entityId]) || entityId}`,
      'success',
      2500,
    )
  }

  function toggleSelectItem(item: DeviceListItem) {
    const idx = selectedIds.value.indexOf(item.entity_id)
    if (idx > -1) {
      selectedIds.value = selectedIds.value.filter((id) => id !== item.entity_id)
    } else {
      selectedIds.value = [...selectedIds.value, item.entity_id]
    }
  }

  function toggleSelectAll() {
    if (selectedIds.value.length === filtered.value.length && filtered.value.length > 0) {
      selectedIds.value = []
    } else {
      selectedIds.value = filtered.value.map((i) => i.entity_id)
    }
  }

  function clearSelection() {
    selectedIds.value = []
  }

  function openControl(item: DeviceListItem) {
    if (!item.entity_id || item.unavailable) return
    void entitiesStore.ensureEntity(item.entity_id).finally(() => {
      chrome.openEntityControl(item.entity_id)
    })
  }

  function openDetail(item: DeviceListItem) {
    if (!item.entity_id) return
    void entitiesStore.ensureEntity(item.entity_id).finally(() => {
      router.push({ path: '/device', query: { id: item.entity_id } })
    })
  }

  async function toggleEntity(item: DeviceListItem) {
    if (!item.toggleable || item.unavailable) return
    if (!authStore.canControl(item.entity_id)) {
      chrome.notify('当前账户无权操作该设备', 'warning')
      return
    }
    await entitiesStore.ensureEntity(item.entity_id)
    const live = entitiesStore.entities[item.entity_id]
    const state = live?.state ?? item.state
    const domain = item.domain
    try {
      if (domain === 'cover') {
        const openStates = new Set(['open', 'opening'])
        const service = openStates.has(state) ? 'close_cover' : 'open_cover'
        await entitiesStore.callService('cover', service, item.entity_id, null, false)
      } else if (domain === 'lock') {
        const service = state === 'unlocked' ? 'lock' : 'unlock'
        // 解锁为高危操作，二次确认（上锁为安全方向直接执行）
        if (service === 'unlock') {
          const ok = await chrome.confirm(
            `确定解锁「${item.name || item.entity_id}」？解锁后门将可直接打开。`,
            '解锁确认',
            { type: 'danger', confirmText: '确认解锁' },
          )
          if (!ok) return
        }
        await entitiesStore.callService('lock', service, item.entity_id, null, false)
      } else {
        const onStates = new Set(['on', 'playing'])
        const service = onStates.has(state) ? 'turn_off' : 'turn_on'
        await entitiesStore.callService(domain, service, item.entity_id, null, false)
      }
      // 内存模式下乐观更新会即时驱动行状态；REST 分页模式列表来自服务端，
      // 乐观态不会驱动本列表渲染，成功后刷新当前页保证行状态与服务端一致
      if (useRestList.value) restRefresh()
    } catch (e) {
      logger.debug('设备切换失败', e)
      chrome.notify('设备操作失败，请检查权限或设备状态', 'error')
    }
  }

  return {
    pageAccentStyle: DEVICES_VIEW_PAGE_ACCENT_STYLE,
    query,
    activeDomain,
    selectedIds,
    pageTab,
    currentFilter,
    searchOptions,
    onSearchOpen,
    onSearchSelect,
    filtered,
    restLoading,
    restError,
    restErrorDetail,
    useRestList,
    restRefresh,
    restPage,
    restTotalPages,
    domainTabs,
    deviceStatCells,
    applyDomainFromAnalytics,
    applyEntityFromAnalytics,
    toggleSelectItem,
    toggleSelectAll,
    clearSelection,
    openControl,
    openDetail,
    toggleEntity,
  }
}
