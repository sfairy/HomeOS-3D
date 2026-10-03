/**
 * @file useMediaPlayerModalDisplay.ts
 * @module frontend/src/composables
 */
import { computed, type Ref } from 'vue'
import { useTtsSpeak } from '@/composables/voice/useTtsSpeak'
import { notifyError } from '@/services/notify'

interface MediaPlayerModalDisplayDeps {
  state: Ref<string | undefined>
  attrs: Ref<Record<string, unknown> | null | undefined>
  modalSubtitle: Ref<string>
  mediaArtist: Ref<string>
  mediaAlbum: Ref<string>
  appName: Ref<string>
  hasProgress: Ref<boolean>
  isSeeking: Ref<boolean>
  seekPreviewPct: Ref<number | null | undefined>
  mediaDuration: Ref<number>
  currentTime: Ref<string>
  formatTime: (seconds: number) => string
  entityId: Ref<string | undefined>
  showMore: Ref<boolean>
  ttsText: Ref<string>
  onClose: () => void
}

/** useMediaPlayerModalDisplay：函数，按签名入参返回处理结果。 */
export function useMediaPlayerModalDisplay(deps: MediaPlayerModalDisplayDeps) {
  const {
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
    onClose,
  } = deps

  const { speak: speakTtsMessage } = useTtsSpeak()

  const hasTts = computed(() => !!entityId.value?.startsWith('media_player.'))

  const stateLabel = computed(() => {
    const s = state.value
    if (s === 'playing') return '播放中...'
    if (s === 'paused') return '已暂停'
    if (s === 'off' || s === 'standby') return '已关机'
    return '就绪'
  })

  const stateLabelUpper = computed(() => stateLabel.value.replace(/\.{3}$/, '').toUpperCase())

  const stateDotClass = computed(() => {
    const s = state.value
    if (s === 'playing') return 'media-modal__status-dot--playing'
    if (s === 'paused') return 'media-modal__status-dot--paused'
    if (s === 'off' || s === 'standby' || s === 'unavailable') return 'media-modal__status-dot--off'
    return 'media-modal__status-dot--idle'
  })

  const displaySubtitle = computed(() => {
    if (modalSubtitle.value) return modalSubtitle.value
    if (state.value === 'off' || state.value === 'standby') return '已关机'
    return '就绪'
  })

  const repeatLabel = computed(() => {
    const r = attrs.value?.repeat
    if (r === 'one') return '单曲循环'
    if (r === 'all') return '列表循环'
    return '关闭循环'
  })

  const metaChips = computed(() => {
    const chips: Array<{ key: string; label: string; value: string }> = []
    if (mediaArtist.value)
      chips.push({ key: 'artist', label: mediaArtist.value, value: mediaArtist.value })
    if (mediaAlbum.value)
      chips.push({ key: 'album', label: mediaAlbum.value, value: mediaAlbum.value })
    if (appName.value) chips.push({ key: 'app', label: appName.value, value: appName.value })
    return chips
  })

  const seekDisplayCurrent = computed(() => {
    if (!hasProgress.value) return '0:00'
    if (isSeeking.value && seekPreviewPct.value != null) {
      return formatTime((seekPreviewPct.value / 100) * mediaDuration.value)
    }
    return currentTime.value
  })

  function closeAll() {
    showMore.value = false
    onClose()
  }

  async function speakTts() {
    const id = entityId.value
    if (!id || !ttsText.value.trim()) return
    const r = await speakTtsMessage(ttsText.value, { mediaPlayer: id })
    if (r.ok) ttsText.value = ''
    else notifyError(r.message || new Error('TTS 播报失败'), 'TTS 播报')
  }

  return {
    hasTts,
    stateLabel,
    stateLabelUpper,
    stateDotClass,
    displaySubtitle,
    repeatLabel,
    metaChips,
    seekDisplayCurrent,
    closeAll,
    speakTts,
  }
}
