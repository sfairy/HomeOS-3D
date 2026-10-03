/**
 * @file useWeatherBackgroundAnimation.ts
 * @module composables/ui
 * @description 天气动态背景 Canvas 动画 composable。
 *
 * 职责：
 * - 管理天气背景 Canvas 与粒子 Canvas 的渲染循环（RAF / 低频定时器）；
 * - 按性能档位（high/medium/low）调整帧率与效果丰富度；
 * - 初始化并同步粒子（雨/雪/冰雹/落叶/玻璃水珠/星星/流星/云朵）与闪电状态；
 * - 可选启用 OffscreenCanvas Worker 加速粒子计算，失败时回退主线程；
 * - 监听页面可见性、容器尺寸、配置变化、屏保空闲等事件，动态启停动画。
 *
 * 依赖：
 * - vue（ref/onMounted/onUnmounted/watch/nextTick）
 * - logger（警告日志）
 * - entities.store / layout.store + chrome.store
 * - useWeatherEffectConfig（天气效果配置）
 * - weather-*-*.util（粒子/场景/降水/性能/动画工具）
 * - adaptive-perf.util（自适应性能档位）
 * - screensaver-background-idle.util（屏保空闲联动）
 */
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { logger } from '@/utils/core/logger'
import { useEntitiesStore } from '@/stores/entities.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useWeatherEffectConfig } from '@/composables/ui/useWeatherEffectConfig'
import { isDevBuild } from '@/utils/core/misc.util'
import {
  createWeatherParticleOffscreen,
  shouldUseWeatherParticleWorker,
} from '@/utils/weather/particle-offscreen.util'
import type { WeatherParticleOffscreenHandle } from '@/utils/weather/particle-offscreen.util'
import {
  ShootingStar,
  createWeatherSceneParticles,
  drawAmbientScene,
  drawSkyAtmosphere,
  profileHasSleet,
  profilePrecipIntensity,
  profileRainIntensity,
} from '@/utils/weather/background-canvas.util'
import type {
  Cloud,
  Lightning,
  Star,
} from '@/utils/weather/background-particles.util'
import { drawWeatherPrecipAndEffects } from '@/utils/weather/background-precip.util'
import { resolveWeatherBackgroundPerformanceMode } from '@/utils/weather/background-perf.util'
import { useAdaptivePerfState } from '@/utils/perf/adaptive-perf.util'
import { resolveRainTiltAngle, resolveGustyWind } from '@/utils/weather/animation.util'
import { onScreensaverBackgroundIdle } from '@/utils/ui/screensaver-background-idle.util'
import type {
  FastRain,
  GlassDrop,
  HailPellet,
  LeafParticle,
  SnowCrystal,
  WeatherBackgroundProps,
  WeatherEffectProfile,
  WeatherPerfMode,
} from '@/types/weather-canvas'

// low 档帧间隔（ms）：2s 一帧，仅维持静态感
const FRAME_INTERVAL_LOW = 2000
// medium 档帧间隔（ms）：400ms 一帧
const FRAME_INTERVAL_MEDIUM = 400
// 配置变化后重建动画的防抖时间（ms）
const WATCH_DEBOUNCE_MS = 500

/** 测量天气背景层的实际 CSS 尺寸（取 .app-shell__weather-layer 容器，回退 window） */
function measureWeatherLayer(canvas: HTMLCanvasElement | null) {
  const root = canvas?.closest('.app-shell__weather-layer') as HTMLElement | null
  const w = root?.clientWidth || window.innerWidth
  const h = root?.clientHeight || window.innerHeight
  return { w: Math.max(1, w), h: Math.max(1, h) }
}

/**
 * 天气动态背景 Canvas 动画逻辑。
 *
 * 调用场景：天气背景组件初始化时调用，返回 canvasRef/particleCanvasRef/particleCanvasKey 供模板绑定。
 *
 * @param props 天气背景属性（quality 控制是否静态）
 * @returns canvasRef 主 canvas 引用；particleCanvasRef 粒子 canvas 引用；particleCanvasKey 粒子 canvas 重建 key
 */
