/**
 * @file useScreensaver.ts
 * @module composables/ui
 * @description 屏保（Screensaver）composable：时钟/天气大屏与空闲触发。
 *
 * 职责：
 * - 管理屏保显隐、模式（clock/weather）与预览模式（管理端预览）；
 * - 监听用户活动（鼠标/触摸/键盘）重置空闲计时器，超时自动进入屏保；
 * - 计算屏保布局（scaled/fluid）与 CSS 变量样式，适配缩放与手机视口；
 * - 派生当前时间（时/分/秒）、日期（星期/月日/年）、农历与天气信息；
 * - 屏保可见时启动唤醒词监听，识别后关闭屏保并执行语音命令；
 * - 本机充电器开关由关变开时退出屏保（保持开启不阻止空闲进入屏保；本地边沿检测，不暂停）。
 * - 监听地震覆盖层与预览请求，必要时强制隐藏屏保。
 *
 * 依赖：
 * - vue（ref/computed/watch/onMounted/onUnmounted）
 * - pinia（storeToRefs）
 * - vue-router（路由跳转）
 * - entities.store / layout.store + chrome.store / earthquake.store
 * - lunar-calendar / lunar-display.util（农历计算与显示）
 * - frontend-config（屏保/UI/人来亮屏配置）
 * - locale-time（时区化时间格式化）
 * - useScaling / usePerfClock / useWakeWord / useTtsSpeak
 * - system API（executeVoiceCommand）
 * - screensaver-background-idle.util（屏保空闲联动背景）
 * - clientPowerWake（本机充电器开关关→开退出屏保；单机 ID 可回退）
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useEntitiesStore } from '@/stores/entities.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useChromeStore } from '@/stores/chrome.store'
import { solarToLunar } from '@/utils/format/lunar-calendar'
import { formatLunarFullLine, formatLunarMonthDayLine } from '@/utils/format/lunar-display.util'
import {
  getConfigSection,
  onConfigChange,
  loadFrontendConfig,
  configEpoch,
} from '@/utils/config/frontend-config'
import { formatZonedDate, getZonedParts, getZonedWallDate } from '@/utils/format/locale-time'
import {
  activeDesignWidth,
  activeDesignHeight,
  computeScreensaverLayout,
} from '@/composables/ui/useScaling'
import { usePerfClock } from '@/composables/ui/usePerfClock'
import { isPhoneViewport } from '@/utils/config/viewport-breakpoints.util'
import { useWakeWord } from '@/composables/voice/useWakeWord'
import { useTtsSpeak } from '@/composables/voice/useTtsSpeak'
import { executeVoiceCommand } from '@/services/api/system'
import { domainIndexToArray } from '@/utils/entity/derived.util'
import {
  screensaverBackgroundIdle,
  setScreensaverVisible,
} from '@/utils/ui/screensaver-background-idle.util'
import { useEarthquakeStore } from '@/stores/earthquake.store'
import { schedulePoll } from '@/utils/core/poll-scheduler'
import { weatherStateLabel } from '@/constants/weather-labels'
import {
  computeFeelsLike,
  collectSensorEntityIds,
  readAqiNumber,
  normalizeWindSpeedMs,
  numOr,
} from '@/utils/weather/weather-metric.util'
import { getClientDeviceId } from '@/utils/client/system.util'
import {
  resolveChargerSwitchWakeEntityIdForDevice,
  shouldDismissScreensaverOnChargerSwitch,
} from '@homeos/shared'

/** 屏保默认配置（与配置文件合并使用） */
const SS_DEFAULTS = {
  scale: 1.35,
  defaultMode: 'clock',
  enableWeatherMode: false,
  instantEnter: true,
  instantLeave: true,
  brightness: 1,
  showBrand: true,
  showSeconds: true,
  showGregorianDate: true,
  showLunar: true,
  showWeatherIcon: true,
  showWeatherDesc: true,
  showWeatherStats: true,
  showWeatherMeta: true,
  timeSizeVw: 24,
  sepSizeVw: 17,
  secSizeVw: 7,
  metaSizeVw: 3,
  subMetaSizeVw: 2,
  brandSizePx: 26,
  weatherTempSizeVw: 22,
  weatherIconSizeVw: 10,
  weatherStatsSizePx: 15,
  brandTopVh: 5,
  contentShiftVh: 0,
}

