<template>
  <!-- HaCameraStream HA 摄像头流播放器：支持 WebRTC/HLS/MJPEG/快照多种流协议，自动降级 -->
  <div class="ha-camera-stream">
    <video
      v-show="isVideoMode"
      ref="videoRef"
      :class="mediaClass"
      autoplay
      muted
      playsinline
      @error="onVideoError"
    />
    <img
      v-show="imageUrl"
      :src="imageUrl"
      :class="mediaClass"
      @error="onImageError"
    />
  </div>
</template>

<script setup>
/**
 * HaCameraStream - Home Assistant 摄像头流播放组件
 * 功能特性：
 * - 支持多种流协议：WebRTC、HLS、MJPEG、snapshot 快照
 * - 自动降级机制：WebRTC 失败降级到 HLS，再失败降级到 MJPEG
 * - snapshot 模式支持定时刷新
 * - 视频错误自动重试和降级
 * - 支持 object-fit 配置
 * 依赖：
 * - useHaWebRtcPlayer: WebRTC 播放
 * - useHlsPlayer: HLS 播放
 * - resolveCameraDisplay: 摄像头显示方式解析
 */
import { ref, watch, onUnmounted, computed, nextTick } from 'vue'
import { resolveCameraDisplay } from '@/utils/ha/camera-stream.util'
import { startCameraWebRtc } from '@/composables/camera/useHaWebRtcPlayer'
import { startHlsPlayback } from '@/composables/camera/useHlsPlayer'
import { logger } from '@/utils/core/logger'
import { schedulePoll } from '@/utils/core/poll-scheduler'

/** 组件 Props 定义 */
const props = defineProps({
  /** 摄像头实体对象 */
  entity: { type: Object, default: null },
  /** Home Assistant 基础 URL */
  haUrl: { type: String, default: '' },
  /** 是否激活播放（非激活时停止播放节省资源） */
  active: { type: Boolean, default: true },
  /** 视频填充方式：cover/contain 等 */
  objectFit: { type: String, default: 'cover' },
  /** 是否优先使用 WebRTC */
  preferWebrtc: { type: Boolean, default: true },
  /** 是否启用 HLS（低延迟模式下仍可作为 MJPEG 失败后的回退） */
  preferHls: { type: Boolean, default: true },
  /**
   * 低延迟优先：WebRTC → MJPEG → HLS → 快照。
   * 弹窗/门铃等交互场景应开启。
   */
  lowLatency: { type: Boolean, default: false },
  /** snapshot 模式刷新间隔（ms），地图等准静态画面可调短 */
  snapshotIntervalMs: { type: Number, default: 3000 },
})

/** 组件事件：error（播放错误）、ready（播放就绪）、fallback（降级到其他协议） */
const emit = defineEmits(['error', 'ready', 'fallback'])

/** 视频元素 ref */
const videoRef = ref(null)
/** 是否跳过 WebRTC（失败后降级标记） */
const skipWebRtc = ref(false)
/** 是否跳过 HLS（失败后降级标记） */
const skipHls = ref(false)
/** 是否跳过 MJPEG（失败后降级标记） */
const skipMjpeg = ref(false)
/** snapshot 刷新计数器（用于强制刷新图片） */
const snapshotTick = ref(0)

/** 媒体元素 class（根据 object-fit 配置） */
const mediaClass = computed(() => `w-full h-full object-${props.objectFit}`)

/** 当前有效的显示方式和 URL（根据偏好和降级状态计算） */
const effectiveDisplay = computed(() => {
  if (!props.active || !props.entity || !props.haUrl) return { mode: 'none', url: '' }
  return resolveCameraDisplay(props.haUrl, props.entity, {
    preferWebRtc: props.preferWebrtc && !skipWebRtc.value,
    preferHls: props.preferHls && !skipHls.value,
    preferMjpeg: !skipMjpeg.value,
    lowLatency: props.lowLatency,
  })
})

/** 是否为视频模式（WebRTC 或 HLS） */
const isVideoMode = computed(() => {
  const m = effectiveDisplay.value.mode
  return m === 'webrtc' || m === 'hls'
})

/** 图片 URL（MJPEG 或 snapshot 模式） */
const imageUrl = computed(() => {
  if (effectiveDisplay.value.mode !== 'mjpeg' && effectiveDisplay.value.mode !== 'snapshot')
    return ''
  const base = effectiveDisplay.value.url
  if (!base) return ''
  if (effectiveDisplay.value.mode === 'snapshot') {
    const sep = base.includes('?') ? '&' : '?'
    return `${base}${sep}_=${snapshotTick.value}`
  }
  return base
})

let stopWebRtc = null
let stopHls = null
let starting = false
/** snapshot 定时刷新任务的取消函数（经全局调度器驱动） */
let snapshotCancel = null

