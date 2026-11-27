import { coverToggleService } from '@/domain/entity/control/cover-control-core'
import { entityMatchesAreaFilter, getEntityDomain, resolveEntityArea } from '@homeos/shared'
import type { DeviceListItem, DeviceFilterState } from '@/kernel/device'
import type { HaEntityState, HaEntityView } from '@/kernel/entity'
import { resolveListRowEntity } from '@/domain/entity/projection-row'
import { getEntityDisplayName, collectIndexedEntityIds } from '@/domain/entity/derived'
import { getDomainLabel } from '@/features/device/utils'
import { ref, computed, onMounted, watch, toRaw } from 'vue'
import { useEntitiesStore } from '@/domain/entity/store/entities.store'
import { useDeviceSearchOptions } from '@/domain/entity/use-device-search-options'
import { useChromeStore } from '@/kernel/ui/chrome/chrome-store'
import { useAuthStore } from '@/domain/auth/auth.store'
import { useRouter, useRoute } from 'vue-router'
import { getLargeEntityThreshold, configEpoch } from '@/kernel/config/frontend-config'
import { usePaginatedEntityList } from '@/domain/entity/use-paginated-entity-list'
import { useRouteEntityProjection } from '@/domain/entity/use-route-entity-projection'
import { useEnsureVisibleEntities } from '@/domain/entity/use-ensure-visible-entities'
import { logger } from '@/kernel/core/index'
import { appNotify } from '@/kernel/bridge/store-bridge'
import { hasEntityControlPopup } from '@/domain/entity/popup-registry'

/* ── 原 devices-view-actions.internals.ts 的实现 ── */
/** /devices 列表：开关类设备服务名解析（纯函数） */

type DeviceToggleCommand = { ok: true; domain: string; service: string } | { ok: false; reason: 'unknown-state' }

/**
 * 根据域与当前状态解析 toggle 要调用的 HA service。
 * cover 状态未知时返回失败；lock 解锁为高危（调用方需二次确认）。
 */
export function resolveDeviceToggleCommand(domain: string, state: string): DeviceToggleCommand {
  if (domain === 'cover') {
    const service = coverToggleService(state)
    if (!service) return { ok: false, reason: 'unknown-state' }
    return { ok: true, domain: 'cover', service }
  }
  if (domain === 'lock') {
    return {
      ok: true,
      domain: 'lock',
      service: state === 'unlocked' ? 'lock' : 'unlock',
    }
  }
  const onStates = new Set(['on', 'playing'])
  return {
    ok: true,
    domain,
    service: onStates.has(state) ? 'turn_off' : 'turn_on',
  }
}

/* ── 原 devices-view-filter.internals.ts 的实现 ── */
/** /devices 内存列表：按域/关键词/状态/房间/排序过滤（纯函数） */

type DevicesMemoryFilterInput = {
  items: DeviceListItem[]
  activeDomain: string
  query: string
  filter: DeviceFilterState
  roomAreaId: string
  controllableOnly: boolean
}

/**
 * 对内存态设备列表做前端过滤与排序（REST 分页模式不应调用）。
 */
export function filterMemoryDeviceItems(input: DevicesMemoryFilterInput): DeviceListItem[] {
  const q = input.query.trim().toLowerCase()
  const status = input.filter.status
  const room = input.roomAreaId
  const sort = input.filter.sort

  let result = input.items.filter((device): device is DeviceListItem => {
    if (!device) return false
    if (input.activeDomain !== 'all' && device.domain !== input.activeDomain) return false
    if (!q) return true
    return device.name.toLowerCase().includes(q) || device.entity_id.toLowerCase().includes(q)
  })

  if (status === 'online') {
    result = result.filter((device) => !device.unavailable)
  } else if (status === 'offline') {
    result = result.filter((device) => device.unavailable)
  } else if (status === 'low-battery') {
    result = result.filter((device) => device.batteryLevel != null && device.batteryLevel <= 20)
  }

  if (room) {
    result = result.filter((device) =>
      entityMatchesAreaFilter(device.area ? { area_id: device.area.id, area_name: device.area.name } : undefined, room),
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
      const left = a.lastChanged ? new Date(a.lastChanged).getTime() : 0
      const right = b.lastChanged ? new Date(b.lastChanged).getTime() : 0
      return right - left
    })
  }

  if (input.controllableOnly) {
    result = result.filter((device) => device.controllable)
  }

  return result
}

