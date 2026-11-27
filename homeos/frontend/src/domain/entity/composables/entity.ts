import { computed, ref, watch, onUnmounted, type Ref, type ComputedRef, shallowRef, unref, type MaybeRefOrGetter } from 'vue'
import { useEntitiesStore } from '@/domain/entity/store/entities.store'
import { getEntityDomain } from '@homeos/shared'
import { fetchEntities } from '@/domain/api/entities'
import { useDropdownPosition } from '@/kernel/ui/popup/use-dropdown-position'
import { collectIndexedEntityIds } from '@/domain/entity/model/utils/derived.util'
import { getLargeEntityThreshold, configEpoch } from '@/kernel/config/frontend-config'
import { getProjection } from '@/domain/entity/store/entity-projection'
import { usePausableStateListener } from '@/domain/entity/composables/use-pausable-state-listener'
import { type HaEntityState } from '@/kernel/types/entity'
import { useRoute } from 'vue-router'
import { useLayoutStore } from '@/domain/layout/store/layout.store'
import { useChromeStore } from '@/kernel/ui/chrome/chrome-store'
import { resolveSubscribeDomains, setActiveSubscribeDomains, getActiveSubscribeDomains, collectWsPinnedEntityIds, buildLayoutSubscriptionKey } from '@/domain/entity/model/utils/ws-subscription'
import { resolveActivePopupEntityId } from '@/domain/entity/store/active-popup-entity'

/** 实体展示 Epoch 依赖注入工具 */
/**
 * 在 computed / 渲染函数中建立实体展示所需的 store 依赖。
 * 优先按 domainEpoch 收窄；无域时仅依赖 derivedEpoch（域 epoch 已对全量变更递增）。
 * @param {import('@/domain/entity/store/entities.store').ReturnType<typeof useEntitiesStore>} entitiesStore
 * @param {string | string[] | undefined} [domains]
 */
export function touchEntityStoreDisplayDeps(
  entitiesStore: {
    getDomainEpoch?: (domain: string) => unknown
    derivedEpoch?: unknown
  },
  domains?: string | string[],
) {
  if (domains?.length) {
    const list = Array.isArray(domains) ? domains : [domains]
    for (const d of list) void entitiesStore.getDomainEpoch?.(d)
    return
  }
  void entitiesStore.derivedEpoch
}
/**
 * 订阅实体 store 变更 epoch，供模板内函数或非 computed 上下文触发重绘。
 * 在 render 中读取 .value 后，同帧内 getEntity / 全表扫描会随 WS 更新。
 * @param {string | string[] | undefined} [domains] - 可选 domain，用 getDomainEpoch 收窄依赖
 */
export function useEntityDisplayEpoch(domains?: string | string[]) {
  const entitiesStore = useEntitiesStore()
  return computed(() => {
    touchEntityStoreDisplayDeps(entitiesStore, domains)
    return entitiesStore.derivedEpoch
  })
}

/** - 提供下拉与域菜单的定位（基于 useDropdownPosition）； */

/** REST 返回的实体行：最小行形状 */
type EntityPickerRestItem = { entity_id: string; [key: string]: unknown }

/** 实体选择器会话配置：定位锚点、下拉引用、域菜单、搜索与各种尺寸/过滤回调 */
type UseEntityPickerSessionOptions = {
  positionAnchor: Ref<HTMLElement | null>
  dropdownRef: Ref<HTMLElement | null>
  domainMenuAnchor: Ref<HTMLElement | null>
  domainMenuPanelRef: Ref<HTMLElement | null>
  showDropdown: Ref<boolean>
  domainMenuOpen: Ref<boolean>
  selectedDomain: Ref<string>
  searchQuery: Ref<string> | ComputedRef<string>
  dropdownMinWidth: () => number
  dropdownMaxHeight: () => number
  chromeHeight: () => number
  minListHeight: () => number
  minRowHeight: () => number
  /** 允许的域；空数组表示全部 */
  allowedDomains: () => string[]
  /** 额外域过滤（如单选逗号分隔多域） */
  domainFilterSet?: () => Set<string>
  /** 是否启用 REST 大目录搜索 */
  useRestSearch?: () => boolean
  /** REST 结果额外过滤 */
  filterRestItem?: (entityId: string) => boolean
}

