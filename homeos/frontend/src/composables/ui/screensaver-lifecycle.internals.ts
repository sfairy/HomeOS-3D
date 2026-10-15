/**
 * @file screensaver-lifecycle.internals.ts
 * @module frontend/src/composables/ui
 */
import { ref, computed, watch, onMounted, onUnmounted, type Ref, type ComputedRef } from 'vue'
import { useRouter } from 'vue-router'
import {
  getConfigSection,
  onConfigChange,
  loadFrontendConfig,
  configEpoch,
} from '@/shared/utils/config/frontend-config'
import { setScreensaverVisible } from '@/shared/utils/ui/screensaver-background-idle.util'
import { schedulePoll } from '@/shared/utils/core/poll-scheduler'
import { useWakeWord } from '@/composables/voice/useWakeWord'
import { useTtsSpeak } from '@/composables/voice/useTtsSpeak'
import { executeVoiceCommand } from '@/services/api/system'
import { getClientDeviceId } from '@/shared/client/utils/system.util'
import {
  resolveChargerSwitchWakeEntityIdForDevice,
  shouldDismissScreensaverOnChargerSwitch,
} from '@homeos/shared'
import type { useEntitiesStore } from '@/stores/entities.store'
import type { useEarthquakeStore } from '@/stores/earthquake.store'

type EntitiesStore = ReturnType<typeof useEntitiesStore>
type EarthquakeStore = ReturnType<typeof useEarthquakeStore>

type SsCfg = ComputedRef<Record<string, unknown>>

/** 防烧屏漂移 */
export function createScreensaverBurnIn(burnInOffset: Ref<{ x: number; y: number }>) {
  let burnInCancel: (() => void) | null = null
  function tickBurnIn() {
    const t = Date.now() / 60000
    burnInOffset.value = {
      x: Math.round(Math.sin(t) * 10 + Math.sin(t * 0.37) * 4),
      y: Math.round(Math.cos(t * 0.8) * 8 + Math.cos(t * 0.21) * 4),
    }
  }
  function startBurnInDrift() {
    if (burnInCancel) return
    tickBurnIn()
    burnInCancel = schedulePoll('screensaver:burnin-drift', tickBurnIn, 30_000)
  }
  function stopBurnInDrift() {
    if (burnInCancel) {
      burnInCancel()
      burnInCancel = null
    }
    burnInOffset.value = { x: 0, y: 0 }
  }
  return { startBurnInDrift, stopBurnInDrift }
}

/** Screen Wake Lock（墙屏 / kiosk） */
export function createScreensaverWakeLock(visible: Ref<boolean>) {
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
    if (!visible.value && (pageVisible || isKioskOrFullscreen())) {
      if (pageVisible) void requestWakeLock()
    } else {
      void releaseWakeLock()
    }
  }

  function onVisibilityForWakeLock() {
    syncWakeLock()
  }

  return { syncWakeLock, onVisibilityForWakeLock, releaseWakeLock }
}

function ssPowerCfg() {
  type ScreensaverCompat = { screensaverEnabled?: boolean; screensaverIdleMs?: number }
  const ss = (getConfigSection('screensaver') || {}) as ScreensaverCompat
  const ui = (getConfigSection('ui') || {}) as ScreensaverCompat
  return {
    enabled: ss.screensaverEnabled ?? ui.screensaverEnabled ?? true,
    idleMs: Number(ss.screensaverIdleMs ?? ui.screensaverIdleMs ?? 120000) || 120000,
  }
}

/** 天气定时刷新 */
function createWeatherRefresh(weatherEid: ComputedRef<string>, entitiesStore: EntitiesStore) {
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
    weatherRefreshCancel = schedulePoll(
      'screensaver:weather-refresh',
      refreshScreensaverWeather,
      WEATHER_REFRESH_MS,
    )
  }
  function stopWeatherRefresh() {
    if (weatherRefreshCancel) {
      weatherRefreshCancel()
      weatherRefreshCancel = null
    }
  }
  return { startWeatherRefresh, stopWeatherRefresh }
}

