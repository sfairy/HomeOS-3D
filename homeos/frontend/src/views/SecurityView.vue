<!--
组件：SecurityView.vue
所属模块：frontend / src / views
-->
<template>
  <div
    v-if="layoutStore.isConfigLoaded"
    class="security-hub page-enter-stagger list-page security-view security-shell"
    :class="[`security-hub--${secTab}`]"
  >
    <ListPageHero :title="tabMeta.label" :hint="tabMeta.hint" :tone="tabMeta.tone">
      <template #icon>
        <component :is="tabMeta.icon" class="w-5 h-5" />
      </template>
      <template #aside>
        <template v-if="secTab === 'overview'">
          <RouterLink
            v-for="link in configLinks"
            :key="link.to"
            :to="link.to"
            class="list-page__link-btn"
          >
            {{ link.label }}
          </RouterLink>
          <button
            type="button"
            class="list-page__btn list-page__btn--primary"
            :disabled="refreshing"
            @click="refreshSecurity"
          >
            <RefreshCw :class="['w-4 h-4', refreshing && 'animate-spin']" />
            {{ refreshing ? '刷新中…' : '刷新' }}
          </button>
        </template>
        <RouterLink v-else :to="tabMeta.settingsTo" class="list-page__link-btn">
          {{ tabMeta.settingsLabel }}
        </RouterLink>
      </template>
      <template v-if="heroMetrics.length" #stats>
        <ListPageMetrics :cells="heroMetrics" />
      </template>
    </ListPageHero>

    <!-- HA / 传感器离线降级提示（全 Tab 可见） -->
    <HaDegradeBanner
      v-if="showSecDegradeBanner"
      class="shrink-0"
      title="安防数据降级"
      :text="secDegradeText"
      @retry="retryHaConnection"
    />

    <section class="list-page__panel security-hub__panel">
      <div class="list-page__panel-toolbar security-hub__panel-toolbar">
        <div class="security-hub__panel-toolbar-row">
          <div class="list-page__tabs security-hub__tabs" role="tablist" aria-label="安防中心视图">
            <button
              v-for="tab in hubTabs"
              :key="tab.id"
              type="button"
              role="tab"
              :aria-selected="secTab === tab.id"
              :class="['list-page__tab', secTab === tab.id && 'list-page__tab--on']"
              @click="secTab = tab.id"
            >
              {{ tab.label }}
              <span v-if="tab.count != null" class="list-page__tab-count">{{ tab.count }}</span>
            </button>
          </div>
        </div>
      </div>

      <div class="list-page__panel-body security-hub__panel-body">
        <!-- ====== 总览（仪表盘） ====== -->
        <div
          v-if="secTab === 'overview'"
          class="flex-1 flex flex-col min-h-0 overflow-hidden animate-fade-in--fast"
        >
          <SecurityOverview />
        </div>

        <!-- ====== 监控中心（懒加载） ====== -->
        <SecurityMonitorPanel
          v-if="secTab === 'monitor'"
          :alert-count="alertCount"
          @back="secTab = 'overview'"
        />

        <!-- ====== 门禁事件 ====== -->
        <div
          v-if="secTab === 'events'"
          class="security-events-layout flex-1 flex flex-row overflow-hidden animate-fade-in--fast min-h-0"
        >
          <div v-if="!hasEvents" class="flex-1 flex items-center justify-center m-8">
            <VEmptyState
              icon=""
              tone="rose"
              :title="'未配置门禁事件路径'"
              :description="'在「集成绑定」中填写 eventsPath（如 /local/doorbell_snapshots/events.jsonl）后，可在此查看门铃抓拍时间轴。'"
            >
              <template #action>
                <div class="flex gap-2 flex-wrap justify-center">
                  <button
                    type="button"
                    class="sec-config-btn"
                    :disabled="validatingEvents"
                    @click="validateEventsPath"
                  >
                    <RefreshCw :class="['w-3.5 h-3.5', validatingEvents && 'animate-spin']" />
                    {{ '测试连通' }}
                  </button>
                  <button
                    type="button"
                    class="sec-config-btn"
                    @click="router.push({ path: '/settings', query: { tab: 'bindings' } })"
                  >
                    <SettingsIcon class="w-3.5 h-3.5" /> {{ '前往绑定' }}
                  </button>
                </div>
                <p
                  v-if="eventsValidateMsg"
                  :class="[
                    'text-[12px] font-mono mt-2',
                    eventsValidateOk ? 'sec-validate-msg--ok' : 'sec-validate-msg--warn',
                  ]"
                >
                  {{ eventsValidateMsg }}
                </p>
              </template>
            </VEmptyState>
          </div>
          <aside
            v-else
            class="security-events-aside shrink-0 flex flex-col gap-3 p-5 min-h-0 max-h-none overflow-hidden"
          >
            <div
              class="security-events-calendar bg-card border border-border-main p-4 backdrop-blur-3xl shadow-[0_24px_64px_rgba(0,0,0,0.4)] glass-shine shrink-0"
            >
              <div class="flex items-center justify-between mb-2.5">
                <h3
                  class="text-xs font-bold sec-calendar-title uppercase tracking-widest flex items-center gap-2"
                >
                  <Calendar class="w-3.5 h-3.5" />
                  {{
                    '{y}年{m}月'
                      .replace('{y}', String(currentYear))
                      .replace('{m}', String(currentMonth + 1))
                  }}
                </h3>
                <div class="flex gap-0.5">
                  <button
                    type="button"
                    class="icon-btn p-1 rounded-lg hover:bg-white/10 sec-text-muted"
                    :aria-label="'上一月'"
                    @click="prevMonth"
                  >
                    <ChevronLeft class="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    class="icon-btn p-1 rounded-lg hover:bg-white/10 sec-text-muted"
                    :aria-label="'下一月'"
                    @click="nextMonth"
                  >
                    <ChevronRight class="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div class="text-[12px] text-center">
                <div
                  class="grid grid-cols-7 gap-y-0.5 gap-x-0.5 mb-1 sec-text-muted font-semibold tracking-wider text-[12px]"
                >
                  <span v-for="d in weekdayLabels" :key="d">{{ d }}</span>
                </div>
                <div class="grid grid-cols-7 gap-y-0.5 gap-x-0.5 font-medium">
                  <button
                    v-for="(d, idx) in calendarDays"
                    :key="idx"
                    type="button"
                    :class="[
                      'py-0.5 rounded-md relative transition-all min-h-[44px] leading-none',
                      d.isCurrentMonth
                        ? isSameDay(d.date, selectedDate)
                          ? 'sec-cal-day--selected font-bold'
                          : 'sec-text-muted hover:bg-white/10'
                        : 'sec-text-muted opacity-30 hover:bg-white/5',
                      isSameDay(d.date, new Date()) && !isSameDay(d.date, selectedDate)
                        ? 'sec-cal-day--today font-bold'
                        : '',
                    ]"
                    :aria-label="`${d.day}日`"
                    :aria-pressed="isSameDay(d.date, selectedDate)"
                    @click="selectDate(d.date)"
                  >
                    {{ d.day }}
                    <span
                      v-if="isSameDay(d.date, new Date())"
                      class="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 sec-cal-today-dot rounded-full"
                      aria-hidden="true"
                    />
                  </button>
                </div>
              </div>
            </div>

            <div
              class="flex-1 min-h-0 overflow-y-auto p-5 rounded-3xl bg-white/5 border border-white/5 backdrop-blur-2xl flex flex-col hidden-scrollbar"
            >
              <div class="flex items-center justify-between mb-4 px-1">
                <h3
                  class="text-[12px] font-black sec-text-muted flex items-center gap-2 uppercase tracking-[0.2em]"
                >
                  <Activity class="w-3.5 h-3.5" /> {{ '活动日志' }}
                </h3>
                <button
                  type="button"
                  class="icon-btn p-1.5 rounded-lg hover:bg-white/10 sec-text-muted transition-all"
                  :aria-label="'刷新事件'"
                  :class="{ 'animate-spin sec-refresh-icon--loading': loadingEvents }"
                  @click="fetchEvents"
                >
                  <RefreshCw class="w-3.5 h-3.5" />
                </button>
              </div>
              <div
                :class="[
                  'relative',
                  dayEvents.length > 0
                    ? 'flex-1 space-y-3 before:absolute before:inset-y-0 before:left-[11px] before:w-[2px] before:bg-white/5'
                    : 'flex-1 flex flex-col min-h-0',
                ]"
              >
                <div v-if="dayEvents.length === 0" class="sec-events-empty sec-events-empty--log">
                  <p class="sec-events-empty__label">{{ '暂无事件' }}</p>
                </div>
                <button
                  v-for="(event, i) in dayEvents"
                  :key="event.id || i"
                  type="button"
                  :class="[
                    'relative w-full pl-8 pr-3 py-3 rounded-2xl cursor-pointer transition-all duration-300 border border-transparent text-left',
                    selectedEventIdx === i
                      ? 'sec-event-item--selected scale-[1.02]'
                      : 'hover:bg-white/5',
                  ]"
                  :aria-current="selectedEventIdx === i ? 'true' : undefined"
                  @click="onEventClick(i)"
                >
                  <div
                    :class="[
                      'absolute left-[7px] top-[18px] w-2.5 h-2.5 rounded-full ring-4 ring-[#0a0d14] transition-all duration-500',
                      selectedEventIdx === i
                        ? 'sec-event-dot--selected scale-110'
                        : 'sec-dot-default ring-transparent',
                    ]"
                  />
                  <p
                    class="text-[12px] font-black font-mono tracking-widest"
                    :class="selectedEventIdx === i ? 'sec-event-time--selected' : 'sec-text-muted'"
                  >
                    {{ event.time }}
                  </p>
                  <p
                    class="text-[13px] font-bold tracking-tight lowercase first-letter:uppercase"
                    :class="selectedEventIdx === i ? 'sec-text-bright' : 'sec-text-muted'"
                  >
                    {{ event.label }}
                  </p>
                  <div
                    v-if="selectedEventIdx === i"
                    class="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 sec-event-bar--selected rounded-r-full"
                  />
                </button>
              </div>
            </div>
          </aside>

          <main
            v-if="hasEvents"
            class="flex-1 flex flex-col min-w-0 min-h-0 bg-[#050506]/80 rounded-[40px] border border-white/10 overflow-hidden shadow-2xl relative glass-shine m-4 ml-0"
          >
            <div
              class="shrink-0 h-16 px-6 flex items-center justify-between bg-[#0a0a0c]/60 border-b border-white/[0.04]"
            >
              <div class="flex items-center gap-1 bg-black/40 rounded-full p-1 border border-white/10">
                <button
                  v-if="dayEvents.length > 0"
                  class="p-1.5 rounded-full hover:bg-white/10 sec-text-muted"
                  @click="selectedEventIdx = Math.max(0, selectedEventIdx - 1)"
                >
                  <ChevronLeft class="w-4 h-4" />
                </button>
                <span class="px-3 py-1 text-xs font-bold sec-text-muted font-mono"
                  >{{ dayEvents.length ? selectedEventIdx + 1 : 0 }} / {{ dayEvents.length }}</span
                >
                <button
                  v-if="dayEvents.length > 0"
                  class="p-1.5 rounded-full hover:bg-white/10 sec-text-muted"
                  @click="selectedEventIdx = Math.min(dayEvents.length - 1, selectedEventIdx + 1)"
                >
                  <ChevronRight class="w-4 h-4" />
                </button>
              </div>
            </div>

            <div class="flex-1 relative flex bg-black overflow-hidden">
              <div
                v-if="dayEvents.length > 0 && dayEvents[selectedEventIdx]"
                class="flex-1 relative flex items-center justify-center"
              >
                <video
                  v-if="eventShowVideo && currentEventVideo && !videoError"
                  :key="currentEventVideo"
                  :src="currentEventVideo"
                  class="w-full h-full object-contain"
                  controls
                  autoplay
                  playsinline
                  @error="videoError = true"
                />
                <img
                  v-else-if="dayEvents[selectedEventIdx].img"
                  :src="dayEvents[selectedEventIdx].img"
                  :alt="`${dayEvents[selectedEventIdx].time || ''} ${dayEvents[selectedEventIdx].label || '事件'} 截图`"
                  class="w-full h-full object-contain"
                />
                <div class="absolute top-4 left-4 flex gap-2 z-30" v-if="currentEventVideo">
                  <button
                    :class="['sec-config-btn text-[12px]', eventShowVideo && 'opacity-60']"
                    @click="eventShowVideo = false"
                  >
                    <Image class="w-3 h-3" /> {{ '截图' }}
                  </button>
                  <button
                    :class="['sec-config-btn text-[12px]', !eventShowVideo && 'opacity-60']"
                    @click="eventShowVideo = true"
                  >
                    <Video class="w-3 h-3" /> {{ '录像' }}
                  </button>
                </div>
                <MediaPagerControls
                  v-model="selectedEventIdx"
                  :total="dayEvents.length"
                  width-class="w-[15%]"
                />
                <button
                  type="button"
                  class="absolute bottom-6 end-6 p-4 bg-black/60 hover:bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl text-white opacity-60 hover:opacity-100 transition-all shadow-2xl z-40"
                  :aria-label="'全屏查看'"
                  @click="isFullscreenViewer = true"
                >
                  <Maximize2 class="w-5 h-5" />
                </button>
              </div>
              <div v-else class="flex-1 flex items-center justify-center p-6">
                <div class="sec-events-empty sec-events-empty--preview">
                  <p class="sec-events-empty__label">{{ '暂无事件画面' }}</p>
                </div>
              </div>
            </div>

            <div
              v-if="dayEvents.length > 0"
              ref="thumbnailsContainerRef"
              class="h-28 shrink-0 p-4 bg-[#0d1017] border-t border-white/5 flex gap-4 overflow-x-auto hidden-scrollbar relative"
            >
              <!-- 缩略图原先是一排裸 <img> + @click：鼠标可用，但既不可聚焦也没有键盘激活，
                   对键盘/读屏用户等于「不存在」。改成 button 后 Enter/Space 原生可用，
                   焦点环走 main.css 的全局 :focus-visible 规则；语义与左侧事件列表保持一致
                   （aria-current 标记当前选中）。图片保持装饰性（alt="" + aria-hidden），
                   可访问名由按钮的 aria-label 承载，避免读屏重复念一遍。
                   注意：容器滚动定位在 useSecurityView 里用 querySelectorAll('img') 找元素，
                   包一层 button 不影响该后代选择器，索引顺序仍与 dayEvents 对齐。 -->
              <button
                v-for="(event, i) in dayEvents"
                :key="'thumb' + (event.id || i)"
                v-show="event.img"
                type="button"
                class="h-full shrink-0 snap-center cursor-pointer rounded-2xl bg-transparent p-0"
                :aria-label="`${event.time || ''} ${event.label || '事件'} 截图，第 ${i + 1} 张`"
                :aria-current="selectedEventIdx === i ? 'true' : undefined"
                @click="selectedEventIdx = i"
              >
                <img
                  :src="event.img"
                  alt=""
                  aria-hidden="true"
                  :class="[
                    'h-full w-32 object-cover rounded-2xl border-2 transition-all',
                    selectedEventIdx === i
                      ? 'sec-thumb--selected scale-[1.05] z-10'
                      : 'border-transparent opacity-30 hover:opacity-100',
                  ]"
                  loading="lazy"
                />
              </button>
            </div>
          </main>
        </div>
      </div>
    </section>

    <!-- 全屏查看器：模态语义（role/aria-modal）+ 焦点陷阱 + Esc 关闭 + 引用计数滚动锁。
         z 轴走 token（--z-modal-root），不再用 z-[9999]/z-[10000] 这类魔法值。 -->
    <Transition name="fade">
      <div
        v-if="fullscreenOpen"
        ref="fullscreenRef"
        class="sec-fullscreen-viewer fixed inset-0 bg-black/95 backdrop-blur-lg flex items-center justify-center p-4 sm:p-10"
        role="dialog"
        aria-modal="true"
        :aria-label="fullscreenLabel"
        @click.self="closeFullscreen"
      >
        <button
          type="button"
          class="absolute top-8 end-8 p-3 sec-text-muted hover:text-white bg-white/5 border border-white/10 hover:bg-white/20 rounded-full transition-all hover:rotate-90 z-10"
          :aria-label="'关闭全屏'"
          @click="closeFullscreen"
        >
          <X class="w-6 h-6" />
        </button>
        <video
          v-if="eventShowVideo && currentEventVideo && !videoError"
          :src="currentEventVideo"
          class="max-w-full max-h-full object-contain rounded-2xl shadow-2xl ring-1 ring-white/10"
          controls
          autoplay
          playsinline
          @error="videoError = true"
        />
        <img
          v-else-if="dayEvents[selectedEventIdx].img"
          :src="dayEvents[selectedEventIdx].img"
          :alt="`${dayEvents[selectedEventIdx].time || ''} ${dayEvents[selectedEventIdx].label || '事件'} 截图（全屏）`"
          class="max-w-full max-h-full object-contain rounded-2xl shadow-2xl ring-1 ring-white/10"
        />
        <MediaPagerControls
          v-model="selectedEventIdx"
          :total="dayEvents.length"
          width-class="w-[20%]"
        />
      </div>
    </Transition>
  </div>
  <div v-else class="h-full flex items-center justify-center p-8">
    <VPanelSkeleton body-height="320px" />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { defineAsyncComponent } from 'vue'
