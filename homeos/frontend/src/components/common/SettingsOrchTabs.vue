<!--
组件：SettingsOrchTabs.vue
所属模块：frontend / src / views / settings / shared / layout
职责：设置页 OrchTabs 子导航。横向 Tab 按钮列表，支持激活指示条、溢出滚动、排序（左右箭头移动）、
      工具栏模式与 plain 嵌套模式。用于设置各面板内子区段切换。
Props：
  - tabs：Tab 配置列表（id / label / icon / count / accent）
  - modelValue：当前选中 id
  - toolbar：单行工具栏模式
  - sortable：启用排序箭头
  - plain：去掉 dock 背景与底边（嵌套在 SettingsCard 内时使用）
Emits：
  - update:modelValue：切换 Tab
  - reorder：排序变更
关键依赖：@lucide/vue 的 ChevronLeft / ChevronRight
数据来源：父级透传的 tabs
-->
<template>
  <div
    :class="[
      'settings-orch-dock',
      toolbar && 'settings-orch-dock--toolbar',
      plain && 'settings-orch-dock--plain',
    ]"
    :style="{ '--orch-accent': activeAccent }"
  >
    <div class="settings-orch-toolbar">
      <button
        v-if="sortable && safeTabs.length > 1"
        type="button"
        class="settings-orch-sort-shift"
        :disabled="!canSortShiftLeft"
        :aria-label="'左移'"
        :title="'左移'"
        @click="moveSort(-1)"
      >
        <ChevronLeft class="w-4 h-4" />
      </button>
      <div class="settings-orch-shell">
        <button
          v-show="hasOverflow"
          type="button"
          class="settings-orch-arrow"
          :disabled="!canScrollLeft"
          :aria-label="'向左'"
          @click="scrollNav(-1)"
        >
          <ChevronLeft class="w-4 h-4" />
        </button>
        <div
          ref="trackRef"
          :class="['settings-orch-track', hasOverflow && 'settings-orch-track--overflow']"
          @scroll="onTrackScroll"
        >
          <button
            v-for="tab in safeTabs"
            :key="tab.id"
            :ref="(el) => setTabRef(tab.id, el)"
            type="button"
            :class="[
              'settings-orch-tab',
              modelValue === tab.id && 'settings-orch-tab--active',
              tab.disabled && 'settings-orch-tab--disabled',
            ]"
            :style="{ '--tab-accent': tabAccent(tab) }"
            @click="select(tab.id)"
          >
            <div class="settings-orch-orb">
              <span v-if="tab.emoji" class="settings-orch-emoji">{{ tab.emoji }}</span>
              <component v-else-if="tab.icon" :is="tab.icon" class="w-4 h-4" />
              <span
                v-if="tab.count != null && !toolbar"
                :class="['settings-orch-count', 'settings-orch-count--badge', tab.countClass]"
              >
                {{ tab.count }}
              </span>
            </div>
            <span class="settings-orch-label">{{ tab.label }}</span>
            <span
              v-if="tab.count != null && toolbar"
              :class="['settings-orch-count', 'settings-orch-count--inline', tab.countClass]"
              :title="tab.countTitle || `${tab.count} 条`"
            >
              {{ tab.count }}
            </span>
          </button>
          <div class="settings-orch-indicator" :style="indicatorStyle" />
        </div>
        <button
          v-show="hasOverflow"
          type="button"
          class="settings-orch-arrow"
          :disabled="!canScrollRight"
          :aria-label="'向右'"
          @click="scrollNav(1)"
        >
          <ChevronRight class="w-4 h-4" />
        </button>
      </div>
      <button
        v-if="sortable && safeTabs.length > 1"
        type="button"
        class="settings-orch-sort-shift"
        :disabled="!canSortShiftRight"
        :aria-label="'右移'"
        :title="'右移'"
        @click="moveSort(1)"
      >
        <ChevronRight class="w-4 h-4" />
      </button>
      <div v-if="$slots.actions" class="settings-orch-toolbar-actions">
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { ChevronLeft, ChevronRight } from '@lucide/vue'
const props = defineProps({
  tabs: { type: Array, default: () => [] },
  modelValue: { type: String, required: true },
  /** 单行工具栏：横向 Tab + 右侧操作区，用于联动中心 */
  toolbar: { type: Boolean, default: false },
  /** 启用排序：Tab 两侧箭头移动当前选中项（触控友好） */
  sortable: { type: Boolean, default: false },
  /** 嵌套在 SettingsCard 内时去掉 dock 背景与底边 */
  plain: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'reorder'])
