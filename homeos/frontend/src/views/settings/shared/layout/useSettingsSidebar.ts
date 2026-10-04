/**
 * 文件：useSettingsSidebar.ts
 * 职责：设置侧栏 composable。提供分组展开/折叠、搜索过滤、未保存快捷入口（pendingTray）、
 *       搜索结果高亮等逻辑，供 SettingsSidebar 复用。
 * 关键依赖：
 *   - vue 的 computed / ref / watch / onMounted / onUnmounted
 *   - filterNavGroupsBySearch / flattenNavSearchResults / countNavTabs / highlightSearchParts：导航搜索
 *   - tabLabel：Tab 标签
 *   - getIndependentPendingTabIds：独立保存 Tab 的未保存标记
 */
import { computed, ref, watch, onMounted, onUnmounted, type Ref } from 'vue'
import {
  filterNavGroupsBySearch,
  flattenNavSearchResults,
  countNavTabs,
  highlightSearchParts,
} from '@/views/settings/nav-search.util'
import { tabLabel } from '@/utils/registry/settings-nav.util'
import { getIndependentPendingTabIds } from '@/composables/settings/pending.internals'

interface SettingsNavGroup {
  id: string
  label: string
  icon: unknown
  tabs: Array<{ id: string; label: string; icon: unknown; independentSave?: boolean }>
}

export function useSettingsSidebar(
  groups: Ref<SettingsNavGroup[]>,
  activeTab: Ref<string>,
  searchQuery: Ref<string>,
) {
  const showSearch = computed(() => countNavTabs(groups.value) > 4)

  const pendingTabIds = computed(() => getIndependentPendingTabIds())

  const pendingTrayItems = computed(() =>
    pendingTabIds.value.map((id) => ({
      id,
      label: tabLabel(id),
    })),
  )

  const headerSubtitle = computed(() => {
    if (countNavTabs(groups.value) <= 1) return '账户与安全'
    const n = pendingTabIds.value.length
    if (n) return `${n} 项未保存`
    return '系统组态配置'
  })

  const displayGroups = computed(() =>
    filterNavGroupsBySearch(groups.value, searchQuery.value),
  )
  const isSearchMode = computed(() => searchQuery.value.trim().length > 0)
  const searchResults = computed(() =>
    isSearchMode.value ? flattenNavSearchResults(displayGroups.value) : [],
  )

  /** 当前展开的一级分组 id，null 表示全部收起 */
  const expandedGroupId = ref<string | null>(null)
  const searchRef = ref<HTMLInputElement | null>(null)

  function isTypingTarget(el: EventTarget | null) {
    const node = el as HTMLElement | null
    const tag = node?.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node?.isContentEditable
  }

  function onGlobalKeydown(e: KeyboardEvent) {
    if (!showSearch.value) return
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (isTypingTarget(e.target)) return
      e.preventDefault()
      searchRef.value?.focus()
      return
    }
    if (e.key === 'Escape' && e.target === searchRef.value && searchQuery.value) {
      e.preventDefault()
      searchQuery.value = ''
      searchRef.value?.blur()
    }
  }

  function isExpanded(groupId: string) {
    if (isSearchMode.value) return true
    return expandedGroupId.value === groupId
  }

  function isGroupActive(group: SettingsNavGroup) {
    return group.tabs.some((tab) => tab.id === activeTab.value)
  }

  function toggleGroup(groupId: string) {
    if (isSearchMode.value) return
    expandedGroupId.value = expandedGroupId.value === groupId ? null : groupId
  }

  function onNavigate(
    tabId: string,
    groupId: string,
    emit: (event: 'navigate', tabId: string) => void,
  ) {
    expandedGroupId.value = groupId
    emit('navigate', tabId)
  }

  watch(
    activeTab,
    (tabId) => {
      if (isSearchMode.value) return
      const group = groups.value.find((g) => g.tabs.some((tab) => tab.id === tabId))
      if (group) expandedGroupId.value = group.id
    },
    { immediate: true },
  )

  watch(isSearchMode, (active) => {
    if (!active) return
    expandedGroupId.value = null
  })

  onMounted(() => {
    window.addEventListener('keydown', onGlobalKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', onGlobalKeydown)
  })

  return {
    showSearch,
    headerSubtitle,
    displayGroups,
    isSearchMode,
    searchResults,
    expandedGroupId,
    searchRef,
    pendingTabIds,
    pendingTrayItems,
    isExpanded,
    isGroupActive,
    toggleGroup,
    onNavigate,
    highlightSearchParts,
  }
}
