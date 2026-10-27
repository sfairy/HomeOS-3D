/**
 * 与 3D / 0.7.2 mountCameraMedia 对齐：HLS → 12s/致命错误切 MJPEG（无 query）→ 7s 再快照。
 * 不因 hvc1 提前弃 HLS（本机可播 HEVC；HA MJPEG 常为空体）。
 *
 * 唯一例外是「播放地址失效」：HA 一路流只有一个 hls token，流 worker 重建后旧地址 404，
 * 此时必须先重新向 `/api/camera_hls` 换票再试（见 `isExpiredStreamAddressError`），
 * 因为后面两条降级路对通用摄像头都是死的（MJPEG 空体、快照 500）。
 */
import { resolveCameraHlsPlayUrl } from '@/shared/utils/ha/camera-stream.util'
import { logger } from '@/shared/utils/core/logger'
import {
  ensureHls,
  isExpiredStreamAddressError,
  type HlsCtor,
} from '@/shared/camera/hls-loader'

type HlsInstance = InstanceType<HlsCtor>
type TransportMode = 'idle' | 'hls' | 'legacy' | 'snapshot'

const HLS_FALLBACK_MS = 12000
const MJPEG_PROBE_MS = 7000
/** 一轮播放里最多换票重试几次；超过就按原策略降级。 */
const HLS_ADDRESS_RETRY_LIMIT = 2

type CameraMediaStopFn = () => void