/* ── 原 devices-view-map.internals.ts 的实现 ── */
/** /devices：实体行 → DeviceListItem 映射（纯函数） */

const DEVICES_TOGGLE_DOMAINS = new Set(['light', 'switch', 'fan', 'cover', 'lock', 'input_boolean'])

const DEVICES_PREFERRED_DOMAINS = [
  'light',
  'climate',
  'cover',
  'switch',
  'sensor',
  'binary_sensor',
  'media_player',
  'camera',
]

type DevicesDomainTab = {
  id: string
  label: string
  count: number | null
}

/** 构建域 Tab：优先常用域，再按数量补其余域。 */
export function buildDevicesDomainTabs(memoryItems: DeviceListItem[], useRestList: boolean): DevicesDomainTab[] {
  if (useRestList) {
    const tabs: DevicesDomainTab[] = [{ id: 'all', label: '全部', count: null }]
    for (const domain of DEVICES_PREFERRED_DOMAINS) {
      tabs.push({ id: domain, label: getDomainLabel(domain), count: null })
    }
    return tabs
  }
  const counts = new Map<string, number>()
  for (const device of memoryItems) {
    counts.set(device.domain, (counts.get(device.domain) || 0) + 1)
  }
  const tabs: DevicesDomainTab[] = [{ id: 'all', label: '全部', count: memoryItems.length }]
  for (const domain of DEVICES_PREFERRED_DOMAINS) {
    if (counts.has(domain)) {
      tabs.push({ id: domain, label: getDomainLabel(domain), count: counts.get(domain)! })
    }
  }
  for (const [domain, count] of [...counts.entries()].sort((left, right) => right[1] - left[1])) {
    if (!DEVICES_PREFERRED_DOMAINS.includes(domain)) {
      tabs.push({ id: domain, label: getDomainLabel(domain), count })
    }
  }
  return tabs
}

type MapDeviceEntityRowOptions = {
  preferProjection?: boolean
  rawEntities: Record<string, HaEntityState>
  isEntityAllowed: (entityId: string) => boolean
}

/** 将 HA 实体视图映射为设备列表行；缺 id / 投影失败返回 null。 */
export function mapDeviceEntityRow(
  entity: HaEntityView & { entity_id: string },
  options: MapDeviceEntityRowOptions,
): DeviceListItem | null {
  const key = entity.entity_id || ''
  if (!key) return null
  const preferProjection = options.preferProjection ?? true
  const src = preferProjection ? resolveListRowEntity(key, entity) : entity
  if (!src) return null
  const rawAttrs = options.rawEntities[key]?.attributes
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
    toggleable: DEVICES_TOGGLE_DOMAINS.has(domain) && options.isEntityAllowed(key),
    controllable: options.isEntityAllowed(key),
    batteryLevel: typeof batteryLevel === 'number' ? batteryLevel : null,
    lastChanged: src.last_changed,
  }
}

/**
 * `/devices` 页面 URL 筛选的解析（纯函数，不依赖 store / router）。
 *
 * 为什么单独抽出来：这段逻辑有两个容易写错、且**错了也不报错**的地方 ——
 * 一是 query 里的非法值不能静默生效（`?status=whatever` 不该把列表清空），
 * 二是 `controllableOnly` 的连带关闭只能发生在 query **带来新值**的那一次
 * （否则用户手动打开的「仅可控」会被自己的域切换动作关掉）。
 * 放进纯函数后可以用单测钉住，而不是靠点几下看看。
 */

