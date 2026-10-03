/**
 * useEntityMultiSelect - 实体多选组合式函数
 * 功能特性：
 * - 提供实体多选的完整状态管理
 * - 支持静态选项或从实体库拉取
 * - 支持域名筛选和搜索过滤
 * - 支持最大选择数量限制
 * - 支持推荐实体智能识别
 * - 集成下拉定位和点击外部关闭
 * - 支持 REST 搜索（大量实体时性能优化）
 *
 * @param props - 多选配置属性
 * @param emit - 事件触发函数
 * @returns 多选状态和操作方法
*/
import { getEntityDomain } from '@homeos/shared'
import { ref, computed, watch, nextTick } from 'vue'
import { useClickOutside } from '@/composables/ui/useClickOutside'
import { useEntityPickerSession } from '@/composables/entity/useEntityPickerSession'
import { useEntitiesStore } from '@/stores/entities.store'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import { getLargeEntityThreshold } from '@/utils/config/frontend-config'

/** 静态选项配置（如 HomeOS 场景） */
interface EntityMultiSelectStaticOption {
  id: string
  label: string
  hint?: string
}

/** 实体多选组件 Props 接口 */
interface EntityMultiSelectProps {
  modelValue: string[]
  allowedDomains: string[]
  placeholder: string
  wrapperClass: string
  dropdownMinWidth: number
  dropdownMaxHeight: number
  suggestDeviceClass?: string
  /** 限制可选数量；1 时为单选（选中新项会替换旧项） */
  maxSelection?: number
  /** 静态选项（如 HomeOS 场景）；提供时不再从实体库拉取 */
  staticOptions?: EntityMultiSelectStaticOption[]
}

/** 实体多选组件事件类型 */
type EntityMultiSelectEmit = (event: 'update:modelValue', value: string[]) => void

