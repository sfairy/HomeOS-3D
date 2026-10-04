/**
 * @file useClientPowerReporter.ts
 * @module frontend/src/composables
 */
import { onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { fetchSystemConfig, reportClientPower } from '@/services/api/system'
import type { ApiRequestConfig } from '@/services/api/index'
import { useAuthStore } from '@/stores/auth.store'
import {
  buildClientSystemReport,
  ensureBatteryManager,
  onBatteryChange,
  readBatterySnapshotSync,
} from '@/utils/client/system.util'
import { logger } from '@/utils/core/logger'
import { isLicenseInactiveError } from '@/utils/core/error-message'
import { isLicenseGateOpen } from '@/router/license-gate'
import { schedulePoll } from '@/utils/core/poll-scheduler'

/**
 * 客户端电量与系统信息实时上报 composable
 *
 * 模块职责：
 *  - 在用户认证后启动客户端系统信息（电量、CPU、内存等）的周期性上报；
 *  - 监听电池变化与页面可见性，动态调整上报间隔；
 *  - 处理 401 鉴权失败时刷新会话并重试；
 *  - 多次失败后停止上报并警告。
 *
 * 依赖：
 *  - @/services/api/system（fetchSystemConfig 拉取配置 / reportClientPower 上报）；
 *  - @/stores/auth.store（判断认证状态、刷新会话）；
 *  - @/utils/client/client-system.util（构建上报 payload、BatteryManager 管理）；
 *  - axios（识别 401 错误）。
 */

/** 默认上报间隔（秒）：未拉取到后端配置时的回退值 */
const FALLBACK_INTERVAL_SEC = 10
/** 电池事件防抖时间（毫秒）：避免短时间内多次上报 */
const BATTERY_DEBOUNCE_MS = 400
/** 电池变化立即上报的阈值（百分比）：超过此变化量时跳过防抖立即上报 */
const BATTERY_IMMEDIATE_DELTA = 0.5
/** 页面隐藏时的上报间隔倍数：隐藏时降低上报频率 */
const HIDDEN_INTERVAL_MULT = 2
/** 完整静态信息刷新间隔（毫秒）：5 分钟刷新一次设备静态信息 */
const FULL_PROFILE_REFRESH_MS = 5 * 60 * 1000
/** 静默请求配置：401 时不触发全局认证跳转，由本 composable 自行处理 */
const SILENT_REQUEST: ApiRequestConfig = { skipAuthRedirect: true }

/** 是否已启动上报（避免重复启动） */
let started = false
/** 周期上报任务的取消函数（经全局调度器驱动） */
let intervalCancel: (() => void) | null = null
/** 电池事件防抖定时器 ID */
let batteryDebounceId: ReturnType<typeof setTimeout> | null = null
/** 完整静态信息刷新任务的取消函数（经全局调度器驱动） */
let fullProfileCancel: (() => void) | null = null
/** 页面是否隐藏（影响上报间隔） */
let hidden = false
/** 当前上报间隔（秒） */
let intervalSec = FALLBACK_INTERVAL_SEC
/** 上一次上报的电池百分比（用于判断变化量） */
let lastReportedLevelPct: number | null = null
/** 是否正在上报中（避免并发上报） */
let reporting = false
/** 连续上报失败次数 */
let reportFailStreak = 0
/** 是否已警告过多次失败（避免日志刷屏） */
let reportFailWarned = false

/**
 * 计算电池百分比。
 * readBatterySnapshot 已在采集时把 Battery API 的 0–1 比例换算为 0–100 百分比，
 * 此处仅做一位小数舍入。
 * @param battery 电池快照对象
 * @returns 0~100 的百分比；无数据时返回 null
 */
function batteryLevelPercent(battery: { level?: number | null } | null) {
  if (!battery || battery.level == null) return null
  return Math.round(battery.level * 10) / 10
}

/**
 * 拉取后端配置中的上报间隔。
 * 后端可通过 clientPower.reportIntervalSec 覆盖默认间隔（最小 5 秒）。
 * @returns 上报间隔（秒）；失败时回退到 FALLBACK_INTERVAL_SEC
 */
async function loadReportIntervalSec() {
  try {
    const { data } = await fetchSystemConfig(SILENT_REQUEST)
    const sec = Number(data?.clientPower?.reportIntervalSec)
    if (Number.isFinite(sec) && sec >= 5) return sec
  } catch {
    // 使用本地回退
  }
  return FALLBACK_INTERVAL_SEC
}
/**
 * 执行一次客户端系统上报。
 *
 * 流程：
 *  1. 通过 buildClientSystemReport 构建 payload（可选刷新静态信息）；
 *  2. 调用 reportClientPower 上报；
 *  3. 记录电池百分比；重置失败计数。
 *
 * 错误处理：
 *  - 401 时尝试 refreshSession 并重试一次；
 *  - refreshSession 失败则停止上报并警告（提示用户使用相同 URL 协议重新登录）；
 *  - 其他错误累计失败计数，达到 3 次时警告一次。
 *
 * @param opts.refreshStatic 是否刷新静态信息（CPU/内存等）
 * @param opts.retryAuth      401 时是否尝试刷新会话重试
 */
async function postReport({
  refreshStatic = false,
  retryAuth = true,
}: { refreshStatic?: boolean; retryAuth?: boolean } = {}) {
  if (reporting) return
  reporting = true
  try {
    const payload = await buildClientSystemReport({ refreshStatic })
    await reportClientPower(payload, SILENT_REQUEST)
    const pct = batteryLevelPercent(payload?.systemInfo?.battery)
    if (pct != null) lastReportedLevelPct = pct
    reportFailStreak = 0
    reportFailWarned = false
  } catch (err) {
    if (isLicenseInactiveError(err)) {
      stopReporter()
      logger.debug('商业授权未激活,已停止客户端系统上报')
      return
    }
    if (retryAuth && axios.isAxiosError(err) && err.response?.status === 401) {
      try {
        await useAuthStore().refreshSession()
        reporting = false
        await postReport({ refreshStatic, retryAuth: false })
        return
      } catch {
        stopReporter()
        logger.warn(
          '客户端系统上报未授权,已停止上报;请使用相同 URL 协议重新登录(建议使用 https://:8443).',
          err,
        )
        return
      }
    }

    reportFailStreak += 1
    if (reportFailStreak >= 3 && !reportFailWarned) {
      reportFailWarned = true
      logger.warn('客户端系统上报多次失败', err)
    } else {
      logger.debug('客户端系统上报失败', err)
    }
  } finally {
    reporting = false
  }
}

/** 清理周期上报任务 */
function clearTimer() {
  if (intervalCancel != null) {
    intervalCancel()
    intervalCancel = null
  }
}

/** 清理静态信息刷新任务 */
function clearFullProfileTimer() {
  if (fullProfileCancel != null) {
    fullProfileCancel()
    fullProfileCancel = null
  }
}

/**
 * 调度周期上报任务。
 *  - 间隔最小 5 秒；
 *  - 页面隐藏时按 HIDDEN_INTERVAL_MULT 倍数延长间隔；
 *  - 每次触发调用 postReport。
 * @param sec 基础间隔（秒）
 */
function scheduleInterval(sec: number) {
  clearTimer()
  const ms = Math.max(5, sec) * 1000 * (hidden ? HIDDEN_INTERVAL_MULT : 1)
  // 客户端电源上报属后台常驻服务，页面隐藏时仍需按周期上报（visibilityAware:false）
  intervalCancel = schedulePoll('client-power:report', () => {
    void postReport()
  }, ms, { visibilityAware: false })
}

/**
 * 页面可见性变化回调。
 *  - 更新 hidden 标志；
 *  - 重新调度间隔；
 *  - 从隐藏恢复到可见时立即触发一次上报（含静态信息刷新）。
 */
function onVisibilityChange() {
  const wasHidden = hidden
  hidden = typeof document !== 'undefined' && document.hidden
  scheduleInterval(intervalSec)
  if (wasHidden && !hidden) {
    void postReport({ refreshStatic: true })
  }
}

/**
 * 电池事件回调。
 *  - 计算电池百分比变化量；
 *  - 变化 >= BATTERY_IMMEDIATE_DELTA 时立即上报（跳过防抖）；
 *  - 否则按 BATTERY_DEBOUNCE_MS 防抖后上报。
 */
function onBatteryEvent() {
  const battery = readBatterySnapshotSync()
  const pct = batteryLevelPercent(battery)
  const delta =
    pct != null && lastReportedLevelPct != null
      ? Math.abs(pct - lastReportedLevelPct)
      : BATTERY_IMMEDIATE_DELTA
  if (batteryDebounceId != null) {
    clearTimeout(batteryDebounceId)
    batteryDebounceId = null
  }
  if (delta >= BATTERY_IMMEDIATE_DELTA) {
    void postReport()
    return
  }
  batteryDebounceId = setTimeout(() => {
    batteryDebounceId = null
    void postReport()
  }, BATTERY_DEBOUNCE_MS)
}
/**
 * 启动客户端系统上报。
 *  1. 拉取后端配置的上报间隔；
 *  2. 初始化 BatteryManager；
 *  3. 立即触发一次完整上报（含静态信息）；
 *  4. 调度周期上报与静态信息刷新；
 *  5. 监听页面可见性变化。
 * 已启动时直接返回（幂等）。
 */
async function startReporter() {
  if (started || typeof window === 'undefined') return
  started = true
  intervalSec = await loadReportIntervalSec()
  await ensureBatteryManager()
  void postReport({ refreshStatic: true })
  scheduleInterval(intervalSec)
  clearFullProfileTimer()
  // 完整静态信息（CPU/内存等）刷新周期 5 分钟，同样后台常驻（visibilityAware:false）
  fullProfileCancel = schedulePoll(
    'client-power:full-profile',
    () => {
      void postReport({ refreshStatic: true })
    },
    FULL_PROFILE_REFRESH_MS,
    { visibilityAware: false },
  )
  document.addEventListener('visibilitychange', onVisibilityChange)
}

/**
 * 停止客户端系统上报。
 *  - 清理所有定时器；
 *  - 重置电池百分比与失败计数；
 *  - 移除可见性监听。
 */
function stopReporter() {
  if (!started) return
  started = false
  clearTimer()
  clearFullProfileTimer()
  if (batteryDebounceId != null) {
    clearTimeout(batteryDebounceId)
    batteryDebounceId = null
  }
  lastReportedLevelPct = null
  reportFailStreak = 0
  reportFailWarned = false
  document.removeEventListener('visibilitychange', onVisibilityChange)
}

/**
 * 认证后启动客户端电量实时监测与上报 composable。
 *
 * 监听认证状态：
 *  - 已认证且非访客 → 启动上报；
 *  - 否则 → 停止上报。
 *
 * 在组件挂载时绑定电池事件监听，卸载时解绑并停止上报。
 */
export function useClientPowerReporter() {
  const authStore = useAuthStore()
  const route = useRoute()
  let offBattery: (() => void) | null = null

  onMounted(() => {
    offBattery = onBatteryChange(onBatteryEvent)
  })

  onUnmounted(() => {
    offBattery?.()
    stopReporter()
  })

  watch(
    () =>
      isLicenseGateOpen() &&
      authStore.isAuthenticated &&
      !authStore.isGuest() &&
      route.name !== 'activation' &&
      route.name !== 'setup' &&
      route.name !== 'login',
    (shouldReport) => {
      if (shouldReport) {
        void startReporter()
      } else {
        stopReporter()
      }
    },
    { immediate: true },
  )
}