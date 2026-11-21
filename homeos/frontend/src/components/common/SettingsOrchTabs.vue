<!--
  设置页 OrchTabs 子导航。横向 Tab 按钮列表，支持激活指示条、溢出滚动、排序（左右箭头移动）、
  工具栏模式与 plain 嵌套模式。用于设置各面板内子区段切换。
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
        v-if="showSortArrows"
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
          role="tablist"
          :aria-label="ariaLabel"
          @scroll="onTrackScroll"
        >
          <button
            v-for="tab in displayTabs"
            :key="tab.id"
            :ref="(el) => setTabRef(tab.id, el)"
            type="button"
            role="tab"
            :data-orch-tab-id="tab.id"
            :aria-selected="String(modelValue === tab.id)"
            :aria-disabled="tab.disabled ? 'true' : undefined"
            :tabindex="modelValue === tab.id && !tab.disabled ? 0 : -1"
            :class="[
              'settings-orch-tab',
              modelValue === tab.id && 'settings-orch-tab--active',
              tab.disabled && 'settings-orch-tab--disabled',
              canDragTab(tab) && 'settings-orch-tab--draggable',
              dragSourceId === tab.id && 'settings-orch-tab--dragging',
            ]"
            :style="{ '--tab-accent': tabAccent(tab) }"
            @click="selectTab(tab)"
            @keydown="onTabKeydown($event, tab)"
            @pointerdown="onTabPointerDown($event, tab)"
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
          <!-- 拖拽插入位：一条竖线，位置由落点下标算出（不用高亮整块，避免与激活态混淆） -->
          <div v-if="dragSourceId && insertionStyle" class="settings-orch-insertion" :style="insertionStyle" />
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
        v-if="showSortArrows"
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

    <!-- 跟随指针的浮动块：Teleport 到 body，避免被轨道的 overflow:hidden 裁掉。
         用 transform 位移（不触发重排），并且 pointer-events:none 让它不干扰命中。 -->
    <Teleport to="body">
      <div v-if="ghost" class="settings-orch-drag-ghost" :style="ghostStyle">
        <div class="settings-orch-orb">
          <span v-if="ghost.emoji" class="settings-orch-emoji">{{ ghost.emoji }}</span>
          <component v-else-if="ghost.icon" :is="ghost.icon" class="w-4 h-4" />
        </div>
        <span class="settings-orch-label">{{ ghost.label }}</span>
      </div>
    </Teleport>
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
  /** 启用拖拽排序：鼠标/触控笔按住 Tab 直接拖到目标位置（触屏仍用两侧箭头） */
  draggable: { type: Boolean, default: false },
  /** 嵌套在 SettingsCard 内时去掉 dock 背景与底边 */
  plain: { type: Boolean, default: false },
  /** tablist 的无障碍名称，默认「子导航」；父面板有更具体的叫法可覆盖 */
  ariaLabel: { type: String, default: '子导航' },
})

const emit = defineEmits(['update:modelValue', 'reorder'])
const trackRef = ref(null)
const tabRefs = ref({})
const indicatorStyle = ref({ opacity: '0' })
const hasOverflow = ref(false)
const canScrollLeft = ref(false)
const canScrollRight = ref(false)

const safeTabs = computed(() => (Array.isArray(props.tabs) ? props.tabs : []))

const activeSortIndex = computed(() => safeTabs.value.findIndex((tabEntry) => tabEntry.id === props.modelValue))
const canSortShiftLeft = computed(() => props.sortable && activeSortIndex.value > 0)
const canSortShiftRight = computed(
  () => props.sortable && activeSortIndex.value >= 0 && activeSortIndex.value < safeTabs.value.length - 1,
)

/**
 * 是否渲染「左右移动」箭头。
 * 开了拖拽就隐藏：两套入口同时出现时，箭头会和溢出滚动箭头挤在同一侧，
 * 视觉上互相压住、还把第一个 Tab 裁掉（实测截图）。
 */
const showSortArrows = computed(() => props.sortable && !props.draggable && safeTabs.value.length > 1)

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
  const match = tabs.find((tabEntry) => String(tabEntry.id) === preferredId && !tabEntry.disabled)
  if (match) return match.id
  const fallback = tabs.find((tabEntry) => !tabEntry.disabled)
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
  // 与拖拽同样先本地渲染：箭头点击也要立刻看到位移，而不是等父级刷回来。
  applyPendingOrder(
    safeTabs.value.map((tab) => tab.id),
    fromIndex,
    toIndex,
  )
  emit('reorder', { fromIndex, toIndex })
}