/** 重置降级标记，重新尝试所有协议 */
function resetFallback() {
  skipWebRtc.value = false
  skipHls.value = false
  skipMjpeg.value = false
}

/** 级联降级：当前协议失败时尝试下一个协议 */
function cascadeFallback(failedMode) {
  if (failedMode === 'webrtc' && !skipWebRtc.value) {
    skipWebRtc.value = true
    emit('fallback', 'webrtc')
    logger.debug('[HaCameraStream] WebRTC 失败，降级下一协议')
    return true
  }
  if (failedMode === 'hls' && !skipHls.value) {
    skipHls.value = true
    emit('fallback', 'hls')
    logger.debug('[HaCameraStream] HLS 失败，降级 MJPEG/快照')
    return true
  }
  if (failedMode === 'mjpeg' && !skipMjpeg.value) {
    skipMjpeg.value = true
    emit('fallback', 'mjpeg')
    logger.debug('[HaCameraStream] MJPEG 失败，降级 HLS/快照')
    return true
  }
  return false
}

/** 启动流播放：根据当前有效方式选择对应的播放方式 */
async function startStream() {
  await stopStream()
  const d = effectiveDisplay.value
  if (!props.active || d.mode === 'none') return

  await nextTick()

  if (d.mode === 'webrtc') {
    if (!videoRef.value || starting) return
    starting = true
    try {
      stopWebRtc = await startCameraWebRtc(d, videoRef.value)
      emit('ready', d.mode)
    } catch (e) {
      logger.warn('[HaCameraStream] WebRTC 失败', e)
      if (await cascadeFallback('webrtc')) {
        await nextTick()
        void startStream()
      } else {
        emit('error', e)
      }
    } finally {
      starting = false
    }
    return
  }

  if (d.mode === 'hls' && videoRef.value && d.url) {
    if (starting) return
    starting = true
    try {
      stopHls = await startHlsPlayback(d.url, videoRef.value)
      emit('ready', d.mode)
    } catch (e) {
      logger.warn('[HaCameraStream] HLS 失败', e)
      if (await cascadeFallback('hls')) {
        await nextTick()
        void startStream()
      } else {
        emit('error', e)
      }
    } finally {
      starting = false
    }
    return
  }

  if (d.mode === 'mjpeg' || d.mode === 'snapshot') {
    if (d.mode === 'snapshot') startSnapshotRefresh()
    emit('ready', d.mode)
  }
}

/** 启动 snapshot 定时刷新 */
function startSnapshotRefresh() {
  stopSnapshotRefresh()
  const ms = Math.max(1000, Number(props.snapshotIntervalMs) || 3000)
  // 快照刷新经全局调度器驱动（页面隐藏时暂停；多摄像头实例用 entity_id 保证 key 唯一）
  snapshotCancel = schedulePoll(`ha-camera:snapshot:${props.entity?.entity_id ?? 'anon'}`, () => {
    snapshotTick.value += 1
  }, ms)
}

/** 停止 snapshot 定时刷新 */
function stopSnapshotRefresh() {
  if (snapshotCancel) {
    snapshotCancel()
    snapshotCancel = null
  }
}

/** 停止流播放并清理资源 */
function stopStream() {
  stopSnapshotRefresh()
  if (stopHls) {
    stopHls()
    stopHls = null
  }
  if (stopWebRtc) {
    stopWebRtc()
    stopWebRtc = null
  }
  if (videoRef.value) {
    videoRef.value.pause()
    videoRef.value.removeAttribute('src')
    videoRef.value.srcObject = null
    videoRef.value.load()
  }
}

/** 视频播放错误处理：触发降级或报错 */
async function onVideoError() {
  const mode = effectiveDisplay.value.mode
  if (mode === 'hls' && (await cascadeFallback('hls'))) {
    await nextTick()
    void startStream()
    return
  }
  emit('error', new Error(`${mode} 播放失败`))
}

/** 图片加载错误处理：MJPEG 失败时降级，否则报错 */
async function onImageError() {
  const mode = effectiveDisplay.value.mode
  if (mode === 'mjpeg' && (await cascadeFallback('mjpeg'))) {
    await nextTick()
    void startStream()
    return
  }
  emit('error', new Error('图像流加载失败'))
}

watch(
  () => props.entity?.entity_id,
  () => {
    resetFallback()
    snapshotTick.value = 0
  },
)

watch(
  () => [
    props.active,
    props.entity?.entity_id,
    props.haUrl,
    effectiveDisplay.value.mode,
    effectiveDisplay.value.url,
    skipWebRtc.value,
    skipHls.value,
    skipMjpeg.value,
    props.lowLatency,
  ],
  () => {
    void startStream()
  },
  { immediate: true },
)

onUnmounted(() => {
  void stopStream()
})
</script>

<style scoped>
.ha-camera-stream {
  width: 100%;
  height: 100%;
  min-height: 0;
  position: relative;
}
</style>