/**
 * 实体选择器共用会话：下拉定位、域菜单、大数据集 REST debounce 搜索、索引候选 ID。
 *
 * @param pickerOptions 会话配置（见 UseEntityPickerSessionOptions）
 * @returns entitiesStore 实体 store；restItems REST 结果；useRestSearch 是否启用 REST 搜索；
 *          dropdownStyle/teleportTarget/teleportDisabled/placement/updatePosition 下拉定位；
 *          domainMenuPlacement/domainMenuStyle/domainMenuTeleportTarget/domainMenuTeleportDisabled 域菜单定位；
 *          fetchRestEntities 主动 REST 拉取；getIndexedCandidateIds 取候选 ID
 */
export function useEntityPickerSession(pickerOptions: UseEntityPickerSessionOptions) {
  const entitiesStore = useEntitiesStore()
  const restItems = ref<EntityPickerRestItem[]>([])
  let restSearchTimer: ReturnType<typeof setTimeout> | null = null

  // 主下拉定位（基于 positionAnchor 与 showDropdown）
  const { dropdownStyle, teleportTarget, teleportDisabled, placement, updatePosition } = useDropdownPosition(
    pickerOptions.positionAnchor,
    pickerOptions.showDropdown,
    {
      minWidth: pickerOptions.dropdownMinWidth,
      maxHeight: pickerOptions.dropdownMaxHeight,
      chromeHeight: pickerOptions.chromeHeight,
      minListHeight: pickerOptions.minListHeight,
      minRowHeight: pickerOptions.minRowHeight,
      dropdownRef: pickerOptions.dropdownRef,
    },
  )

  // 域菜单定位（不互斥，固定尺寸）
  const {
    dropdownStyle: domainMenuStyle,
    teleportTarget: domainMenuTeleportTarget,
    teleportDisabled: domainMenuTeleportDisabled,
    placement: domainMenuPlacement,
  } = useDropdownPosition(pickerOptions.domainMenuAnchor, pickerOptions.domainMenuOpen, {
    minWidth: 140,
    maxHeight: 200,
    chromeHeight: 0,
    minListHeight: 72,
    minRowHeight: 32,
    exclusive: false,
    dropdownRef: pickerOptions.domainMenuPanelRef,
  })

  // 是否启用 REST 搜索：调用方显式指定，否则按 totalCount 与大库阈值比较
  const useRestSearch = computed(() => {
    if (pickerOptions.useRestSearch) return pickerOptions.useRestSearch()
    return entitiesStore.totalCount >= getLargeEntityThreshold()
  })

  /**
   * 从 REST 拉取实体：根据 selectedDomain / searchQuery / allowedDomains / domainFilterSet / filterRestItem 过滤。
   * 仅在 REST 模式且下拉打开时执行；失败时清空 restItems。
   */
  async function fetchRestEntities() {
    if (!useRestSearch.value || !pickerOptions.showDropdown.value) return
    const allowed = pickerOptions.allowedDomains()
    const params: Record<string, string | number> = { limit: 200, page: 1 }
    // 单一允许域时直接传 domain 参数
    const dom = pickerOptions.selectedDomain.value || (allowed.length === 1 ? allowed[0] : '')
    if (dom) params.domain = dom
    const q = String(pickerOptions.searchQuery.value || '').trim()
    if (q) params.search = q
    try {
      const { data } = await fetchEntities(params, { timeout: 60_000 })
      let list = (data?.entities || []) as EntityPickerRestItem[]
      // 未指定 domain 时，按 domainFilterSet 在客户端二次过滤
      const filterSet = pickerOptions.domainFilterSet?.()
      if (!dom && filterSet?.size) {
        list = list.filter((e) => filterSet.has(getEntityDomain(e.entity_id)))
      }
      // 调用方自定义额外过滤
      if (pickerOptions.filterRestItem) {
        list = list.filter((e) => pickerOptions.filterRestItem!(e.entity_id))
      }
      restItems.value = list
    } catch {
      // 失败时清空，避免展示过期结果
      restItems.value = []
    }
  }

  // 搜索/域/下拉打开变化时防抖 250ms 触发 REST 拉取
  watch([pickerOptions.searchQuery, pickerOptions.selectedDomain, pickerOptions.showDropdown], () => {
    if (!useRestSearch.value || !pickerOptions.showDropdown.value) return
    if (restSearchTimer) clearTimeout(restSearchTimer)
    restSearchTimer = setTimeout(() => {
      void fetchRestEntities()
    }, 250)
  })

  // 组件卸载时清理防抖计时器，避免内存泄漏与卸载后回调
  onUnmounted(() => {
    if (restSearchTimer) clearTimeout(restSearchTimer)
  })

  /**
   * 取索引候选 ID 列表：优先用 domainEntityIndex；索引不可用时回退到 entities 全量 keys 过滤。
   *
   * @param options.selectedDomain 当前选中域（覆盖 opts.selectedDomain）
   * @param options.domains 允许的域列表（覆盖 opts.allowedDomains）
   * @param options.domainSet 多域集合（覆盖 opts.domainFilterSet）
   * @param options.isAllowed 自定义允许判断函数
   * @returns 候选实体 ID 数组
   */
  function getIndexedCandidateIds(options?: {
    selectedDomain?: string
    domains?: string[]
    domainSet?: Set<string>
    isAllowed?: (entityId: string) => boolean
  }) {
    const index = entitiesStore.domainEntityIndex
    const selected = options?.selectedDomain ?? pickerOptions.selectedDomain.value
    const domains = options?.domains ?? pickerOptions.allowedDomains()
    const domainSet = options?.domainSet
    const isAllowed = options?.isAllowed

    // 索引不可用：回退到 entities 全量 keys 按域前缀过滤
    if (!index?.size) {
      const keys = Object.keys(entitiesStore.entities)
      if (selected) return keys.filter((id) => id.startsWith(selected + '.'))
      if (domains.length === 1) return keys.filter((id) => id.startsWith(domains[0] + '.'))
      if (domainSet?.size) {
        return keys.filter((id) => domainSet.has(getEntityDomain(id)))
      }
      if (isAllowed) return keys.filter(isAllowed)
      if (domains.length > 1) {
        const set = new Set(domains)
        return keys.filter((id) => set.has(getEntityDomain(id)))
      }
      return keys
    }

    // 索引可用：优先用索引；索引为空时回退到 entities keys
    if (selected) {
      const indexed = collectIndexedEntityIds(index, { domain: selected })
      if (indexed && indexed.length > 0) return indexed
      return Object.keys(entitiesStore.entities).filter((id) => id.startsWith(selected + '.'))
    }

    if (domains.length === 1) {
      const indexed = collectIndexedEntityIds(index, { domain: domains[0] })
      if (indexed && indexed.length > 0) return indexed
      return Object.keys(entitiesStore.entities).filter((id) => id.startsWith(domains[0] + '.'))
    }

    if (domainSet?.size) {
      const indexed = collectIndexedEntityIds(index, {
        domain: 'all',
        groupDomainSet: domainSet,
      })
      if (indexed && indexed.length > 0) return indexed
      return Object.keys(entitiesStore.entities).filter((id) => domainSet.has(getEntityDomain(id)))
    }

    // 多域或自定义允许：聚合各域索引，再用 isAllowed 二次过滤
    if (domains.length > 1 || isAllowed) {
      const ids = new Set<string>()
      const list = domains.length ? domains : [...index.keys()]
      for (const dom of list) {
        // 已指定 selected 时跳过非 selected 的域
        if (selected && dom !== selected) continue
        const collected = collectIndexedEntityIds(index, { domain: dom })
        if (collected) {
          for (const id of collected) {
            if (!isAllowed || isAllowed(id)) ids.add(id)
          }
        }
      }
      return [...ids]
    }

    // 全部域：取 'all' 索引；为空时回退到 entities 全量 keys
    const indexed = collectIndexedEntityIds(index, { domain: 'all' })
    if (indexed && indexed.length > 0) return indexed
    return Object.keys(entitiesStore.entities)
  }

  return {
    entitiesStore,
    restItems,
    useRestSearch,
    dropdownStyle,
    teleportTarget,
    teleportDisabled,
    placement,
    updatePosition,
    domainMenuPlacement,
    domainMenuStyle,
    domainMenuTeleportTarget,
    domainMenuTeleportDisabled,
    fetchRestEntities,
    getIndexedCandidateIds,
  }
}