// ── 拖拽排序（Pointer Events：鼠标 / 触屏 / 手写笔统一） ──
// 用指针而不是 HTML5 DnD：原生 draggable 在触屏上不触发，墙屏就完全没法拖。
// 鼠标：按下后移动超过阈值即开始拖；触屏/笔：需长按一小会儿，避免和横向滚动抢手势。
//
// 落点用**几何计算**而不是 elementFromPoint：Tab 之间有 gap，指针落在空隙里会把落点
// 清空，拖动过程中高亮就会闪；而且「命中某个 Tab」无法表达「插到它左边还是右边」，
// 拖到相邻位置时常差一格。这里直接算插入下标（第几个位置），语义更准也更稳。
const dragSourceId = ref('')
/** 当前插入位置（0..n），即「松手后这个 Tab 会落在第几个」。 */
const dropIndex = ref(-1)
/** 跟随指针的浮动块内容与抓取偏移（让块相对指针的位置与按下时一致，不会“跳一下”）。 */
const ghost = ref(null)
const ghostPos = ref({ x: 0, y: 0 })

const POINTER_DRAG_THRESHOLD = 6
const TOUCH_LONG_PRESS_MS = 260
/** 松手后本地先按新顺序渲染，等父级刷新回来再交还控制权，避免「拖完没反应然后跳一下」。 */
const pendingOrder = ref(null)

let pointerState = null
let longPressTimer = 0
let suppressClickUntil = 0
let autoScrollFrame = 0

const tabsSignature = computed(() => safeTabs.value.map((tab) => tab.id).join('|'))

// 父级刷新（后端顺序回来了）就丢掉本地乐观顺序，避免与真实数据长期不一致。
watch(tabsSignature, () => {
  pendingOrder.value = null
})

const displayTabs = computed(() => {
  const order = pendingOrder.value
  if (!order) return safeTabs.value
  const rank = new Map(order.map((id, index) => [id, index]))
  return [...safeTabs.value].sort((left, right) => (rank.get(left.id) ?? 1e9) - (rank.get(right.id) ?? 1e9))
})

const ghostStyle = computed(() => {
  const item = ghost.value
  if (!item) return { display: 'none' }
  return {
    width: `${item.width}px`,
    height: `${item.height}px`,
    transform: `translate3d(${ghostPos.value.x - item.grabX}px, ${ghostPos.value.y - item.grabY}px, 0)`,
    '--tab-accent': item.accent || 'var(--hos-color-accent)',
  }
})

/**
 * 插入位竖线的横向位置。
 *
 * 与激活指示条同一坐标系（Tab 的 `offsetLeft` 相对轨道内容，随轨道一起滚动），
 * 因此左右拖动滚动时竖线会自然跟着内容走，不需要额外监听 scroll。
 */
const insertionStyle = computed(() => {
  const index = dropIndex.value
  if (index < 0 || !dragSourceId.value) return null
  const tabs = displayTabs.value
  const gap = 6
  if (!tabs.length) return null
  // 落点等于原位时不画线：否则「拖回原处」也会出现一条线，看起来像要换位置。
  const fromIndex = tabs.findIndex((tab) => tab.id === dragSourceId.value)
  const toIndex = fromIndex < index ? index - 1 : index
  if (fromIndex >= 0 && toIndex === fromIndex) return null
  if (index >= tabs.length) {
    const last = resolveTabEl(tabRefs.value[tabs[tabs.length - 1].id])
    if (!last) return null
    return { left: `${last.offsetLeft + last.offsetWidth + gap / 2}px` }
  }
  const target = resolveTabEl(tabRefs.value[tabs[index].id])
  if (!target) return null
  return { left: `${Math.max(0, target.offsetLeft - gap / 2)}px` }
})

/** 把「把第 fromIndex 个移到 toIndex」应用成待渲染顺序（乐观更新）。 */
function applyPendingOrder(order, fromIndex, toIndex) {
  const next = [...order]
  const [moved] = next.splice(fromIndex, 1)
  if (moved === undefined) return
  next.splice(toIndex, 0, moved)
  pendingOrder.value = next
}

function canDragTab(tab) {
  return props.draggable && !tab.disabled && displayTabs.value.length > 1
}

