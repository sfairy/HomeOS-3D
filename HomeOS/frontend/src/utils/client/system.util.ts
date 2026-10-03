/**
 * 打开前端的客户端系统信息采集（电量为其中一项）
 *
 * 所属模块：客户端 / 系统信息采集
 * 职责：采集本机浏览器环境下的硬件 / 平台 / 显示 / 能力 / 网络 / 电量信息；
 *   管理 Battery API 的初始化与事件监听；构建上报 payload（含 clientId + systemInfo + reportToken）。
 * 依赖：adaptive-perf.util（设备画像）、viewport-breakpoints.util（视口形态判定）。
 */
import { readLocalStorage, writeLocalStorage } from '@/utils/core/local-storage.util'

import { probeDeviceProfile } from '@/utils/perf/adaptive-perf.util'
import { isPhoneViewport, isTabletLikeViewport } from '@/utils/config/viewport-breakpoints.util'
import { randomUUID } from '@/utils/core/random-uuid.util'

/** localStorage key：客户端设备 id */
const CLIENT_DEVICE_ID_KEY = 'homeos_client_device_id'

/** Battery API 管理器最小形状（level / charging / 时间 + 事件监听） */
type BatteryManagerLike = {
  level: number
  charging: boolean
  chargingTime: number
  dischargingTime: number
  addEventListener: (type: string, listener: () => void) => void
}

/** 已初始化的 Battery 管理器实例（null 表示未初始化或不可用） */
let batteryManager: BatteryManagerLike | null = null
/** Battery 初始化 Promise（防止并发重复初始化） */
let batteryInitPromise: Promise<BatteryManagerLike | null> | null = null
/** @type {Set<() => void>} 电量变化回调集合 */
const batteryListeners = new Set<() => void>()

/** 静态系统信息缓存（电量等动态字段不缓存） */
let cachedStaticSystemInfo: Record<string, unknown> | null = null
/** 静态信息缓存时间戳 */
let cachedStaticSystemAt = 0
/** 静态信息缓存有效期（5 分钟） */
const STATIC_SYSTEM_CACHE_MS = 5 * 60 * 1000

/**
 * 获取或创建稳定的客户端 ID（持久化到 localStorage）。
 *
 * @returns 客户端 UUID；localStorage 不可用时返回临时 UUID
 */
export function getClientDeviceId() {
  if (typeof localStorage === 'undefined') return randomUUID()
  let id = readLocalStorage(CLIENT_DEVICE_ID_KEY)
  if (!id) {
    id = randomUUID()
    writeLocalStorage(CLIENT_DEVICE_ID_KEY, id)
  }
  return id
}

/**
 * 读取系统配色方案偏好（dark / light / unknown）。
 *
 * @returns 配色方案字符串；matchMedia 不可用时返回 'unknown'
 */
function readColorScheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'unknown'
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
  if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light'
  return 'unknown'
}

/**
 * 读取网络连接信息（effectiveType / downlink / rtt / saveData）。
 *
 * @returns 网络信息对象；navigator.connection 不可用时返回 null
 */
function readNetworkInfo() {
  const conn = typeof navigator !== 'undefined' ? navigator.connection : null
  if (!conn) return null
  return {
    effectiveType: conn.effectiveType || null,
    downlink: typeof conn.downlink === 'number' ? conn.downlink : null,
    rtt: typeof conn.rtt === 'number' ? conn.rtt : null,
    saveData: conn.saveData === true,
  }
}
/**
 * 预初始化 Battery API 并注册事件（登录后尽早调用）。
 * 使用 Promise 缓存防止并发重复初始化。
 *
 * @returns Battery 管理器实例（可能为 null 表示不可用）
 */
export function ensureBatteryManager() {
  if (batteryInitPromise) return batteryInitPromise
  batteryInitPromise = (async () => {
    await probeBattery()
    return batteryManager
  })()
  return batteryInitPromise
}

/**
 * 同步读取已初始化的电量快照（未初始化时返回 null）。
 *
 * @returns 电量快照对象或 null
 */
export function readBatterySnapshotSync() {
  if (!batteryManager) return null
  return readBatterySnapshot(batteryManager)
}

/**
 * 判断 UA 是否为 Safari / iOS（这些浏览器不支持 Battery API）。
 *
 * @param ua User-Agent 字符串
 * @returns true 表示疑似 Safari / iOS
 */
function isSafariLikeUa(ua = '') {
  return (
    /iPhone|iPod|iPad/i.test(ua) ||
    (/Safari/i.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox/i.test(ua))
  )
}

/**
 * 推断 Battery API 不可用的原因（用于 UI 提示）。
 *
 * @returns 原因字符串（'api-unavailable' / 'insecure-context' / 'safari'）；可用时返回 null
 */
function detectBatteryUnsupportedReason() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'api-unavailable'
  if (!window.isSecureContext) return 'insecure-context'
  if (typeof navigator.getBattery !== 'function') {
    return isSafariLikeUa(navigator.userAgent || '') ? 'safari' : 'api-unavailable'
  }
  return null
}

/**
 * 构建电量不可用的快照对象。
 *
 * @param reason 不可用原因
 * @returns supported=false 的快照，含 unsupportedReason
 */
function unsupportedBatterySnapshot(reason: string | null) {
  return {
    supported: false,
    level: null,
    charging: null,
    chargingTime: null,
    dischargingTime: null,
    unsupportedReason: reason,
  }
}

