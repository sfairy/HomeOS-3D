<template>
  <div :class="['media-mini-widget', 'widget-glass-card', !compact && 'media-mini-widget--hub']">
    <!-- Hub 头部：仅非 compact 模式渲染，标题「多媒体」，主题色紫色 -->
    <WidgetHubHeader
      v-if="!compact"
      v-model="activeTab"
      title="多媒体"
      accent="var(--premium-accent-purple)"
      :tabs="mediaTabs"
    >
      <template #icon
        ><Music class="w-3.5 h-3.5" style="color: var(--premium-accent-purple)"
      /></template>
    </WidgetHubHeader>

    <!-- 播放器 Tab：多播放器水平滑动列表 -->
    <template v-if="activeTab === 'player'">
      <VEmptyState
        v-if="!playerIds.length"
        compact
        tone="violet"
        :title="'未配置播放器'"
        :description="'请在微件设置中填写 media_player 实体 ID'"
      />
      <template v-else>
        <div v-if="albumBg" class="mm-album-bg" :style="{ backgroundImage: `url(${albumBg})` }" />
        <div v-if="playerIds.length > 1" class="mm-dots">
          <div
            v-for="(eid, idx) in playerIds"
            :key="eid"
            :class="['mm-dot', { 'mm-dot--active': idx === activeSlide }]"
            @click="scrollToSlide(idx)"
          />
        </div>
        <div
          ref="sliderRef"
          class="mm-slider no-scrollbar"
          @mousedown="onDragStart"
          @mouseleave="onDragLeave"
          @mouseup="onDragEnd"
          @mousemove="onDragMove"
        >
          <div v-for="eid in playerIds" :key="eid" class="mm-slide">
            <div class="mm-slide-inner">
              <template v-if="entitiesStore.entities[eid]">
                <div class="mm-slide-top">
                  <div class="mm-status">
                    <div
                      :class="['mm-state-dot', stateDotClass(eid)]"
                      aria-hidden="true"
                    />
                    <span class="mm-device-name">{{
                      getEntityDisplayName(eid, entitiesStore.entities[eid])
                    }}</span>
                    <span class="sr-only">{{ stateDotLabel(eid) }}</span>
                  </div>
                </div>
                <div class="mm-controls" @mousedown.stop @click.stop="openPlayer(eid)">
                  <div class="mm-cover">
                    <img
                      v-if="entityArt(eid)"
                      :src="entityArt(eid)"
                      class="w-full h-full object-cover"
                      alt=""
                    />
                    <div v-else class="mm-cover-fallback"><Music :size="18" /></div>
                  </div>
                  <div class="mm-track-info">
                    <div class="mm-title">{{ mediaTitle(eid) }}</div>
                    <div class="mm-subtitle">{{ mediaSubtitle(eid) }}</div>
                  </div>
                  <div class="mm-actions" @click.stop>
                    <button
                      type="button"
                      class="mm-btn"
                      :aria-label="'上一曲'"
                      @click="prevTrack(eid)"
                    >
                      <SkipBack :size="15" fill="currentColor" />
                    </button>
                    <button
                      type="button"
                      class="mm-btn-play"
                      :aria-label="
                        entitiesStore.entities[eid].state === 'playing' ? '暂停' : '播放'
                      "
                      @click="togglePlay(eid)"
                    >
                      <Pause
                        v-if="entitiesStore.entities[eid].state === 'playing'"
                        :size="15"
                        fill="currentColor"
                      />
                      <Play v-else class="mm-icon-play" :size="15" fill="currentColor" />
                    </button>
                    <button
                      type="button"
                      class="mm-btn"
                      :aria-label="'下一曲'"
                      @click="nextTrack(eid)"
                    >
                      <SkipForward :size="15" fill="currentColor" />
                    </button>
                  </div>
                </div>
              </template>
              <VEmptyState v-else compact tone="violet" :title="'等待部署多媒体终端...'" />
            </div>
          </div>
        </div>
      </template>
    </template>

    <!-- 播放列表 Tab -->
    <MediaPlaylistWidget
      v-else
      class="mm-hub-panel"
      variant="embedded"
      :config="config"
      :panel-visible="panelVisible"
    />
  </div>
</template>

