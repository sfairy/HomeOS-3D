<!--
  组件文件：NavTabEditor.vue
  所属模块：frontend/src/views/settings/display
  组件职责：显示主题大类下的顶栏导航编辑器，提供桌面端顶栏 Tab 的可见性、顺序与放置
    位置（顶栏/更多下拉菜单/隐藏）可视化配置。上部为实时预览区，中部为拖拽排序列表，
    工具栏提供「全部显示」「重置默认」操作。
  主要 props / emits：无 props / emits（独立 Section 级面板，直接读写 store）。
  依赖关系：通过 useLayoutStore Pinia store 读取与写入 navTabs 顺序、可见性与下拉配置；
    引用 nav-tabs.util、embed-nav-theme.util、embed-icons.util 等工具函数计算预览与排序。
  注意事项：「总览」主页始终固定在顶栏不可移除；手机端底部导航不受此配置影响；修改
    后须点击设置页顶部「保存布局」按钮持久化到服务端。
-->
<template>
  <div class="nav-tab-editor">
    <section class="nav-tab-editor__preview" aria-label="顶栏预览">
      <div class="nav-tab-editor__preview-head">
        <span class="nav-tab-editor__preview-eyebrow">{{ '顶栏预览' }}</span>
        <div class="nav-tab-editor__stats">
          <span class="nav-tab-editor__stat nav-tab-editor__stat--on">
            <Eye class="w-3 h-3" aria-hidden="true" />
            {{ barCount }} {{ '顶栏' }}
          </span>
          <span class="nav-tab-editor__stat nav-tab-editor__stat--menu">
            <LayoutDashboard class="w-3 h-3" aria-hidden="true" />
            {{ dropdownCount }} {{ '更多' }}
          </span>
          <span v-if="hiddenCount" class="nav-tab-editor__stat nav-tab-editor__stat--off">
            <EyeOff class="w-3 h-3" aria-hidden="true" />
            {{ hiddenCount }} {{ '隐藏' }}
          </span>
        </div>
      </div>

      <div class="nav-tab-editor__mock-bar">
        <div class="nav-tab-editor__mock-brand">
          <img :src="brandLogoUrl" class="nav-tab-editor__mock-logo" alt="" />
          <span class="nav-tab-editor__mock-title">{{ siteTitle }}</span>
        </div>
        <div class="nav-tab-editor__mock-tabs">
          <span class="nav-tab-editor__tab nav-tab-editor__tab--home nav-tab-editor__tab--active">
            <Home class="nav-tab-editor__tab-icon" aria-hidden="true" />
            <span>{{ '总览' }}</span>
          </span>
          <template v-for="tab in previewBarTabs" :key="tab.id">
            <span
              class="nav-tab-editor__tab"
              :class="tab.id === previewHighlightId && 'nav-tab-editor__tab--active'"
              :style="{ '--tab-accent': tab.accent }"
            >
              <component :is="tab.icon" class="nav-tab-editor__tab-icon" aria-hidden="true" />
              <span>{{ tab.label }}</span>
            </span>
          </template>
          <span
            v-if="previewDropdownTabs.length"
            class="nav-tab-editor__tab nav-tab-editor__tab--more"
            :class="previewDropdownActive && 'nav-tab-editor__tab--active'"
          >
            <LayoutDashboard class="nav-tab-editor__tab-icon" aria-hidden="true" />
            <span>{{ '更多' }}</span>
            <span class="nav-tab-editor__more-count">{{ previewDropdownTabs.length }}</span>
          </span>
        </div>
      </div>

      <div v-if="previewDropdownTabs.length" class="nav-tab-editor__dropdown-preview">
        <span class="nav-tab-editor__dropdown-label">{{ '更多菜单' }}</span>
        <div class="nav-tab-editor__dropdown-items">
          <span
            v-for="tab in previewDropdownTabs"
            :key="tab.id"
            class="nav-tab-editor__dropdown-item"
            :class="tab.id === previewHighlightId && 'nav-tab-editor__dropdown-item--active'"
            :style="{ '--tab-accent': tab.accent }"
          >
            <component :is="tab.icon" class="nav-tab-editor__tab-icon" aria-hidden="true" />
            <span>{{ tab.label }}</span>
          </span>
        </div>
      </div>
    </section>

    <div class="nav-tab-editor__toolbar">
      <p class="nav-tab-editor__toolbar-hint">
        {{
          '拖拽或使用箭头调整顺序；总览始终可见。手机底栏固定为总览、设备、场景、自动化、更多，不受此项影响。'
        }}
      </p>
      <div class="nav-tab-editor__actions">
        <button type="button" class="nav-tab-editor__action" @click="showAllTabs">
          {{ '全部显示' }}
        </button>
        <button type="button" class="nav-tab-editor__action" @click="moveOptionalToDropdown">
          {{ '可选收入更多' }}
        </button>
        <button type="button" class="nav-tab-editor__action" @click="resetTabOrder">
          {{ '恢复顺序' }}
        </button>
      </div>
    </div>

    <div class="nav-tab-editor__list" role="list" :aria-label="'导航标签排序与可见性'">
      <article
        v-for="(tabId, index) in orderedNavTabIds"
        :key="tabId"
        role="listitem"
        :draggable="true"
        :class="[
          'nav-tab-editor__row',
          isVisible(tabId) && 'nav-tab-editor__row--on',
          !isVisible(tabId) && 'nav-tab-editor__row--off',
          highlightedTabId === tabId && 'nav-tab-editor__row--focus',
          draggingIndex === index && 'nav-tab-editor__row--dragging',
          dragOverIndex === index && draggingIndex !== index && 'nav-tab-editor__row--drag-over',
          isEmbedNavTabId(tabId) && 'nav-tab-editor__row--embed',
        ]"
        :style="{ '--row-accent': tabMeta(tabId).accent }"
        @dragstart="onDragStart($event, index)"
        @dragover="onDragOver($event, index)"
        @dragleave="onDragLeave(index)"
        @drop="onDrop($event, index)"
        @dragend="onDragEnd"
        @click="highlightTab(tabId)"
      >
        <div class="nav-tab-editor__row-lead">
          <button
            type="button"
            class="nav-tab-editor__handle"
            :aria-label="'拖拽排序'"
            @mousedown.stop
          >
            <GripVertical class="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <span class="nav-tab-editor__index">{{ String(index + 1).padStart(2, '0') }}</span>
          <div class="nav-tab-editor__orb">
            <component :is="tabMeta(tabId).icon" class="w-[16px] h-[16px]" aria-hidden="true" />
          </div>
          <div class="nav-tab-editor__copy">
            <span class="nav-tab-editor__label">{{ tabMeta(tabId).label }}</span>
            <span class="nav-tab-editor__path">{{ tabMeta(tabId).path }}</span>
          </div>
        </div>

        <div class="nav-tab-editor__row-controls" @click.stop>
          <button
            type="button"
            class="nav-tab-editor__visibility"
            :class="isVisible(tabId) && 'nav-tab-editor__visibility--on'"
            :aria-label="isVisible(tabId) ? '隐藏标签' : '显示标签'"
            :aria-pressed="isVisible(tabId) ? 'true' : 'false'"
            @click="toggleNavTab(tabId)"
          >
            <Eye v-if="isVisible(tabId)" class="w-3.5 h-3.5" aria-hidden="true" />
            <EyeOff v-else class="w-3.5 h-3.5" aria-hidden="true" />
          </button>

          <div
            v-if="isVisible(tabId)"
            class="nav-tab-editor__placement"
            role="group"
            :aria-label="'展示位置'"
          >
            <button
              type="button"
              class="nav-tab-editor__placement-btn"
              :class="!isInDropdown(tabId) && 'nav-tab-editor__placement-btn--active'"
              @click="setPlacement(tabId, 'bar')"
            >
              {{ '顶栏' }}
            </button>
            <button
              type="button"
              class="nav-tab-editor__placement-btn"
              :class="isInDropdown(tabId) && 'nav-tab-editor__placement-btn--active'"
              @click="setPlacement(tabId, 'dropdown')"
            >
              {{ '更多' }}
            </button>
          </div>
          <span v-else class="nav-tab-editor__hidden-badge">{{ '已隐藏' }}</span>

          <div class="nav-tab-editor__nudge-group">
            <button
              type="button"
              class="nav-tab-editor__nudge"
              :disabled="index === 0"
              :aria-label="'上移'"
              @click="moveNavTab(index, -1)"
            >
              <ChevronUp class="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              class="nav-tab-editor__nudge"
              :disabled="index >= orderedNavTabIds.length - 1"
              :aria-label="'下移'"
              @click="moveNavTab(index, 1)"
            >
              <ChevronDown class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import {
  Home,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  Smartphone,
  ShieldCheck,
  ScrollText,
  Bell,
  Activity,
  LayoutDashboard,
  Workflow,
  Leaf,
  BarChart3,
} from '@lucide/vue'
import { useLayoutStore } from '@/stores/layout.store'
import {
  embedNavTabId,
  isEmbedNavTabId,
  isNavTabInDropdown,
  isNavTabVisible,
  NAV_OPTIONAL_TAB_IDS,
  NAV_TAB_ORDER_DEFAULT,
  resolveOrderedNavTabIds,
  setNavTabPlacement,
  toggleNavTabVisibility,
} from '@/utils/layout/nav-tabs.util'
import { EMBED_TAB_ACCENTS, resolveEmbedNavAccent } from '@/utils/layout/embed-nav-theme.util'
import { resolveEmbedIconComponent } from '@/utils/layout/embed-icons.util'
import { DEFAULT_BRAND_LOGO_URL } from '@/utils/layout/nav-tabs.util'

