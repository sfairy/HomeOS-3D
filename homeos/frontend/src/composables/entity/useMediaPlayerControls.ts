/**
 * 媒体播放器控制组合式函数模块。
 *
 * 职责：
 * - 为 MediaPlayerModal 与 MediaPlayerPopup 提供共享的媒体播放器控制逻辑；
 * - 解析实体与属性（state、supported_features 特性位掩码、媒体元数据、歌词）；
 * - 提供播放/暂停、上一曲/下一曲、静音、随机/循环、音源切换、进度拖拽（带预览）、音量控制；
 * - 通过 requestAnimationFrame 维护实时播放进度，seek 期间暂停外部更新以避免抖动；
 * - 通过 useSliderCommit 处理音量滑块的拖拽本地值与提交。
 *
 * 依赖：vue ref/computed/watch/onUnmounted/unref、entities store、ui store、notifyError、
 * ha-media-url 工具、useSliderCommit、progress-bar 工具、HaEntityState 类型。
 */
import { ref, computed, watch, onUnmounted, unref, type MaybeRef, type Ref } from 'vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useHaConnectionStore } from '@/stores/ha-connection.store'
import { notifyError } from '@/services/notify'
import { resolveHaEntityPicture } from '@/utils/ha/media-url.util'
import { useSliderCommit } from '@/composables/entity/useSliderCommit'
import { progressFillStyle, clampInRange } from '@/utils/ui/progress-bar.util'
import type { HaEntityState } from '@/types/entity-store'

/** 媒体播放器数据源：可为 entity_id 字符串、实体对象、null/undefined */
type MediaPlayerSource =
  | string
  | { entity_id?: string; state?: string; attributes?: HaEntityState['attributes'] }
  | null
  | undefined

/**
 * MediaPlayerModal 与 MediaPlayerPopup 共用的 media_player 控制逻辑。
 *
 * 调用场景：MediaPlayerModal/MediaPlayerPopup 组件 setup 中调用，
 * 提供播放控制、进度计算、音量调节、元数据/歌词展示等全部响应式状态。
 *
 * @param source entity_id 或实体对象
 * @returns 媒体播放器控制所需的全部响应式状态与控制方法
 */