/** 实体投影只读展示组合式函数模块。 */

/**
 * 解析 MaybeRefOrGetter 形式的 entityId 引用为具体值。
 * @param entityIdRef ref/getter/ref 值
 * @returns 解析后的字符串或 null/undefined
 */
function resolveId(entityIdRef: MaybeRefOrGetter<string | undefined | null>) {
  return typeof entityIdRef === 'function' ? entityIdRef() : unref(entityIdRef)
}
/**
 * 只读展示：优先投影，未在 scope 内时回退 store 全量实体。
 *
 * 调用场景：户型图热区、卡片等需要"乐观投影优先"的只读展示组件。
 * 当投影存在且与 store 状态不一致时，以 store state + 投影 attributes 合成（保证状态权威）；
 * 投影存在但 store 缺失时直接使用投影；无投影时使用 store 原值。
 *
 * @param {import('vue').MaybeRefOrGetter<string | undefined | null>} entityIdRef
 * @returns 实体快照 shallowRef
 */
export function useEntityProjection(entityIdRef: MaybeRefOrGetter<string | undefined | null>) {
  const entitiesStore = useEntitiesStore()
  // 使用 shallowRef 避免对大对象进行深度响应式追踪
  const entity = shallowRef<HaEntityState | null>(null)
  /** 重新同步实体快照（投影优先 + store 回退） */
  function sync() {
    const id = resolveId(entityIdRef)
    if (!id) {
      entity.value = null
      return
    }
    const storeEntity = entitiesStore.getEntity(id) ?? null
    const proj = getProjection(id)
    // 投影与 store 都存在但 state 不一致：以 store state 为权威，attributes 取投影
    if (proj && storeEntity && proj.state !== storeEntity.state) {
      entity.value = {
        entity_id: storeEntity.entity_id,
        state: storeEntity.state,
        attributes: storeEntity.attributes,
      }
      return
    }
    // 仅投影存在：直接采用投影
    if (proj) {
      entity.value = {
        entity_id: proj.entity_id,
        state: proj.state,
        attributes: proj.attributes,
      }
      return
    }
    // 无投影：回退 store 全量实体
    entity.value = storeEntity
  }
  sync()
  // entity_id 变化时重新同步
  watch(() => resolveId(entityIdRef), sync)
  // 按实体监听即可；不再挂全局 entityStateRevision，避免传感器风暴扇出
  usePausableStateListener(sync, {
    entityIds: () => resolveId(entityIdRef) || undefined,
  })
  return entity
}