/**
 * 屏保 composable：聚合屏保显隐、布局样式、时间/农历/天气派生与唤醒词。
 *
 * 调用场景：屏保组件初始化时调用，返回渲染所需的全部响应式状态与 dismiss 方法。
 *
 * @returns visible/mode/ssCfg 等屏保状态与样式计算属性，dismiss 关闭方法
 */
export function useScreensaver() {
  const entitiesStore = useEntitiesStore()
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()
  const router = useRouter()
  const { speak } = useTtsSpeak()
  const { screensaverPreview } = storeToRefs(chrome)
  const earthquakeStore = useEarthquakeStore()

  // 配置变化计数器：读取配置后自增以触发 computed 重算
  const cfgTick = ref(0)
  // 缩放变化计数器：监听 homeos-scaling-change 后自增
  const scalingTick = ref(0)
  // 视口宽高（SSR 安全降级）
  const viewportW = ref(typeof window !== 'undefined' ? window.innerWidth : 1366)
  const viewportH = ref(typeof window !== 'undefined' ? window.innerHeight : 1024)
  // 防烧屏：时钟轻微漂移（像素），须在 ssStyle 之前声明
  const burnInOffset = ref({ x: 0, y: 0 })
  // 防烧屏漂移任务的取消函数（经全局调度器驱动）
  let burnInCancel: (() => void) | null = null

  // 屏保配置：默认值合并配置文件 screensaver 段（读取 cfgTick/scalingTick 触发响应）
  const ssCfg = computed(() => {
    cfgTick.value
    scalingTick.value
    return { ...SS_DEFAULTS, ...getConfigSection('screensaver') }
  })

  // 屏保布局度量：基于缩放全局变量与 UI 配置计算 scaled/fluid 布局
  const layoutMetrics = computed(() => {
    scalingTick.value
    const ui = getConfigSection('ui')
    const designW =
      activeDesignWidth.value || layoutStore.layoutConfig.pageMaxWidth || ui.scaleBaseWidth || 1366
    const designH = activeDesignHeight.value || ui.scaleBaseHeight || 1024
    return computeScreensaverLayout(viewportW.value, viewportH.value, designW, designH)
  })
  // 屏保 CSS 变量样式：尺寸/位置百分比与像素值，适配缩放与手机视口
  const ssStyle = computed(() => {
    const c = ssCfg.value
    const L = layoutMetrics.value
    const vw = viewportW.value
    const vh = viewportH.value
    const vmin = Math.min(vw, vh)
    // 手机 fluid 模式下直接铺满视口，不使用 canvas 尺寸
    const isMobileFluid = L.layoutMode === 'fluid' && isPhoneViewport(vw, vh)
    const canvasW = isMobileFluid ? vw : L.canvasW
    const canvasH = isMobileFluid ? vh : L.canvasH
    const userScale = Number(c.scale) || 1
    const brandTop = ((Number(c.brandTopVh) || 5) / 100) * canvasH
    const contentShift = ((Number(c.contentShiftVh) || 0) / 100) * canvasH
    // 手机模式下字体略放大 1.08 倍，保证可读性
    const mobileBoost = isMobileFluid ? 1.08 : 1
    return {
      '--ss-scale': userScale * mobileBoost,
      // fluid 模式缩放系数（scaled 模式为 1），供竖屏平板按设计稿基准放大时钟
      '--ss-fit': String(L.fit ?? 1),
      '--ss-design-w': `${L.designW}px`,
      '--ss-design-h': `${L.designH}px`,
      '--ss-canvas-w': `${canvasW}px`,
      '--ss-canvas-h': `${canvasH}px`,
      '--ss-vw': `${vw}px`,
      '--ss-vh': `${vh}px`,
      '--ss-vmin': `${vmin}px`,
      '--ss-time-pct': Number(c.timeSizeVw) || 24,
      '--ss-sep-pct': Number(c.sepSizeVw) || 17,
      '--ss-sec-pct': Number(c.secSizeVw) || 7,
      '--ss-meta-pct': Number(c.metaSizeVw) || 3,
      '--ss-sub-meta-pct': Number(c.subMetaSizeVw) || 2,
      '--ss-brand-px': `${Number(c.brandSizePx) || 26}px`,
      '--ss-wx-temp-pct': Number(c.weatherTempSizeVw) || 22,
      '--ss-wx-icon-pct': Number(c.weatherIconSizeVw) || 10,
      '--ss-wx-stats-px': `${Number(c.weatherStatsSizePx) || 15}px`,
      '--ss-brand-top': `${brandTop}px`,
      '--ss-content-shift': `${contentShift}px`,
      '--ss-burnin-x': `${burnInOffset.value.x}px`,
      '--ss-burnin-y': `${burnInOffset.value.y}px`,
    }
  })

  // 遮罩类名：控制进入/离开是否无动画（instant）
  const overlayClass = computed(() => {
    const c = ssCfg.value
    return {
      instant: c.instantEnter !== false,
      instantLeave: c.instantLeave !== false,
    }
  })

  // 遮罩亮度调暗样式：屏保空闲背景时按 brightness 计算暗度
  const overlayDimStyle = computed(() => {
    void screensaverBackgroundIdle.value
    const b = Number(ssCfg.value.brightness)
    if (screensaverBackgroundIdle.value && b > 0 && b < 1) {
      return { '--ss-dim-opacity': String(Math.min(1, Math.max(0, 1 - b))) }
    }
    return { '--ss-dim-opacity': '0' }
  })

  // shell 容器样式：scaled 模式按 shell 尺寸+scale 变换；fluid 手机模式 100%；其余按 canvas 尺寸
  const shellStyle = computed(() => {
    const L = layoutMetrics.value
    const vw = viewportW.value
    if (L.layoutMode === 'scaled') {
      return {
        width: `${L.shellW}px`,
        height: `${L.shellH}px`,
        transform: `scale(${L.shellScale})`,
        transformOrigin: 'center center',
      }
    }
    if (isPhoneViewport(vw, viewportH.value)) {
      return { width: '100%', height: '100%' }
    }
    return {
      width: `${L.canvasW}px`,
      height: `${L.canvasH}px`,
    }
  })

  // 内容 shell 样式：scaled 模式固定为设计稿尺寸；其余 100%
  const contentShellStyle = computed(() => {
    const L = layoutMetrics.value
    if (L.layoutMode === 'scaled') {
      return {
        width: `${L.designW}px`,
        height: `${L.designH}px`,
      }
    }
    return {
      width: '100%',
      height: '100%',
    }
  })

  let resizeRaf: number | null = null
  /** 视口 resize 回调：用 rAF 节流，避免高频触发重算 */
  function onViewportResize() {
    if (resizeRaf) return
    resizeRaf = requestAnimationFrame(() => {
      viewportW.value = window.innerWidth
      viewportH.value = window.innerHeight
      resizeRaf = null
    })
  }

  // 屏保是否可见
  const visible = ref(false)
  // 是否处于预览模式（管理端预览，不受空闲计时影响）
  const previewActive = ref(false)
  // 预览保护期截止时间：在此期间 dismiss 不生效，避免预览刚启动就被关闭
  const previewGuardUntil = ref(0)
  // 当前屏保模式：clock 或 weather
  const mode = ref('clock')
  // Screen Wake Lock：屏保关闭且页面可见时保持亮屏（墙屏/kiosk）
  let wakeLock: WakeLockSentinel | null = null
  let wakeLockWanted = false

  function isKioskOrFullscreen() {
    if (typeof document === 'undefined') return false
    if (document.fullscreenElement) return true
    try {
      return document.documentElement?.getAttribute('data-kiosk') === 'true'
    } catch {
      return false
    }
  }

  async function requestWakeLock() {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return
    if (document.visibilityState !== 'visible') return
    if (visible.value) return
    wakeLockWanted = true
    try {
      if (wakeLock) return
      wakeLock = await navigator.wakeLock.request('screen')
      wakeLock.addEventListener('release', () => {
        wakeLock = null
        if (wakeLockWanted && document.visibilityState === 'visible' && !visible.value) {
          void requestWakeLock()
        }
      })
    } catch {
      wakeLock = null
    }
  }

  async function releaseWakeLock() {
    wakeLockWanted = false
    const lock = wakeLock
    wakeLock = null
    if (!lock) return
    try {
      await lock.release()
    } catch {
      /* 忽略 */
    }
  }

  function syncWakeLock() {
    const pageVisible = typeof document !== 'undefined' && document.visibilityState === 'visible'
    // 屏保未显示且（页面可见，或 kiosk/全屏）时申请；屏保显示或页面隐藏时释放
    if (!visible.value && (pageVisible || isKioskOrFullscreen())) {
      if (pageVisible) void requestWakeLock()
    } else {
      void releaseWakeLock()
    }
  }

  function onVisibilityForWakeLock() {
    syncWakeLock()
  }

  function tickBurnIn() {
    // ±12px 缓慢漂移，减轻静态时钟烧屏
    const t = Date.now() / 60000
    burnInOffset.value = {
      x: Math.round(Math.sin(t) * 10 + Math.sin(t * 0.37) * 4),
      y: Math.round(Math.cos(t * 0.8) * 8 + Math.cos(t * 0.21) * 4),
    }
  }

  function startBurnInDrift() {
    if (burnInCancel) return
    tickBurnIn()
    // 30 秒低频漂移，经全局调度器驱动（页面隐藏时暂停合理：无画面显示即无烧屏风险）
    burnInCancel = schedulePoll('screensaver:burnin-drift', tickBurnIn, 30_000)
  }

  function stopBurnInDrift() {
    if (burnInCancel) {
      burnInCancel()
      burnInCancel = null
    }
    burnInOffset.value = { x: 0, y: 0 }
  }

  // 性能时钟（autoStart=false，由屏保显隐控制启停）
  const {
    now: currentTime,
    start: startClockTimer,
    stop: stopClockTimer,
  } = usePerfClock({ autoStart: false, forceIntervalMs: 1000 })
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  /** 读取 UI 配置段的快捷函数 */
  const uiCfg = () => getConfigSection('ui')
  /** 空闲超时（毫秒）：取配置 screensaverIdleMs，缺省 120000（2 分钟） */
  const IDLE_TIMEOUT = () => uiCfg().screensaverIdleMs ?? 120000

  // 站点标题：取布局配置 siteTitle，缺省 HomeOS
  const siteTitle = computed(() => layoutStore.layoutConfig.siteTitle || 'HomeOS')

  // 时区化时钟各部分（高频字段：随秒级时钟刷新）
  const zonedClock = computed(() => getZonedParts(currentTime.value))
  const timeHour = computed(() => zonedClock.value.hour)
  const timeMin = computed(() => zonedClock.value.minute)
  const timeSec = computed(() => zonedClock.value.second)

  // 低频时钟：日期/农历等低频字段基于此，避免每秒重复格式化与农历计算
  const lowFreqClock = ref(new Date())
  // 低频字段刷新周期（毫秒）：60 秒一次
  const LOW_FREQ_REFRESH_MS = 60_000
  // 上次低频字段刷新时间戳
  let lastLowFreqAt = 0
  // 与秒级时钟协作：跨天/跨月时立即同步低频时钟保证显示正确，否则按周期降频刷新
  watch(currentTime, (t) => {
    const now = t.getTime()
    const dayChanged = getZonedWallDate(t) !== getZonedWallDate(lowFreqClock.value)
    if (dayChanged || now - lastLowFreqAt >= LOW_FREQ_REFRESH_MS) {
      lowFreqClock.value = t
      lastLowFreqAt = now
    }
  })

  // 日期各部分（中文格式，基于低频时钟）
  const dateWeek = computed(() => formatZonedDate(lowFreqClock.value, 'zh-CN', { weekday: 'long' }))
  const dateMD = computed(() =>
    formatZonedDate(lowFreqClock.value, 'zh-CN', { month: 'long', day: 'numeric' }),
  )
  const dateYear = computed(() => formatZonedDate(lowFreqClock.value, 'zh-CN', { year: 'numeric' }))
  // 农历：公历转农历后格式化为完整行与月日行（基于低频时钟）
  const lunarRaw = computed(() => solarToLunar(getZonedWallDate(lowFreqClock.value)))
  const lunarFullLine = computed(() => formatLunarFullLine(lunarRaw.value))
  const lunarMonthDayLine = computed(() => formatLunarMonthDayLine(lunarRaw.value))
  // 天气实体：优先取配置的 weatherEntityId，否则取 weather 域第一个实体
  const weatherEntity = computed(() => {
    void entitiesStore.derivedEpoch
    void entitiesStore.getDomainEpoch('weather')
    const eid = layoutStore.layoutConfig.haConfig?.weatherEntityId
    if (eid) return entitiesStore.entities[eid]
    const weatherIds = domainIndexToArray(entitiesStore.domainEntityIndex.get('weather'))
    const firstId = weatherIds[0]
    return firstId ? entitiesStore.entities[firstId] : null
  })

  /** 天气实体 id（无实体时为 ''） */
  const weatherEid = computed(() => {
    const ent = weatherEntity.value
    return ent?.entity_id || ''
  })

  // 天气温度：取 attributes.temperature 并取整，缺省 '--'
  const weatherTemp = computed(() => {
    const t = weatherEntity.value?.attributes?.temperature as number | undefined
    return t != null ? Math.round(t) : '--'
  })
  // 天气描述：优先中文标签，未知状态回退原始 state
  const weatherDesc = computed(() => {
    const s = weatherEntity.value?.state ?? '--'
    return s !== '--' ? weatherStateLabel(s) : '--'
  })

  // 天气附加信息：湿度/体感/风速/气压/AQI，组合为图标+值的列表
  const weatherExtra = computed(() => {
    const attrs = weatherEntity.value?.attributes as Record<string, unknown> | undefined
    if (!attrs) return null
    const items: { icon: string; val: string }[] = []
    if (attrs.humidity != null) items.push({ icon: '💧', val: String(attrs.humidity) + '%' })
    // 体感温度：优先实体属性，缺失时按温度/湿度/风估算
    const tRaw = numOr(attrs.temperature, NaN)
    const feelsRaw = attrs.feels_like ?? attrs.apparent_temperature
    if (!Number.isNaN(tRaw)) {
      let fl: number
      if (feelsRaw != null && !Number.isNaN(Number(feelsRaw))) {
        fl = Number(feelsRaw)
      } else {
        fl = computeFeelsLike(
          tRaw,
          numOr(attrs.humidity, 50),
          normalizeWindSpeedMs(numOr(attrs.wind_speed, NaN), attrs.wind_speed_unit as string),
        )
      }
      if (Number.isFinite(fl)) items.push({ icon: '🌡️', val: Math.round(fl) + '°' })
    }
    if (attrs.wind_speed != null) {
      const unit = (attrs.wind_speed_unit as string) || 'm/s'
      items.push({ icon: '🌬', val: Math.round(Number(attrs.wind_speed)) + unit })
    }
    if (attrs.pressure != null)
      items.push({ icon: '📊', val: Math.round(Number(attrs.pressure)) + 'hPa' })
    // AQI：只读 sensor.{城市名}_aqi，排除 PM2.5 / weather.attrs.aqi
    void entitiesStore.getDomainEpoch('sensor')
    const aqi = readAqiNumber(
      (id) => entitiesStore.getEntity(id),
      weatherEid.value,
      collectSensorEntityIds({
        sensorIndexIds: entitiesStore.sensorIndex.get('sensor'),
        domainSensorIds: entitiesStore.domainEntityIndex.get('sensor'),
        allEntityIds: Object.keys(entitiesStore.entities),
      }),
    )
    if (aqi != null) items.push({ icon: '😷', val: `AQI ${aqi}` })
    return items.length ? items : null
  })

  // 天气状态 → emoji 映射（与 WEATHER_LABELS 键对齐）
  const WEATHER_ICON_EMOJI = {
    sunny: '☀️',
    'clear-day': '☀️',
    clear: '☀️',
    excellent: '☀️',
    fine: '☀️',
    'clear-night': '🌙',
    partlycloudy: '⛅',
    'partly-cloudy': '⛅',
    cloudy: '☁️',
    rainy: '🌧️',
    pouring: '🌧️',
    drizzle: '🌦️',
    lightning: '⛈️',
    thunderstorm: '⛈️',
    storm: '⛈️',
    snowy: '❄️',
    sleet: '🌨️',
    'snowy-rainy': '🌨️',
    hail: '🧊',
    windy: '💨',
    wind: '💨',
    fog: '🌫️',
    mist: '🌫️',
    haze: '🌫️',
    smoke: '🌫️',
    sandstorm: '🏜️',
    dust: '🏜️',
    tornado: '🌪️',
  }

  // 天气图标：优先精确状态映射，未知状态回退关键字匹配
  const weatherIcon = computed(() => {
    const s = (weatherEntity.value?.state || '').toLowerCase()
    const exact = (WEATHER_ICON_EMOJI as Record<string, string>)[s]
    if (exact) return exact
    if (s.includes('sunny') || s.includes('clear')) return '☀️'
    if (s.includes('partly')) return '⛅'
    if (s.includes('cloud')) return '☁️'
    if (s.includes('rain') || s.includes('drizzle')) return '🌧'
    if (s.includes('storm') || s.includes('thunder')) return '⛈'
    if (s.includes('snow')) return '🌨'
    if (s.includes('hail')) return '🧊'
    if (s.includes('fog') || s.includes('mist') || s.includes('haze')) return '🌫'
    if (s.includes('wind')) return '💨'
    return '🌤'
  })

  /** 选择屏保模式：未启用天气模式则固定 clock；否则按配置 defaultMode（random 时 50% 概率） */
  function pickScreensaverMode() {
    const c = ssCfg.value
    if (!c.enableWeatherMode) return 'clock'
    const pref = String(c.defaultMode || 'random').toLowerCase()
    if (pref === 'clock') return 'clock'
    if (pref === 'weather') return 'weather'
    return Math.random() < 0.5 ? 'clock' : 'weather'
  }

  // 天气数据 30 分钟定时刷新（屏保可见时运行）：拉取预报并刷新天气实体缓存
  const WEATHER_REFRESH_MS = 30 * 60 * 1000
  let weatherRefreshCancel: (() => void) | null = null
  function refreshScreensaverWeather() {
    const eid = weatherEid.value
    if (!eid) return
    entitiesStore.fetchForecasts(eid, 'daily').catch(() => {
      /* 刷新失败保持旧数据 */
    })
  }
  function startWeatherRefresh() {
    if (weatherRefreshCancel) return
    refreshScreensaverWeather()
    weatherRefreshCancel = schedulePoll('screensaver:weather-refresh', refreshScreensaverWeather, WEATHER_REFRESH_MS)
  }
  function stopWeatherRefresh() {
    if (weatherRefreshCancel) {
      weatherRefreshCancel()
      weatherRefreshCancel = null
    }
  }

  /** 判断是否可以进入屏保：预览模式允许；地震覆盖层显示时禁止 */
  function canEnterScreensaver() {
    if (previewActive.value) return true
    if (earthquakeStore.showOverlay) return false
    return true
  }

  /** 显示屏保：选择模式、启动时钟、标记可见并通知背景空闲模块 */
  function showScreensaver() {
    if (!canEnterScreensaver()) return
    mode.value = pickScreensaverMode()
    startClockTimer()
    visible.value = true
    setScreensaverVisible(true)
    startBurnInDrift()
    startWeatherRefresh()
    syncWakeLock()
    if (ssWakeEnabled()) ssWake.start()
  }

  /** 隐藏屏保：通知背景模块、停止唤醒词、非预览时停止时钟 */
  function hideScreensaver() {
    setScreensaverVisible(false)
    ssWake.stop()
    stopWeatherRefresh()
    if (!previewActive.value) stopClockTimer()
    visible.value = false
    stopBurnInDrift()
    syncWakeLock()
  }

  /** 重置空闲计时器：若屏保可见且非预览则先隐藏；预览模式或禁用时不重启计时 */
  function resetIdle() {
    if (idleTimer) clearTimeout(idleTimer)
    if (visible.value && !previewActive.value) {
      hideScreensaver()
    }
    if (previewActive.value) return
    if (uiCfg().screensaverEnabled === false) return
    idleTimer = setTimeout(() => {
      showScreensaver()
    }, IDLE_TIMEOUT())
  }
  let activityThrottle: ReturnType<typeof setTimeout> | null = null
  /** 用户活动回调：600ms 节流后重置空闲计时 */
  function onUserActivity() {
    if (activityThrottle) return
    activityThrottle = setTimeout(() => {
      activityThrottle = null
    }, 600)
    resetIdle()
  }

  /** 关闭屏保：预览保护期内不响应；预览模式同步关闭预览请求 */
  function dismiss() {
    if (previewActive.value && Date.now() < previewGuardUntil.value) return
    const wasPreview = previewActive.value
    hideScreensaver()
    if (wasPreview) {
      previewActive.value = false
      chrome.closeScreensaverPreview()
    }
    resetIdle()
  }

  const wakeSwitchEntityId = computed(() => {
    void configEpoch.value
    return resolveChargerSwitchWakeEntityIdForDevice(
      getConfigSection('clientPowerWake'),
      getClientDeviceId(),
    )
  })

  /** 本机充电器开关上次状态：进入屏保时快照，仅认此后的 off→on，不依赖 WS old_state */
  let lastSwitchState: string | null = null
  let unsubWakeSwitch = () => {}

  function snapshotWakeSwitchState() {
    const id = wakeSwitchEntityId.value
    if (!id) {
      lastSwitchState = null
      return
    }
    const cached = entitiesStore.entities[id]?.state
    if (cached != null && cached !== '') lastSwitchState = cached
  }

  function resubscribeWakeSwitch() {
    unsubWakeSwitch()
    const id = wakeSwitchEntityId.value
    if (!id) {
      unsubWakeSwitch = () => {}
      return
    }
    unsubWakeSwitch = entitiesStore.onStateChanged(
      (payload) => {
        const prev = lastSwitchState ?? payload.old_state?.state ?? null
        const next = payload.new_state?.state ?? null
        lastSwitchState = next
        if (
          !shouldDismissScreensaverOnChargerSwitch({
            screensaverVisible: visible.value,
            previewActive: previewActive.value,
            oldState: prev,
            newState: next,
          })
        ) {
          return
        }
        dismiss()
      },
      { entityIds: id },
    )
  }

  watch(
    wakeSwitchEntityId,
    (id) => {
      unsubWakeSwitch()
      unsubWakeSwitch = () => {}
      lastSwitchState = null
      if (!id) return
      void entitiesStore.ensureEntity(id).then((ent) => {
        if (wakeSwitchEntityId.value !== id) return
        lastSwitchState = ent?.state ?? entitiesStore.entities[id]?.state ?? null
        resubscribeWakeSwitch()
      })
    },
    { immediate: true },
  )

  watch(visible, (on) => {
    if (on) snapshotWakeSwitchState()
  })

  /** 判断屏保态唤醒词是否启用：屏保可见且配置了唤醒词且交互模式为 wake */
  function ssWakeEnabled() {
    const voice = getConfigSection('voice') || {}
    return visible.value && !!voice.wakeWordEnabled && voice.interactionMode === 'wake'
  }

  // 屏保态唤醒词监听：识别到命令后关闭屏保、跳转首页、执行语音命令并 TTS 播报
  const ssWake = useWakeWord(
    async (cmd: string) => {
      dismiss()
      try {
        if (router.currentRoute.value.path !== '/') await router.push('/')
      } catch {
        /* 路由跳转失败忽略 */
      }
      try {
        window.dispatchEvent(new CustomEvent('homeos:voice-wake', { detail: { cmd } }))
      } catch {
        /* 事件派发失败忽略 */
      }
      try {
        const { data } = await executeVoiceCommand(cmd)
        const msg = data?.message
        if (msg && getConfigSection('voice')?.ttsEnabled !== false) await speak(msg)
      } catch {
        /* 语音命令执行失败忽略 */
      }
    },
    {
      enabled: ssWakeEnabled,
      onError: () => {
        /* 屏保态仅降噪重试；主 VoiceCommand 会展示可读错误 */
      },
    },
  )

  // 地震覆盖层显示时，若屏保可见且非预览则强制隐藏
  watch(
    () => earthquakeStore.showOverlay,
    (on) => {
      if (on && visible.value && !previewActive.value) hideScreensaver()
    },
  )

  // 监听预览请求：有 token 则进入预览模式并设置保护期；无 token 则退出预览
  watch(
    screensaverPreview,
    (req) => {
      if (!req?.token) {
        if (previewActive.value) {
          previewActive.value = false
          hideScreensaver()
        }
        return
      }
      if (idleTimer) clearTimeout(idleTimer)
      previewActive.value = true
      mode.value = req.mode === 'weather' ? 'weather' : 'clock'
      previewGuardUntil.value = Date.now() + 450
      startClockTimer()
      visible.value = true
      setScreensaverVisible(true)
      startBurnInDrift()
      startWeatherRefresh()
      syncWakeLock()
    },
    { flush: 'sync' },
  )

  let cfgUnsub: (() => void) | null = null

  /** 缩放变化回调：自增 scalingTick 触发布局重算 */
  function onScalingChange() {
    scalingTick.value++
  }

  onMounted(() => {
    onViewportResize()
    window.addEventListener('resize', onViewportResize, { passive: true })
    window.addEventListener('orientationchange', onViewportResize, { passive: true })
    window.addEventListener('homeos-scaling-change', onScalingChange)
    // 加载前端配置后自增 cfgTick，触发配置相关 computed 重算
    loadFrontendConfig().then(() => {
      cfgTick.value++
    })
    // 监听配置变化：screensaver 段变化时自增 cfgTick
    cfgUnsub = onConfigChange((sections) => {
      if (
        !sections ||
        sections.includes('screensaver') ||
        sections.includes('clientPowerWake')
      ) {
        cfgTick.value++
      }
    })
    window.addEventListener('mousemove', onUserActivity, { passive: true })
    window.addEventListener('touchstart', onUserActivity, { passive: true })
    window.addEventListener('keydown', onUserActivity)
    document.addEventListener('visibilitychange', onVisibilityForWakeLock)
    syncWakeLock()
    resetIdle()
  })

  onUnmounted(() => {
    cfgUnsub?.()
    unsubWakeSwitch()
    stopClockTimer()
    stopBurnInDrift()
    stopWeatherRefresh()
    void releaseWakeLock()
    if (visible.value) setScreensaverVisible(false)
    if (idleTimer) clearTimeout(idleTimer)
    if (activityThrottle) clearTimeout(activityThrottle)
    window.removeEventListener('resize', onViewportResize)
    window.removeEventListener('orientationchange', onViewportResize)
    window.removeEventListener('homeos-scaling-change', onScalingChange)
    window.removeEventListener('mousemove', onUserActivity)
    window.removeEventListener('touchstart', onUserActivity)
    window.removeEventListener('keydown', onUserActivity)
    document.removeEventListener('visibilitychange', onVisibilityForWakeLock)
  })

  return {
    visible,
    mode,
    ssCfg,
    overlayClass,
    overlayDimStyle,
    layoutMetrics,
    ssStyle,
    shellStyle,
    contentShellStyle,
    siteTitle,
    timeHour,
    timeMin,
    timeSec,
    dateWeek,
    dateMD,
    dateYear,
    lunarFullLine,
    lunarMonthDayLine,
    weatherIcon,
    weatherTemp,
    weatherDesc,
    weatherExtra,
    dismiss,
  }
}