function pickScreensaverMode(ssCfg: SsCfg) {
  const c = ssCfg.value
  if (!c.enableWeatherMode) return 'clock'
  const pref = String(c.defaultMode || 'random').toLowerCase()
  if (pref === 'clock') return 'clock'
  if (pref === 'weather') return 'weather'
  return Math.random() < 0.5 ? 'clock' : 'weather'
}

/** 空闲计时与显隐 */
export function createScreensaverIdleController(opts: {
  ssCfg: SsCfg
  earthquakeStore: EarthquakeStore
  startClockTimer: () => void
  stopClockTimer: () => void
  startBurnInDrift: () => void
  stopBurnInDrift: () => void
  syncWakeLock: () => void
  weatherEid: ComputedRef<string>
  entitiesStore: EntitiesStore
}) {
  const {
    ssCfg,
    earthquakeStore,
    startClockTimer,
    stopClockTimer,
    startBurnInDrift,
    stopBurnInDrift,
    syncWakeLock,
    weatherEid,
    entitiesStore,
  } = opts

  const visible = ref(false)
  const mode = ref('clock')
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  let activityThrottle: ReturnType<typeof setTimeout> | null = null
  const IDLE_TIMEOUT = () => ssPowerCfg().idleMs
  const isScreensaverEnabled = () => ssPowerCfg().enabled !== false
  const { startWeatherRefresh, stopWeatherRefresh } = createWeatherRefresh(weatherEid, entitiesStore)

  let ssWakeStart: (() => void) | null = null
  let ssWakeStop: (() => void) | null = null
  function bindWakeControls(start: () => void, stop: () => void) {
    ssWakeStart = start
    ssWakeStop = stop
  }
  function ssWakeEnabled() {
    const voice = getConfigSection('voice') || {}
    return visible.value && !!voice.wakeWordEnabled && voice.interactionMode === 'wake'
  }

  function showScreensaver() {
    if (earthquakeStore.showOverlay) return
    mode.value = pickScreensaverMode(ssCfg)
    startClockTimer()
    visible.value = true
    setScreensaverVisible(true)
    startBurnInDrift()
    startWeatherRefresh()
    syncWakeLock()
    if (ssWakeEnabled()) ssWakeStart?.()
  }

  function hideScreensaver() {
    setScreensaverVisible(false)
    ssWakeStop?.()
    stopWeatherRefresh()
    stopClockTimer()
    visible.value = false
    stopBurnInDrift()
    syncWakeLock()
  }

  function resetIdle() {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = null
    if (visible.value) hideScreensaver()
    if (!isScreensaverEnabled()) return
    idleTimer = setTimeout(() => {
      showScreensaver()
    }, IDLE_TIMEOUT())
  }

  function syncEnableFromConfig() {
    if (!isScreensaverEnabled()) {
      if (idleTimer) {
        clearTimeout(idleTimer)
        idleTimer = null
      }
      if (visible.value) hideScreensaver()
      return
    }
    if (!visible.value) {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        showScreensaver()
      }, IDLE_TIMEOUT())
    }
  }

  function onUserActivity() {
    if (activityThrottle) return
    activityThrottle = setTimeout(() => {
      activityThrottle = null
    }, 600)
    resetIdle()
  }

  function dismiss() {
    hideScreensaver()
    resetIdle()
  }

  function clearIdleTimers() {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = null
    if (activityThrottle) clearTimeout(activityThrottle)
    activityThrottle = null
  }

  return {
    visible,
    mode,
    showScreensaver,
    hideScreensaver,
    resetIdle,
    syncEnableFromConfig,
    onUserActivity,
    dismiss,
    ssWakeEnabled,
    bindWakeControls,
    stopWeatherRefresh,
    clearIdleTimers,
  }
}

