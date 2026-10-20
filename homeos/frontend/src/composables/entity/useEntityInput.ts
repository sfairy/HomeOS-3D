/**
 * @file useEntityInput.ts
 * @module frontend/src/composables
 */
import { ref, computed, nextTick, watch, type Ref } from 'vue'
import { useClickOutside } from '@/composables/ui/useClickOutside'
import { useEntityPickerSession } from '@/composables/entity/useEntityPickerSession'
import { getEntityDisplayName } from '@/shared/entity/utils/derived.util'
import type { HaEntityState } from '@/shared/types/entity-store'
import {
  buildEntityInputGroups,
  inferSuggestDeviceClassFromPlaceholder,
  type EntityInputGroup,
  type EntityInputItem,
} from '@/composables/entity/entity-input.internals'

export type { EntityInputItem, EntityInputGroup }

interface UseEntityInputProps {
  modelValue: string
  placeholder: string
  domainFilter: string
  suggestDeviceClass: string
  dropdownMinWidth: number
  dropdownMaxHeight: number
}

type EntityInputEmit = (event: 'update:modelValue', value: string) => void

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
      .map((domain) => domain.trim())
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
    for (const domain of filterDomains.value) {
      sum += entitiesStore.domainCounts.get(domain) || 0
    }
    return sum
  })

  const domainCounts = computed(() => {
    const counts: Record<string, number> = {}
    for (const [domain, count] of entitiesStore.domainCounts) {
      if (hasDomainFilter.value && !filterDomainSet.value.has(domain)) continue
      counts[domain] = count
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
    query: string,
    activeSuggest: string,
  ): EntityInputGroup[] {
    return buildEntityInputGroups({
      entries,
      query: query,
      activeSuggest,
      selectedDomain: selectedDomain.value,
      filterDomainSet: hasDomainFilter.value ? filterDomainSet.value : null,
    })
  }

  const autoSuggestDeviceClass = computed(() => {
    if (props.suggestDeviceClass) return props.suggestDeviceClass
    return inferSuggestDeviceClassFromPlaceholder(props.placeholder || '')
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
    const query = (showDropdown.value || clearedLocally.value ? editingText.value : props.modelValue)
      .toLowerCase()
      .trim()
    const activeSuggest = autoSuggestDeviceClass.value || props.suggestDeviceClass

    if (useRestSearch.value && showDropdown.value) {
      const entries = restItems.value.map((entity) => ({
        key: entity.entity_id,
        e: entitiesStore.entities[entity.entity_id] || entity,
      }))
      return buildGroupedFromEntries(entries, query, activeSuggest)
    }

    const entities = entitiesStore.entities
    const ids = getIndexedCandidateIds()
    const entries = ids.map((key) => ({ key, e: entities[key] }))
    return buildGroupedFromEntries(entries, query, activeSuggest)
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
    const groupIndex = groupedItems.value.indexOf(group)
    return groupIndex === activeGroupIdx.value && idx === activeItemIdx.value
  }

  function setActive(_item: EntityInputItem, idx: number, group: EntityInputGroup) {
    const groupIndex = groupedItems.value.indexOf(group)
    activeGroupIdx.value = groupIndex
    activeItemIdx.value = idx
  }

  function onInput(event: Event) {
    editingText.value = (event.target as HTMLInputElement).value
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