const layoutStore = useLayoutStore()

// 核心 Tab 元信息（id / label / path / icon / accent），顺序为默认顺序
const CORE_NAV_TABS = [
  { id: 'devices', label: '设备', path: '/devices', icon: Smartphone, accent: '#64D2FF' },
  {
    id: 'linkage',
    label: '联动',
    path: '/linkage',
    icon: Workflow,
    accent: '#BF5AF2',
  },
  { id: 'life', label: '生活', path: '/life', icon: Leaf, accent: '#2dd4bf' },
  { id: 'security', label: '安防', path: '/security', icon: ShieldCheck, accent: '#FF375F' },
  { id: 'events', label: '事件', path: '/events', icon: ScrollText, accent: '#38bdf8' },
  { id: 'notifications', label: '通知', path: '/notifications', icon: Bell, accent: '#f472b6' },
  {
    id: 'earthquake-history',
    label: '地震',
    path: '/earthquake-history',
    icon: Activity,
    accent: '#fbbf24',
  },
  {
    id: 'reports',
    label: '报表',
    path: '/reports',
    icon: BarChart3,
    accent: '#a78bfa',
  },
]

const draggingIndex = ref(-1)
const dragOverIndex = ref(-1)
const highlightedTabId = ref(null)

// 站点标题：读取布局配置，缺失回退为 HomeOS
const siteTitle = computed(() => {
  const title = layoutStore.layoutConfig.siteTitle?.trim()
  return title || 'HomeOS'
})