export async function startCameraMediaTransport(
  entityId: string,
  videoEl: HTMLVideoElement,
  imageEl: HTMLImageElement,
  onUnavailable?: () => void,
  onReady?: (mode: 'hls' | 'mjpeg' | 'snapshot') => void,
): Promise<CameraMediaStopFn> {
  const eid = String(entityId || '').trim()
  if (!eid) throw new Error('摄像头实体为空')

  let stopped = false
  let hls: HlsInstance | null = null
  let mode: TransportMode = 'idle'
  let isLegacyTransport = false
  let generation = 0
  let hlsTimer = 0
  let mjpegTimer = 0
  let mjpegPollTimer = 0
  let triedSnapshot = false
  let snapshotFailures = 0
  let hasStarted = false
  let hlsAddressRetries = 0

  const clearTimers = () => {
    window.clearTimeout(hlsTimer)
    window.clearTimeout(mjpegTimer)
    window.clearInterval(mjpegPollTimer)
    hlsTimer = 0
    mjpegTimer = 0
    mjpegPollTimer = 0
  }

  const markReady = () => {
    if (stopped || hasStarted) return
    hasStarted = true
    clearTimers()
    let readyMode: 'mjpeg' | 'snapshot' | 'hls'
    if (mode === 'legacy') readyMode = 'mjpeg'
    else if (mode === 'snapshot') readyMode = 'snapshot'
    else readyMode = 'hls'
    onReady?.(readyMode)
  }

  const stop = () => {
    if (stopped) return
    stopped = true
    generation += 1
    mode = 'idle'
    clearTimers()
    hls?.destroy()
    hls = null
    videoEl.pause()
    videoEl.removeAttribute('src')
    videoEl.srcObject = null
    videoEl.load()
    imageEl.removeAttribute('src')
    isLegacyTransport = false
    triedSnapshot = false
    snapshotFailures = 0
    hasStarted = false
  }

  const showVideo = () => {
    imageEl.style.display = 'none'
    imageEl.removeAttribute('src')
    videoEl.style.display = ''
  }

  const showImage = (url: string) => {
    videoEl.style.display = 'none'
    videoEl.pause()
    videoEl.removeAttribute('src')
    videoEl.load()
    imageEl.style.display = ''
    imageEl.src = url
  }

  const startSnapshot = (expectedGen: number) => {
    if (stopped || expectedGen !== generation || triedSnapshot) return
    generation += 1
    mode = 'snapshot'
    triedSnapshot = true
    window.clearTimeout(mjpegTimer)
    showImage(`/api/camera_proxy/${encodeURIComponent(eid)}?hb=${Date.now()}`)
  }

  const armMjpegWatch = (probeGen: number) => {
    window.clearInterval(mjpegPollTimer)
    window.clearTimeout(mjpegTimer)
    mjpegPollTimer = window.setInterval(() => {
      if (stopped || probeGen !== generation) return
      if ((mode === 'legacy' || mode === 'snapshot') && imageEl.naturalWidth > 0) markReady()
    }, 250)
    mjpegTimer = window.setTimeout(() => {
      if (stopped || probeGen !== generation || mode !== 'legacy') return
      if (imageEl.naturalWidth > 0) {
        markReady()
        return
      }
      startSnapshot(probeGen)
    }, MJPEG_PROBE_MS)
  }

  const startMjpeg = (expectedGen: number, force = false) => {
    if (stopped) return
    if (!force && expectedGen !== generation) return
    if (!force && isLegacyTransport) return
    const probeGen = ++generation
    mode = 'legacy'
    isLegacyTransport = true
    triedSnapshot = false
    hasStarted = false
    window.clearTimeout(hlsTimer)
    hls?.destroy()
    hls = null
    showImage(`/api/camera_proxy_stream/${encodeURIComponent(eid)}`)
    armMjpegWatch(probeGen)
  }

  const onImageLoad = () => {
    if (stopped) return
    if ((mode === 'legacy' || mode === 'snapshot') && imageEl.naturalWidth > 0) markReady()
  }

  const onImageError = () => {
    if (stopped) return
    if (mode !== 'legacy' && mode !== 'snapshot') return
    if (mode === 'snapshot' || triedSnapshot) {
      snapshotFailures += 1
      if (snapshotFailures <= 3) {
        isLegacyTransport = false
        startMjpeg(generation, true)
        return
      }
      onUnavailable?.()
      return
    }
    startSnapshot(generation)
  }

  const onVideoProgress = () => {
    if (stopped || mode !== 'hls' || videoEl.readyState < 2) return
    markReady()
  }

  const onVideoError = () => {
    if (stopped || mode !== 'hls' || hls) return
    startMjpeg(generation)
  }

  imageEl.addEventListener('load', onImageLoad)
  imageEl.addEventListener('error', onImageError)
  videoEl.addEventListener('loadeddata', onVideoProgress)
  videoEl.addEventListener('playing', onVideoProgress)
  videoEl.addEventListener('error', onVideoError)

  const cleanupListeners = () => {
    imageEl.removeEventListener('load', onImageLoad)
    imageEl.removeEventListener('error', onImageError)
    videoEl.removeEventListener('loadeddata', onVideoProgress)
    videoEl.removeEventListener('playing', onVideoProgress)
    videoEl.removeEventListener('error', onVideoError)
  }

  /**
   * 起一路 HLS（`generation` 变了即作废）。
   *
   * 换票 → 换地址重试 → 降级三步都在这里：重试会自增 `generation` 并递归一次，
   * 旧 player 的后续回调因 `isCurrent()` 不成立而全部失效。
   */
  const startHls = async (expectedGen: number): Promise<void> => {
    window.clearTimeout(hlsTimer)
    hlsTimer = window.setTimeout(() => startMjpeg(expectedGen), HLS_FALLBACK_MS)
    try {
      const playUrl = await resolveCameraHlsPlayUrl(eid)
      if (stopped || expectedGen !== generation || mode !== 'hls') return
      const Hls = await ensureHls()
      if (stopped || expectedGen !== generation || mode !== 'hls') return
      if (!Hls) {
        startMjpeg(expectedGen)
        return
      }
      const player = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 15,
        maxBufferLength: 15,
        maxMaxBufferLength: 15,
        maxBufferSize: 0x7a1200,
        xhrSetup(xhr, reqUrl) {
          try {
            const resolved = new URL(reqUrl, window.location.href)
            if (resolved.origin === window.location.origin) xhr.withCredentials = true
          } catch {
            /* ignore */
          }
        },
      })
      hls = player
      const isCurrent = () =>
        !stopped && expectedGen === generation && mode === 'hls' && hls === player
      player.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!isCurrent()) return
        hlsAddressRetries = 0
        void videoEl.play().catch(() => {})
      })
      player.on(Hls.Events.ERROR, (_ev, data) => {
        if (!isCurrent() || !data?.fatal) return
        if (isExpiredStreamAddressError(data) && hlsAddressRetries < HLS_ADDRESS_RETRY_LIMIT) {
          hlsAddressRetries += 1
          logger.warn(
            '[camera-media] HLS 播放地址已失效，重新换票',
            data.details,
            data.response?.code,
          )
          hls = null
          player.destroy()
          void startHls(++generation)
          return
        }
        logger.warn('[camera-media] HLS 致命错误，降级 MJPEG', data.type, data.details)
        startMjpeg(expectedGen)
      })
      player.attachMedia(videoEl)
      player.loadSource(playUrl)
    } catch (error) {
      if (stopped || expectedGen !== generation || mode !== 'hls') return
      logger.warn('[camera-media] HLS 换票失败，降级 MJPEG', error)
      startMjpeg(expectedGen)
    }
  }

  const gen = ++generation
  mode = 'hls'
  showVideo()
  await startHls(gen)

  return () => {
    cleanupListeners()
    stop()
  }
}