/** 实体多选组合式函数主入口 */
export function useEntityMultiSelect(props: EntityMultiSelectProps, emit: EntityMultiSelectEmit) {
  /** 占位文本（优先使用 props.placeholder，默认"点击选择实体"） */
  const placeholderText = computed(() => props.placeholder || '点击选择实体')
  /** 下拉面板是否显示 */
  const showDropdown = ref(false)
  /** 域名筛选菜单是否展开 */
  const domainMenuOpen = ref(false)
  /** 当前选中的筛选域名 */
  const selectedDomain = ref('')
  /** 当前搜索关键词 */
  const query = ref('')
  /** 外层容器 ref */
  const wrapRef = ref<HTMLElement | null>(null)
  /** 触发器 ref，用于下拉定位锚点 */
  const triggerRef = ref<HTMLElement | null>(null)
  /** 下拉面板 ref */
  const dropdownRef = ref<HTMLElement | null>(null)
  /** 域名菜单锚点 ref */
  const domainMenuAnchor = ref<HTMLElement | null>(null)
  /** 域名菜单元面板 ref（Teleport） */
  const domainMenuPanelRef = ref<HTMLElement | null>(null)
  /** 搜索输入框 ref */
  const searchRef = ref<HTMLInputElement | null>(null)

  /** 已选实体 ID 数组（清洗和格式化） */
  const selectedIds = computed(() => {
    const arr = Array.isArray(props.modelValue) ? props.modelValue : []
    return arr.map((id) => String(id).trim()).filter(Boolean)
  })

  /** 允许的域名集合（用于快速查找） */
  const allowedDomainSet = computed(() => new Set(props.allowedDomains))
  /** 是否允许所有域名（即无域名限制） */
  const allowAllDomains = computed(() => !props.allowedDomains.length)

  /**
   * 实体选择器会话管理
   * 提供下拉定位、域名菜单、REST 搜索等功能
  */
  const {
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
    getIndexedCandidateIds: getSessionIndexedIds,
  } = useEntityPickerSession({
    positionAnchor: triggerRef,
    dropdownRef,
    domainMenuAnchor,
    domainMenuPanelRef,
    showDropdown,
    domainMenuOpen,
    selectedDomain,
    searchQuery: query,
    dropdownMinWidth: () => props.dropdownMinWidth,
    dropdownMaxHeight: () => props.dropdownMaxHeight,
    chromeHeight: () =>
      props.staticOptions?.length
        ? 44
        : props.allowedDomains.length > 1 || !props.allowedDomains.length
          ? 88
          : 44,
    // 分组头 + 名称/ID 双行条目；过小会导致搜索后向上展开时裁切末行
    minListHeight: () => 96,
    minRowHeight: () => 52,
    allowedDomains: () => props.allowedDomains,
    useRestSearch: () => {
      if (props.staticOptions?.length) return false
      // 阈值判断在 session 默认逻辑中；此处仅关闭静态选项场景
      return useEntitiesStore().totalCount >= getLargeEntityThreshold()
    },
    filterRestItem: (entityId) =>
      allowAllDomains.value || allowedDomainSet.value.has(getEntityDomain(entityId)),
  })

  /** 可用域名列表（从允许域名或实体库推导） */
  const availableDomains = computed(() => {
    if (props.allowedDomains.length) return [...props.allowedDomains]
    void entitiesStore.derivedEpoch
    const index = entitiesStore.domainEntityIndex
    if (index?.size) return [...index.keys()].sort((a, b) => a.localeCompare(b))
    return [
      ...new Set(Object.keys(entitiesStore.entities).map((id) => getEntityDomain(id))),
    ].sort((a, b) => a.localeCompare(b))
  })

  /** 判断实体是否在允许的域名范围内 */
  function isDomainAllowed(entityId: string) {
    if (allowAllDomains.value) return true
    return allowedDomainSet.value.has(getEntityDomain(entityId))
  }

  /** 获取索引化的候选实体 ID 列表 */
  function getIndexedCandidateIds() {
    return getSessionIndexedIds({
      domains: allowAllDomains.value
        ? [...(entitiesStore.domainEntityIndex?.keys() || [])]
        : props.allowedDomains,
      isAllowed: isDomainAllowed,
    })
  }

  /** 当前激活的推荐设备类型（根据占位符智能识别） */
  const activeSuggestDeviceClass = computed(() => {
    if (props.suggestDeviceClass) return props.suggestDeviceClass
    const hint = (props.placeholder || '').toLowerCase()
    if (hint.includes('smoke') || hint.includes('烟雾')) return 'smoke'
    if (hint.includes('gas') || hint.includes('燃气') || hint.includes('methane')) return 'gas'
    if (
      hint.includes('water') ||
      hint.includes('leak') ||
      hint.includes('漏水') ||
      hint.includes('水浸')
    )
      return 'moisture'
    return ''
  })

  /** 从实体条目构建分组列表，支持推荐排序 */
  function buildGroupedFromEntries(entries: Array<{ key: string; e: unknown }>, q: string) {
    const groups = new Map<
      string,
      Array<{ entity_id: string; name: string; domain: string; isSuggested?: boolean }>
    >()
    const activeSuggest = activeSuggestDeviceClass.value
    for (const { key, e } of entries) {
      if (!e || !isDomainAllowed(key)) continue
      const dom = getEntityDomain(key)
      if (selectedDomain.value && dom !== selectedDomain.value) continue
      const name = getEntityDisplayName(key, e).toLowerCase()
      const eid = key.toLowerCase()
      const attrs = (e as { attributes?: Record<string, unknown> })?.attributes
      const deviceClass = String(attrs?.device_class || '').toLowerCase()
      const isSuggested = !!(activeSuggest && deviceClass === activeSuggest)
      if (!q || eid.includes(q) || name.includes(q)) {
        if (!groups.has(dom)) groups.set(dom, [])
        groups.get(dom)!.push({
          entity_id: key,
          name: getEntityDisplayName(key, e),
          domain: dom,
          isSuggested,
        })
      }
    }
    const result: Array<{
      domain: string
      items: Array<{ entity_id: string; name: string; domain: string; isSuggested?: boolean }>
    }> = []
    for (const [domain, items] of groups) {
      items.sort((a, b) => {
        if (a.isSuggested && !b.isSuggested) return -1
        if (!a.isSuggested && b.isSuggested) return 1
        return a.name.localeCompare(b.name, 'zh-CN')
      })
      result.push({ domain, items })
    }
    result.sort((a, b) => a.domain.localeCompare(b.domain))
    return result
  }

  /** 分组后的实体列表（按 domain 分组，推荐项前置） */
  const groupedItems = computed(() => {
    const q = query.value.toLowerCase().trim()
    if (props.staticOptions?.length) {
      const items = props.staticOptions
        .filter((o) => {
          if (!q) return true
          const label = String(o.label || '').toLowerCase()
          const id = String(o.id || '').toLowerCase()
          const hint = String(o.hint || '').toLowerCase()
          return label.includes(q) || id.includes(q) || hint.includes(q)
        })
        .map((o) => ({
          entity_id: o.id,
          name: o.label,
          domain: 'scene',
        }))
      return items.length ? [{ domain: 'HomeOS 场景', items }] : []
    }

    // 触发响应式更新：derivedEpoch 在索引重建完成后递增
    void entitiesStore.derivedEpoch

    if (useRestSearch.value && showDropdown.value) {
      const entries = restItems.value.map((e) => ({
        key: e.entity_id,
        e: entitiesStore.entities[e.entity_id] || e,
      }))
      return buildGroupedFromEntries(entries, q)
    }
    const entities = entitiesStore.entities
    const ids = getIndexedCandidateIds()
    const entries = ids.map((key) => ({ key, e: entities[key] }))
    return buildGroupedFromEntries(entries, q)
  })

  /** 扁平化的实体列表（用于虚拟滚动） */
  const flatItems = computed(() => groupedItems.value.flatMap((g) => g.items))

  /** 是否显示域名筛选器 */
  const showDomainFilter = computed(
    () => !props.staticOptions?.length && availableDomains.value.length > 1,
  )
  /** 是否显示分组标题 */
  const showGroupHeader = computed(() => {
    if (props.staticOptions?.length) return false
    return availableDomains.value.length > 1 || groupedItems.value.length > 1
  })

  // 监听列表数据变化，展开时更新下拉面板位置
  watch([groupedItems, flatItems, restItems, showDropdown], () => {
    if (!showDropdown.value) return
    nextTick(() => updatePosition())
  })

  // 互斥关闭父下拉时同步收起域筛选子菜单
  watch(showDropdown, (open) => {
    if (!open) domainMenuOpen.value = false
  })

  /** 获取实体显示名称 */
  function displayName(entityId: string) {
    const stat = props.staticOptions?.find((o) => o.id === entityId)
    if (stat) return stat.label
    const ent = entitiesStore.getEntity(entityId)
    return getEntityDisplayName(entityId, ent)
  }

  /** 判断实体是否已被选中 */
  function isSelected(entityId: string) {
    return selectedIds.value.includes(entityId)
  }

  /** 触发 v-model 更新事件 */
  function emitIds(ids: string[]) {
    emit('update:modelValue', [...ids])
  }

  /** 切换实体选中状态（添加/移除） */
  function toggleItem(entityId: string) {
    const next = [...selectedIds.value]
    const idx = next.indexOf(entityId)
    if (idx >= 0) {
      next.splice(idx, 1)
    } else if (props.maxSelection === 1) {
      emitIds([entityId])
      closeDropdown()
      return
    } else if (props.maxSelection && next.length >= props.maxSelection) {
      return
    } else {
      next.push(entityId)
    }
    emitIds(next)
  }

  /** 移除指定实体 */
  function removeId(entityId: string) {
    emitIds(selectedIds.value.filter((id) => id !== entityId))
  }

  /** 清空所有已选实体 */
  function clearAll() {
    emitIds([])
  }

  /** 选择筛选域名 */
  function selectFilterDomain(dom: string) {
    selectedDomain.value = dom
    domainMenuOpen.value = false
  }

  /** 切换域名筛选菜单展开/收起 */
  function toggleDomainMenu() {
    domainMenuOpen.value = !domainMenuOpen.value
  }

  /** 设置搜索关键词 */
  function setQuery(value: string) {
    query.value = value
  }

  /** 展开下拉面板：重置状态、更新位置、聚焦搜索框 */
  function openDropdown() {
    if (showDropdown.value) {
      closeDropdown()
      return
    }
    showDropdown.value = true
    domainMenuOpen.value = false
    nextTick(() => {
      updatePosition()
      searchRef.value?.focus()
      if (useRestSearch.value) void fetchRestEntities()
    })
  }

  /** 关闭下拉面板：重置搜索和域名菜单 */
  function closeDropdown() {
    showDropdown.value = false
    domainMenuOpen.value = false
    query.value = ''
  }

  /** 点击外部区域时关闭下拉 */
  function onClickOutside() {
    closeDropdown()
  }

  useClickOutside(
    () =>
      [
        wrapRef.value,
        triggerRef.value,
        dropdownRef.value,
        domainMenuAnchor.value,
        domainMenuPanelRef.value,
      ].filter(Boolean) as HTMLElement[],
    onClickOutside,
  )

  const bindWrapRef = (el: HTMLElement | null) => {
    wrapRef.value = el
  }
  const bindTriggerRef = (el: HTMLElement | null) => {
    triggerRef.value = el
  }
  const bindDropdownRef = (el: HTMLElement | null) => {
    dropdownRef.value = el
  }
  const bindDomainMenuAnchor = (el: HTMLElement | null) => {
    domainMenuAnchor.value = el
  }
  const bindDomainMenuPanelRef = (el: HTMLElement | null) => {
    domainMenuPanelRef.value = el
  }
  const bindSearchRef = (el: HTMLInputElement | null) => {
    searchRef.value = el
  }

  return {
    placeholderText,
    showDropdown,
    domainMenuOpen,
    selectedDomain,
    query,
    bindWrapRef,
    bindTriggerRef,
    bindDropdownRef,
    bindDomainMenuAnchor,
    bindDomainMenuPanelRef,
    bindSearchRef,
    dropdownStyle,
    teleportTarget,
    teleportDisabled,
    placement,
    domainMenuPlacement,
    domainMenuStyle,
    domainMenuTeleportTarget,
    domainMenuTeleportDisabled,
    selectedIds,
    availableDomains,
    groupedItems,
    flatItems,
    showDomainFilter,
    showGroupHeader,
    displayName,
    isSelected,
    toggleItem,
    removeId,
    clearAll,
    selectFilterDomain,
    toggleDomainMenu,
    setQuery,
    openDropdown,
    closeDropdown,
  }
}
