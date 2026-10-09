<template>
  <div class="ha-camera-stream">
    <video
      ref="videoRef"
      :class="mediaClass"
      autoplay
      muted
      playsinline
    />
    <img
      ref="imageRef"
      :alt="streamAlt"
      :class="mediaClass"
      style="display: none"
    />
  </div>
</template>

<script setup>
/**
 * HA 摄像头播放：可选 WebRTC，随后与 3D 总览同一条通路
 * HLS（hls.js）→ camera_proxy_stream → camera_proxy。
 */
import { ref, watch, onUnmounted, computed, nextTick } from 'vue'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import { startCameraWebRtc } from '@/composables/camera/useHaWebRtcPlayer'
import { startCameraMediaTransport } from '@/composables/camera/useCameraMediaTransport'
import { logger } from '@/utils/core/logger'

const props = defineProps({
  entity: { type: Object, default: null },
  haUrl: { type: String, default: '' },
  active: { type: Boolean, default: true },
  objectFit: { type: String, default: 'cover' },
  preferWebrtc: { type: Boolean, default: true },
  preferHls: { type: Boolean, default: true },
  lowLatency: { type: Boolean, default: false },
  snapshotIntervalMs: { type: Number, default: 3000 },
})

const emit = defineEmits(['error', 'ready', 'fallback'])

const videoRef = ref(null)
const imageRef = ref(null)
const skipWebRtc = ref(false)

const mediaClass = computed(() => `w-full h-full object-${props.objectFit}`)

const streamAlt = computed(() => {
  const entity = props.entity
  if (!entity) return '摄像头画面'
  const name = getEntityDisplayName(String(entity.entity_id || ''), entity)
  return name ? `${name} 画面` : '摄像头画面'
})

let stopPlayback = null
let streamGeneration = 0

function resetFallback() {
  skipWebRtc.value = false
}

async function waitForEls(generation) {
  for (let i = 0; i < 8; i += 1) {
    if (generation !== streamGeneration) return null
    if (videoRef.value && imageRef.value) return { video: videoRef.value, image: imageRef.value }
    await nextTick()
  }
  if (generation !== streamGeneration) return null
  if (videoRef.value && imageRef.value) return { video: videoRef.value, image: imageRef.value }
  return null
}

function stopStream() {
  if (stopPlayback) {
    stopPlayback()
    stopPlayback = null
  }
}

async function startStream() {
  const generation = ++streamGeneration
  stopStream()
  const entityId = String(props.entity?.entity_id || '').trim()
  if (!props.active || !entityId) return

  const els = await waitForEls(generation)
  if (!els) {
    if (generation === streamGeneration) emit('error', new Error('播放器未就绪'))
    return
  }
  els.image.style.display = 'none'
  els.video.style.display = ''

  const tryWebrtc = props.preferWebrtc && !skipWebRtc.value && props.haUrl
  if (tryWebrtc) {
    try {
      stopPlayback = await startCameraWebRtc(
        { mode: 'webrtc', webrtcSignal: 'ha', entityId, url: '' },
        els.video,
      )
      if (generation !== streamGeneration) {
        stopPlayback?.()
        stopPlayback = null
        return
      }
      emit('ready', 'webrtc')
      return
    } catch (error) {
      if (generation !== streamGeneration) return
      logger.warn('[HaCameraStream] WebRTC 失败，改走 3D HLS/MJPEG 通路', error)
      skipWebRtc.value = true
      emit('fallback', 'webrtc')
    }
  }

  try {
    stopPlayback = await startCameraMediaTransport(entityId, els.video, els.image, () => {
      if (generation !== streamGeneration) return
      emit('error', new Error('摄像头实时预览不可用'))
    })
    if (generation !== streamGeneration) {
      stopPlayback?.()
      stopPlayback = null
      return
    }
    emit('ready', 'hls')
  } catch (error) {
    if (generation !== streamGeneration) return
    logger.warn('[HaCameraStream] 媒体通路失败', error)
    emit('error', error)
  }
}

watch(
  () => props.entity?.entity_id,
  () => {
    resetFallback()
  },
)

watch(
  () => [props.active, props.entity?.entity_id, props.haUrl, props.preferWebrtc, skipWebRtc.value],
  () => {
    void startStream()
  },
  { immediate: true, flush: 'post' },
)

onUnmounted(() => {
  streamGeneration += 1
  stopStream()
})
</script>

<style scoped>
.ha-camera-stream {
  width: 100%;
  height: 100%;
  min-height: 0;
  position: relative;
}

.ha-camera-stream > video,
.ha-camera-stream > img {
  position: absolute;
  inset: 0;
}
</style>