export function useMediaPlayerControls(
  source: MaybeRef<MediaPlayerSource> | (() => MediaPlayerSource) | Ref<MediaPlayerSource>,
) {
  const entitiesStore = useEntitiesStore()
  const haConnectionStore = useHaConnectionStore()
  /** 解析数据源（兼容 ref/getter/ref 值） */
  function resolveSource() {
    if (typeof source === 'function') return source()
    return unref(source)
  }
  // 当前 entity_id：字符串直接取，对象取 entity_id 字段
  const entityId = computed(() => {
    const s = resolveSource()
    if (typeof s === 'string') return s
    return s?.entity_id || ''
  })
  // 实体快照：优先 store 实时值，回退到外部传入对象
  const entity = computed(() => {
    const id = entityId.value
    if (!id) return null
    const fromStore = entitiesStore.entities[id]
    if (fromStore) return fromStore
    const s = resolveSource()
    return typeof s === 'object' && s?.entity_id ? s : null
  })
  // 状态：缺省 'off'
  const state = computed(() => entity.value?.state || 'off')
  // attributes：缺省空对象
  const attrs = computed(
    () => (entity.value?.attributes || {}) as Record<string, unknown>,
  )
  const isPlaying = computed(() => state.value === 'playing')
  const isMuted = computed(() => !!attrs.value.is_volume_muted)
  // HA media_player 支持特性位掩码（MediaPlayerEntityFeature）
  const MEDIA_FEATURE = {
    PAUSE: 1,
    SEEK: 2,
    VOLUME_SET: 4,
    VOLUME_MUTE: 8,
    PREVIOUS_TRACK: 16,
    NEXT_TRACK: 32,
    TURN_ON: 128,
    TURN_OFF: 256,
    PLAY_MEDIA: 512,
    VOLUME_STEP: 1024,
    SELECT_SOURCE: 2048,
    STOP: 4096,
    CLEAR_PLAYLIST: 8192,
    PLAY: 16384,
    SHUFFLE_SET: 32768,
    SELECT_SOUND_MODE: 65536,
    BROWSE_MEDIA: 131072,
    REPEAT_SET: 262144,
    GROUPING: 524288,
  } as const
  // 当前实体支持特性位掩码
  const supportedFeatures = computed(() => Number(attrs.value.supported_features) || 0)
  /** 判断是否支持指定特性位 */
  function hasFeature(bit: number) {
    return (supportedFeatures.value & bit) === bit
  }
  // 各类控制能力（按特性位判断）
  const supports = computed(() => ({
    pause: hasFeature(MEDIA_FEATURE.PAUSE),
    play: hasFeature(MEDIA_FEATURE.PLAY),
    seek: hasFeature(MEDIA_FEATURE.SEEK),
    volumeSet: hasFeature(MEDIA_FEATURE.VOLUME_SET),
    volumeMute: hasFeature(MEDIA_FEATURE.VOLUME_MUTE),
    previousTrack: hasFeature(MEDIA_FEATURE.PREVIOUS_TRACK),
    nextTrack: hasFeature(MEDIA_FEATURE.NEXT_TRACK),
    selectSource: hasFeature(MEDIA_FEATURE.SELECT_SOURCE),
    shuffleSet: hasFeature(MEDIA_FEATURE.SHUFFLE_SET),
    repeatSet: hasFeature(MEDIA_FEATURE.REPEAT_SET),
  }))
  // 媒体封面图：通过 resolveHaEntityPicture 拼接 HA base URL
  const entityPicture = computed(() => {
    const pic = attrs.value.entity_picture
    if (!pic) return null
    return resolveHaEntityPicture(
      haConnectionStore.baseUrl,
      String(pic),
    )
  })
  // 标题：优先 media_title，否则按状态展示中文文案
  const title = computed(() => {
    const mediaTitle = attrs.value.media_title
    if (mediaTitle) return String(mediaTitle)
    const s = state.value
    if (s === 'playing') return '播放中...'
    if (s === 'paused') return '已暂停'
    if (s === 'off' || s === 'standby') return '已关机'
    return '就绪'
  })
  // 媒体元数据
  const mediaArtist = computed(() => String(attrs.value.media_artist || ''))
  const mediaAlbum = computed(() => String(attrs.value.media_album_name || ''))
  const appName = computed(() => String(attrs.value.app_name || ''))
  const contentType = computed(() => String(attrs.value.media_content_type || ''))
  const deviceName = computed(() => String(attrs.value.friendly_name || ''))
  // 副标题：优先 artist · album，其次 series · episode，最后 channel
  const subtitle = computed(() => {
    const parts = [mediaArtist.value, mediaAlbum.value].filter(Boolean)
    if (parts.length) return parts.join(' · ')
    const series = attrs.value.media_series_title
    const episode = attrs.value.media_episode
    const channel = attrs.value.media_channel
    if (series || episode) return [series, episode].filter(Boolean).map(String).join(' · ')
    if (channel) return String(channel)
    return ''
  })
  /** 解析歌词：支持 lyrics / media_lyrics / lyric / lrc 等常见 HA 属性 */
  const lyricsLines = computed(() => {
    const raw =
      attrs.value.lyrics ?? attrs.value.media_lyrics ?? attrs.value.lyric ?? attrs.value.lrc ?? null
    if (!raw) return []
    if (Array.isArray(raw)) {
      return raw.map((line) => String(line).trim()).filter(Boolean)
    }
    if (typeof raw === 'string') {
      // 字符串歌词：按行拆分，去除 LRC 时间戳 [mm:ss.xxx]
      return raw
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.replace(/^\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]\s*/, ''))
    }
    return []
  })
  const hasLyrics = computed(() => lyricsLines.value.length > 0)
  // 媒体总时长（秒）
  const mediaDuration = computed(() => Number(attrs.value.media_duration) || 0)
  const hasProgress = computed(() => mediaDuration.value > 0)
  // 可选音源列表
  const sourceList = computed(() =>
    Array.isArray(attrs.value.source_list) ? (attrs.value.source_list as string[]) : [],
  )
  // 实时播放位置（秒）+ seek 状态（拖拽中暂停外部更新）
  const livePosition = ref(0)
  const isSeeking = ref(false)
  const seekPreviewPct = ref<number | null>(null)
  /** requestAnimationFrame 句柄 */
  let rafId: number | null = null
  /**
   * 计算实时播放位置：基于 media_position + media_position_updated_at 推算（播放中持续累加）。
   * @returns 当前播放秒数（clamp 到 0~duration）
   */
  function resolveLivePosition() {
    const duration = mediaDuration.value
    if (!duration) return 0
    let pos = Number(attrs.value.media_position) || 0
    if (state.value === 'playing' && attrs.value.media_position_updated_at) {
      const updatedAt = new Date(String(attrs.value.media_position_updated_at)).getTime()
      pos += (Date.now() - updatedAt) / 1000
    }
    return Math.min(duration, Math.max(0, pos))
  }
  /** rAF tick：非拖拽时更新 livePosition，循环调度 */
  function tick() {
    if (!hasProgress.value) {
      livePosition.value = 0
      rafId = requestAnimationFrame(tick)
      return
    }
    if (!isSeeking.value) livePosition.value = resolveLivePosition()
    rafId = requestAnimationFrame(tick)
  }
  /** 启动 rAF 播放循环 */
  function startPlaybackLoop() {
    if (rafId != null) cancelAnimationFrame(rafId)
    rafId = requestAnimationFrame(tick)
  }
  /** 停止 rAF 播放循环 */
  function stopPlaybackLoop() {
    if (rafId != null) cancelAnimationFrame(rafId)
    rafId = null
  }
  // hasProgress 变化时启停播放循环
  watch(
    hasProgress,
    (active) => {
      stopPlaybackLoop()
      if (active) startPlaybackLoop()
      else livePosition.value = 0
    },
    { immediate: true },
  )
  // 切换实体时重置 seek 状态并重启循环
  watch(entityId, () => {
    isSeeking.value = false
    seekPreviewPct.value = null
    startPlaybackLoop()
  })
  onUnmounted(stopPlaybackLoop)
  // 进度百分比：拖拽中使用预览值，否则用 livePosition / duration
  const progressPct = computed(() => {
    if (!hasProgress.value) return 0
    if (isSeeking.value && seekPreviewPct.value != null) return seekPreviewPct.value
    return Math.min(100, (livePosition.value / mediaDuration.value) * 100)
  })
  // seekVal 双向：get 取进度百分比，set 仅更新预览（不立即下发）
  const seekVal = computed({
    get: () => progressPct.value,
    set: (v) => {
      seekPreviewPct.value = v
    },
  })
  // 进度条填充样式（media 变体）
  const progressFillStyleComputed = computed(() =>
    progressFillStyle({ value: progressPct.value, variant: 'media' }),
  )
  /**
   * 调用 media_player service，失败时统一 notifyError。
   * @param service media_player.* service 名（如 media_play/media_pause）
   * @param data service payload
   */
  async function callMedia(service: string, data?: Record<string, unknown>) {
    const id = entityId.value
    if (!id) return
    try {
      await entitiesStore.callService('media_player', service, id, data, false)
    } catch (e) {
      notifyError(e, '媒体控制')
    }
  }
  // 音量源：volume_level(0-1) → 0-100
  const volumeSource = computed(() =>
    clampInRange((Number(attrs.value.volume_level) || 0) * 100, 0, 100, 0),
  )
  // 音量滑块：拖拽本地值与提交解耦，释放时调用 volume_set
  const {
    localValue: sliderVolume,
    rangeValue: sliderVolumeRange,
    isDragging: isVolumeDragging,
    trackStyle: volumeTrackStyle,
    onInput: onVolumeInput,
    onChange: onVolumeChange,
    commit: commitVolume,
  } = useSliderCommit(volumeSource, {
    onCommit: (val: number) => callMedia('volume_set', { volume_level: val / 100 }),
    track: () => ({
      min: 0,
      max: 100,
      step: 1,
      variant: 'media',
      trackColor: 'rgba(255,255,255,0.1)',
    }),
  })
  /**
   * 格式化时间为 m:ss 或 h:mm:ss。
   * @param seconds 秒数
   * @returns 格式化后的时间字符串
   */
  function formatTime(seconds: number | null | undefined) {
    if (!seconds || Number.isNaN(seconds)) return '0:00'
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    const h = Math.floor(seconds / 3600)
    if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${m}:${String(s).padStart(2, '0')}`
  }
  // 当前时间标签：拖拽中显示预览时间
  const currentTimeLabel = computed(() => {
    if (isSeeking.value && seekPreviewPct.value != null) {
      return formatTime((seekPreviewPct.value / 100) * mediaDuration.value)
    }
    return formatTime(livePosition.value)
  })
  // 总时长标签
  const totalTimeLabel = computed(() => formatTime(mediaDuration.value))
  /** 切换播放/暂停 */
  function togglePlay() {
    callMedia(state.value === 'playing' ? 'media_pause' : 'media_play')
  }
  /** 上一曲 */
  function prevTrack() {
    callMedia('media_previous_track')
  }
  /** 下一曲 */
  function nextTrack() {
    callMedia('media_next_track')
  }
  /** 切换静音 */
  function toggleMute() {
    callMedia('volume_mute', { is_volume_muted: !attrs.value.is_volume_muted })
  }
  /** 切换随机播放 */
  function toggleShuffle() {
    callMedia('shuffle_set', { shuffle: !attrs.value.shuffle })
  }
  /** 切换循环模式：off → one → all → off */
  function toggleRepeat() {
    const current = attrs.value.repeat || 'off'
    const next = current === 'off' ? 'one' : current === 'one' ? 'all' : 'off'
    callMedia('repeat_set', { repeat: next })
  }
  /**
   * 切换音源。
   * @param src 音源名称
   */
  function setSource(src: string) {
    callMedia('select_source', { source: src })
  }
  /**
   * seek 输入（拖拽中）：更新预览百分比与本地 livePosition。
   * @param pct 0-100
   */
  function onSeekInput(pct: number) {
    isSeeking.value = true
    seekPreviewPct.value = pct
    livePosition.value = (pct / 100) * Number(mediaDuration.value)
  }
  /**
   * seek 拖拽（与 onSeekInput 同义，供 slider 拖拽事件调用）。
   * @param pct 0-100
   */
  function onSeekDrag(pct: number) {
    onSeekInput(pct)
  }
  /**
   * 从百分比提交 seek：清除拖拽状态，下发 media_seek。
   * @param pct 0-100
   */
  function seekFromPct(pct: number) {
    isSeeking.value = false
    seekPreviewPct.value = null
    const pos = Math.round((pct / 100) * Number(mediaDuration.value))
    livePosition.value = pos
    callMedia('media_seek', { seek_position: pos })
  }
  /** seek 变更（释放）提交 */
  function onSeekChange() {
    seekFromPct(seekVal.value)
  }
  return {
    entity,
    entityId,
    state,
    attrs,
    isPlaying,
    isMuted,
    supports,
    entityPicture,
    title,
    subtitle,
    mediaArtist,
    mediaAlbum,
    appName,
    contentType,
    deviceName,
    lyricsLines,
    hasLyrics,
    mediaDuration,
    hasProgress,
    progressPct,
    seekVal,
    livePosition,
    isSeeking,
    seekPreviewPct,
    sliderVolume,
    sliderVolumeRange,
    isVolumeDragging,
    volumeTrackStyle,
    progressFillStyle: progressFillStyleComputed,
    currentTimeLabel,
    totalTimeLabel,
    sourceList,
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
    onSeekChange,
    onSeekInput,
    startPlaybackLoop,
    stopPlaybackLoop,
  }
}