/** query 里允许出现的筛选键。 */
export const DEVICE_QUERY_DOMAIN = 'domain'
export const DEVICE_QUERY_STATUS = 'status'

/** `DeviceFilterState['status']` 的合法取值。 */
const VALID_STATUS = new Set<string>(['all', 'online', 'offline', 'low-battery'])

/** query 值可能是数组（重复参数）；只取第一个，且去空白。 */
function readQueryValue(raw: unknown): string {
  const value = Array.isArray(raw) ? raw[0] : raw
  return String(value ?? '').trim()
}

export interface DeviceQueryFilters {
  domain: string | null
  status: DeviceFilterState['status'] | null
  /** 至少有一个键被解析出来（调用方据此决定要不要动 `controllableOnly`）。 */
  present: boolean
}

/**
 * 从 URL query 解析出需要应用的筛选。
 *
 * `null` 表示「query 里没有该键」或「值非法」—— 两者对调用方都是「不应用」，
 * 非法值不做任何提示、也不改变现状。
 */
export function parseDeviceQueryFilters(query: Record<string, unknown> | undefined): DeviceQueryFilters {
  const rawDomain = readQueryValue(query?.[DEVICE_QUERY_DOMAIN])
  const rawStatus = readQueryValue(query?.[DEVICE_QUERY_STATUS])
  const domain = rawDomain || null
  const status = VALID_STATUS.has(rawStatus) ? (rawStatus as DeviceFilterState['status']) : null
  return { domain, status, present: Boolean(domain || status) }
}

/**
 * 把当前状态回写成 query 键值（用于 `router.replace`）。
 *
 * 默认值（`all` / 空串）返回 `null`，由调用方删除键，而不是写成 `?status=all`：
 * URL 只表达非默认值，链接才短。
 */
export function toDeviceQueryParams(state: { domain: string; status: DeviceFilterState['status'] }): {
  domain: string | null
  status: string | null
} {
  return {
    domain: state.domain && state.domain !== 'all' ? state.domain : null,
    status: state.status && state.status !== 'all' ? state.status : null,
  }
}

/* ── 原 useDevicesView.ts 的实现 ── */

const FILTER_STORAGE_KEY = 'homeos:devices-filter'