/**
 * 计算插入下标：统计「中心点落在指针左边的 Tab 个数」。
 *
 * 用中心点而不是边缘，是为了让判定阈值落在 Tab 正中间——手感与系统级拖拽排序一致，
 * 也不会因为 Tab 宽度不同而偏向某一侧。
 */
function insertionIndexFromPointer(x) {
  let index = 0
  for (const tab of displayTabs.value) {
    const el = resolveTabEl(tabRefs.value[tab.id])
    if (!el) continue
    const rect = el.getBoundingClientRect()
    if (x > rect.left + rect.width / 2) index += 1
  }
  return index
}

function startPointerDrag() {
  if (!pointerState) return
  dragSourceId.value = pointerState.id
  dropIndex.value = -1
  // 拖拽期间关掉平滑滚动与吸附：两者会与每帧 ±12px 的自动滚动互相打断，
  // 表现为「拖到边缘不动」或「轨道自己弹回去」。
  const track = trackRef.value
  if (track) {
    track.style.scrollBehavior = 'auto'
    track.style.scrollSnapType = 'none'
  }
  beginGhost()
  // 长按进入拖拽时没有移动事件，先按按下点算一次落点，竖线立刻出现。
  movePointerDrag(pointerState.x)
  startAutoScroll()
}

/** 用源 Tab 的真实尺寸与抓取偏移创建浮动块：视觉上就是「把那个图标拿起来了」。 */
function beginGhost() {
  const id = dragSourceId.value
  const element = resolveTabEl(tabRefs.value[id])
  const source = displayTabs.value.find((tab) => tab.id === id)
  if (!element || !source || !pointerState) return
  const rect = element.getBoundingClientRect()
  ghost.value = {
    label: source.label || '',
    emoji: source.emoji || '',
    icon: source.icon || null,
    accent: source.accent || '',
    width: rect.width,
    height: rect.height,
    // 抓取点相对块左上角：ghost 用 translate3d(pointer - grab) 定位，
    // 因此按在图标左侧还是右侧，拿起后都保持在指针下的同一处，不会瞬移居中。
    grabX: pointerState.startX - rect.left,
    grabY: pointerState.startY - rect.top,
  }
  ghostPos.value = { x: pointerState.x, y: pointerState.y }
}

function movePointerDrag(x) {
  dropIndex.value = insertionIndexFromPointer(x)
}

function finishPointerDrag(commit) {
  const sourceId = dragSourceId.value
  const target = dropIndex.value
  clearPointerState()
  if (!commit || !sourceId || target < 0) return
  const order = displayTabs.value.map((tab) => tab.id)
  const fromIndex = order.indexOf(sourceId)
  if (fromIndex < 0) return
  // 插入下标是「源还在原位」时算的：源在落点之前要减 1，否则会多挪一格。
  const toIndex = fromIndex < target ? target - 1 : target
  if (toIndex === fromIndex || toIndex < 0 || toIndex >= order.length) return
  // 本地先按新顺序渲染：父级要等网络往返再刷新，这里不给反馈就会「拖完像没生效」。
  applyPendingOrder(order, fromIndex, toIndex)
  emit('reorder', { fromIndex, toIndex })
}

function clearPointerState() {
  pointerState = null
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = 0
  }
  stopAutoScroll()
  const track = trackRef.value
  if (track) {
    // 恢复 CSS 里的原值（清空 inline 即可，样式表里有 smooth + proximity）
    track.style.scrollBehavior = ''
    track.style.scrollSnapType = ''
  }
  dragSourceId.value = ''
  dropIndex.value = -1
  ghost.value = null
  window.removeEventListener('pointermove', onPointerMove, true)
  window.removeEventListener('pointerup', onPointerUp, true)
  window.removeEventListener('pointercancel', onPointerCancel, true)
}

function onPointerMove(event) {
  if (!pointerState) return
  pointerState.x = event.clientX
  pointerState.y = event.clientY
  const moved = Math.hypot(event.clientX - pointerState.startX, event.clientY - pointerState.startY)
  if (!dragSourceId.value) {
    // 触屏：先按住不动，长按到点再进入拖拽；期间明显移动 = 用户在滚动，放弃排序
    if (pointerState.kind === 'touch') {
      if (moved > POINTER_DRAG_THRESHOLD && longPressTimer) {
        clearTimeout(longPressTimer)
        longPressTimer = 0
        clearPointerState()
      }
      return
    }
    if (moved < POINTER_DRAG_THRESHOLD) return
    startPointerDrag()
  }
  event.preventDefault()
  ghostPos.value = { x: event.clientX, y: event.clientY }
  movePointerDrag(event.clientX)
}

