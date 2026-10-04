<template>
  <!-- MediaPlayerModalTransport 媒体弹窗播控区：进度条、播放/暂停/前后曲与音量控件 -->
  <div class="media-modal__seek">
    <VProgressBar
      :value="hasProgress ? progressPct : 0"
      variant="media"
      size="sm"
      :interactive="hasProgress && supports.seek"
      :aria-label="'播放进度'"
      :aria-value-text="hasProgress ? `${seekDisplayCurrent} / ${totalTime}` : '—'"
      @seek="onSeekDrag"
      @seek-end="seekFromPct"
    />
    <div class="media-modal__seek-row">
      <span class="media-modal__time">{{ seekDisplayCurrent }}</span>
      <span class="media-modal__time">{{ hasProgress ? totalTime : '—' }}</span>
    </div>
  </div>

  <div class="media-modal__transport">
    <button
      v-if="supports.shuffleSet"
      type="button"
      class="media-modal__aux"
      :class="{ 'media-modal__aux--on': attrs?.shuffle }"
      :aria-label="'随机播放'"
      @click="toggleShuffle"
    >
      <Shuffle :size="20" />
    </button>
    <button
      v-if="supports.previousTrack"
      type="button"
      class="media-modal__nav"
      :aria-label="'上一曲'"
      @click="prevTrack"
    >
      <SkipBack :size="28" />
    </button>
    <button
      type="button"
      class="media-modal__play"
      :aria-label="isPlaying ? '暂停' : '播放'"
      @click="togglePlay"
    >
      <Pause v-if="isPlaying" :size="30" fill="currentColor" />
      <Play v-else :size="30" fill="currentColor" class="media-modal__play-nudge" />
    </button>
    <button
      v-if="supports.nextTrack"
      type="button"
      class="media-modal__nav"
      :aria-label="'下一曲'"
      @click="nextTrack"
    >
      <SkipForward :size="28" />
    </button>
    <button
      v-if="supports.repeatSet"
      type="button"
      class="media-modal__aux"
      :class="{ 'media-modal__aux--on': attrs?.repeat && attrs.repeat !== 'off' }"
      :aria-label="'循环播放'"
      @click="toggleRepeat"
    >
      <Repeat :size="20" />
    </button>
  </div>

  <div v-if="supports.volumeSet || supports.volumeMute" class="media-modal__volume">
    <button
      v-if="supports.volumeMute"
      type="button"
      class="media-modal__vol-btn"
      :aria-label="'静音'"
      @click="toggleMute"
    >
      <VolumeX v-if="isMuted || volume === 0" :size="20" />
      <Volume2 v-else :size="20" />
    </button>
    <div v-if="supports.volumeSet" class="media-modal__vol-track">
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        :value="volumeRange"
        class="media-modal__vol-slider media-range"
        :style="volumeTrackStyle"
        :aria-label="'音量'"
        @input="onVolumeInput"
        @change="onVolumeChange"
        @mouseup="commitVolume"
        @touchend="commitVolume"
      />
    </div>
  </div>
</template>

<script setup>
/**
 * MediaPlayerModalTransport - 媒体弹窗播控区组件
 * 职责：呈现播放进度条、播放/暂停/上一曲/下一曲按钮、随机/循环开关与音量条。
 * Props:
 * - hasProgress/progressPct：是否存在进度与进度百分比；
 * - supports：能力开关对象，控制按钮与音量条是否渲染；
 * - seekDisplayCurrent/totalTime：当前播放时间与总时长文本；
 * - attrs：播放器原始属性（用于读取 shuffle/repeat 状态）；
 * - isPlaying/isMuted/volume/volumeRange/volumeTrackStyle：播放状态、静音、音量相关；
 * - onSeekDrag/seekFromPct：进度条拖动与跳转回调；
 * - toggleShuffle/prevTrack/togglePlay/nextTrack/toggleRepeat：播放控制回调；
 * - toggleMute/onVolumeInput/onVolumeChange/commitVolume：音量相关回调。
 */
import {
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Repeat,
  Shuffle,
} from '@lucide/vue'
import VProgressBar from '@/components/common/base/VProgressBar.vue'

defineProps({
  hasProgress: { type: Boolean, default: false },
  progressPct: { type: Number, default: 0 },
  supports: { type: Object, required: true },
  seekDisplayCurrent: { type: String, default: '0:00' },
  totalTime: { type: String, default: '—' },
  attrs: { type: Object, default: null },
  isPlaying: { type: Boolean, default: false },
  isMuted: { type: Boolean, default: false },
  volume: { type: Number, default: 0 },
  volumeRange: { type: Number, default: 0 },
  volumeTrackStyle: { type: Object, default: () => ({}) },
  onSeekDrag: { type: Function, required: true },
  seekFromPct: { type: Function, required: true },
  toggleShuffle: { type: Function, required: true },
  prevTrack: { type: Function, required: true },
  togglePlay: { type: Function, required: true },
  nextTrack: { type: Function, required: true },
  toggleRepeat: { type: Function, required: true },
  toggleMute: { type: Function, required: true },
  onVolumeInput: { type: Function, required: true },
  onVolumeChange: { type: Function, required: true },
  commitVolume: { type: Function, required: true },
})
</script>
