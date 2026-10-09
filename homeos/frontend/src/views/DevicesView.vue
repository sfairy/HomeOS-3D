<!--
  组件文件：DevicesView.vue
  所属模块：frontend/src/views
  组件职责：全部实体列表总览页。顶部 ListPageHero 展示标题「全部实体」与搜索框、
    设备列表/数据分析双模式切换；列表模式分左右双栏，左侧 DeviceStatsDashboard 统计卡片 +
    DeviceFilterPanel 筛选面板，右侧域 Tab 横滑 + 全选切换 + VirtualList 虚拟滚动渲染
    设备行（每行支持选中、跳转详情、打开控制）；分析模式切换到 DeviceAnalyticsDashboard
    多维图表分析面板，底部支持库分页与批量操作栏 DeviceBatchActions。
  依赖关系：vue（computed/ref/watch）、@lucide/vue 图标；
    composables：useDevicesView（筛选/搜索/分页/全选核心状态）、useHorizontalScrollNav（域 Tab 横滑）；
    子组件：SearchableSelect、VirtualList、ListPageHero/Metrics、ApiQueryState、VEmptyState、
    DeviceAnalyticsDashboard/DeviceRow/DeviceStatsDashboard/DeviceFilterPanel/DeviceBatchActions。
  注意事项：DeviceRow 行高固定 72px 供 VirtualList 使用；搜索/筛选/分页/批量选择均由
    useDevicesView 统一管理，避免视图层堆积状态；--page-accent 为 devices sky 主题。
