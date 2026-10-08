<template>
  <!-- MediaPlayerModal 媒体播放器模态框：全屏的媒体播放控制器 -->
  <Teleport :to="teleportTarget" :disabled="teleportDisabled">
  <Transition name="hos-modal">
    <div v-if="isOpen && entityId" class="hos-modal-root" @click.self="closeAll">
      <div class="hos-modal-backdrop">
        <div
          v-if="albumArt"
          class="media-modal__bg-art"
          :class="{ 'media-modal__bg-art--live': isPlaying }"
          :style="{ backgroundImage: `url(${albumArt})` }"
          aria-hidden="true"
        />
      </div>

      <article
        ref="panelRef"
        class="hos-modal-panel hos-modal-panel--xl media-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="deviceName || '媒体播放器'"
        @click.stop="showMore = false"
      >
        <div class="hos-modal-glow hos-modal-glow--blue" aria-hidden="true" />
        <div class="hos-modal-glow hos-modal-glow--purple" aria-hidden="true" />

        <div class="media-modal__layout">
          <MediaPlayerModalArt
            v-model:view-mode="viewMode"
            :album-art="albumArt"
            :is-playing="isPlaying"
            :modal-title="modalTitle"
            :has-lyrics="hasLyrics"
            :lyrics-lines="lyricsLines"
          />

          <section class="media-modal__main">
            <MediaPlayerModalHeader
              v-model:show-more="showMore"
              v-model:tts-text="ttsText"
              :device-name="deviceName"
              :state-label-upper="stateLabelUpper"
              :state-dot-class="stateDotClass"
              :attrs="attrs"
              :supports="supports"
              :repeat-label="repeatLabel"
              :source-list="sourceList"
              :has-tts="hasTts"
              :toggle-shuffle="toggleShuffle"
              :toggle-repeat="toggleRepeat"
              :set-source="setSource"
              :speak-tts="speakTts"
              @close="emit('close')"
            />

            <div class="media-modal__info">
              <h2 class="media-modal__title" :title="modalTitle">{{ modalTitle }}</h2>
              <p class="media-modal__subtitle" :title="displaySubtitle">{{ displaySubtitle }}</p>
              <div v-if="metaChips.length" class="media-modal__meta">
                <span
                  v-for="chip in metaChips"
                  :key="chip.key"
                  class="media-modal__meta-chip"
                  :title="chip.value"
                >
                  {{ chip.label }}
                </span>
              </div>
            </div>

            <MediaPlayerModalTransport
              :has-progress="hasProgress"
              :progress-pct="progressPct"
              :supports="supports"
              :seek-display-current="seekDisplayCurrent"
              :total-time="totalTime"
              :attrs="attrs"
              :is-playing="isPlaying"
              :is-muted="isMuted"
              :volume="volume"
              :volume-range="volumeRange"
              :volume-track-style="volumeTrackStyle"
              :on-seek-drag="onSeekDrag"
              :seek-from-pct="seekFromPct"
              :toggle-shuffle="toggleShuffle"
              :prev-track="prevTrack"
              :toggle-play="togglePlay"
              :next-track="nextTrack"
              :toggle-repeat="toggleRepeat"
              :toggle-mute="toggleMute"
              :on-volume-input="onVolumeInput"
              :on-volume-change="onVolumeChange"
              :commit-volume="commitVolume"
            />
          </section>
        </div>
      </article>
    </div>
  </Transition>
  </Teleport>
</template>

<script setup>
/**
 * MediaPlayerModal - 媒体播放器模态框组件
 * 功能特性：
 * - 全屏媒体播放控制
 * - 播放/暂停、音量、曲目切换
 * - 显示专辑封面和曲目信息
 * - 进度条和播放时间
 * - 模态对话框形式
 */
/**
 * 媒体播放器弹窗 — 侧栏迷你控制器入口
 * 横向分栏：左侧封面/歌词，右侧播控（参考 HomeOS 玻璃态风格）
 */
import { ref, computed, watch } from 'vue'
import MediaPlayerModalArt from '@/components/modals/media-player/MediaPlayerModalArt.vue'
import MediaPlayerModalHeader from '@/components/modals/media-player/MediaPlayerModalHeader.vue'
import MediaPlayerModalTransport from '@/components/modals/media-player/MediaPlayerModalTransport.vue'
import { useMediaPlayerControls } from '@/composables/entity/useMediaPlayerControls'
import { useShellTeleportTarget } from '@/composables/ui/useShellTeleportTarget'
import { useMediaPlayerModalDisplay } from '@/composables/entity/useMediaPlayerModalDisplay'
import { useFocusTrap } from '@/composables/ui/useFocusTrap'
import './media-player/modal.css'

const { teleportTarget, shellTeleportPending } = useShellTeleportTarget()
const teleportDisabled = shellTeleportPending

const props = defineProps({
  isOpen: { type: Boolean },
  entityId: {},
})

const emit = defineEmits(['close'])

const panelRef = ref(null)
const showMore = ref(false)
const viewMode = ref('cover')
const ttsText = ref('')

useFocusTrap(
  panelRef,
  computed(() => props.isOpen && !!props.entityId),
)

const {
  entityId,
  attrs,
  isPlaying,
  isMuted,
  supports,
  entityPicture: albumArt,
  title: modalTitle,
  subtitle: modalSubtitle,
  mediaArtist,
  mediaAlbum,
  appName,
  deviceName,
  lyricsLines,
  hasLyrics,
  mediaDuration,
  hasProgress,
  progressPct,
  isSeeking,
  seekPreviewPct,
  sliderVolume: volume,
  sliderVolumeRange: volumeRange,
  volumeTrackStyle,
  currentTimeLabel: currentTime,
  totalTimeLabel: totalTime,
  sourceList,
  state,
  formatTime,
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
  startPlaybackLoop,
  stopPlaybackLoop,
} = useMediaPlayerControls(() => props.entityId)

const {
  hasTts,
  stateLabelUpper,
  stateDotClass,
  displaySubtitle,
  repeatLabel,
  metaChips,
  seekDisplayCurrent,
  closeAll,
  speakTts,
} = useMediaPlayerModalDisplay({
  state,
  attrs,
  modalSubtitle,
  mediaArtist,
  mediaAlbum,
  appName,
  hasProgress,
  isSeeking,
  seekPreviewPct,
  mediaDuration,
  currentTime,
  formatTime,
  entityId,
  showMore,
  ttsText,
  onClose: () => emit('close'),
})

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      startPlaybackLoop()
      viewMode.value = 'cover'
      showMore.value = false
    } else {
      stopPlaybackLoop()
      showMore.value = false
    }
  },
  { immediate: true },
)

watch(entityId, () => {
  viewMode.value = 'cover'
  showMore.value = false
})
</script>