<script setup>
/**
 * 多媒体迷你控制器部件 MediaMiniWidget
 *
 * 职责：右侧信息面板中的音乐播放器缩略版控制界面，支持多播放器水平滑动切换（CSS snap 对齐），
 *       通过 WidgetHubHeader 提供「播放/场景/列表」Tab 切换。
 * 数据来源：HA media_player 实体，经 entitiesStore 读取实时状态。
 * 依赖：
 *   - vue (ref/computed/watch/defineAsyncComponent)
 *   - @lucide/vue 图标库
 *   - @/stores/entities.store（实体状态与服务调用）
 *   - @/stores/layout.store（布局配置）
 *   - @/stores/chrome.store（打开播放器）
 *   - @/composables/entity/useEntityDisplayEpoch（媒体展示纪元，强制刷新）
 *   - @/utils/ha/ha-media-url.util（解析 HA 实体图片 URL）
 *   - @/utils/entity/entity-derived.util（实体展示名）
 *   - @/composables/ui/useSwiperDraggable（拖拽滑动）
 *   - @/composables/widget/useHubTabs（Tab 状态管理）
 */
import { ref, computed, watch, defineAsyncComponent } from 'vue'
import { Music, Pause, Play, SkipBack, SkipForward } from '@lucide/vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useHaConnectionStore } from '@/stores/ha-connection.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useEntityDisplayEpoch } from '@/composables/entity/useEntityDisplayEpoch'
import { resolveHaEntityPicture } from '@/utils/ha/media-url.util'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import { useSwiperDraggable } from '@/composables/ui/useSwiperDraggable'
import WidgetHubHeader from '@/components/widgets/shared/WidgetHubHeader.vue'
import { useHubTabs } from '@/composables/widget/useHubTabs'

const MediaPlaylistWidget = defineAsyncComponent(() => import('./PlaylistWidget.vue'))

/**
 * 组件 Props。
 * @property {Object} config - 微件配置，含 playerEntities（逗号分隔的 media_player 实体 ID 字符串）
 * @property {*} id - 微件实例 ID（由外部框架注入）
 * @property {boolean} panelVisible - 面板是否可见（影响懒加载时机），默认 true
 * @property {string} defaultTab - 默认激活 Tab 的 key，默认空字符串
 * @property {boolean} compact - 是否为紧凑模式（隐藏 Hub 头部），默认 true
 */
const props = defineProps({
  config: { type: Object, default: () => ({}) },
  id: {},
  panelVisible: { type: Boolean, default: true },
  defaultTab: { type: String, default: '' },
  compact: { type: Boolean, default: true },
})

// 多媒体 Hub Tab 配置：播放器 / 播放列表
const ALL_HUB_TABS = [
  { key: 'player', label: '播放' },
  { key: 'playlist', label: '列表' },
]

/**
 * 通过 useHubTabs 获取可见 Tab 列表与激活 Tab 状态。
 * - mediaTabs: 经 config 过滤后的可见 Tab 数组
 * - activeTab: 当前激活 Tab 的 key（双向绑定）
 */
const { hubTabs: mediaTabs, activeTab } = useHubTabs({
  hubType: 'mediaMini',
  config: () => props.config,
  defaultTabProp: () => props.defaultTab,
  allTabs: ALL_HUB_TABS,
})

// 紧凑模式下强制锁定到「播放」Tab，避免隐藏头部后无法切换
watch(
  () => props.compact,
  () => {
    if (props.compact) activeTab.value = 'player'
  },
)

// 实体状态仓库（提供 media_player 实体与服务调用）
const entitiesStore = useEntitiesStore()
const haConnectionStore = useHaConnectionStore()
// Chrome 仓库（打开播放器等）
const chrome = useChromeStore()
// 媒体展示纪元：随 media_player 域变化自增，用于强制刷新派生计算
const mediaDisplayEpoch = useEntityDisplayEpoch('media_player')

/**
 * 从 config.playerEntities 解析出合法的 media_player 实体 ID 列表。
 * 配置值为逗号分隔字符串，仅保留以 media_player. 开头的项。
 * @returns {string[]} media_player 实体 ID 数组
 */
const playerIds = computed(() => {
  if (props.config?.playerEntities) {
    return props.config.playerEntities
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.startsWith('media_player.'))
  }
  return []
})

// 当前激活的播放器幻灯片索引（拖拽或点击切换）
const activeSlide = ref(0)
// 幻灯片容器引用，供 useSwiperDraggable 绑定拖拽事件
const sliderRef = ref(null)

// 辅助函数

  /**
   * 解析实体的封面图片 URL（兼容 HA 相对路径，拼接 HA 实例地址）。
   * @param {string} eid - media_player 实体 ID
   * @returns {string|null} 完整封面 URL 或 null
   */
  function entityArt(eid) {
    // 引用 mediaDisplayEpoch 触发响应式依赖，确保封面随域更新刷新
    void mediaDisplayEpoch.value
    const url = entitiesStore.entities[eid]?.attributes?.entity_picture
    return resolveHaEntityPicture(haConnectionStore.baseUrl, url)
  }