-->
<template>
  <div class="list-page devices-view" :style="pageAccentStyle">
    <ListPageHero :title="'全部实体'" :hint="'搜索、筛选与批量控制 Home Assistant 实体'" tone="sky">
      <template #icon>
        <Layers class="w-5 h-5" />
      </template>
      <template #aside>
        <router-link :to="{ path: '/events' }" class="list-page__link-btn">
          {{ '事件历史' }}
        </router-link>
      </template>
      <template #stats>
        <ListPageMetrics :cells="deviceStatCells" />
      </template>
      <template #toolbar>
        <div
          class="list-page__search-row list-page__search-row--filters devices-view__hero-toolbar"
        >
          <div class="list-page__search-wrap">
            <SearchableSelect
              v-model="query"
              variant="list-page"
              :options="searchOptions"
              :placeholder="'搜索设备名称或 entity_id…'"
              :empty-text="'无匹配项'"
              :clear-aria="'清除'"
              :toggle-aria="'展开选项'"
              @open="onSearchOpen"
              @select="onSearchSelect"
            />
          </div>
          <div
            class="list-page__filter-chips devices-view__mode-chips"
            role="group"
            :aria-label="'视图模式'"
          >
            <button
              type="button"
              :class="[
                'list-page__chip list-page__chip--btn',
                pageTab === 'list' && 'list-page__chip--accent',
              ]"
              :aria-pressed="pageTab === 'list'"
              @click="pageTab = 'list'"
            >
              <Layers class="w-3.5 h-3.5" />
              {{ '设备列表' }}
            </button>
            <button
              type="button"
              :class="[
                'list-page__chip list-page__chip--btn',
                pageTab === 'analytics' && 'list-page__chip--accent',
              ]"
              :aria-pressed="pageTab === 'analytics'"
              @click="pageTab = 'analytics'"
            >
              <BarChart3 class="w-3.5 h-3.5" />
              {{ '数据分析' }}
            </button>
          </div>
        </div>
      </template>
    </ListPageHero>

    <section v-show="pageTab === 'analytics'" class="list-page__panel device-analytics-panel">
      <DeviceAnalyticsDashboard
        :visible="pageTab === 'analytics'"
        @filter-domain="applyDomainFromAnalytics"
        @filter-entity="applyEntityFromAnalytics"
      />
    </section>

    <div v-show="pageTab === 'list'" class="devices-view__list-mode">
      <div class="devices-view__layout">
        <aside class="devices-view__sidebar">
          <DeviceStatsDashboard :visible="pageTab === 'list'" />
          <DeviceFilterPanel v-model="currentFilter" />
        </aside>

        <main class="devices-view__main">
          <section class="list-page__panel">
            <div class="list-page__panel-toolbar devices-view__panel-toolbar">
              <div class="devices-view__panel-toolbar-row">
                <button
                  type="button"
                  :class="[
                    'devices-view__select-all',
                    selectedIds.length === filtered.length &&
                      filtered.length > 0 &&
                      'devices-view__select-all--active',
                  ]"
                  @click="toggleSelectAll"
                >
                  <component
                    :is="
                      selectedIds.length === filtered.length && filtered.length > 0
                        ? CheckSquare
                        : Square
                    "
                    class="w-4 h-4"
                  />
                  <span>{{ '全选' }}</span>
                </button>
                <div class="devices-view__domain-tabs-shell">
                  <button
                    v-show="domainTabsOverflow"
                    type="button"
                    class="list-page__tab-arrow"
                    :disabled="!canScrollDomainLeft"
                    :aria-label="'向左滚动域筛选'"
                    @click="scrollDomainTabs(-1)"
                  >
                    <ChevronLeft class="w-4 h-4" />
                  </button>
                  <div
                    ref="domainTabsTrackRef"
                    class="list-page__tabs devices-view__domain-tabs"
                    role="tablist"
                    :aria-label="'设备域筛选'"
                    @scroll="updateDomainTabsScroll"
                  >
                    <button
                      v-for="d in domainTabs"
                      :key="d.id"
                      :ref="(el) => setDomainTabRef(d.id, el)"
                      type="button"
                      role="tab"
                      :id="`devices-tab-${d.id}`"
                      :aria-selected="activeDomain === d.id"
                      :class="['list-page__tab', activeDomain === d.id && 'list-page__tab--on']"
                      @click="activeDomain = d.id"
                    >
                      {{ d.label }}
                      <span v-if="d.count != null" class="list-page__tab-count">{{ d.count }}</span>
                    </button>
                  </div>
                  <button
                    v-show="domainTabsOverflow"
                    type="button"
                    class="list-page__tab-arrow"
                    :disabled="!canScrollDomainRight"
                    :aria-label="'向右滚动域筛选'"
                    @click="scrollDomainTabs(1)"
                  >
                    <ChevronRight class="w-4 h-4" />
                  </button>
                </div>
                <span class="devices-view__list-count">{{ filtered.length }} {{ '项' }}</span>
              </div>
              <DeviceBatchActions :selected-ids="selectedIds" @clear="clearSelection" />
            </div>

            <div
              ref="listViewportRef"
              class="list-page__panel-body devices-view__list-viewport"
            >
              <ApiQueryState
                :loading="useRestList && restLoading && !filtered.length"
                :error="useRestList && restError ? restErrorDetail : ''"
                tone="sky"
                error-title="设备列表加载失败"
                @retry="restRefresh"
              >
                <VirtualList
                  :items="filtered"
                  :item-height="DEVICE_ROW_HEIGHT"
                  :item-gap="6"
                  container-class="devices-view__list list-page__list devices-view__list--paged"
                >
                  <template #default="{ item }">
                    <DeviceRow
                      :key="item.entity_id"
                      :item="item"
                      :selected="selectedIds.includes(item.entity_id)"
                      @toggle="toggleEntity"
                      @open="openControl"
                      @detail="openDetail"
                      @select="toggleSelectItem"
                    />
                  </template>
                  <template #empty>
                    <VEmptyState
                      v-if="!(useRestList && restLoading)"
                      tone="sky"
                      :title="'暂无匹配设备'"
                      :description="query ? '尝试更换关键词或域筛选' : '等待 Home Assistant 同步实体'"
                    />
                  </template>
                </VirtualList>
              </ApiQueryState>
            </div>

            <footer
              v-if="useRestList && restTotalPages > 1"
              class="list-page__pager devices-view__rest-pager"
            >
              <button
                type="button"
                class="list-page__btn"
                :disabled="restPage <= 1 || restLoading"
                @click="restPrevPage"
              >
                {{ '上一批' }}
              </button>
              <span class="list-page__muted">{{ '库分页' }} {{ restPage }} / {{ restTotalPages }}</span>
              <button
                type="button"
                class="list-page__btn"
                :disabled="restPage >= restTotalPages || restLoading"
                @click="restNextPage"
              >
                {{ '下一批' }}
              </button>
            </footer>
          </section>
        </main>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch, type ComponentPublicInstance } from 'vue'
