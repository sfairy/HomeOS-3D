/**
 * @file weather-particle-offscreen.util.ts
 * @module frontend/src/utils
 */
import { logger } from '@/utils/core/logger'
import type { WeatherEffectProfile } from '@/utils/weather/effect-condition.util'
import type {
  ResolvedWeatherEffectConfig,
  WeatherEffectSceneParams,
} from '@/utils/weather/effect-presets.util'
import type { WeatherPerfMode } from '@/types/weather-canvas'

interface WeatherParticleOffscreenOpts {
  width: number
  height: number
  dpr?: number
  profile?: WeatherEffectProfile
  wind?: number
  rainAngle?: number
  particleCounts?: ResolvedWeatherEffectConfig['particleCounts']
  rainIntensity?: number
  scene?: WeatherEffectSceneParams
}

interface WeatherParticleOffscreenState {
  profile?: WeatherEffectProfile
  wind?: number
  rainAngle?: number
  particleCounts?: ResolvedWeatherEffectConfig['particleCounts']
  rainIntensity?: number
  scene?: WeatherEffectSceneParams
  active?: boolean
}

/** WeatherParticleOffscreenHandle：类型定义，字段语义见声明。 */
export interface WeatherParticleOffscreenHandle {
  setState(state: WeatherParticleOffscreenState): void
  resize(width: number, height: number, dpr?: number): void
  destroy(): void
}

/**
 * @returns {boolean}
 */
function isWeatherParticleOffscreenSupported() {
  return (
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.transferControlToOffscreen === 'function'
  )
}

/** 已 transfer 过的 canvas（浏览器不允许对同一元素再次 transfer） */
const transferredCanvases = new WeakSet<HTMLCanvasElement>()

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ width: number, height: number, dpr?: number, profile?: object, wind?: number, rainAngle?: number, particleCounts?: object }} opts
 */
export function createWeatherParticleOffscreen(
  canvas: HTMLCanvasElement,
  opts: WeatherParticleOffscreenOpts,
): WeatherParticleOffscreenHandle | null {
  if (!isWeatherParticleOffscreenSupported()) return null
  if (!canvas?.transferControlToOffscreen) return null
  if (transferredCanvases.has(canvas)) return null

  const worker = new Worker(new URL('../../workers/weather-particle.worker', import.meta.url), {
    type: 'module',
  })

  let destroyed = false
  const offscreen = canvas.transferControlToOffscreen()
  transferredCanvases.add(canvas)

  worker.postMessage(
    {
      type: 'init',
      canvas: offscreen,
      width: opts.width,
      height: opts.height,
      dpr: opts.dpr ?? 1,
      profile: opts.profile ?? {
        kind: 'clear-day',
        precipIntensity: 0,
        wind: 0.3,
        windDir: 1,
        cloudCover: 0.1,
        isNight: false,
        dayPhase: 1,
        rawState: 'sunny',
        humidity: 50,
        temperature: 20,
        visibilityKm: 12,
        isHaze: false,
      },
      wind: opts.wind ?? 0.3,
      rainAngle: opts.rainAngle ?? 0.03,
      particleCounts: opts.particleCounts,
      rainIntensity: opts.rainIntensity,
      scene: opts.scene,
      active: true,
    },
    [offscreen],
  )

  worker.onerror = (err: ErrorEvent) => {
    logger.warn('[天气粒子 Worker]', err.message || err)
  }

  return {
    setState(state: WeatherParticleOffscreenState) {
      if (destroyed) return
      worker.postMessage({ type: 'state', ...state })
    },
    resize(width: number, height: number, dpr?: number) {
      if (destroyed) return
      worker.postMessage({ type: 'resize', width, height, dpr: dpr ?? 1 })
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      worker.postMessage({ type: 'stop' })
      worker.terminate()
    },
  }
}

/**
 * high 模式 + 雨雪场景时启用 Worker 粒子层
 */
export function shouldUseWeatherParticleWorker(
  profile: WeatherEffectProfile | null | undefined,
  perfMode: WeatherPerfMode,
  fpsReduced: boolean = false,
) {
  if (perfMode !== 'high' || fpsReduced) return false
  if (!isWeatherParticleOffscreenSupported()) return false
  if (!profile) return false
  const kind = profile.kind || ''
  return [
    'drizzle',
    'rain',
    'heavy-rain',
    'thunderstorm',
    'snow',
    'sleet',
    'hail',
    'windy',
  ].includes(kind)
}