export function useWeatherBackgroundAnimation(props: WeatherBackgroundProps) {
  const entitiesStore = useEntitiesStore()
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()
  const { adaptiveTier } = useAdaptivePerfState()
  const { profile, renderConfig, activeScene, isNight } = useWeatherEffectConfig()
  // 主背景 canvas（环境场景 + 降水效果）
  const canvasRef = ref<HTMLCanvasElement | null>(null)
  // 粒子 canvas（OffscreenCanvas Worker 渲染目标）
  const particleCanvasRef = ref<HTMLCanvasElement | null>(null)
  // 粒子 canvas 重建 key：Worker 失败或切换时自增以强制重建
  const particleCanvasKey = ref(0)

  /** 解析当前性能模式 */
  function resolvePerformanceMode() {
    return resolveWeatherBackgroundPerformanceMode(props, layoutStore, entitiesStore, adaptiveTier)
  }
  // 粒子集合（主线程渲染时使用）
  let glassDrops: GlassDrop[] = []
  let fastRain: FastRain[] = []
  let snowCrystals: SnowCrystal[] = []
  let leaves: LeafParticle[] = []
  let hail: HailPellet[] = []
  let stars: Star[] = []
  let shootingStars: ShootingStar[] = []
  let clouds: Cloud[] = []
  // 闪电状态（定时器/下一次触发/闪光/辉光）
  const precipState = {
    lightning: null as Lightning | null,
    lightningTimer: 0,
    lightningNext: 0,
    lightningFlash: 0,
    lightningGlow: 0,
    lightningPhase: 'idle' as 'idle' | 'leader' | 'stroke' | 'afterglow',
    lightningRepeat: false,
  }
  let ctx: CanvasRenderingContext2D | null = null
  let animFrame: number | null = null
  let lowFrameTimer: ReturnType<typeof setTimeout> | null = null
  let lastFrameTime = 0
  let pageVisible = true
  // 是否因帧率不足而降级（fpsReduced=true 时禁用 Worker）
  let fpsReduced = false
  // 连续慢帧计数，达到阈值后触发降级
  let slowFrameStreak = 0
  let particleOffscreen: WeatherParticleOffscreenHandle | null = null
  let particleWorkerActive = false
  /** 当前 particle canvas 是否已 transferControlToOffscreen（只能一次，需重建 DOM） */
  let particleCanvasTransferred = false
  /** startAnimation 代数：丢弃过期 nextTick，避免重复 transfer */
  let animationEpoch = 0
  /** setupParticleWorker 异步 remount 代数 */
  let particleSetupEpoch = 0
  /** 正在 remount/nextTick 准备 Worker，避免 render 循环重复 setup */
  let particleSetupPending = false
  let devicePixelRatioCached = 1
  let cssWidth = 0
  let cssHeight = 0
  let resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null
  let watchDebounceTimer: ReturnType<typeof setTimeout> | null = null
  let containerResizeObserver: ResizeObserver | null = null
  // 是否已渲染过至少一帧（用于首帧淡入）
  let hasRenderedFrame = false
  let unsubScreensaverIdle: (() => void) | null = null

  /** 绑定容器 ResizeObserver：容器尺寸变化时防抖重建动画 */
  function bindContainerResizeObserver() {
    containerResizeObserver?.disconnect()
    const root = canvasRef.value?.closest('.app-shell__weather-layer') as HTMLElement | null
    if (!root || typeof ResizeObserver === 'undefined') return
    containerResizeObserver = new ResizeObserver(() => scheduleResizeAnimation())
    containerResizeObserver.observe(root)
  }

  /** 停止动画循环：取消 RAF 与低频定时器 */
  function stopAnimation() {
    if (animFrame) {
      cancelAnimationFrame(animFrame)
      animFrame = null
    }
    if (lowFrameTimer) {
      clearTimeout(lowFrameTimer)
      lowFrameTimer = null
    }
  }

  /** 调度下一帧：low/medium 档用 setTimeout 降频，high 档用 RAF */
  function scheduleNextFrame(perfMode: WeatherPerfMode) {
    if (!pageVisible) return
    if (perfMode === 'low' || perfMode === 'medium') {
      const interval = perfMode === 'low' ? FRAME_INTERVAL_LOW : FRAME_INTERVAL_MEDIUM
      lowFrameTimer = setTimeout(() => {
        lowFrameTimer = null
        animFrame = requestAnimationFrame(render)
      }, interval)
      return
    }
    animFrame = requestAnimationFrame(render)
  }

  /** 初始化所有场景粒子（玻璃水珠/雨/雪/落叶/冰雹/星星/流星/云朵） */
  function initParticles(w: number, h: number) {
    const scene = createWeatherSceneParticles(w, h, renderConfig.value, profile.value)
    glassDrops = scene.glassDrops
    fastRain = scene.fastRain
    snowCrystals = scene.snowCrystals
    leaves = scene.leaves
    hail = scene.hail
    stars = scene.stars
    shootingStars = scene.shootingStars
    clouds = scene.clouds
  }

  /** 销毁粒子 Worker 并重置状态（canvas 仍保持 transferred，需 remountParticleCanvas） */
  function destroyParticleWorker() {
    particleOffscreen?.destroy()
    particleOffscreen = null
    particleWorkerActive = false
  }

  /** 强制重建粒子 canvas DOM，以便再次 transferControlToOffscreen */
  function remountParticleCanvas() {
    particleCanvasTransferred = false
    particleCanvasKey.value++
  }

  /** 瞬时风速：平均风 × 风向 × 时间阵风，不再把 gustStrength 当恒定倍率 */
  function resolveWind(p: WeatherEffectProfile, t = Date.now()) {
    const gustAmp = activeScene.value.gustStrength ?? 1
    const debugBoost = isDevBuild && chrome.debugWeather === 'windy' ? 2.5 : 0
    const mag = p.wind > 0.3 ? p.wind : debugBoost || 0.3
    const signed = mag * (p.windDir || 1)
    return resolveGustyWind(t, signed, gustAmp)
  }

  /** 计算雨滴倾斜角度（基于瞬时风） */
  function resolveRainAngle(p: WeatherEffectProfile, t = Date.now()) {
    return resolveRainTiltAngle(resolveWind(p, t))
  }
  /**
   * 初始化粒子 Worker：满足条件时创建 OffscreenCanvas Worker。
   * transferControlToOffscreen 只能调用一次：已 transfer 时先 remount 再重试一次。
   * 失败时回退主线程渲染并重建 particle canvas。
   */
  function setupParticleWorker(
    w: number,
    h: number,
    p: WeatherEffectProfile,
    perfMode: WeatherPerfMode,
    retried = false,
  ) {
    destroyParticleWorker()
    if (!shouldUseWeatherParticleWorker(p, perfMode, fpsReduced)) {
      particleSetupPending = false
      return
    }
    const pc = particleCanvasRef.value
    if (!pc) {
      particleSetupPending = false
      return
    }

    const deferRemountRetry = () => {
      if (retried) {
        particleSetupPending = false
        return
      }
      const setupEpoch = ++particleSetupEpoch
      particleSetupPending = true
      remountParticleCanvas()
      nextTick(() => {
        if (setupEpoch !== particleSetupEpoch) return
        setupParticleWorker(w, h, p, perfMode, true)
      })
    }

    // 同一 canvas 不能二次 transfer：重建 DOM 后在下一 tick 重试一次
    if (particleCanvasTransferred) {
      deferRemountRetry()
      return
    }

    try {
      particleOffscreen = createWeatherParticleOffscreen(pc, {
        width: w,
        height: h,
        dpr: devicePixelRatioCached,
        profile: p,
        wind: resolveWind(p),
        rainAngle: resolveRainAngle(p),
        particleCounts: renderConfig.value.particleCounts,
        rainIntensity: resolveWorkerRainIntensity(p),
        scene: activeScene.value,
      })
      particleWorkerActive = !!particleOffscreen
      if (particleWorkerActive) {
        particleCanvasTransferred = true
        particleSetupPending = false
        return
      }
      // 支持 Offscreen 但创建失败（常见：canvas 已被 transfer）：重建后重试一次
      deferRemountRetry()
    } catch (e) {
      particleWorkerActive = false
      particleSetupPending = false
      remountParticleCanvas()
      logger.warn('OffscreenCanvas Worker 初始化失败,回退主线程粒子', e)
    }
  }

  /** 计算降水强度：雨夹雪取混合强度，否则取雨强度，再乘以场景强度系数 */
  function resolvePrecipIntensity(p: WeatherEffectProfile) {
    const scene = activeScene.value
    const base = profileHasSleet(p) ? profilePrecipIntensity(p) : profileRainIntensity(p)
    return base * (scene.intensity ?? scene.rainIntensity ?? 1)
  }

  /** Worker 用的雨强度（同 resolvePrecipIntensity） */
  function resolveWorkerRainIntensity(p: WeatherEffectProfile) {
    return resolvePrecipIntensity(p)
  }

  /**
   * 同步粒子 Worker 状态：按需创建/销毁/更新。
   * @returns 当前 Worker 是否活跃
   */
  function syncParticleWorker(
    w: number,
    h: number,
    p: WeatherEffectProfile,
    perfMode: WeatherPerfMode,
  ) {
    const wantWorker = shouldUseWeatherParticleWorker(p, perfMode, fpsReduced)
    if (!wantWorker) {
      if (particleWorkerActive || particleCanvasTransferred || particleSetupPending) {
        particleSetupPending = false
        particleSetupEpoch++
        destroyParticleWorker()
        remountParticleCanvas()
      }
      return false
    }
    if (!particleWorkerActive && !particleSetupPending && particleCanvasRef.value) {
      setupParticleWorker(w, h, p, perfMode)
    }
    if (particleWorkerActive && particleOffscreen) {
      particleOffscreen.setState({
        profile: p,
        wind: resolveWind(p),
        rainAngle: resolveRainAngle(p),
        particleCounts: renderConfig.value.particleCounts,
        rainIntensity: resolveWorkerRainIntensity(p),
        scene: activeScene.value,
        active: pageVisible,
      })
    }
    return particleWorkerActive
  }

  /** 绘制流星：夜间且丰富效果时按概率生成，更新并绘制存活的流星 */
  function drawShootingStars(w: number, h: number, dt: number, richEffects: boolean) {
    if (
      isNight.value &&
      richEffects &&
      Math.random() < (renderConfig.value.shootingStarRate ?? 0.0006)
    ) {
      shootingStars.push(new ShootingStar(w, h))
    }
    shootingStars = shootingStars.filter((ss: ShootingStar) => {
      if (!richEffects) return false
      const dead = ss.update(dt)
      if (!dead && ctx) ss.draw(ctx)
      return !dead
    })
  }

  /** 绘制降水与效果（雨/雪/冰雹/落叶/玻璃水珠/闪电等） */
  function drawPrecipAndEffects(
    p: WeatherEffectProfile,
    w: number,
    h: number,
    t: number,
    dt: number,
    wind: number,
    rainAngle: number,
    richEffects: boolean,
  ) {
    if (!ctx) return
    drawWeatherPrecipAndEffects(
      ctx,
      p,
      w,
      h,
      t,
      dt,
      wind,
      rainAngle,
      richEffects,
      renderConfig.value,
      { glassDrops, fastRain, snowCrystals, leaves, hail },
      particleWorkerActive,
      resolvePrecipIntensity,
      precipState,
      // 帧率不足时降粒子数量约 35%
      fpsReduced ? 0.65 : 1,
    )
  }
  /** 主渲染循环：清除画布、绘制环境场景、流星、降水效果，并调度下一帧 */
  function render(timestamp: number) {
    const canvas = canvasRef.value
    if (!canvas || !ctx || !pageVisible) {
      stopAnimation()
      return
    }
    const perfMode = resolvePerformanceMode()
    const richEffects = perfMode === 'high'
    const w = cssWidth
    const h = cssHeight
    const p = profile.value
    const t = Date.now()
    const wind = resolveWind(p, t)
    const rainAngle = resolveRainAngle(p, t)
    const effectConfig = renderConfig.value
    const sceneParticles = { stars, clouds }

    // 帧率监控：high 档连续 45 帧超过 20ms 则降级；恢复正常帧率后解除降级
    if (timestamp && lastFrameTime) {
      const frameMs = timestamp - lastFrameTime
      if (perfMode === 'high' && frameMs > 20) {
        slowFrameStreak++
        if (slowFrameStreak >= 45) fpsReduced = true
      } else if (frameMs < 18) {
        slowFrameStreak = 0
        if (fpsReduced && slowFrameStreak === 0) fpsReduced = false
      }
    }
    // 计算 dt（时间步长），按性能档位限幅避免大跳变
    let dt = 1
    if (timestamp && lastFrameTime) {
      const frameMs = timestamp - lastFrameTime
      const perfCap = perfMode === 'low' ? 120 : perfMode === 'medium' ? 24 : 3
      dt = Math.min(frameMs / (1000 / 60), perfCap)
    }
    lastFrameTime = timestamp

    syncParticleWorker(w, h, p, perfMode)
    ctx.clearRect(0, 0, w, h)
    drawSkyAtmosphere(ctx, w, h, p, effectConfig.scene)
    drawAmbientScene(ctx, w, h, p, t, dt, wind, richEffects, effectConfig, sceneParticles)
    drawShootingStars(w, h, dt, richEffects)
    drawPrecipAndEffects(p, w, h, t, dt, wind, rainAngle, richEffects)

    // 首帧渲染完成后淡入显示
    if (!hasRenderedFrame) {
      hasRenderedFrame = true
      canvas.style.opacity = '1'
    }

    scheduleNextFrame(perfMode)
  }

  /** 页面可见性变化：可见时重启动画，隐藏时停止并暂停 Worker */
  function onVisibilityChange() {
    pageVisible = !document.hidden
    if (pageVisible) {
      startAnimation()
    } else {
      stopAnimation()
      particleOffscreen?.setState({ active: false })
    }
  }

  /**
   * 启动动画：设置 canvas 尺寸/DPR、获取 2D 上下文、初始化粒子并调度首帧。
   * quality === 'static' 时直接返回（静态背景不动画）。
   */
  function startAnimation() {
    if (!pageVisible || props.quality === 'static') return
    const canvas = canvasRef.value
    if (!canvas) return
    const epoch = ++animationEpoch
    // 作废进行中的 remount 重试，避免与本次 start 竞态
    particleSetupEpoch++
    particleSetupPending = true
    stopAnimation()
    destroyParticleWorker()
    remountParticleCanvas()
    hasRenderedFrame = false
    canvas.style.opacity = '0'

    // DPR 上限 2，避免高 DPR 设备过度消耗性能
    devicePixelRatioCached = Math.min(window.devicePixelRatio || 1, 2)
    const { w, h } = measureWeatherLayer(canvas)
    cssWidth = w
    cssHeight = h
    canvas.style.width = `${cssWidth}px`
    canvas.style.height = `${cssHeight}px`
    canvas.width = cssWidth * devicePixelRatioCached
    canvas.height = cssHeight * devicePixelRatioCached
    ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) {
      particleSetupPending = false
      return
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(devicePixelRatioCached, devicePixelRatioCached)
    initParticles(cssWidth, cssHeight)

    const perfMode = resolvePerformanceMode()
    const p = profile.value
    // nextTick 等待粒子 canvas 挂载后再初始化 Worker；过期 epoch 直接丢弃
    nextTick(() => {
      if (epoch !== animationEpoch) return
      particleSetupPending = false
      const pc = particleCanvasRef.value
      if (pc) {
        pc.style.width = `${cssWidth}px`
        pc.style.height = `${cssHeight}px`
        setupParticleWorker(cssWidth, cssHeight, p, perfMode)
      }
      scheduleNextFrame(perfMode)
    })
  }

  /** 防抖重建动画：resize 后 300ms 内仅触发一次 */
  function scheduleResizeAnimation() {
    if (resizeDebounceTimer) clearTimeout(resizeDebounceTimer)
    resizeDebounceTimer = setTimeout(() => {
      resizeDebounceTimer = null
      startAnimation()
    }, 300)
  }

  onMounted(() => {
    if (props.quality === 'static') return
    pageVisible = !document.hidden
    nextTick(() => {
      startAnimation()
      bindContainerResizeObserver()
    })
    window.addEventListener('resize', scheduleResizeAnimation)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('homeos-scaling-change', scheduleResizeAnimation)
    // 监听屏保空闲：空闲时停止动画，恢复时重启
    unsubScreensaverIdle = onScreensaverBackgroundIdle((idle) => {
      if (idle) {
        stopAnimation()
        particleOffscreen?.setState({ active: false })
      } else if (pageVisible && props.quality !== 'static') {
        startAnimation()
      }
    })
  })

  onUnmounted(() => {
    unsubScreensaverIdle?.()
    stopAnimation()
    destroyParticleWorker()
    if (resizeDebounceTimer) clearTimeout(resizeDebounceTimer)
    if (watchDebounceTimer) clearTimeout(watchDebounceTimer)
    containerResizeObserver?.disconnect()
    containerResizeObserver = null
    window.removeEventListener('resize', scheduleResizeAnimation)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('homeos-scaling-change', scheduleResizeAnimation)
  })

  /** 配置变化处理：停止动画、重置降级与闪电状态、重建动画 */
  function handleConfigChange() {
    stopAnimation()
    destroyParticleWorker()
    fpsReduced = false
    slowFrameStreak = 0
    precipState.lightning = null
    precipState.lightningTimer = 0
    precipState.lightningNext = 0
    precipState.lightningFlash = 0
    precipState.lightningGlow = 0
    startAnimation()
  }

  // canvas 挂载时启动动画（非 static 模式）
  watch(canvasRef, (canvas) => {
    if (canvas && props.quality !== 'static') startAnimation()
  })

  // 监听 profile/性能档位/quality/自适应档位/渲染配置变化，防抖后重建动画
  watch(
    [
      profile,
      () => layoutStore.layoutConfig.performanceMode,
      () => props.quality,
      adaptiveTier,
      renderConfig,
    ],
    () => {
      if (watchDebounceTimer) clearTimeout(watchDebounceTimer)
      watchDebounceTimer = setTimeout(handleConfigChange, WATCH_DEBOUNCE_MS)
    },
  )

  return {
    canvasRef,
    particleCanvasRef,
    particleCanvasKey,
  }
}