/**
 * 根据实体播放状态返回状态圆点的 CSS 类名（含光晕效果）。
 * @param {string} eid - media_player 实体 ID
 * @returns {string} 状态圆点样式类名
 */
function stateDotClass(eid) {
  void mediaDisplayEpoch.value
  const s = entitiesStore.entities[eid]?.state
  if (s === 'playing') return 'mmw-dot-playing shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse'
  if (s === 'paused') return 'mmw-dot-paused shadow-[0_0_6px_rgba(251,191,36,0.4)]'
  if (s === 'off' || s === 'standby' || s === 'unavailable') return 'mmw-dot-off'
  return 'mmw-dot-default shadow-[0_0_6px_rgba(96,165,250,0.4)]'
}

/**
 * 状态圆点的无障碍文本替代（仅颜色信息无法被屏幕阅读器感知）。
 * @param {string} eid - media_player 实体 ID
 * @returns {string} 状态描述文本
 */
function stateDotLabel(eid) {
  void mediaDisplayEpoch.value
  const s = entitiesStore.entities[eid]?.state
  if (s === 'playing') return '正在播放'
  if (s === 'paused') return '已暂停'
  if (s === 'off' || s === 'standby') return '已关机'
  if (s === 'unavailable') return '设备不可用'
  return '已就绪'
}

/**
 * 获取媒体标题，缺失时按状态返回占位文案（播放中/已暂停/已关机/就绪）。
 * @param {string} eid - media_player 实体 ID
 * @returns {string} 媒体标题或状态占位文案
 */
function mediaTitle(eid) {
  void mediaDisplayEpoch.value
  const e = entitiesStore.entities[eid]
  const title = e?.attributes?.media_title
  if (title) return title
  const s = e?.state
  if (s === 'playing') return '播放中...'
  if (s === 'paused') return '已暂停'
  if (s === 'off' || s === 'standby') return '已关机'
  return '就绪'
}

/**
 * 获取媒体副标题（艺人 · 专辑），缺失字段自动过滤。
 * @param {string} eid - media_player 实体 ID
 * @returns {string} 副标题字符串
 */
function mediaSubtitle(eid) {
  void mediaDisplayEpoch.value
  const e = entitiesStore.entities[eid]
  const artist = e?.attributes?.media_artist
  const album = e?.attributes?.media_album_name
  return [artist, album].filter(Boolean).join(' · ')
}

/**
 * 当前激活幻灯片对应播放器的封面图 URL，用作整个滑块的背景模糊层。
 * @returns {string|null} 封面 URL 或 null
 */
const albumBg = computed(() => {
  const eid = playerIds.value[activeSlide.value]
  return eid ? entityArt(eid) : null
})

// 拖拽滑动与滚动管理

/**
 * 通过 useSwiperDraggable 绑定鼠标/触摸拖拽事件，实现幻灯片水平切换。
 * - dragMoved: 本次拖拽是否产生位移（用于区分点击与拖拽）
 * - onDragStart/Leave/End/Move: 事件处理器，绑定到 sliderRef 容器
 * - scrollToSlide(idx): 滚动到指定索引的幻灯片
 * dragExcludeSelector 指定的元素不触发拖拽，避免误伤控制按钮。
 */
const { dragMoved, onDragStart, onDragLeave, onDragEnd, onDragMove, scrollToSlide } =
  useSwiperDraggable(sliderRef, activeSlide, {
    dragThreshold: 8,
    dragExcludeSelector: '.mm-controls, .mm-actions, .mm-btn, .mm-btn-play',
  })

/**
 * 切换播放/暂停状态。根据当前 state 调用 HA 的 media_play 或 media_pause 服务。
 * @param {string} eid - media_player 实体 ID
 */
function togglePlay(eid) {
  entitiesStore.callService(
    'media_player',
    entitiesStore.entities[eid]?.state === 'playing' ? 'media_pause' : 'media_play',
    eid,
  )
}
/**
 * 上一曲：调用 HA 的 media_previous_track 服务。
 * @param {string} eid - media_player 实体 ID
 */
function prevTrack(eid) {
  entitiesStore.callService('media_player', 'media_previous_track', eid)
}
/**
 * 下一曲：调用 HA 的 media_next_track 服务。
 * @param {string} eid - media_player 实体 ID
 */
function nextTrack(eid) {
  entitiesStore.callService('media_player', 'media_next_track', eid)
}

/**
 * 打开完整播放器面板。若本次为拖拽操作则跳过，避免误触发。
 * @param {string} eid - media_player 实体 ID
 */
function openPlayer(eid) {
  if (dragMoved.value) return
  chrome.openMediaPlayer(eid)
}
</script>

<style scoped src="./styles/MiniWidget.css"></style>
