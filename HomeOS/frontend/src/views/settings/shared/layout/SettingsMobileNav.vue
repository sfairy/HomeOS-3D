<!--
组件：SettingsMobileNav.vue
所属模块：frontend / src / views / settings / shared / layout
职责：设置移动端导航。横向滚动 Tab 列表，Tab 数超过阈值时显示搜索框，支持搜索过滤、
      高亮匹配片段、水平滚动指示与键盘 Escape 清空。
Props：
  - groups：导航分组列表
  - activeTab：当前激活 Tab id
  - searchQuery：搜索关键词
Emits：
  - navigate：跳转 Tab
  - update:searchQuery：搜索关键词变更
关键依赖：
  - filterNavGroupsBySearch / flattenNavSearchResults / countNavTabs / highlightSearchParts：导航搜索工具
数据来源：父级透传的 groups / activeTab
-->
<template>
  <nav class="settings-mobile-nav" :aria-label="'设置'">
    <div v-if="showSearch" class="settings-mobile-nav__search">
      <Search class="settings-mobile-nav__search-icon" aria-hidden="true" />
      <input
        ref="mobileSearchRef"
        :value="searchQuery"
        type="text"
        role="searchbox"
        inputmode="search"
        class="settings-mobile-nav__search-input"
        :placeholder="'搜索设置…'"
        :aria-label="'搜索设置页'"
        autocomplete="off"
        @input="onSearchInput"
        @keydown.escape="onSearchEscape"
      />
    </div>

    <template v-if="isSearchMode">
      <div
        class="settings-mobile-nav__tabs settings-mobile-nav__tabs--search"
        role="tablist"
        :aria-label="'搜索结果'"
      >
        <button
          v-for="item in searchResults"
          :key="item.id"
          type="button"
          role="tab"
          :aria-selected="activeTab === item.id"
          :class="[
            'settings-mobile-nav__btn',
            'settings-mobile-nav__btn--search',
            activeTab === item.id && 'settings-mobile-nav__btn--active',
          ]"
          @click="emit('navigate', item.id)"
        >
          <component :is="item.icon" class="settings-mobile-nav__btn-icon" />
          <span class="settings-mobile-nav__btn-label">
            <template v-for="(part, hi) in highlightSearchParts(item.label, searchQuery)" :key="hi">
              <mark v-if="part.match" class="settings-search-mark">{{ part.text }}</mark>
              <template v-else>{{ part.text }}</template>
            </template>
          </span>
          <span class="settings-mobile-nav__btn-group">
            <template
              v-for="(part, hi) in highlightSearchParts(item.groupLabel, searchQuery)"
              :key="'g' + hi"
            >
              <mark v-if="part.match" class="settings-search-mark">{{ part.text }}</mark>
              <template v-else>{{ part.text }}</template>
            </template>
          </span>
        </button>
        <p v-if="!searchResults.length" class="settings-mobile-nav__empty">{{ '无匹配设置项' }}</p>
      </div>
    </template>

    <template v-else>
      <div class="settings-mobile-nav__groups" role="tablist" :aria-label="'设置分组'">
        <button
          v-for="group in groups"
          :key="group.id"
          type="button"
          role="tab"
          :aria-selected="activeGroupId === group.id"
          :class="[
            'settings-mobile-nav__group',
            activeGroupId === group.id && 'settings-mobile-nav__group--active',
          ]"
          @click="onGroupClick(group.id)"
        >
          <component :is="group.icon" class="settings-mobile-nav__group-icon" />
          <span>{{ group.label }}</span>
        </button>
      </div>

      <div class="settings-mobile-nav__group-head" aria-hidden="true">
        <span class="settings-mobile-nav__group-head-label">{{ activeGroup?.label }}</span>
        <span class="settings-mobile-nav__group-head-count">{{ visibleTabs.length }} 项</span>
      </div>
      <div
        ref="tabsTrackRef"
        class="settings-mobile-nav__tabs"
        role="tablist"
        :aria-label="'设置页面'"
      >
        <button
          v-for="tab in visibleTabs"
          :key="tab.id"
          :ref="(el) => setTabRef(tab.id, el)"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab.id"
          :class="[
            'settings-mobile-nav__btn',
            activeTab === tab.id && 'settings-mobile-nav__btn--active',
          ]"
          @click="emit('navigate', tab.id)"
        >
          <component :is="tab.icon" class="settings-mobile-nav__btn-icon" />
          <span>{{ tab.label }}</span>
          <span v-if="tab.independentSave" class="settings-mobile-nav__save-dot" :title="'面板内保存'" />
        </button>
      </div>
    </template>
  </nav>
</template>