import { Layers, CheckSquare, Square, BarChart3, ChevronLeft, ChevronRight } from '@lucide/vue'
import DeviceAnalyticsDashboard from '@/components/devices/DeviceAnalyticsDashboard.vue'
import DeviceRow from '@/components/devices/DeviceRow.vue'
import DeviceStatsDashboard from '@/components/devices/DeviceStatsDashboard.vue'
import DeviceFilterPanel from '@/components/devices/DeviceFilterPanel.vue'
import DeviceBatchActions from '@/components/devices/DeviceBatchActions.vue'
import SearchableSelect from '@/components/common/base/SearchableSelect.vue'
import VirtualList from '@/components/common/base/VirtualList.vue'
import ListPageHero from '@/components/page-shell/ListPageHero.vue'
import ListPageMetrics from '@/components/page-shell/ListPageMetrics.vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import VEmptyState from '@/components/common/base/VEmptyState.vue'
import { useDevicesView } from '@/composables/device/useDevicesView'
import { useHorizontalScrollNav } from '@/composables/ui/useHorizontalScrollNav'

/** DeviceRow 单行渲染高度（px）：与 list-page__row 内 44px 触控元素 + 上下 padding 14px×2 对齐，
 *  VirtualList 虚拟模式按此步长计算视口内渲染行，失配会导致大列表行内容被裁切/重叠 */
const DEVICE_ROW_HEIGHT = 72

const {
  pageAccentStyle,
  query,
  activeDomain,
  selectedIds,
  pageTab,
  currentFilter,
  searchOptions,
  onSearchOpen,
  onSearchSelect,
  filtered,
  restLoading,
  restError,
  restErrorDetail,
  useRestList,
  restRefresh,
  restPage,
  restTotalPages,
  domainTabs,
  deviceStatCells,
  applyDomainFromAnalytics,
  applyEntityFromAnalytics,
  toggleSelectItem,
  toggleSelectAll,
  clearSelection,
  openControl,
  openDetail,
  toggleEntity,
} = useDevicesView()

// 列表滚动容器：库分页切换后回到列表顶部，避免停留在空位。
const listViewportRef = ref<HTMLElement | null>(null)
function scrollListToTop() {
  listViewportRef.value?.scrollIntoView({ block: 'start' })
}

// 库分页翻页：直接驱动后端分页，切换后回到列表顶部。
function restPrevPage() {
  if (restPage.value <= 1 || restLoading.value) return
  restPage.value -= 1
  nextTick(() => scrollListToTop())
}
function restNextPage() {
  if (restPage.value >= restTotalPages.value || restLoading.value) return
  restPage.value += 1
  nextTick(() => scrollListToTop())
}

const domainTabsTrackRef = ref<HTMLElement | null>(null)
const domainTabEls = ref<Record<string, HTMLElement>>({})
const domainTabsKey = computed(() => domainTabs.value.map((d) => `${d.id}:${d.count ?? ''}`).join('|'))

const {
  hasOverflow: domainTabsOverflow,
  canScrollLeft: canScrollDomainLeft,
  canScrollRight: canScrollDomainRight,
  updateScrollState: updateDomainTabsScroll,
  scrollNav: scrollDomainTabs,
  scrollChildIntoView: scrollDomainTabIntoView,
} = useHorizontalScrollNav(domainTabsTrackRef, domainTabsKey)

function resolveEl(el: Element | ComponentPublicInstance | null): HTMLElement | null {
  if (!el) return null
  if (el instanceof HTMLElement) return el
  const node = (el as ComponentPublicInstance).$el
  return node instanceof HTMLElement ? node : null
}

function setDomainTabRef(id: string, el: Element | ComponentPublicInstance | null) {
  const node = resolveEl(el)
  if (node) domainTabEls.value[id] = node
  else delete domainTabEls.value[id]
}

watch(activeDomain, (id) => {
  nextTick(() => scrollDomainTabIntoView(domainTabEls.value[id]))
})
</script>

<style>
@import './styles/devices-view.css';
/* 设备页主题样式，随页面按需加载（从 main.ts 全局导入拆分而来） */
@import '@/views/styles/devices-theme.css';
</style>
