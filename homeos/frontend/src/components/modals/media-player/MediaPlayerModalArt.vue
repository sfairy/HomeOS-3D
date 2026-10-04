<template>
  <!-- MediaPlayerModalArt 媒体弹窗封面区：展示专辑封面或逐行歌词，并提供视图切换按钮 -->
  <aside class="media-modal__art">
    <div class="media-modal__art-frame" :class="{ 'media-modal__art-frame--live': isPlaying }">
      <template v-if="viewMode === 'cover'">
        <img v-if="albumArt" :src="albumArt" class="media-modal__cover-img" :alt="modalTitle" />
        <div v-else class="media-modal__cover-empty">
          <Music :size="72" stroke-width="1" />
        </div>
      </template>
      <div v-else class="media-modal__lyrics">
        <p v-if="!hasLyrics" class="media-modal__lyrics-empty">{{ '暂无歌词' }}</p>
        <p v-for="(line, i) in lyricsLines" :key="i" class="media-modal__lyrics-line">{{ line }}</p>
      </div>
    </div>
    <button
      v-if="hasLyrics"
      type="button"
      class="media-modal__view-toggle"
      @click.stop="toggleViewMode"
    >
      <Image v-if="viewMode === 'lyrics'" :size="14" />
      <AlignLeft v-else :size="14" />
      <span>{{ viewMode === 'cover' ? '歌词' : '显示封面' }}</span>
    </button>
  </aside>
</template>

<script setup>
/**
 * MediaPlayerModalArt - 媒体弹窗封面区组件
 * 职责：在媒体播放器弹窗左侧呈现封面图或歌词文本，并提供封面/歌词视图切换。
 * Props:
 * - albumArt：专辑封面 URL，缺省时显示占位图标；
 * - isPlaying：是否正在播放，用于驱动封面动效；
 * - modalTitle：弹窗标题，作为封面 img 的 alt 文本；
 * - hasLyrics/lyricsLines：是否拥有歌词及歌词行数组；
 * - viewMode（v-model）：当前视图模式 'cover' | 'lyrics'。
 */
import { Music, AlignLeft, Image } from '@lucide/vue'

const viewMode = defineModel('viewMode', { type: String, default: 'cover' })

defineProps({
  albumArt: { type: String, default: '' },
  isPlaying: { type: Boolean, default: false },
  modalTitle: { type: String, default: '' },
  hasLyrics: { type: Boolean, default: false },
  lyricsLines: { type: Array, default: () => [] },
})

function toggleViewMode() {
  // 在封面与歌词视图间切换
  viewMode.value = viewMode.value === 'cover' ? 'lyrics' : 'cover'
}
</script>