/**
 * `/devices` 的 URL 筛选键。
 *
 * 为什么需要：「设备健康」面板里的「传感器 88」是可点的 —— 点进去必须落到**同一批实体**上。
 * 若 URL 不能表达筛选，这个跳转只能落到「全部实体」，数字与列表对不上，比不能点更糟。
 *
 * 只覆盖 `domain` 与 `status`：其余筛选（房间 / 排序 / 仅可控）是用户在本页自己调的偏好，
 * 进了 URL 会让链接又长又难读。解析与回写在 `devices-view-query.internals.ts`（有单测）。
 */

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
    // 顺序有意为之：query 在 sessionStorage **之后**应用，让外部链接的描述优先于上次偏好。
    applyQueryFilters()
  })

  watch(
    currentFilter,
    (parsedFilters) => {
      try {
        sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(parsedFilters))
      } catch {
        // 忽略：sessionStorage 不可用或解析失败
      }
    },
    { deep: true },
  )

  /**
   * 把 query 里的 `domain` / `status` 应用到当前筛选。
   *
   * 只在 query 确实**带来新值**时才动手，且此时一并关掉 `controllableOnly`：
   * 该值默认 `true`，会把传感器 / 二元传感器整类隐藏，而设备健康面板的分解里点的恰恰
   * 主要就是传感器 —— 不关的话点进去是空列表，「传感器 88」变成「0 项」。
   *
   * 反面约束（容易写错的地方）：不要在每次 query 变化时都强制 `controllableOnly = false`。
   * 本页会把当前域回写到 URL，于是「用户手动打开仅可控 → 切域 Tab → URL 变了」会让
   * 这个 watcher 再跑一遍，把用户的开关又关掉。因此只在**真正应用了新值**的那一次处理。
   *
   * 返回是否真的改动了状态。
   */
  function applyQueryFilters(): boolean {
    const { domain, status, present } = parseDeviceQueryFilters(route.query as Record<string, unknown>)
    if (!present) return false

    let applied = false
    if (domain && activeDomain.value !== domain) {
      activeDomain.value = domain
      applied = true
    }
    if (status && currentFilter.value.status !== status) {
      currentFilter.value = { ...currentFilter.value, status }
      applied = true
    }
    if (!applied) return false

    if (currentFilter.value.controllableOnly) {
      currentFilter.value = { ...currentFilter.value, controllableOnly: false }
    }
    // 从外部链接进来时直接看列表：分析模式下应用筛选是看不见效果的。
    if (pageTab.value !== 'list') pageTab.value = 'list'
    return true
  }

  /**
   * 把当前 `domain` / `status` 回写到 URL。
   *
   * 单向读 URL 会让链接**说谎**：用户进来后改了域 Tab，地址栏还写着旧域，复制出去就是错的链接。
   * 因此两个方向都同步，用「值相同就不动」的守卫避免来回触发。
   */
  function syncFiltersToQuery() {
    const { domain, status } = toDeviceQueryParams({
      domain: activeDomain.value,
      status: currentFilter.value.status,
    })

    const currentDomain = String(route.query[DEVICE_QUERY_DOMAIN] || '')
    const currentStatus = String(route.query[DEVICE_QUERY_STATUS] || '')
    if (currentDomain === (domain ?? '') && currentStatus === (status ?? '')) return

    const next: Record<string, string> = { ...route.query } as Record<string, string>
    if (domain) next[DEVICE_QUERY_DOMAIN] = domain
    else delete next[DEVICE_QUERY_DOMAIN]
    if (status) next[DEVICE_QUERY_STATUS] = status
    else delete next[DEVICE_QUERY_STATUS]
    router.replace({ query: next })
  }

  watch(
    () => [route.query[DEVICE_QUERY_DOMAIN], route.query[DEVICE_QUERY_STATUS]],
    () => applyQueryFilters(),
  )
  watch([activeDomain, () => currentFilter.value.status], () => syncFiltersToQuery())

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
    entity: HaEntityView & { entity_id: string },
    options?: { preferProjection?: boolean; rawEntities?: Record<string, HaEntityState> },
  ): DeviceListItem | null {
    return mapDeviceEntityRow(entity, {
      preferProjection: options?.preferProjection,
      rawEntities: options?.rawEntities ?? toRaw(entitiesStore.entities),
      isEntityAllowed: (entityId) => authStore.isEntityAllowed(entityId),
    })
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
      getEntityDisplayName(a, rawEntities[a]).localeCompare(getEntityDisplayName(b, rawEntities[b]), 'zh'),
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
    restEntities.value.map((entity) => mapEntityRow(entity)).filter((item): item is DeviceListItem => item !== null),
  )
  const allItems = computed(() => (useRestList.value ? restItems.value : memoryItems.value))

  const filtered = computed((): DeviceListItem[] => {
    if (useRestList.value) return allItems.value
    return filterMemoryDeviceItems({
      items: allItems.value,
      activeDomain: activeDomain.value,
      query: query.value,
      filter: currentFilter.value,
      roomAreaId: resolvedRoomFilter.value,
      controllableOnly: currentFilter.value.controllableOnly,
    })
  })

  /**
   * 选中项的 O(1) 成员判定集合。
   *
   * 列表里每一行的 `:selected` 与「全选」判定原先是 `selectedIds.includes(...)`：
   * 选中 N 行时就是 O(N) × 行数，且选中态一变、`selectedIds` 数组换引用，
   * 整个可见列表都要重新 patch。用集合把判定降成 O(1)。
   */
  const selectedIdSet = computed(() => new Set(selectedIds.value))

  watch([filtered, activeDomain, query, currentFilter, restPage], () => {
    // 没有选中项时无事可做：这个 watcher 在每次派生重建（每批 WS）都会触发，
    // 原实现会无条件新建 Set + 换一次数组引用，把整屏行标记成「选中态可能变了」。
    if (selectedIds.value.length === 0) return
    const visible = new Set(filtered.value.map((i) => i.entity_id))
    const kept = selectedIds.value.filter((id) => visible.has(id))
    if (kept.length !== selectedIds.value.length) selectedIds.value = kept
  })

  useRouteEntityProjection(() => filtered.value.map((i) => i.entity_id))
  useEnsureVisibleEntities(() => filtered.value.map((i) => i.entity_id))

  const domainTabs = computed(() => buildDevicesDomainTabs(memoryItems.value, useRestList.value))

  const totalCount = computed(() => (useRestList.value ? restTotal.value : memoryItems.value.length))

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

  function toggleSelectItem(device: DeviceListItem) {
    const idx = selectedIds.value.indexOf(device.entity_id)
    if (idx > -1) {
      selectedIds.value = selectedIds.value.filter((id) => id !== device.entity_id)
    } else {
      selectedIds.value = [...selectedIds.value, device.entity_id]
    }
  }

  function toggleSelectAll() {
    const allSelected =
      filtered.value.length > 0 && filtered.value.every((device) => selectedIdSet.value.has(device.entity_id))
    if (allSelected) {
      selectedIds.value = []
    } else {
      selectedIds.value = filtered.value.map((device) => device.entity_id)
    }
  }

  function clearSelection() {
    selectedIds.value = []
  }

  function openControl(device: DeviceListItem) {
    if (!device.entity_id || device.unavailable) return
    if (!hasEntityControlPopup(device.entity_id)) {
      chrome.notify('该设备暂无快捷控制弹窗，请打开详情查看', 'info')
      return
    }
    void entitiesStore.ensureEntity(device.entity_id).finally(() => {
      chrome.openEntityControl(device.entity_id)
    })
  }

  function openDetail(device: DeviceListItem) {
    if (!device.entity_id) return
    void entitiesStore.ensureEntity(device.entity_id).finally(() => {
      router.push({ path: '/device', query: { id: device.entity_id } })
    })
  }

  async function toggleEntity(device: DeviceListItem) {
    if (!device.toggleable || device.unavailable) return
    if (!authStore.isEntityAllowed(device.entity_id)) {
      chrome.notify('当前账户无权操作该设备', 'warning')
      return
    }
    await entitiesStore.ensureEntity(device.entity_id)
    const live = entitiesStore.entities[device.entity_id]
    const state = live?.state ?? device.state
    const command = resolveDeviceToggleCommand(device.domain, state)
    try {
      if (!command.ok) {
        chrome.notify('设备状态未知，暂时无法操作', 'warning')
        return
      }
      // 解锁为高危操作，二次确认（上锁为安全方向直接执行）
      if (command.domain === 'lock' && command.service === 'unlock') {
        const ok = await chrome.confirm(
          `确定解锁「${device.name || device.entity_id}」？解锁后门将可直接打开。`,
          '解锁确认',
          { type: 'danger', confirmText: '确认解锁' },
        )
        if (!ok) return
      }
      await entitiesStore.callService(command.domain, command.service, device.entity_id, null, false)
      // 内存模式下乐观更新会即时驱动行状态；REST 分页模式列表来自服务端，
      // 乐观态不会驱动本列表渲染，成功后刷新当前页保证行状态与服务端一致
      if (useRestList.value) restRefresh()
    } catch (error) {
      logger.debug('设备切换失败', error)
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
