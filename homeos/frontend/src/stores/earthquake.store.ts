/**
 * 地震预警状态管理 Store
 *
 * 职责：
 * - EEW early：全屏倒计时 + 滑动解锁
 * - confirmation / CENC：平静公报弹层 + 轻量关闭
 * - 同震去重：EEW 响应后 30 分钟内抑制同震公报弹层
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { EarthquakeAlertPayload } from '@/types/earthquake'
import { haversineDistanceKm, refineAlertCountdown } from '@homeos/shared'
import { syncEarthquakeDismiss } from '@/utils/earthquake/util'
import { useLayoutStore } from '@/stores/layout.store'
import { schedulePoll } from '@/utils/core/poll-scheduler'

/** 自动关闭延迟（毫秒）：预警弹出 60 秒后若用户未操作则自动关闭 */
const AUTO_DISMISS_MS = 60_000
/** 同震 EEW 响应后抑制 CENC 公报的窗口 */
const CENC_SUPPRESS_AFTER_EEW_MS = 30 * 60_000
/** 同震指纹：时间窗 / 距离 / 震级差（与后端跨源去重同量级） */
const SAME_QUAKE_TIME_WINDOW_SEC = 120
const SAME_QUAKE_DIST_KM = 50
const SAME_QUAKE_MAG_DELTA = 0.5

type EewResponseFingerprint = {
  eventId: string
  originTime: number
  latitude: number
  longitude: number
  magnitude: number
  respondedAt: number
}

function matchesSameQuake(
  payload: EarthquakeAlertPayload,
  fp: EewResponseFingerprint,
): boolean {
  if (fp.eventId && payload.eventId && fp.eventId === payload.eventId) return true
  const dtSec = Math.abs(Number(payload.originTime) - fp.originTime) / 1000
  if (dtSec > SAME_QUAKE_TIME_WINDOW_SEC) return false
  if (Math.abs(Number(payload.magnitude) - fp.magnitude) > SAME_QUAKE_MAG_DELTA) return false
  const dist = haversineDistanceKm(
    Number(payload.latitude),
    Number(payload.longitude),
    fp.latitude,
    fp.longitude,
  )
  return dist <= SAME_QUAKE_DIST_KM
}