import { RouterLink } from 'vue-router'
import {
  Video,
  Activity,
  Image,
  Calendar,
  Settings as SettingsIcon,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Maximize2,
  X,
} from '@lucide/vue'
import ListPageHero from '@/components/common/list-page/ListPageHero.vue'
import ListPageMetrics from '@/components/common/list-page/ListPageMetrics.vue'
import HaDegradeBanner from '@/components/common/HaDegradeBanner.vue'
import MediaPagerControls from '@/components/security/MediaPagerControls.vue'
import SecurityOverview from '@/views/security/Overview.vue'
import VPanelSkeleton from '@/components/common/base/VPanelSkeleton.vue'
import VEmptyState from '@/components/common/base/VEmptyState.vue'
import { useSecurityView } from '@/composables/security/useSecurityView'
import { useFocusTrap } from '@/composables/ui/useFocusTrap'
import { useBodyScrollLock } from '@/composables/ui/useBodyScrollLock'
import { useEscLayer } from '@/composables/ui/useEscStack'
import '@/views/security/styles/security.css'
import './styles/security-view.css'

const SecurityMonitorPanel = defineAsyncComponent(
  () => import('@/views/security/MonitorPanel.vue'),
)

const {
  router,
  layoutStore,
  secTab,
  hubTabs,
  tabMeta,
  configLinks,
  heroMetrics,
  refreshing,
  refreshSecurity,
  alertCount,
  showSecDegradeBanner,
  secDegradeText,
  retryHaConnection,
  hasEvents,
  loadingEvents,
  validatingEvents,
  eventsValidateMsg,
  eventsValidateOk,
  validateEventsPath,
  weekdayLabels,
  currentYear,
  currentMonth,
  calendarDays,
  isSameDay,
  selectedDate,
  selectedEventIdx,
  dayEvents,
  currentEventVideo,
  isFullscreenViewer,
  eventShowVideo,
  thumbnailsContainerRef,
  prevMonth,
  nextMonth,
  selectDate,
  onEventClick,
  fetchEvents,
} = useSecurityView()

