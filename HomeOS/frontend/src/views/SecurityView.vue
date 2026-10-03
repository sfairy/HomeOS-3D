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
                <div
                  v-for="(event, i) in dayEvents"
                  :key="event.id || i"
                  :class="[
                    'relative pl-8 pr-3 py-3 rounded-2xl cursor-pointer transition-all duration-300 border border-transparent',
                    selectedEventIdx === i
                      ? 'sec-event-item--selected scale-[1.02]'
                      : 'hover:bg-white/5',
                  ]"
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
                </div>
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
                  class="absolute bottom-6 right-6 p-4 bg-black/60 hover:bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl text-white opacity-60 hover:opacity-100 transition-all shadow-2xl z-40"
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
              <img
                v-for="(event, i) in dayEvents"
                :key="'thumb' + (event.id || i)"
                v-show="event.img"
                :src="event.img"
                :class="[
                  'h-full w-32 object-cover rounded-2xl border-2 transition-all cursor-pointer flex-shrink-0 snap-center',
                  selectedEventIdx === i
                    ? 'sec-thumb--selected scale-[1.05] z-10'
                    : 'border-transparent opacity-30 hover:opacity-100',
                ]"
                loading="lazy"
                @click="selectedEventIdx = i"
              />
            </div>
          </main>
        </div>
      </div>
    </section>

    <!-- 全屏查看器 -->
    <Transition name="fade">
      <div
        v-if="isFullscreenViewer && dayEvents[selectedEventIdx]"
        class="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-lg flex items-center justify-center p-4 sm:p-10"
        @click.self="isFullscreenViewer = false"
      >
        <button
          type="button"
          class="absolute top-8 right-8 p-3 sec-text-muted hover:text-white bg-white/5 border border-white/10 hover:bg-white/20 rounded-full transition-all hover:rotate-90 z-[10000]"
          :aria-label="'关闭全屏'"
          @click="isFullscreenViewer = false"
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
</script>
