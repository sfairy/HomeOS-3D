/**
 * @file useEntityPickerSession.ts
 * @module composables/entity
 * @description 实体选择器共用会话 composable。
 *
 * 职责：
 * - 提供下拉与域菜单的定位（基于 useDropdownPosition）；
 * - 大数据集时启用 REST 搜索（debounce 250ms），小数据集走内存；
 * - 通过 domainEntityIndex 或 entities 兜底提供候选实体 ID 列表。
 *
 * 依赖：
 * - @homeos/shared（getEntityDomain）
 * - vue（ref、computed、watch、onUnmounted、Ref、ComputedRef）
 * - @/stores/entities.store（实体状态与索引）
 * - @/services/api/entities（fetchEntities REST 搜索）
 * - @/composables/ui/useDropdownPosition（下拉定位）
 * - @/utils/entity/derived.util（collectIndexedEntityIds 索引收集）
 * - @/utils/config/frontend-config（getLargeEntityThreshold 大库阈值）
 */
import { getEntityDomain } from '@homeos/shared'
import { ref, computed, watch, onUnmounted, type Ref, type ComputedRef } from 'vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { fetchEntities } from '@/services/api/entities'
import { useDropdownPosition } from '@/composables/ui/useDropdownPosition'
import { collectIndexedEntityIds } from '@/utils/entity/derived.util'
import { getLargeEntityThreshold } from '@/utils/config/frontend-config'

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
 * @param opts 会话配置（见 UseEntityPickerSessionOptions）
 * @returns entitiesStore 实体 store；restItems REST 结果；useRestSearch 是否启用 REST 搜索；
 *          dropdownStyle/teleportTarget/teleportDisabled/placement/updatePosition 下拉定位；
 *          domainMenuPlacement/domainMenuStyle/domainMenuTeleportTarget/domainMenuTeleportDisabled 域菜单定位；
 *          fetchRestEntities 主动 REST 拉取；getIndexedCandidateIds 取候选 ID
 */
export function useEntityPickerSession(opts: UseEntityPickerSessionOptions) {
  const entitiesStore = useEntitiesStore()
  const restItems = ref<EntityPickerRestItem[]>([])
  let restSearchTimer: ReturnType<typeof setTimeout> | null = null

  // 主下拉定位（基于 positionAnchor 与 showDropdown）
  const { dropdownStyle, teleportTarget, teleportDisabled, placement, updatePosition } =
    useDropdownPosition(opts.positionAnchor, opts.showDropdown, {
      minWidth: opts.dropdownMinWidth,
      maxHeight: opts.dropdownMaxHeight,
      chromeHeight: opts.chromeHeight,
      minListHeight: opts.minListHeight,
      minRowHeight: opts.minRowHeight,
      dropdownRef: opts.dropdownRef,
    })

  // 域菜单定位（不互斥，固定尺寸）
  const {
    dropdownStyle: domainMenuStyle,
    teleportTarget: domainMenuTeleportTarget,
    teleportDisabled: domainMenuTeleportDisabled,
    placement: domainMenuPlacement,
  } = useDropdownPosition(opts.domainMenuAnchor, opts.domainMenuOpen, {
    minWidth: 140,
    maxHeight: 200,
    chromeHeight: 0,
    minListHeight: 72,
    minRowHeight: 32,
    exclusive: false,
    dropdownRef: opts.domainMenuPanelRef,
  })

  // 是否启用 REST 搜索：调用方显式指定，否则按 totalCount 与大库阈值比较
  const useRestSearch = computed(() => {
    if (opts.useRestSearch) return opts.useRestSearch()
    return entitiesStore.totalCount >= getLargeEntityThreshold()
  })

  /**
   * 从 REST 拉取实体：根据 selectedDomain / searchQuery / allowedDomains / domainFilterSet / filterRestItem 过滤。
   * 仅在 REST 模式且下拉打开时执行；失败时清空 restItems。
   */
  async function fetchRestEntities() {
    if (!useRestSearch.value || !opts.showDropdown.value) return
    const allowed = opts.allowedDomains()
    const params: Record<string, string | number> = { limit: 200, page: 1 }
    // 单一允许域时直接传 domain 参数
    const dom = opts.selectedDomain.value || (allowed.length === 1 ? allowed[0] : '')
    if (dom) params.domain = dom
    const q = String(opts.searchQuery.value || '').trim()
    if (q) params.search = q
    try {
      const { data } = await fetchEntities(params, { timeout: 60_000 })
      let list = (data?.entities || []) as EntityPickerRestItem[]
      // 未指定 domain 时，按 domainFilterSet 在客户端二次过滤
      const filterSet = opts.domainFilterSet?.()
      if (!dom && filterSet?.size) {
        list = list.filter((e) => filterSet.has(getEntityDomain(e.entity_id)))
      }
      // 调用方自定义额外过滤
      if (opts.filterRestItem) {
        list = list.filter((e) => opts.filterRestItem!(e.entity_id))
      }
      restItems.value = list
    } catch {
      // 失败时清空，避免展示过期结果
      restItems.value = []
    }
  }

  // 搜索/域/下拉打开变化时防抖 250ms 触发 REST 拉取
  watch([opts.searchQuery, opts.selectedDomain, opts.showDropdown], () => {
    if (!useRestSearch.value || !opts.showDropdown.value) return
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
    const selected = options?.selectedDomain ?? opts.selectedDomain.value
    const domains = options?.domains ?? opts.allowedDomains()
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