/** 全屏查看器容器 ref：焦点陷阱的边界与首个可聚焦元素（关闭按钮）的落点。 */
const fullscreenRef = ref(null)
/**
 * 全屏查看器是否**真的**展示了媒体。
 * 与 `isFullscreenViewer` 分开：打开标记为真但当天的选事件没有画面时不应进入模态语义，
 * 否则会出现「对话框里什么都没有」且焦点被锁。陷阱、滚动锁、Esc 都以它为准。
 */
const fullscreenOpen = computed(
  () => isFullscreenViewer.value && !!dayEvents.value[selectedEventIdx.value],
)
/** 对话框可访问名：带当前序号，读屏进入全屏后能立刻知道「在看第几条」。 */
const fullscreenLabel = computed(
  () => `事件媒体全屏查看 · 第 ${selectedEventIdx.value + 1} / ${dayEvents.value.length} 条`,
)

/** 关闭全屏查看器。 */
function closeFullscreen() {
  isFullscreenViewer.value = false
}

/**
 * 全屏状态下的 Esc：交给全局 Esc 层级栈（见 useEscStack）。
 *
 * 这里原先自己挂 window keydown。问题是 `stopPropagation()` 挡不住**同一目标**上的其它
 * window 监听器（只受 `stopImmediatePropagation` 影响，而那取决于注册顺序，不可依赖）。
 * 层级修好之后，全局确认框显示在查看器之上、两者可以同时在场上，一次 Esc 会把两层一起关掉。
 * 入栈后 Esc 只派发给栈顶：确认框开着时先关确认框，确认框关掉后才是查看器。
 */
useEscLayer(fullscreenOpen, '安防全屏查看器', () => closeFullscreen())

// 焦点陷阱 + 滚动锁（引用计数）：全屏期间 Tab 不会跑到背后的日历/事件列表上，
// body 也不会被滚动；与同时打开的确认框共享同一把锁，不会提前放行。
useFocusTrap(fullscreenRef, fullscreenOpen)
useBodyScrollLock(fullscreenOpen, '安防全屏查看器')
</script>