function onPointerUp() {
  if (!dragSourceId.value) {
    clearPointerState()
    return
  }
  // 拖完就抑制紧随其后的 click，否则松手会顺带切换选中的 Tab
  suppressClickUntil = Date.now() + 300
  finishPointerDrag(true)
}

function onPointerCancel() {
  finishPointerDrag(false)
}

function onTabPointerDown(event, tab) {
  if (!canDragTab(tab) || event.button > 0) return
  clearPointerState()
  const kind = event.pointerType === 'mouse' ? 'mouse' : 'touch'
  pointerState = {
    id: String(tab.id),
    kind,
    startX: event.clientX,
    startY: event.clientY,
    // 长按直接进入拖拽时还没收到 pointermove，用按下点作为初始位置，
    // 否则自动滚动会拿不到坐标、误判成「贴左边」而一直往左滚。
    x: event.clientX,
    y: event.clientY,
  }
  window.addEventListener('pointermove', onPointerMove, true)
  window.addEventListener('pointerup', onPointerUp, true)
  window.addEventListener('pointercancel', onPointerCancel, true)
  if (kind === 'touch') {
    longPressTimer = window.setTimeout(() => {
      longPressTimer = 0
      if (pointerState) startPointerDrag()
    }, TOUCH_LONG_PRESS_MS)
  }
}

/** 拖到轨道边缘时自动滚动，长列表也能拖到看不见的位置。 */
function startAutoScroll() {
  if (autoScrollFrame) return
  const step = () => {
    autoScrollFrame = 0
    const track = trackRef.value
    if (!dragSourceId.value || !pointerState || !track) return
    const rect = track.getBoundingClientRect()
    const edge = 56
    const x = pointerState.x
    if (x < rect.left + edge) track.scrollLeft -= 12
    else if (x > rect.right - edge) track.scrollLeft += 12
    autoScrollFrame = requestAnimationFrame(step)
  }
  autoScrollFrame = requestAnimationFrame(step)
}

function stopAutoScroll() {
  if (autoScrollFrame) {
    cancelAnimationFrame(autoScrollFrame)
    autoScrollFrame = 0
  }
}

function selectTab(tab) {
  if (Date.now() < suppressClickUntil) return
  select(tab.id)
}

/**
 * 方向键 / Home / End 在 Tab 间移动（APG WAI-ARIA tabs 的自动激活模式）：
 * 只跳过 disabled 项、首尾循环，选中即切换并聚焦，避免平板外接键盘时 Tab 键要按十几次。
 * @param {KeyboardEvent} event - 键盘事件
 * @param {{id: string, disabled?: boolean}} tab - 当前聚焦的 Tab
 */
function onTabKeydown(event, tab) {
  const key = event.key
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return
  const tabs = safeTabs.value
  if (tabs.length < 2) return
  const enabled = tabs.filter((candidateTab) => !candidateTab.disabled)
  if (enabled.length === 0) return
  const currentIndex = enabled.findIndex((candidateTab) => candidateTab.id === tab.id)
  let nextIndex
  if (key === 'Home') nextIndex = 0
  else if (key === 'End') nextIndex = enabled.length - 1
  else {
    const delta = key === 'ArrowRight' ? 1 : -1
    const base = currentIndex < 0 ? 0 : currentIndex
    nextIndex = (base + delta + enabled.length) % enabled.length
  }
  const next = enabled[nextIndex]
  if (!next) return
  event.preventDefault()
  select(next.id)
  nextTick(() => resolveTabEl(tabRefs.value[next.id])?.focus())
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
  for (const id of safeTabs.value.map((tabEntry) => tabEntry.id)) {
    const node = resolveTabEl(tabRefs.value[id])
    if (node) resizeObserver.observe(node)
  }
}

watch(
  () => safeTabs.value.map((tabEntry) => tabEntry.id).join(','),
  () => {
    syncModelToValidTab()
    nextTick(() => {
      refreshLayout()
      bindResizeObserver()
    })
  },
)

watch(
  () =>
    safeTabs.value.map((tabEntry) => `${tabEntry.id}:${tabEntry.count ?? ''}:${tabEntry.disabled ? 1 : 0}`).join('|'),
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
  // 拖拽用的是 window 级监听：组件卸载时必须摘掉，否则会在已销毁的实例上回调
  clearPointerState()
})
</script>
