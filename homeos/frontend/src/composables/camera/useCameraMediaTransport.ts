/**
 * 与 3D / 0.7.2 mountCameraMedia 对齐：HLS → 12s/致命错误切 MJPEG（无 query）→ 7s 再快照。
 * 不因 hvc1 提前弃 HLS（本机可播 HEVC；HA MJPEG 常为空体）。
 */
import type HlsJs from 'hls.js'
import { resolveCameraHlsPlayUrl } from '@/utils/ha/camera-stream.util'
import { logger } from '@/utils/core/logger'

type HlsCtor = typeof HlsJs
type HlsInstance = InstanceType<HlsCtor>
type TransportMode = 'idle' | 'hls' | 'legacy' | 'snapshot'

const HLS_FALLBACK_MS = 12000
const MJPEG_PROBE_MS = 7000

function loadClassicHlsScript(): Promise<HlsCtor | null> {
  const w = window as Window & { Hls?: HlsCtor }
  if (w.Hls?.isSupported?.()) return Promise.resolve(w.Hls)
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-homeos-hls="1.7.3"]')
    if (existing) {
      existing.addEventListener('load', () => resolve(w.Hls?.isSupported?.() ? w.Hls! : null), {
        once: true,
      })
      existing.addEventListener('error', () => resolve(null), { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = '/static/vendor/hls.js/1.7.3/hls.min.js'
    script.async = true
    script.dataset.homeosHls = '1.7.3'
    script.onload = () => resolve(w.Hls?.isSupported?.() ? w.Hls! : null)
    script.onerror = () => resolve(null)
    document.head.appendChild(script)
  })
}

export type CameraMediaStopFn = () => void

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
    const readyMode = mode === 'legacy' ? 'mjpeg' : mode === 'snapshot' ? 'snapshot' : 'hls'
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

  const gen = generation
  mode = 'hls'
  showVideo()
  hlsTimer = window.setTimeout(() => startMjpeg(gen), HLS_FALLBACK_MS)

  const cleanupListeners = () => {
    imageEl.removeEventListener('load', onImageLoad)
    imageEl.removeEventListener('error', onImageError)
    videoEl.removeEventListener('loadeddata', onVideoProgress)
    videoEl.removeEventListener('playing', onVideoProgress)
    videoEl.removeEventListener('error', onVideoError)
  }

  try {
    const playUrl = await resolveCameraHlsPlayUrl(eid)
    if (stopped || gen !== generation || mode !== 'hls') {
      return () => {
        cleanupListeners()
        stop()
      }
    }
    const Hls = await loadClassicHlsScript()
    if (stopped || gen !== generation || mode !== 'hls') {
      /* 已降级 */
    } else if (!Hls) {
      startMjpeg(gen)
    } else {
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
        !stopped && gen === generation && mode === 'hls' && hls === player
      player.on(Hls.Events.ERROR, (_ev, data) => {
        if (!isCurrent() || !data?.fatal) return
        logger.warn('[camera-media] HLS 致命错误，降级 MJPEG', data.type, data.details)
        startMjpeg(gen)
      })
      player.on(Hls.Events.MANIFEST_PARSED, () => {
        if (isCurrent()) void videoEl.play().catch(() => {})
      })
      player.attachMedia(videoEl)
      player.loadSource(playUrl)
    }
  } catch (error) {
    logger.warn('[camera-media] HLS 换票失败，降级 MJPEG', error)
    startMjpeg(gen)
  }

  return () => {
    cleanupListeners()
    stop()
  }
}