const brandLogoUrl = DEFAULT_BRAND_LOGO_URL

// Tab 可见性 Map（id → boolean）
const navTabVisibility = computed(() => ({ ...(layoutStore.layoutConfig.navTabVisibility || {}) }))
// Tab 放置位置 Map（id → 'bar' | 'dropdown'）
const navTabPlacement = computed(() => ({ ...(layoutStore.layoutConfig.navTabPlacement || {}) }))

// 动态内嵌页 Tab：优先使用 customEmbeds，否则回退到 MoviePilot 单 Tab
const dynamicNavTabs = computed(() => {
  const tabs = []
  const embeds = layoutStore.layoutConfig.customEmbeds || []
  if (embeds.length > 0) {
    embeds.forEach((embed, idx) => {
      const id = embedNavTabId(embed.id)
      const iconKey = embed.icon || 'MonitorPlay'
      tabs.push({
        id,
        label: embed.name || embed.id || id,
        path: `/embed/${embed.id}`,
        icon: resolveEmbedIconComponent(iconKey),
        accent: resolveEmbedNavAccent(embed, idx),
      })
    })
  } else if (layoutStore.layoutConfig.moviePilotUrl) {
    tabs.push({
      id: 'media',
      label: '影视',
      path: '/embed/movie-pilot',
      icon: resolveEmbedIconComponent('MonitorPlay'),
      accent: EMBED_TAB_ACCENTS[0],
    })
  }
  return tabs
})

const allNavTabs = computed(() => [...CORE_NAV_TABS, ...dynamicNavTabs.value])

// 排序后的 Tab id 列表（合并默认顺序与动态 Tab）
const orderedNavTabIds = computed(() =>
  resolveOrderedNavTabIds(
    layoutStore.layoutConfig.navTabOrder,
    dynamicNavTabs.value.map((t) => t.id),
  ),
)

// 预览用 Tab 列表（合并元信息、可见性、放置位置）
const previewTabs = computed(() =>
  orderedNavTabIds.value.map((id) => {
    const meta = tabMeta(id)
    return {
      id,
      label: meta.label,
      icon: meta.icon,
      accent: meta.accent,
      visible: isVisible(id),
      inDropdown: isInDropdown(id),
    }
  }),
)