/** 路由/布局变更时同步 WebSocket domain 订阅；重连后补发 pinned（生产环境关键） */

/** 同步防抖间隔（毫秒）：加快换页/弹窗后的域与 pinned 生效 */
const SYNC_DEBOUNCE_MS = 50

/**
 * WebSocket 订阅同步组合式函数。
 *
 * 调用场景：在主视图根组件 setup 中调用一次，托管全局 WS 订阅生命周期。
 * 返回 syncSubscription（手动强制同步）与 getActiveSubscribeDomains（查询当前激活域）。
 *
 * @returns {{ syncSubscription: () => void, getActiveSubscribeDomains: typeof getActiveSubscribeDomains }}
 */
export function useEntityWsSubscriptionSync() {
  const route = useRoute()
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()
  const entitiesStore = useEntitiesStore()

  /** 最近一次下发的订阅指纹（避免重复 emit） */
  let lastEmittedKey = ''
  /** debounce 计时器句柄 */
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  /** 收集当前布局下需要 pin 的实体 ID（打开的控制/媒体弹窗实体） */
  function resolvePinnedEntityIds() {
    return collectWsPinnedEntityIds(layoutStore.layoutConfig, resolveActivePopupEntityId())
  }

  /**
   * 执行一次订阅同步。
   *
   * @param force 是否强制下发（忽略指纹相同短路）
   */
  function syncSubscription(force = false) {
    const domains = resolveSubscribeDomains(route.path, layoutStore.layoutConfig)
    const pinnedEntityIds = resolvePinnedEntityIds()
    const activePopup = resolveActivePopupEntityId()
    // 稳定指纹：排序后拼接，避免 JSON.stringify 分配与键序抖动
    const domainKey = domains ? [...domains].sort().join(',') : '*'
    const pinnedKey = [...pinnedEntityIds].sort().join(',')
    const layoutKey = buildLayoutSubscriptionKey(layoutStore.layoutConfig, activePopup)
    const key = `${route.path}|${domainKey}|${pinnedKey}|${layoutKey}|${configEpoch.value}`
    // 指纹一致且非强制：跳过，避免无谓 emit
    if (!force && key === lastEmittedKey) return
    lastEmittedKey = key
    setActiveSubscribeDomains(domains)
    const socket = entitiesStore.getSocket()
    // 仅在 socket 已连接时下发；未连接时由 connect 事件补发
    if (socket?.connected) {
      socket.emit('update_subscription', {
        subscribeDomains: domains,
        pinnedEntityIds,
      })
    }
  }

  /** 防抖版同步：合并短时间内的多次触发 */
  function scheduleSync() {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      syncSubscription()
    }, SYNC_DEBOUNCE_MS)
  }

  // 浅指纹 + debounce；弹窗开闭也会改变 pin，故一并监听 chrome 弹窗状态
  watch(
    () =>
      buildLayoutSubscriptionKey(layoutStore.layoutConfig, resolveActivePopupEntityId()) +
      '|' +
      route.path +
      '|' +
      configEpoch.value +
      '|' +
      String(chrome.isEntityControlOpen) +
      '|' +
      (chrome.entityControlEntityId || '') +
      '|' +
      String(chrome.isMediaPlayerOpen) +
      '|' +
      (chrome.activeMediaEntityId || ''),
    scheduleSync,
  )

  /** 当前 socket connect 事件解绑函数 */
  let detachConnect: (() => void) | null = null

  /**
   * 绑定 socket connect 事件，重连后强制补发订阅。
   * @param onConnect connect 回调
   * @returns 解绑函数（socket 不存在时返回 null）
   */
  function bindSocketSubscriptionSync(onConnect: () => void): (() => void) | null {
    const socket = entitiesStore.getSocket()
    if (!socket) return null
    socket.on('connect', onConnect)
    return () => socket.off('connect', onConnect)
  }

  /** 强制同步防抖：避免 reconnect 时 epoch/connect/connected 三连打爆 update_subscription */
  function scheduleForceSync() {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      syncSubscription(true)
    }, SYNC_DEBOUNCE_MS)
  }

  // wsTransportEpoch 变化表示 socket 实例重建：重新绑定 connect；同步由 connect 单源触发
  watch(
    () => entitiesStore.wsTransportEpoch,
    () => {
      detachConnect?.()
      detachConnect = bindSocketSubscriptionSync(() => scheduleForceSync())
      const socket = entitiesStore.getSocket()
      // 已连接时补一次（新建 socket 可能已连上且不再触发 connect）
      if (socket?.connected) scheduleForceSync()
    },
    { immediate: true },
  )

  onUnmounted(() => {
    if (debounceTimer) clearTimeout(debounceTimer)
    detachConnect?.()
  })

  return {
    syncSubscription: () => syncSubscription(true),
    getActiveSubscribeDomains,
  }
}

/** 单实体与多实体实时订阅组合式函数 */

/**
 * 订阅单个实体的实时状态，避免依赖整个 entities 映射。
 * 通过 usePausableStateListener 精确监听指定实体的变化，
 * 避免无关实体变化导致的不必要重渲染。
 * @param {import('vue').MaybeRefOrGetter<string | undefined | null>} entityIdRef
 */
export function useEntity(entityIdRef: MaybeRefOrGetter<string | undefined | null>) {
  const entitiesStore = useEntitiesStore()
  const entity = shallowRef<HaEntityState | null>(null)
  function sync() {
    const id = resolveId(entityIdRef)
    entity.value = id ? (entitiesStore.getEntity(id) ?? null) : null
  }
  sync()
  watch(() => resolveId(entityIdRef), sync)
  usePausableStateListener(sync, {
    entityIds: () => resolveId(entityIdRef) || undefined,
  })
  return entity
}