const trackRef = ref(null)
const tabRefs = ref({})
const indicatorStyle = ref({ opacity: '0' })
const hasOverflow = ref(false)
const canScrollLeft = ref(false)
const canScrollRight = ref(false)

const safeTabs = computed(() => (Array.isArray(props.tabs) ? props.tabs : []))

const activeSortIndex = computed(() => safeTabs.value.findIndex((t) => t.id === props.modelValue))

const canSortShiftLeft = computed(() => props.sortable && activeSortIndex.value > 0)

const canSortShiftRight = computed(
  () =>
    props.sortable &&
    activeSortIndex.value >= 0 &&
    activeSortIndex.value < safeTabs.value.length - 1,
)

let resizeObserver = null
let indicatorFrame = 0

const activeAccent = computed(() => {
  const tab = safeTabs.value.find((item) => item.id === props.modelValue)
  return tab?.accent || '#0A84FF'
})

function tabAccent(tab) {
  return tab.accent || '#0A84FF'
}

function resolveTabEl(el) {
  if (!el) return null
  if (el instanceof Element) return el
  if (el.$el instanceof Element) return el.$el
  return null
}

function setTabRef(id, el) {
  const node = resolveTabEl(el)
  if (node) tabRefs.value[id] = node
  else delete tabRefs.value[id]
}

function isTabFullyVisible(id) {
  const el = resolveTabEl(tabRefs.value[id])
  const track = trackRef.value
  if (!el || !track) return true
  const left = el.offsetLeft - track.scrollLeft
  const right = left + el.offsetWidth
  return left >= -2 && right <= track.clientWidth + 2
}

function updateScrollState() {
  const track = trackRef.value
  if (!track) {
    hasOverflow.value = false
    canScrollLeft.value = false
    canScrollRight.value = false
    return
  }
  const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth)
  hasOverflow.value = maxScroll > 2
  canScrollLeft.value = track.scrollLeft > 2
  canScrollRight.value = track.scrollLeft < maxScroll - 2
}

function onTrackScroll() {
  updateScrollState()
  updateIndicator()
}

function measureIndicator() {
  const el = resolveTabEl(tabRefs.value[props.modelValue])
  const track = trackRef.value
  if (!el || !track) {
    indicatorStyle.value = { opacity: '0' }
    return
  }
  // offsetLeft/Width 相对 track padding box，与 absolute 指示条坐标系一致；
  // toolbar 圆角更小，内收略少；默认磁贴 Tab 内收更多，避免底条“漏”进相邻空隙。
  const inset = props.toolbar ? 6 : 8
  const width = Math.max(0, el.offsetWidth - inset * 2)
  const left = Math.max(0, el.offsetLeft + inset)
  indicatorStyle.value = {
    opacity: '1',
    width: `${width}px`,
    transform: `translate3d(${left}px, 0, 0)`,
  }
}

function updateIndicator() {
  if (indicatorFrame) cancelAnimationFrame(indicatorFrame)
  nextTick(() => {
    indicatorFrame = requestAnimationFrame(() => {
      indicatorFrame = 0
      measureIndicator()
    })
  })
}