// 顶栏直显 Tab（可见且未放入下拉）
const previewBarTabs = computed(() =>
  previewTabs.value.filter((tab) => tab.visible && !tab.inDropdown),
)

// 「更多」下拉 Tab（可见但放入下拉）
const previewDropdownTabs = computed(() =>
  previewTabs.value.filter((tab) => tab.visible && tab.inDropdown),
)

// 预览高亮 id：优先取当前选中，否则取首个顶栏或下拉 Tab
const previewHighlightId = computed(() => {
  if (highlightedTabId.value) return highlightedTabId.value
  return previewBarTabs.value[0]?.id ?? previewDropdownTabs.value[0]?.id ?? null
})

const previewDropdownActive = computed(() =>
  previewDropdownTabs.value.some((tab) => tab.id === previewHighlightId.value),
)

const barCount = computed(() => previewBarTabs.value.length)
const dropdownCount = computed(() => previewDropdownTabs.value.length)
const hiddenCount = computed(() => previewTabs.value.filter((tab) => !tab.visible).length)

// 取 Tab 元信息：从 allNavTabs 查找，缺失时回退默认值
function tabMeta(id) {
  return (
    allNavTabs.value.find((t) => t.id === id) || {
      id,
      label: id,
      path: '/',
      icon: Smartphone,
      accent: '#60a5fa',
    }
  )
}

function isVisible(id) {
  return isNavTabVisible(navTabVisibility.value, id)
}

function isInDropdown(id) {
  return isNavTabInDropdown(navTabPlacement.value, id)
}

function highlightTab(tabId) {
  highlightedTabId.value = tabId
}

// 设置 Tab 放置位置（顶栏 / 更多）
function setPlacement(id, placement) {
  layoutStore.layoutConfig.navTabPlacement = setNavTabPlacement(
    layoutStore.layoutConfig.navTabPlacement,
    id,
    placement,
  )
  highlightedTabId.value = id
}

// 切换 Tab 可见性
function toggleNavTab(id) {
  layoutStore.layoutConfig.navTabVisibility = toggleNavTabVisibility(
    layoutStore.layoutConfig.navTabVisibility,
    id,
  )
  highlightedTabId.value = id
}

// 全部显示：将所有 Tab 设为可见
function showAllTabs() {
  layoutStore.layoutConfig.navTabVisibility = Object.fromEntries(
    allNavTabs.value.map((t) => [t.id, true]),
  )
}

// 可选 Tab 收入「更多」下拉
function moveOptionalToDropdown() {
  const next = { ...(layoutStore.layoutConfig.navTabPlacement || {}) }
  for (const tabId of NAV_OPTIONAL_TAB_IDS) {
    if (isNavTabVisible(layoutStore.layoutConfig.navTabVisibility, tabId)) {
      next[tabId] = 'dropdown'
    }
  }
  layoutStore.layoutConfig.navTabPlacement = next
}

// 恢复默认顺序：默认顺序 + 动态 Tab
function resetTabOrder() {
  layoutStore.layoutConfig.navTabOrder = [
    ...NAV_TAB_ORDER_DEFAULT,
    ...dynamicNavTabs.value.map((t) => t.id),
  ]
}

// 重新排序：从 fromIndex 移到 toIndex
function reorderNavTab(fromIndex, toIndex) {
  const list = [...orderedNavTabIds.value]
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= list.length || toIndex >= list.length) return
  const [item] = list.splice(fromIndex, 1)
  list.splice(toIndex, 0, item)
  layoutStore.layoutConfig.navTabOrder = list
}

function moveNavTab(index, delta) {
  reorderNavTab(index, index + delta)
}

// 拖拽相关事件处理：dragstart / dragover / dragleave / drop / dragend
function onDragStart(event, index) {
  draggingIndex.value = index
  dragOverIndex.value = -1
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', String(index))
}

function onDragOver(event, index) {
  if (draggingIndex.value < 0) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  dragOverIndex.value = index
}

function onDragLeave(index) {
  if (dragOverIndex.value === index) dragOverIndex.value = -1
}

function onDrop(event, toIndex) {
  event.preventDefault()
  const fromIndex = draggingIndex.value
  if (fromIndex >= 0 && fromIndex !== toIndex) {
    reorderNavTab(fromIndex, toIndex)
  }
  onDragEnd()
}

function onDragEnd() {
  draggingIndex.value = -1
  dragOverIndex.value = -1
}
</script>
