/**
 * @file MediaPlayerPopup.vue
 * @module components/entities/popups
 * @brief 媒体播放器控制弹窗
 *
 * 职责：
 * - 基于 AnchoredPopupShell 渲染 media_player 域控制面板
 * - 提供播放/暂停、上一首/下一首、音量调节、循环/随机
 * - 展示当前曲目信息与播放状态
 *
 * 依赖：
 * - vue（ref/computed）、@lucide/vue（Music/SkipBack/SkipForward/Pause/Play/Volume2 等）
 * - ./AnchoredPopupShell、./PopupHead
 * - @/composables/entity/useEntityPopupBase
 */
<template>
  <!-- MediaPlayerPopup 媒体播放器弹窗：控制媒体播放器实体 -->
  <AnchoredPopupShell
    :x-pct="xPct"
    :y-pct="yPct"
    :anchor-x="anchorX"
    :anchor-y="anchorY"
    :width="290"
    :height="340"
    class="media-popup-wrapper"
    inner-class="media-popup"
    close-class="popup-close-btn"
    pointer-on-inner
    inner-swipe-close
    @close="$emit('close')"
  >
    <div class="media-popup-head" style="--accent: #c084fc; --accent-rgb: 192, 132, 252">
      <PopupHead :title="deviceName || '媒体播放器'" :icon="Music">
        <template #status>
          <span
            :class="[
              'popup-status-dot',
              state === 'playing' &&
                'popup-status-dot--pulse mcp-dot-playing shadow-[0_0_8px_rgba(34,197,94,0.6)]',
            ]"
            :style="stateDotStyle"
          />
          <span class="text-white/40">{{ stateLabel }}</span>
        </template>
        <template v-if="supports.repeatSet || supports.shuffleSet" #actions>
          <button
            v-if="supports.repeatSet"
            class="media-head-btn"
            @click.stop="toggleRepeat"
            :class="{
              'media-head-btn--active': attrs?.repeat === 'all' || attrs?.repeat === 'one',
            }"
            :aria-label="'循环播放'"
            :title="'循环播放'"
          >
            <Repeat class="w-3 h-3" />
          </button>
          <button
            v-if="supports.shuffleSet"
            class="media-head-btn"
            @click.stop="toggleShuffle"
            :class="{ 'media-head-btn--active-shuffle': attrs?.shuffle }"
            :aria-label="'随机播放'"
            :title="'随机播放'"
          >
            <Shuffle class="w-3 h-3" />
          </button>
        </template>
      </PopupHead>
    </div>

    <div class="flex gap-3 mb-3">
      <div
        class="w-14 h-14 rounded-xl bg-black/40 border border-white/10 flex-shrink-0 overflow-hidden flex items-center justify-center relative"
      >
        <img
          v-if="entityPicture"
          :src="entityPicture"
          class="w-full h-full object-cover"
          :alt="popupTitle"
        />
        <Music v-else class="w-5 h-5 text-white/10" />
        <div
          v-if="state === 'playing'"
          class="absolute inset-0 mcp-playing-overlay pointer-events-none"
        />
      </div>
      <div class="flex flex-col justify-center min-w-0 flex-1">
        <h3 class="text-sm font-bold text-white truncate leading-tight">{{ popupTitle }}</h3>
        <p class="text-xs mcp-subtitle truncate mt-0.5">{{ popupSubtitle }}</p>
      </div>
    </div>

    <div v-if="hasProgress" class="mb-3">
      <div class="flex justify-between text-xs text-white/25 mb-1">
        <span>{{
          formatTime(
            isSeeking && seekPreviewPct != null
              ? (seekPreviewPct / 100) * mediaDuration
              : livePosition,
          )
        }}</span>
        <span>{{ formatTime(mediaDuration) }}</span>
      </div>
      <VProgressBar
        :value="progressPct"
        variant="media"
        size="xs"
        :interactive="supports.seek"
        :aria-label="'播放进度'"
        :aria-value-text="`${formatTime(livePosition)} / ${formatTime(mediaDuration)}`"
        @seek="onSeekDrag"
        @seek-end="seekFromPct"
      />
    </div>

    <div
      class="flex items-center justify-between gap-2 mb-3 bg-white/5 p-1 rounded-2xl border border-white/5"
    >
      <button
        v-if="supports.previousTrack"
        class="flex-1 py-2 flex items-center justify-center mcp-ctrl-btn hover:bg-white/5 rounded-xl transition-all active:scale-90"
        @click.stop="prevTrack"
        :aria-label="'上一曲'"
      >
        <SkipBack class="w-5 h-5" />
      </button>
      <button
        class="w-11 h-11 rounded-xl mcp-play-btn text-white flex items-center justify-center shadow-lg active:scale-90 transition-all"
        @click.stop="togglePlay"
        :aria-label="state === 'playing' ? '暂停' : '播放'"
      >
        <Pause v-if="state === 'playing'" class="w-5 h-5" />
        <Play v-else class="w-5 h-5 ml-0.5" />
      </button>
      <button
        v-if="supports.nextTrack"
        class="flex-1 py-2 flex items-center justify-center mcp-ctrl-btn hover:bg-white/5 rounded-xl transition-all active:scale-90"
        @click.stop="nextTrack"
        :aria-label="'下一曲'"
      >
        <SkipForward class="w-5 h-5" />
      </button>
    </div>

    <div v-if="supports.volumeSet || supports.volumeMute" class="flex items-center gap-3 px-1 mb-3">
      <button
        v-if="supports.volumeMute"
        class="mcp-mute-btn hover:text-white transition-colors"
        @click.stop="toggleMute"
        :aria-label="'静音'"
      >
        <VolumeX v-if="attrs?.is_volume_muted || sliderVolume === 0" class="w-4 h-4" />
        <Volume2 v-else class="w-4 h-4" />
      </button>
      <div v-if="supports.volumeSet" class="relative flex-1 flex items-center">
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          :value="sliderVolumeRange"
          class="media-volume-slider media-range"
          data-no-swipe-close
          :style="volumeTrackStyle"
          :aria-label="'音量'"
          @input="onVolumeInput"
          @change="onVolumeChange"
          @mouseup="commitVolume"
          @touchend="commitVolume"
        />
      </div>
    </div>

    <div v-if="supports.selectSource && sourceList.length > 0" class="mb-3">
      <span class="text-xs mcp-source-label font-bold uppercase tracking-widest block mb-1.5">{{
        '音源'
      }}</span>
      <div class="flex flex-wrap gap-1">
        <button
          v-for="src in sourceList"
          :key="src"
          :class="['source-chip', attrs?.source === src ? 'source-chip--active' : '']"
          @click.stop="setSource(src)"
        >
          {{ src }}
        </button>
      </div>
    </div>

    <div v-if="hasTts" class="tts-row">
      <input
        v-model="ttsText"
        type="text"
        class="tts-input"
        :placeholder="'输入播报文字...'"
        @keydown.enter="speakTts"
      />
      <button
        class="tts-btn"
        @click="speakTts"
        :disabled="!ttsText.trim()"
        :aria-label="'语音播报'"
      >
        <Volume2 class="w-3.5 h-3.5" />
      </button>
    </div>
  </AnchoredPopupShell>