function scrollTabIntoView(id, behavior = 'auto') {
  const el = resolveTabEl(tabRefs.value[id])
  const track = trackRef.value
  if (!el || !track) return
  if (behavior !== 'smooth' && isTabFullyVisible(id)) return
  const targetLeft = el.offsetLeft - (track.clientWidth - el.offsetWidth) / 2
  const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth)
  track.scrollTo({
    left: Math.min(maxScroll, Math.max(0, targetLeft)),
    behavior: behavior === 'smooth' ? 'smooth' : 'auto',
  })
}

function scrollTabIntoViewIfNeeded(id) {
  scrollTabIntoView(id, isTabFullyVisible(id) ? 'auto' : 'smooth')
}

function scrollNav(dir) {
  const track = trackRef.value
  if (!track) return
  const step = Math.max(180, Math.floor(track.clientWidth * 0.65))
  track.scrollBy({ left: dir * step, behavior: 'smooth' })
}

function resolveValidTabId(preferred) {
  const tabs = safeTabs.value
  if (!tabs.length) return preferred
  const preferredId = String(preferred ?? '')
  const match = tabs.find((t) => String(t.id) === preferredId && !t.disabled)
  if (match) return match.id
  const fallback = tabs.find((t) => !t.disabled)
  return fallback?.id ?? tabs[0]?.id ?? preferred
}

function syncModelToValidTab() {
  const valid = resolveValidTabId(props.modelValue)
  if (valid != null && valid !== props.modelValue) {
    emit('update:modelValue', valid)
  }
}

function moveSort(delta) {
  if (!props.sortable) return
  const fromIndex = activeSortIndex.value
  if (fromIndex < 0) return
  const toIndex = fromIndex + delta
  if (toIndex < 0 || toIndex >= safeTabs.value.length) return
  emit('reorder', { fromIndex, toIndex })
}

function select(id) {
  const tab = safeTabs.value.find((item) => item.id === id)
  if (!tab || tab.disabled) return
  if (id === props.modelValue) {
    nextTick(() => {
      scrollTabIntoViewIfNeeded(id)
      updateIndicator()
      updateScrollState()
    })
    return
  }
  emit('update:modelValue', id)
  nextTick(() => {
    scrollTabIntoViewIfNeeded(id)
    updateIndicator()
    updateScrollState()
  })
}

function refreshLayout() {
  updateScrollState()
  updateIndicator()
}

function bindResizeObserver() {
  resizeObserver?.disconnect()
  resizeObserver = null
  const track = trackRef.value
  if (!track || !(track instanceof Element) || typeof ResizeObserver === 'undefined') return
  resizeObserver = new ResizeObserver(() => refreshLayout())
  resizeObserver.observe(track)
  for (const id of safeTabs.value.map((t) => t.id)) {
    const node = resolveTabEl(tabRefs.value[id])
    if (node) resizeObserver.observe(node)
  }
}

watch(
  () => safeTabs.value.map((t) => t.id).join(','),
  () => {
    syncModelToValidTab()
    nextTick(() => {
      refreshLayout()
      bindResizeObserver()
    })
  },
)

watch(
  () => safeTabs.value.map((t) => `${t.id}:${t.count ?? ''}:${t.disabled ? 1 : 0}`).join('|'),
  () => {
    nextTick(() => {
      updateIndicator()
      updateScrollState()
    })
  },
)

watch(
  () => props.modelValue,
  () => {
    syncModelToValidTab()
    nextTick(() => {
      updateIndicator()
      scrollTabIntoViewIfNeeded(props.modelValue)
      updateScrollState()
    })
  },
)

watch(
  () => props.toolbar,
  () => nextTick(refreshLayout),
)

onMounted(() => {
  syncModelToValidTab()
  nextTick(() => {
    refreshLayout()
    bindResizeObserver()
  })
})

onUnmounted(() => {
  if (indicatorFrame) cancelAnimationFrame(indicatorFrame)
  indicatorFrame = 0
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>
