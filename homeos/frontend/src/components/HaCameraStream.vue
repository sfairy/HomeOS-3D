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
 * 与 3D / 0.7.2 mountCameraMedia 同一条通路：HLS → MJPEG → 快照。
 * preferWebrtc 仅门铃等场景额外先试 WebRTC，失败后仍落入上述通路。
 * go2rtcUrl 非空时优先走局域网 go2rtc（同源 MSE 中继），只有它宣告终态才落回上述通路。
 */
import { ref, watch, onUnmounted, computed, nextTick } from 'vue'
import { getEntityDisplayName } from '@/shared/entity/utils/derived.util'
import { startCameraWebRtc } from '@/shared/camera/composables/useHaWebRtcPlayer'
import { startCameraMediaTransport } from '@/shared/camera/composables/useCameraMediaTransport'
import { useGo2RtcMseTransport } from '@/shared/camera/composables/useGo2RtcMseTransport'
import { logger } from '@/shared/utils/core/logger'

const props = defineProps({
  entity: { type: Object, default: null },
  haUrl: { type: String, default: '' },
  active: { type: Boolean, default: true },
  objectFit: { type: String, default: 'cover' },
  preferWebrtc: { type: Boolean, default: false },
  preferHls: { type: Boolean, default: true },
  lowLatency: { type: Boolean, default: false },
  snapshotIntervalMs: { type: Number, default: 3000 },
  cameraSource: { type: String, default: 'entity' },
  go2rtcUrl: { type: String, default: '' },
  projectId: { type: String, default: '' },
  componentId: { type: String, default: '' },
  cameraId: { type: String, default: '' },
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

/** 只在「HA 实体」来源下才认实体；go2rtc 来源的地址即配置。 */
const go2rtcSourceUrl = computed(() =>
  props.cameraSource === 'go2rtc' ? String(props.go2rtcUrl || '').trim() : '',
)
/** go2rtc 宣告终态（地址非法/被拒/浏览器不支持）后置位，把画面让回既有通路。 */
const isGo2rtcUnavailable = ref(false)

const go2rtcPlayback = useGo2RtcMseTransport({
  url: go2rtcSourceUrl,
  video: videoRef,
  projectId: computed(() => props.projectId),
  componentId: computed(() => props.componentId),
  cameraId: computed(() => props.cameraId),
  enabled: computed(() => props.active && !!go2rtcSourceUrl.value && !isGo2rtcUnavailable.value),
  onReady: () => {
    if (imageRef.value) imageRef.value.style.display = 'none'
    if (videoRef.value) videoRef.value.style.display = ''
    emit('ready', 'go2rtc')
  },
  onUnavailable: (message) => {
    // 进程内的断线重连由传输自己退避，只有它彻底放弃才降级到 HLS → MJPEG → 快照。
    logger.warn('[HaCameraStream] go2rtc 不可用，改走 HLS/MJPEG 通路', message)
    isGo2rtcUnavailable.value = true
    emit('fallback', 'go2rtc')
  },
})

function resetFallback() {
  skipWebRtc.value = false
  isGo2rtcUnavailable.value = false
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

async function startLegacyCascade(entityId, els, generation) {
  stopPlayback = await startCameraMediaTransport(
    entityId,
    els.video,
    els.image,
    () => {
      if (generation !== streamGeneration) return
      emit('error', new Error('摄像头实时预览不可用'))
    },
    (mode) => {
      if (generation !== streamGeneration) return
      emit('ready', mode)
    },
  )
}

async function startStream() {
  const generation = ++streamGeneration
  stopStream()
  const entityId = String(props.entity?.entity_id || '').trim()
  // go2rtc 来源可以没有 HA 实体；两种来源都没配就直接不播。
  const hasGo2rtcSource = !!go2rtcSourceUrl.value && !isGo2rtcUnavailable.value
  if (!props.active || (!entityId && !hasGo2rtcSource)) return
  // MSE 由 `useGo2RtcMseTransport` 自己盯 enabled/url 变化，这里不抢同一个 video。
  if (hasGo2rtcSource) return

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
      logger.warn('[HaCameraStream] WebRTC 失败，改走 0.7.2 HLS/MJPEG 通路', error)
      skipWebRtc.value = true
      emit('fallback', 'webrtc')
    }
  }

  try {
    await startLegacyCascade(entityId, els, generation)
    if (generation !== streamGeneration) {
      stopPlayback?.()
      stopPlayback = null
    }
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
  () => [props.active, props.entity?.entity_id, props.haUrl, props.preferWebrtc, skipWebRtc.value,
    go2rtcSourceUrl.value, isGo2rtcUnavailable.value],
  () => {
    void startStream()
  },
  { immediate: true, flush: 'post' },
)

onUnmounted(() => {
  streamGeneration += 1
  go2rtcPlayback.stop()
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