/** 充电器开关订阅 */
function bindChargerSwitchWake(opts: {
  visible: Ref<boolean>
  dismiss: () => void
  entitiesStore: EntitiesStore
}) {
  const { visible, dismiss, entitiesStore } = opts
  const wakeSwitchEntityId = computed(() => {
    void configEpoch.value
    return resolveChargerSwitchWakeEntityIdForDevice(
      getConfigSection('clientPowerWake'),
      getClientDeviceId(),
    )
  })

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

  return { unsubWakeSwitch: () => unsubWakeSwitch() }
}

/** 充电器开关唤醒与屏保态唤醒词 */
export function createScreensaverWakeTriggers(opts: {
  visible: Ref<boolean>
  dismiss: () => void
  entitiesStore: EntitiesStore
  ssWakeEnabled: () => boolean
}) {
  const { visible, dismiss, entitiesStore, ssWakeEnabled } = opts
  const router = useRouter()
  const { speak } = useTtsSpeak()
  const { unsubWakeSwitch } = bindChargerSwitchWake({ visible, dismiss, entitiesStore })

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

  return { ssWake, unsubWakeSwitch }
}

/** 挂载 / 卸载副作用 */
export function bindScreensaverLifecycle(opts: {
  onViewportResize: () => void
  onScalingChange: () => void
  bumpCfgTick: () => void
  syncEnableFromConfig: () => void
  onUserActivity: () => void
  onVisibilityForWakeLock: () => void
  syncWakeLock: () => void
  resetIdle: () => void
  unsubWakeSwitch: () => void
  stopClockTimer: () => void
  stopBurnInDrift: () => void
  stopWeatherRefresh: () => void
  releaseWakeLock: () => Promise<void>
  visible: Ref<boolean>
  clearIdleTimers: () => void
  earthquakeStore: EarthquakeStore
  hideScreensaver: () => void
}) {
  let cfgUnsub: (() => void) | null = null

  onMounted(() => {
    opts.onViewportResize()
    window.addEventListener('resize', opts.onViewportResize, { passive: true })
    window.addEventListener('orientationchange', opts.onViewportResize, { passive: true })
    window.addEventListener('homeos-scaling-change', opts.onScalingChange)
    loadFrontendConfig().then(() => {
      opts.bumpCfgTick()
    })
    cfgUnsub = onConfigChange((sections) => {
      if (
        !sections ||
        sections.includes('screensaver') ||
        sections.includes('ui') ||
        sections.includes('clientPowerWake')
      ) {
        opts.bumpCfgTick()
      }
      if (!sections || sections.includes('screensaver') || sections.includes('ui')) {
        opts.syncEnableFromConfig()
      }
    })
    window.addEventListener('mousemove', opts.onUserActivity, { passive: true })
    window.addEventListener('touchstart', opts.onUserActivity, { passive: true })
    window.addEventListener('keydown', opts.onUserActivity)
    document.addEventListener('visibilitychange', opts.onVisibilityForWakeLock)
    opts.syncWakeLock()
    opts.resetIdle()
  })

  watch(
    () => opts.earthquakeStore.showOverlay,
    (on) => {
      if (on && opts.visible.value) opts.hideScreensaver()
    },
  )

  onUnmounted(() => {
    cfgUnsub?.()
    opts.unsubWakeSwitch()
    opts.stopClockTimer()
    opts.stopBurnInDrift()
    opts.stopWeatherRefresh()
    void opts.releaseWakeLock()
    if (opts.visible.value) setScreensaverVisible(false)
    opts.clearIdleTimers()
    window.removeEventListener('resize', opts.onViewportResize)
    window.removeEventListener('orientationchange', opts.onViewportResize)
    window.removeEventListener('homeos-scaling-change', opts.onScalingChange)
    window.removeEventListener('mousemove', opts.onUserActivity)
    window.removeEventListener('touchstart', opts.onUserActivity)
    window.removeEventListener('keydown', opts.onUserActivity)
    document.removeEventListener('visibilitychange', opts.onVisibilityForWakeLock)
  })
}
