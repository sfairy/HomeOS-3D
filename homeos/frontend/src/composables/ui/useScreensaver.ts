/**
 * @file useScreensaver.ts
 * @module frontend/src/composables/ui
 */
/** - 管理屏保显隐、模式（clock/weather）与预览模式（管理端预览）； */
import { useEntitiesStore } from '@/stores/entities.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useEarthquakeStore } from '@/stores/earthquake.store'
import { usePerfClock } from '@/composables/ui/usePerfClock'
import { createScreensaverLayoutState } from './screensaver-layout.internals'
import {
  createScreensaverClockState,
  createScreensaverWeatherState,
} from './screensaver-clock-weather.internals'
import {
  createScreensaverBurnIn,
  createScreensaverWakeLock,
  createScreensaverIdleController,
  createScreensaverWakeTriggers,
  bindScreensaverLifecycle,
} from './screensaver-lifecycle.internals'

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
  const earthquakeStore = useEarthquakeStore()

  const layout = createScreensaverLayoutState(layoutStore)
  const {
    now: currentTime,
    start: startClockTimer,
    stop: stopClockTimer,
  } = usePerfClock({ autoStart: false, forceIntervalMs: 1000 })

  const clock = createScreensaverClockState(layoutStore, currentTime)
  const weather = createScreensaverWeatherState(entitiesStore, layoutStore)
  const burnIn = createScreensaverBurnIn(layout.burnInOffset)

  // visible must exist before wake-lock sync reads it
  const idle = createScreensaverIdleController({
    ssCfg: layout.ssCfg as never,
    earthquakeStore,
    startClockTimer,
    stopClockTimer,
    startBurnInDrift: burnIn.startBurnInDrift,
    stopBurnInDrift: burnIn.stopBurnInDrift,
    syncWakeLock: () => wakeLock.syncWakeLock(),
    weatherEid: weather.weatherEid,
    entitiesStore,
  })
  const wakeLock = createScreensaverWakeLock(idle.visible)
  // rebind sync now that wakeLock exists (idle captured a stub via closure above)
  // Actually idle already calls syncWakeLock from opts — we passed () => wakeLock.syncWakeLock()
  // but wakeLock const is in TDZ when creating the arrow... In JS const wakeLock is not initialized
  // when the arrow is *created*, but the arrow only *calls* it later, after wakeLock init. OK.

  const wake = createScreensaverWakeTriggers({
    visible: idle.visible,
    dismiss: idle.dismiss,
    entitiesStore,
    ssWakeEnabled: idle.ssWakeEnabled,
  })
  idle.bindWakeControls(() => wake.ssWake.start(), () => wake.ssWake.stop())

  bindScreensaverLifecycle({
    onViewportResize: layout.onViewportResize,
    onScalingChange: layout.onScalingChange,
    bumpCfgTick: layout.bumpCfgTick,
    syncEnableFromConfig: idle.syncEnableFromConfig,
    onUserActivity: idle.onUserActivity,
    onVisibilityForWakeLock: wakeLock.onVisibilityForWakeLock,
    syncWakeLock: wakeLock.syncWakeLock,
    resetIdle: idle.resetIdle,
    unsubWakeSwitch: wake.unsubWakeSwitch,
    stopClockTimer,
    stopBurnInDrift: burnIn.stopBurnInDrift,
    stopWeatherRefresh: idle.stopWeatherRefresh,
    releaseWakeLock: wakeLock.releaseWakeLock,
    visible: idle.visible,
    clearIdleTimers: idle.clearIdleTimers,
    earthquakeStore,
    hideScreensaver: idle.hideScreensaver,
  })

  return {
    visible: idle.visible,
    mode: idle.mode,
    ssCfg: layout.ssCfg,
    overlayClass: layout.overlayClass,
    overlayDimStyle: layout.overlayDimStyle,
    layoutMetrics: layout.layoutMetrics,
    ssStyle: layout.ssStyle,
    shellStyle: layout.shellStyle,
    contentShellStyle: layout.contentShellStyle,
    siteTitle: clock.siteTitle,
    timeHour: clock.timeHour,
    timeMin: clock.timeMin,
    timeSec: clock.timeSec,
    dateWeek: clock.dateWeek,
    dateMD: clock.dateMD,
    dateYear: clock.dateYear,
    lunarFullLine: clock.lunarFullLine,
    lunarMonthDayLine: clock.lunarMonthDayLine,
    weatherIcon: weather.weatherIcon,
    weatherTemp: weather.weatherTemp,
    weatherDesc: weather.weatherDesc,
    weatherExtra: weather.weatherExtra,
    dismiss: idle.dismiss,
  }
}