<script setup>
import { readLocalStorage, writeLocalStorage } from '@/utils/core/local-storage.util'
/**
 * 所属模块：frontend/views
 * 职责：渲染 views/SettingsMobileNav 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { Search } from '@lucide/vue'
import {
  filterNavGroupsBySearch,
  flattenNavSearchResults,
  countNavTabs,
  highlightSearchParts,
} from '@/views/settings/nav-search.util'

const props = defineProps({
  groups: { type: Array, required: true },
  activeTab: { type: String, required: true },
  searchQuery: { type: String, default: '' },
})

const emit = defineEmits(['navigate', 'update:searchQuery'])

const tabsTrackRef = ref(null)
const tabRefs = ref({})
const mobileSearchRef = ref(null)

const showSearch = computed(() => countNavTabs(props.groups) > 4)

const isSearchMode = computed(() => props.searchQuery.trim().length > 0)

const filteredGroups = computed(() => filterNavGroupsBySearch(props.groups, props.searchQuery))

const searchResults = computed(() =>
  isSearchMode.value ? flattenNavSearchResults(filteredGroups.value) : [],
)

function onSearchInput(event) {
  emit('update:searchQuery', event.target?.value ?? '')
}

function onSearchEscape(event) {
  if (!props.searchQuery.trim()) return
  event.preventDefault()
  emit('update:searchQuery', '')
  event.target?.blur()
}

function isTypingTarget(el) {
  const tag = el?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable
}

function onGlobalKeydown(e) {
  if (!showSearch.value) return
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
  if (isTypingTarget(e.target)) return
  e.preventDefault()
  mobileSearchRef.value?.focus()
}

function setTabRef(id, el) {
  if (el) tabRefs.value[id] = el
  else delete tabRefs.value[id]
}

const activeGroupId = computed(() => {
  const group = props.groups.find((g) => g.tabs.some((tab) => tab.id === props.activeTab))
  return group?.id ?? props.groups[0]?.id ?? ''
})

const activeGroup = computed(
  () => props.groups.find((g) => g.id === activeGroupId.value) ?? props.groups[0] ?? null,
)

const visibleTabs = computed(() => activeGroup.value?.tabs ?? [])

const MOBILE_NAV_GROUP_KEY = 'homeos.settings.mobileNav.lastGroup'

function onGroupClick(groupId) {
  try {
    writeLocalStorage(MOBILE_NAV_GROUP_KEY, groupId)
  } catch {
    /* 忽略 */
  }
  if (groupId === activeGroupId.value) {
    scrollActiveTabIntoView('auto')
    return
  }
  const group = props.groups.find((g) => g.id === groupId)
  const first = group?.tabs?.[0]
  if (first) emit('navigate', first.id)
}

function scrollActiveTabIntoView(behavior = 'auto') {
  if (isSearchMode.value) return
  nextTick(() => {
    const el = tabRefs.value[props.activeTab]
    const track = tabsTrackRef.value
    if (!el || !track) return
    const left = el.offsetLeft - track.scrollLeft
    const right = left + el.offsetWidth
    if (left >= -2 && right <= track.clientWidth + 2) return
    const targetLeft = el.offsetLeft - (track.clientWidth - el.offsetWidth) / 2
    const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth)
    track.scrollTo({
      left: Math.min(maxScroll, Math.max(0, targetLeft)),
      behavior: behavior === 'smooth' ? 'smooth' : 'auto',
    })
  })
}

watch(
  () => props.activeTab,
  () => scrollActiveTabIntoView('auto'),
)

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown)
  scrollActiveTabIntoView('auto')
  try {
    const savedGroup = readLocalStorage(MOBILE_NAV_GROUP_KEY)
    if (savedGroup && savedGroup !== activeGroupId.value) {
      const group = props.groups.find((g) => g.id === savedGroup)
      const tabInGroup = group?.tabs?.find((t) => t.id === props.activeTab)
      if (tabInGroup) scrollActiveTabIntoView('auto')
    }
  } catch {
    /* 忽略 */
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
})
</script>

<style scoped>
/* 分组标题：标明当前标签条所属分组，避免层级不清 */
.settings-mobile-nav__group-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 2px 0;
}

.settings-mobile-nav__group-head-label {
  font-size: var(--premium-fs-micro, 12px);
  font-weight: 800;
  letter-spacing: 0.04em;
  color: rgba(255, 255, 255, 0.85);
}

.settings-mobile-nav__group-head-count {
  font-size: var(--premium-fs-micro, 12px);
  font-weight: 600;
  color: var(--hos-text-secondary);
}

/* 独立保存面板标记：与桌面侧栏保存点视觉一致 */
.settings-mobile-nav__save-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(251, 191, 36, 0.9);
  box-shadow: 0 0 8px rgba(251, 191, 36, 0.45);
}
</style>
