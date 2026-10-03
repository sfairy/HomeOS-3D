/**
 * @file useEntityInput.ts
 * @module frontend/src/composables
 */
import { getEntityDomain } from '@homeos/shared'
import { ref, computed, nextTick, watch, type Ref } from 'vue'
import { useClickOutside } from '@/composables/ui/useClickOutside'
import { useEntityPickerSession } from '@/composables/entity/useEntityPickerSession'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import type { HaEntityState } from '@/types/entity-store'

/** EntityInputItem：类型定义，字段语义见声明。 */
export interface EntityInputItem {
  entity_id: string
  name: string
  domain: string
  isSuggested?: boolean
}

/** EntityInputGroup：类型定义，字段语义见声明。 */
export interface EntityInputGroup {
  domain: string
  items: EntityInputItem[]
}

interface UseEntityInputProps {
  modelValue: string
  placeholder: string
  domainFilter: string
  suggestDeviceClass: string
  dropdownMinWidth: number
  dropdownMaxHeight: number
}

type EntityInputEmit = (event: 'update:modelValue', value: string) => void

/** useEntityInput：函数，按签名入参返回处理结果。 */
export function useEntityInput(
  props: UseEntityInputProps,
  emit: EntityInputEmit,
  inputRef: Ref<HTMLInputElement | null>,
) {
  const showDropdown = ref(false)
  const domainMenuOpen = ref(false)
  const selectedDomain = ref('')
  const activeGroupIdx = ref(0)
  const activeItemIdx = ref(0)
  const activeFlatIdx = ref(0)
  const wrapRef = ref<HTMLElement | null>(null)
  const dropdownRef = ref<HTMLElement | null>(null)
  const domainMenuAnchor = ref<HTMLElement | null>(null)
  const domainMenuPanelRef = ref<HTMLElement | null>(null)
  const editingText = ref('')
  /** 用户点击清除后，父级可能仍保留原 modelValue（如部件 ID 不可为空） */
  const clearedLocally = ref(false)

  /** 支持逗号分隔多域，如 `input_boolean,binary_sensor,switch` */
  const filterDomains = computed(() => {
    const raw = String(props.domainFilter || '').trim()
    if (!raw) return [] as string[]
    return raw
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean)
  })
  const filterDomainSet = computed(() => new Set(filterDomains.value))
  const hasDomainFilter = computed(() => filterDomains.value.length > 0)

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
    positionAnchor: wrapRef,
    dropdownRef,
    domainMenuAnchor,
    domainMenuPanelRef,
    showDropdown,
    domainMenuOpen,
    selectedDomain,
    searchQuery: editingText,
    dropdownMinWidth: () => props.dropdownMinWidth,
    dropdownMaxHeight: () => props.dropdownMaxHeight,
    chromeHeight: () => (hasDomainFilter.value ? 44 : 0),
    // 有域筛选时列表区仍须容纳分组头 + 名称/ID 双行
    minListHeight: () => (hasDomainFilter.value ? 96 : 136),
    minRowHeight: () => 58,
    allowedDomains: () => filterDomains.value,
    domainFilterSet: () => filterDomainSet.value,
  })

  watch(
    () => props.modelValue,
    () => {
      if (props.modelValue) clearedLocally.value = false
      editingText.value = ''
      showDropdown.value = false
      domainMenuOpen.value = false
      activeGroupIdx.value = 0
      activeItemIdx.value = 0
      activeFlatIdx.value = 0
    },
  )

  // 互斥关闭父下拉时同步收起域筛选子菜单
  watch(showDropdown, (open) => {
    if (!open) domainMenuOpen.value = false
  })

  const totalEntityCount = computed(() => {
    if (!hasDomainFilter.value) return entitiesStore.totalCount
    let sum = 0
    for (const d of filterDomains.value) {
      sum += entitiesStore.domainCounts.get(d) || 0
    }
    return sum
  })

  const domainCounts = computed(() => {
    const counts: Record<string, number> = {}
    for (const [d, c] of entitiesStore.domainCounts) {
      if (hasDomainFilter.value && !filterDomainSet.value.has(d)) continue
      counts[d] = c
    }
    return counts
  })

  const availableDomains = computed(() => {
    if (hasDomainFilter.value) return [...filterDomains.value].sort()
    return [...entitiesStore.domainCounts.keys()].sort()
  })

  function getIndexedCandidateIds() {
    return getSessionIndexedIds({
      domains: filterDomains.value,
      domainSet: hasDomainFilter.value ? filterDomainSet.value : undefined,
    })
  }

  function buildGroupedFromEntries(
    entries: Array<{ key: string; e: HaEntityState | undefined }>,
    q: string,
    activeSuggest: string,
  ): EntityInputGroup[] {
    const groups = new Map<string, EntityInputItem[]>()
    for (const { key, e } of entries) {
      if (!e) continue
      const dom = getEntityDomain(key)
      if (hasDomainFilter.value && !filterDomainSet.value.has(dom)) continue
      if (selectedDomain.value && dom !== selectedDomain.value) continue
      const name = getEntityDisplayName(key, e).toLowerCase()
      const eid = key.toLowerCase()
      const rawDeviceClass = e.attributes?.device_class
      const deviceClass =
        typeof rawDeviceClass === 'string' ? rawDeviceClass.toLowerCase() : undefined
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
    const result: EntityInputGroup[] = []
    for (const [domain, items] of groups) {
      items.sort((a, b) => {
        if (a.isSuggested && !b.isSuggested) return -1
        if (!a.isSuggested && b.isSuggested) return 1
        return a.name.localeCompare(b.name)
      })
      result.push({ domain, items })
    }
    result.sort((a, b) => a.domain.localeCompare(b.domain))
    return result
  }

  const autoSuggestDeviceClass = computed(() => {
    if (props.suggestDeviceClass) return props.suggestDeviceClass

    const hint = (props.placeholder || '').toLowerCase()

    if (hint.includes('temperature') || hint.includes('_temp') || hint.includes('温度'))
      return 'temperature'
    if (hint.includes('humidity') || hint.includes('湿度')) return 'humidity'
    if (hint.includes('pm25') || hint.includes('pm2.5') || hint.includes('空气质量')) return 'pm25'
    if (hint.includes('co2') || hint.includes('carbon_dioxide') || hint.includes('二氧化碳'))
      return 'carbon_dioxide'
    if (hint.includes('battery') || hint.includes('电池')) return 'battery'
    if (
      hint.includes('power') ||
      hint.includes('energy') ||
      hint.includes('功率') ||
      hint.includes('能耗')
    )
      return 'power'
    if (hint.includes('voltage') || hint.includes('电压')) return 'voltage'
    if (hint.includes('current') || hint.includes('电流')) return 'current'
    if (
      hint.includes('presence') ||
      hint.includes('mmwave') ||
      hint.includes('occupancy') ||
      hint.includes('存在') ||
      hint.includes('人体')
    )
      return 'occupancy'
    if (hint.includes('motion') || hint.includes('运动')) return 'motion'
    if (hint.includes('lock') || hint.includes('door') || hint.includes('门锁')) return 'door'
    if (hint.includes('window') || hint.includes('窗户')) return 'window'
    if (hint.includes('smoke') || hint.includes('烟雾')) return 'smoke'
    if (hint.includes('carbon_monoxide') || hint.includes('co') || hint.includes('一氧化碳'))
      return 'carbon_monoxide'
    if (
      hint.includes('water') ||
      hint.includes('leak') ||
      hint.includes('漏水') ||
      hint.includes('水浸')
    )
      return 'moisture'

    return ''
  })

  function selectFilterDomain(dom: string) {
    selectedDomain.value = dom
    domainMenuOpen.value = false
    activeGroupIdx.value = 0
    activeItemIdx.value = 0
  }

  const entityName = computed(() => {
    if (!props.modelValue) return ''
    const ent = entitiesStore.getEntity(props.modelValue)
    return ent ? getEntityDisplayName(props.modelValue, ent) : ''
  })

  const displayValue = computed(() => {
    if (clearedLocally.value) return editingText.value
    if (showDropdown.value) return editingText.value
    return entityName.value || props.modelValue
  })

  const showClearBtn = computed(() => {
    if (clearedLocally.value) return false
    return !!(props.modelValue || editingText.value)
  })

  const groupedItems = computed(() => {
    const q = (showDropdown.value || clearedLocally.value ? editingText.value : props.modelValue)
      .toLowerCase()
      .trim()
    const activeSuggest = autoSuggestDeviceClass.value || props.suggestDeviceClass

    if (useRestSearch.value && showDropdown.value) {
      const entries = restItems.value.map((e) => ({
        key: e.entity_id,
        e: entitiesStore.entities[e.entity_id] || e,
      }))
      return buildGroupedFromEntries(entries, q, activeSuggest)
    }

    const entities = entitiesStore.entities
    const ids = getIndexedCandidateIds()
    const entries = ids.map((key) => ({ key, e: entities[key] }))
    return buildGroupedFromEntries(entries, q, activeSuggest)
  })

  const showDomainFilter = computed(() => !hasDomainFilter.value)
  const showGroupHeader = computed(() => !hasDomainFilter.value || groupedItems.value.length > 1)

  const flatItems = computed(() => {
    const items: EntityInputItem[] = []
    for (const group of groupedItems.value) {
      for (const item of group.items) items.push(item)
    }
    items.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    return items
  })

  const useVirtualDropdown = computed(() => flatItems.value.length > 120)

  watch([groupedItems, flatItems, restItems, showDropdown], () => {
    if (!showDropdown.value) return
    nextTick(() => updatePosition())
  })

  watch(
    () => [props.dropdownMinWidth, props.dropdownMaxHeight],
    () => {
      if (showDropdown.value) updatePosition()
    },
  )

  function entityItemKey(item: EntityInputItem) {
    return item.entity_id
  }

  function isActive(_item: EntityInputItem, idx: number, group: EntityInputGroup) {
    const gi = groupedItems.value.indexOf(group)
    return gi === activeGroupIdx.value && idx === activeItemIdx.value
  }

  function setActive(_item: EntityInputItem, idx: number, group: EntityInputGroup) {
    const gi = groupedItems.value.indexOf(group)
    activeGroupIdx.value = gi
    activeItemIdx.value = idx
  }

  function onInput(e: Event) {
    editingText.value = (e.target as HTMLInputElement).value
    activeGroupIdx.value = 0
    activeItemIdx.value = 0
    activeFlatIdx.value = 0
    nextTick(() => {
      updatePosition()
      showDropdown.value = true
    })
  }

  function onFocus() {
    if (!clearedLocally.value) {
      editingText.value = props.modelValue || ''
    }
    activeGroupIdx.value = 0
    activeItemIdx.value = 0
    activeFlatIdx.value = 0
    nextTick(() => {
      updatePosition()
      showDropdown.value = true
      inputRef.value?.select()
      if (useRestSearch.value) void fetchRestEntities()
    })
  }

  function select(item: EntityInputItem) {
    clearedLocally.value = false
    emit('update:modelValue', item.entity_id)
    editingText.value = ''
    showDropdown.value = false
  }

  function commitRawEntityId() {
    const raw = editingText.value.trim()
    if (!raw || !raw.includes('.')) return false
    clearedLocally.value = false
    emit('update:modelValue', raw)
    editingText.value = ''
    showDropdown.value = false
    return true
  }

  function clear() {
    clearedLocally.value = true
    editingText.value = ''
    emit('update:modelValue', '')
    domainMenuOpen.value = false
    activeGroupIdx.value = 0
    activeItemIdx.value = 0
    activeFlatIdx.value = 0
    nextTick(() => {
      updatePosition()
      showDropdown.value = true
      inputRef.value?.focus()
      if (useRestSearch.value) void fetchRestEntities()
    })
  }

  function moveDown() {
    if (useVirtualDropdown.value) {
      if (flatItems.value.length === 0) return
      activeFlatIdx.value = (activeFlatIdx.value + 1) % flatItems.value.length
      return
    }
    const groups = groupedItems.value
    if (groups.length === 0) return
    const currentGroup = groups[activeGroupIdx.value]
    if (!currentGroup) return
    if (activeItemIdx.value < currentGroup.items.length - 1) activeItemIdx.value++
    else if (activeGroupIdx.value < groups.length - 1) {
      activeGroupIdx.value++
      activeItemIdx.value = 0
    }
  }

  function moveUp() {
    if (useVirtualDropdown.value) {
      if (flatItems.value.length === 0) return
      activeFlatIdx.value =
        (activeFlatIdx.value - 1 + flatItems.value.length) % flatItems.value.length
      return
    }
    if (activeGroupIdx.value === 0 && activeItemIdx.value === 0) return
    if (activeItemIdx.value > 0) activeItemIdx.value--
    else if (activeGroupIdx.value > 0) {
      activeGroupIdx.value--
      const prevGroup = groupedItems.value[activeGroupIdx.value]
      if (prevGroup) activeItemIdx.value = prevGroup.items.length - 1
    }
  }

  function selectCurrent() {
    if (useVirtualDropdown.value) {
      const item = flatItems.value[activeFlatIdx.value]
      if (item) {
        select(item)
        return
      }
    } else {
      const group = groupedItems.value[activeGroupIdx.value]
      if (group && group.items[activeItemIdx.value]) {
        select(group.items[activeItemIdx.value])
        return
      }
    }
    commitRawEntityId()
  }

  function closeDropdown() {
    showDropdown.value = false
    domainMenuOpen.value = false
  }

  function onClickOutside() {
    showDropdown.value = false
    domainMenuOpen.value = false
    if (clearedLocally.value && props.modelValue) {
      clearedLocally.value = false
      editingText.value = ''
    }
  }

  function toggleDomainMenu() {
    domainMenuOpen.value = !domainMenuOpen.value
  }

  function registerDropdownEl(el: HTMLElement | null) {
    dropdownRef.value = el
  }

  function registerDomainMenuAnchor(el: HTMLElement | null) {
    domainMenuAnchor.value = el
  }

  function registerDomainMenuPanel(el: HTMLElement | null) {
    domainMenuPanelRef.value = el
  }

  useClickOutside(
    () =>
      [wrapRef.value, dropdownRef.value, domainMenuAnchor.value, domainMenuPanelRef.value].filter(
        (el): el is HTMLElement => !!el,
      ),
    onClickOutside,
  )

  return {
    wrapRef,
    showDropdown,
    domainMenuOpen,
    selectedDomain,
    activeFlatIdx,
    displayValue,
    showClearBtn,
    dropdownStyle,
    teleportTarget,
    teleportDisabled,
    placement,
    domainMenuPlacement,
    domainMenuStyle,
    domainMenuTeleportTarget,
    domainMenuTeleportDisabled,
    totalEntityCount,
    domainCounts,
    availableDomains,
    groupedItems,
    flatItems,
    showDomainFilter,
    showGroupHeader,
    useVirtualDropdown,
    entityItemKey,
    isActive,
    setActive,
    onInput,
    onFocus,
    select,
    clear,
    moveDown,
    moveUp,
    selectCurrent,
    closeDropdown,
    selectFilterDomain,
    toggleDomainMenu,
    registerDropdownEl,
    registerDomainMenuAnchor,
    registerDomainMenuPanel,
  }
}