</template>

<script setup>
/**
 * 职责：实现 MediaPlayerPopup 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
/**
 * MediaPlayerPopup - 媒体播放器弹窗组件
 * 功能特性：
 * - 播放/暂停控制
 * - 音量调节
 * - 曲目切换
 * - 显示当前播放信息
 * - 弹出式面板
 */
import { ref, computed } from 'vue'
import {
  Music,
  SkipBack,
  SkipForward,
  Pause,
  Play,
  Volume2,
  VolumeX,
  Repeat,
  Shuffle,
} from '@lucide/vue'
import AnchoredPopupShell from '@/components/entities/popups/AnchoredPopupShell.vue'
import PopupHead from '@/components/entities/popups/PopupHead.vue'
import { defineEntityPopupProps, useEntityPopupBase } from '@/composables/entity/useEntityPopupBase'
import { useTtsSpeak } from '@/composables/voice/useTtsSpeak'
import { useMediaPlayerControls } from '@/composables/entity/useMediaPlayerControls'
import VProgressBar from '@/components/common/base/VProgressBar.vue'
import { notifyError } from '@/services/notify'

const props = defineProps(defineEntityPopupProps())

defineEmits(['close'])

const { liveEntity } = useEntityPopupBase(props)
const { speak: speakTtsMessage } = useTtsSpeak()

const {
  entity: mediaEntity,
  state,
  attrs,
  supports,
  entityPicture,
  title: popupTitle,
  subtitle: popupSubtitle,
  deviceName,
  mediaDuration,
  hasProgress,
  progressPct,
  livePosition,
  isSeeking,
  seekPreviewPct,
  sliderVolume,
  sliderVolumeRange,
  volumeTrackStyle,
  formatTime,
  sourceList,
  togglePlay,
  prevTrack,
  nextTrack,
  toggleMute,
  onVolumeInput,
  onVolumeChange,
  commitVolume,
  toggleShuffle,
  toggleRepeat,
  setSource,
  onSeekDrag,
  seekFromPct,
} = useMediaPlayerControls(() => liveEntity.value)

const STATE_LABELS = {
  playing: '播放中',
  paused: '已暂停',
  idle: '空闲',
  off: '待机',
  standby: '待机',
  unavailable: '不可用',
  unknown: '未知',
}

const stateLabel = computed(() => STATE_LABELS[state.value] || state.value || '—')

const stateDotStyle = computed(() => {
  const s = state.value
  if (s === 'playing') return {}
  if (s === 'paused') return { background: 'var(--premium-accent-amber)' }
  if (s === 'off' || s === 'standby') return { background: 'rgba(255,255,255,0.25)' }
  return { background: 'var(--premium-accent-blue)', boxShadow: '0 0 6px rgba(96,165,250,0.4)' }
})

const hasTts = computed(() => mediaEntity.value?.entity_id?.startsWith('media_player.'))
const ttsText = ref('')

async function speakTts() {
  const r = await speakTtsMessage(ttsText.value, { mediaPlayer: mediaEntity.value.entity_id })
  if (r.ok) ttsText.value = ''
  else notifyError(r.message || new Error('TTS 播报失败'), 'TTS 播报')
}
</script>

<style scoped src="./styles/MediaPlayerPopup.css"></style>
<!-- 关闭按钮由 AnchoredPopupShell 渲染，需非 scoped 公共样式 -->
<style>
@import '@/assets/styles/popup-base.css';
</style>