export const useEarthquakeStore = defineStore('earthquake', () => {
  const isAlerting = ref(false)
  const isDismissed = ref(false)
  const showOverlay = ref(false)
  const dismissedEventId = ref<string | null>(null)
  const activeEvent = ref<EarthquakeAlertPayload | null>(null)
  const currentCountdown = ref(0)
  const elapsedShaking = ref(0)

  /** 台网核定速报 / 确认通报弹层 */
  const showCencBulletin = ref(false)
  const cencEvent = ref<EarthquakeAlertPayload | null>(null)
  /** EEW 已响应指纹（用于 30 分钟内抑制同震 CENC 弹层） */
  const eewResponseFingerprints = ref<EewResponseFingerprint[]>([])

  let tickCancel: (() => void) | null = null
  let autoDismissTimer: ReturnType<typeof setTimeout> | null = null

  const displayCountdown = computed(() => {
    const val = currentCountdown.value
    if (val <= 0) return 0
    return Math.ceil(val)
  })

  const hasArrived = computed(() => currentCountdown.value <= 0)

  const statusText = computed(() => {
    if (hasArrived.value) return '横波已到达，避险中'
    return 'S波横波即将到达'
  })

  const timerDisplay = computed(() => {
    if (currentCountdown.value > 0) return Math.max(0, Math.round(currentCountdown.value))
    return Math.round(elapsedShaking.value)
  })

  const countdownUrgent = computed(() => currentCountdown.value > 0 && currentCountdown.value <= 10)

  function clearTimers() {
    if (tickCancel) {
      tickCancel()
      tickCancel = null
    }
    if (autoDismissTimer) {
      clearTimeout(autoDismissTimer)
      autoDismissTimer = null
    }
  }

  function rememberEewResponse(payload: EarthquakeAlertPayload) {
    const fp: EewResponseFingerprint = {
      eventId: String(payload.eventId || ''),
      originTime: Number(payload.originTime) || Date.now(),
      latitude: Number(payload.latitude) || 0,
      longitude: Number(payload.longitude) || 0,
      magnitude: Number(payload.magnitude) || 0,
      respondedAt: Date.now(),
    }
    const cutoff = Date.now() - CENC_SUPPRESS_AFTER_EEW_MS
    eewResponseFingerprints.value = [
      ...eewResponseFingerprints.value.filter((r) => r.respondedAt >= cutoff),
      fp,
    ].slice(-12)
  }

  function shouldSuppressCencBulletin(payload: EarthquakeAlertPayload): boolean {
    const cutoff = Date.now() - CENC_SUPPRESS_AFTER_EEW_MS
    return eewResponseFingerprints.value.some(
      (fp) => fp.respondedAt >= cutoff && matchesSameQuake(payload, fp),
    )
  }

  function syncAlertVisibility() {
    if (!activeEvent.value || isEventDismissed(activeEvent.value.eventId)) return
    if (!showOverlay.value) {
      isAlerting.value = true
      showOverlay.value = true
    }
  }

  function startTicking(payload: EarthquakeAlertPayload) {
    clearTimers()

    const tick = () => {
      const layoutStore = useLayoutStore()
      const cfg = layoutStore.layoutConfig?.earthquakeConfig
      const lat = cfg?.latitude ? Number(cfg.latitude) : NaN
      const lon = cfg?.longitude ? Number(cfg.longitude) : NaN

      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        const refined = refineAlertCountdown(payload, lat, lon)
        currentCountdown.value = refined.countdown
        if (activeEvent.value) {
          activeEvent.value = {
            ...activeEvent.value,
            distance: refined.distance,
            localIntensity: refined.localIntensity,
            countdown: refined.countdown,
          }
        }
      } else {
        const elapsed = (Date.now() - payload.originTime) / 1000
        const initial = payload.countdown ?? 0
        currentCountdown.value = initial - elapsed
      }

      if (currentCountdown.value <= 0) {
        elapsedShaking.value = Math.max(0, Math.floor(Math.abs(currentCountdown.value)))
      } else {
        elapsedShaking.value = 0
      }

      syncAlertVisibility()
    }

    tick()
    tickCancel = schedulePoll('earthquake:countdown', tick, 1000)

    autoDismissTimer = setTimeout(() => {
      if (isAlerting.value && !isDismissed.value) dismissAlert(activeEvent.value?.eventId)
    }, AUTO_DISMISS_MS)
  }

  function isEventDismissed(eventId: string | null | undefined): boolean {
    return Boolean(eventId && dismissedEventId.value === eventId)
  }

  function triggerAlert(payload: EarthquakeAlertPayload) {
    const eventId = String(payload.eventId || '').trim()
    if (!eventId) return
    if (isEventDismissed(eventId)) return

    // 确认通报走公报弹层，不全屏倒计时
    if (payload.alertKind === 'confirmation') {
      triggerConfirmation(payload)
      return
    }

    const sameEvent =
      activeEvent.value?.eventId === eventId && (isAlerting.value || showOverlay.value)

    if (sameEvent) {
      activeEvent.value = { ...activeEvent.value, ...payload, eventId }
      startTicking(payload)
      rememberEewResponse(payload)
      return
    }

    dismissedEventId.value = null
    isDismissed.value = false
    activeEvent.value = { ...payload, eventId }
    currentCountdown.value = payload.countdown ?? 0
    elapsedShaking.value = 0

    isAlerting.value = true
    showOverlay.value = true
    rememberEewResponse(payload)

    startTicking(payload)
  }

  /**
   * 台网核定速报 / 迟到确认：平静公报弹层。
   * 若 30 分钟内已对同震响应过 EEW，则抑制弹层（通知仍可由后端下发）。
   */
  function triggerConfirmation(payload: EarthquakeAlertPayload) {
    const eventId = String(payload.eventId || '').trim()
    if (!eventId) return
    if (shouldSuppressCencBulletin(payload)) return

    cencEvent.value = {
      ...payload,
      eventId,
      alertKind: 'confirmation',
    }
    showCencBulletin.value = true
  }

  function dismissCencBulletin() {
    showCencBulletin.value = false
    cencEvent.value = null
  }

  function dismissAlert(eventId?: string | null) {
    const resolvedEventId = String(eventId || activeEvent.value?.eventId || '').trim()
    if (resolvedEventId) dismissedEventId.value = resolvedEventId
    if (activeEvent.value) rememberEewResponse(activeEvent.value)
    isDismissed.value = true
    isAlerting.value = false
    showOverlay.value = false
    clearTimers()
    syncEarthquakeDismiss(resolvedEventId)
  }

  function reset() {
    clearTimers()
    isAlerting.value = false
    isDismissed.value = false
    showOverlay.value = false
    dismissedEventId.value = null
    activeEvent.value = null
    currentCountdown.value = 0
    elapsedShaking.value = 0
    showCencBulletin.value = false
    cencEvent.value = null
    eewResponseFingerprints.value = []
  }

  return {
    isAlerting,
    isDismissed,
    showOverlay,
    isEventDismissed,
    activeEvent,
    currentCountdown,
    elapsedShaking,
    displayCountdown,
    hasArrived,
    statusText,
    timerDisplay,
    countdownUrgent,
    showCencBulletin,
    cencEvent,
    triggerAlert,
    triggerConfirmation,
    dismissAlert,
    dismissCencBulletin,
    reset,
  }
})