/**
 * 探测 Battery API 并读取快照。不可用时返回带原因的 unsupported 快照；
 *   可用时初始化管理器并注册 levelchange / chargingchange 等事件。
 *
 * @returns {Promise<{ supported, level, charging, chargingTime, dischargingTime, unsupportedReason? }>}
 */
async function probeBattery() {
  const unsupportedReason = detectBatteryUnsupportedReason()
  if (unsupportedReason) {
    return unsupportedBatterySnapshot(unsupportedReason)
  }
  try {
    if (!batteryManager) {
      batteryManager = (await navigator.getBattery!()) as BatteryManagerLike
      // 注册事件后所有电量变化统一通知回调集合
      const notify = () => {
        for (const fn of batteryListeners) fn()
      }
      batteryManager.addEventListener('levelchange', notify)
      batteryManager.addEventListener('chargingchange', notify)
      batteryManager.addEventListener('chargingtimechange', notify)
      batteryManager.addEventListener('dischargingtimechange', notify)
    }
    return readBatterySnapshot(batteryManager)
  } catch {
    batteryManager = null
    return unsupportedBatterySnapshot('api-unavailable')
  }
}

/**
 * 从 Battery 管理器读取当前快照。
 *
 * @param mgr Battery 管理器实例
 * @returns supported=true 的快照对象
 */
function readBatterySnapshot(mgr: BatteryManagerLike) {
  return {
    supported: true,
    // Battery API 的 level 是 0–1 比例，此处统一换算为 0–100 百分比后再上报，
    // 与后端 DTO `@Max(100)` 契约一致，消除整数 1% 被误判为 100% 的歧义
    level: typeof mgr.level === 'number' ? Math.round(mgr.level * 1000) / 10 : null,
    charging: typeof mgr.charging === 'boolean' ? mgr.charging : null,
    chargingTime: Number.isFinite(mgr.chargingTime) ? mgr.chargingTime : null,
    dischargingTime: Number.isFinite(mgr.dischargingTime) ? mgr.dischargingTime : null,
  }
}

/**
 * 注册电量变化回调。
 *
 * @param handler 回调函数
 * @returns 取消注册函数（调用即从集合移除）
 */
export function onBatteryChange(handler: () => void) {
  batteryListeners.add(handler)
  return () => batteryListeners.delete(handler)
}
/**
 * 采集完整客户端系统信息（电量嵌套在 battery 字段）。
 * 静态信息（硬件 / 平台 / 显示 / 能力 / 网络）缓存 5 分钟，refreshStatic 强制刷新。
 *
 * @param options.refreshStatic 是否强制刷新静态信息（忽略缓存）
 * @returns {Promise<Record<string, unknown> & { battery, reportedAt }>} 含 battery 与 reportedAt 的完整系统信息
 */
async function probeClientSystemInfo({ refreshStatic = false }: { refreshStatic?: boolean } = {}) {
  const battery = batteryManager ? readBatterySnapshot(batteryManager) : await probeBattery()
  const now = Date.now()
  // 静态信息命中缓存时直接返回（电量仍取最新）
  if (
    !refreshStatic &&
    cachedStaticSystemInfo &&
    now - cachedStaticSystemAt < STATIC_SYSTEM_CACHE_MS
  ) {
    return {
      ...cachedStaticSystemInfo,
      battery,
      reportedAt: new Date().toISOString(),
    }
  }

  const hw = probeDeviceProfile()
  const width = typeof window !== 'undefined' ? window.innerWidth : 0
  const height = typeof window !== 'undefined' ? window.innerHeight : 0
  const nav = typeof navigator !== 'undefined' ? navigator : null
  const ua = nav?.userAgent || ''
  // coarse pointer = 触控主导设备
  const coarsePointer =
    typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true
  // standalone = PWA / 墙屏模式
  const standalone =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(display-mode: standalone)').matches === true

  const staticInfo: Record<string, unknown> = {
    hardware: {
      cores: hw.cores,
      deviceMemory: hw.deviceMemory,
      tier: hw.tier,
      tierReason: hw.reason,
    },
    platform: {
      userAgent: ua,
      platform: nav?.platform || '',
      language: nav?.language || '',
      vendor: nav?.vendor || '',
      mobile: /Mobi|Android/i.test(ua),
    },
    display: {
      width,
      height,
      screenWidth: typeof screen !== 'undefined' ? screen.width : 0,
      screenHeight: typeof screen !== 'undefined' ? screen.height : 0,
      pixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
      colorScheme: readColorScheme(),
      phoneLike: isPhoneViewport(width, height),
      tabletLike: isTabletLikeViewport(width, height),
    },
    capabilities: {
      touch: coarsePointer || (nav?.maxTouchPoints ?? 0) > 0,
      standalone,
      serviceWorker: typeof nav?.serviceWorker !== 'undefined',
      reducedMotion:
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
    },
    network: readNetworkInfo(),
  }
  cachedStaticSystemInfo = staticInfo
  cachedStaticSystemAt = now

  return {
    ...staticInfo,
    battery,
    reportedAt: new Date().toISOString(),
  }
}

/**
 * 构建上报 payload：系统信息为主，电量在 systemInfo.battery 内。
 * 正式密钥走 Cookie `homeos_cprt`。
 */
export async function buildClientSystemReport(options: { refreshStatic?: boolean } = {}) {
  const clientId = getClientDeviceId()
  const systemInfo = await probeClientSystemInfo(options)
  return {
    clientId,
    systemInfo,
  }
}