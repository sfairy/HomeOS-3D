import { readLocalStorage, writeLocalStorage, randomUUID } from '@/kernel/utils/core'
import { probeDeviceProfile } from '@/kernel/utils/perf'
import { isTabletLikeViewport } from '@/kernel/utils/config/viewport-breakpoints.util'

/** 从 UA / 屏幕尺寸推断终端可读标签（绑定 display profile 时使用） */
export function inferTerminalLabel(): string {
  if (typeof navigator === 'undefined') return '未知终端'
  const ua = navigator.userAgent || ''
  const platform = navigator.platform || ''
  const width = typeof window !== 'undefined' ? window.innerWidth : 0

  let kind = '浏览器'
  if (/iPad/i.test(ua) || (platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1)) {
    kind = 'iPad'
  } else if (/Android/i.test(ua)) {
    kind = 'Android 平板'
  } else if (/iPhone/i.test(ua)) {
    kind = 'iPhone'
  } else if (/Windows/i.test(ua)) {
    kind = 'Windows'
  } else if (/Mac/i.test(platform)) {
    kind = 'Mac'
  }

  return width > 0 ? `${kind} · ${width}px` : kind
}

/** 客户端电量展示工具 */

/**
 * 终端电量百分比（0–100）。
 *
 * @param row 客户端行数据（含 systemInfo 或直接 level）
 * @returns 电量百分比整数；无数据或非有限值返回 null
 */
export function normalizeBatteryPercent(
  row: { systemInfo?: unknown; level?: number } | null | undefined,
): number | null {
  if (!row) return null
  const info = getSystemInfoFromClientRow(row) as { battery?: { level?: number } } | null
  const level = info?.battery?.level
  if (level == null || !Number.isFinite(level)) return null
  // 采集与后端均已统一为 0–100 百分比，无需再按 `<= 1` 启发式换算
  return Math.round(level)
}

/**
 * 按电量返回三段渐变色 [深 → 中 → 亮]。
 *
 * @param pct 电量百分比（0–100，会被夹取）
 * @param charging 是否充电中（充电时末段色切换为蓝 / 青）
 * @returns 三段色值数组 [深色, 中色, 亮色]
 */
function batteryBarPalette(pct: number, charging = false): [string, string, string] {
  const p = Math.max(0, Math.min(100, pct))
  let stops: [string, string, string]

  if (p <= 15) stops = ['#991b1b', '#dc2626', '#fb923c']
  else if (p <= 30) stops = ['#c2410c', '#ea580c', '#fbbf24']
  else if (p <= 45) stops = ['#b45309', '#f59e0b', '#fde047']
  else if (p <= 60) stops = ['#a16207', '#eab308', '#a3e635']
  else if (p <= 75) stops = ['#15803d', '#22c55e', '#4ade80']
  else if (p <= 90) stops = ['#047857', '#10b981', '#6ee7b7']
  else stops = ['#065f46', '#059669', '#34d399']

  if (charging) {
    stops = [stops[0], stops[1], p <= 45 ? '#38bdf8' : '#2dd4bf']
  }
  return stops
}

/**
 * 生成电量进度条的内联样式（三段渐变 + 多层光晕）。
 *
 * @param pct 电量百分比；null 时返回空对象（无样式）
 * @param charging 是否充电中
 * @returns CSS 属性对象（background / boxShadow）
 */
export function batteryBarStyle(pct: number | null, charging = false): Record<string, string> {
  if (pct == null) return {}
  const [c1, c2, c3] = batteryBarPalette(pct, charging)
  // 低电量 / 高电量时光晕更强，中间段较弱
  const glowStrength = pct <= 20 ? 0.48 : pct >= 75 ? 0.4 : 0.34
  return {
    background: `linear-gradient(90deg, ${c1} 0%, ${c2} 50%, ${c3} 100%)`,
    boxShadow: `0 0 18px color-mix(in srgb, ${c2} ${Math.round(glowStrength * 100)}%, transparent), 0 0 6px color-mix(in srgb, ${c3} 28%, transparent), inset 0 1px 0 rgba(255, 255, 255, 0.28)`,
  }
}

/**
 * 生成电量百分比标签的内联样式（颜色 + 字重 + 文本光晕）。
 *
 * @param pct 电量百分比；null 时返回空对象
 * @param charging 是否充电中
 * @returns CSS 属性对象（color / fontWeight / textShadow）
 */
export function batteryLabelStyle(pct: number | null, charging = false): Record<string, string> {
  if (pct == null) return {}
  const [, c2, c3] = batteryBarPalette(pct, charging)
  return {
    color: c3,
    fontWeight: pct <= 20 || pct >= 80 ? '700' : '600',
    textShadow: `0 0 12px color-mix(in srgb, ${c2} 50%, transparent)`,
  }
}

/**
 * 按电量返回进度条 CSS 类名（用于动画 / 状态样式）。
 *
 * @param pct 电量百分比；null 返回 unknown 类
 * @param low 低电量阈值（默认 20）
 * @param high 满电阈值（默认 80）
 * @returns CSS 类名字符串（charge-battery__fill--{unknown|low|mid|full}）
 */
export function batteryBarClass(pct: number | null, low?: number, high?: number): string {
  if (pct == null) return 'charge-battery__fill--unknown'
  if (pct < (low ?? 20)) return 'charge-battery__fill--low'
  if (pct >= (high ?? 80)) return 'charge-battery__fill--full'
  return 'charge-battery__fill--mid'
}

/** 客户端系统信息展示文案 */

/** 客户端设备形态枚举 */
type ClientDeviceKind = 'tablet' | 'phone' | 'desktop' | 'unknown'

/** 客户端 systemInfo 最小形状（display / platform / capabilities / hardware / battery） */
type ClientSystemInfo = {
  display?: {
    tabletLike?: boolean
    width?: number
    height?: number
  }
  platform?: {
    userAgent?: string
    platform?: string
  }
  capabilities?: {
    touch?: boolean
    standalone?: boolean
  }
  hardware?: {
    tier?: string
    cores?: number
    deviceMemory?: number
  }
  battery?: {
    supported?: boolean
    level?: number | null
    charging?: boolean | null
  }
  [key: string]: unknown
}

/**
 * 解析 UA / platform / touch 推断 OS 与设备形态标记。
 *
 * @param ua User-Agent 字符串
 * @param platformStr navigator.platform
 * @param touch 是否支持触控
 * @returns OS 标签与各平台布尔标记（isIPad / isIPhone / isAndroid / isWindows / isMac / isLinux / isMobileUA）
 */
function parseClientPlatform(ua: string | null | undefined, platformStr: string | null | undefined, touch: boolean) {
  const userAgent = String(ua || '')
  const platform = String(platformStr || '')

  // iPad OS 13+ 的 UA 与 Mac 一致，需结合 platform + touch 判定
  const isIPad =
    /iPad/i.test(userAgent) ||
    (platform === 'MacIntel' && touch && /Macintosh/i.test(userAgent) && !/iPhone|iPod/i.test(userAgent))
  const isIPhone = /iPhone|iPod/i.test(userAgent)
  const isAndroid = /Android/i.test(userAgent)
  const isAndroidPhone = isAndroid && /Mobile/i.test(userAgent)
  const isAndroidTablet = isAndroid && !isAndroidPhone
  const isWindows = /^Win/i.test(platform) || /Windows/i.test(userAgent)
  const isMac = !isIPad && (/^Mac/i.test(platform) || /Macintosh/i.test(userAgent))
  const isLinux = /Linux/i.test(platform) || (/Linux/i.test(userAgent) && !isAndroid)

  let os = ''
  if (isIPad) os = 'iPad'
  else if (isIPhone) os = 'iPhone'
  else if (isAndroidTablet) os = 'Android 平板'
  else if (isAndroidPhone) os = 'Android 手机'
  else if (isWindows) os = 'Windows'
  else if (isMac) os = 'macOS'
  else if (isLinux) os = 'Linux'
  else if (platform === 'Win32') os = 'Windows'
  else if (platform) os = platform

  return {
    os,
    isIPad,
    isIPhone,
    isAndroid,
    isAndroidPhone,
    isAndroidTablet,
    isWindows,
    isMac,
    isLinux,
    isMobileUA: /Mobi|Android/i.test(userAgent),
  }
}

/**
 * 综合 UA、触控与视口推断设备形态（避免大屏桌面浏览器被误判为墙屏）。
 *
 * @param systemInfo 客户端系统信息对象
 * @returns { kind, label, os, formHint } 设备形态枚举 + 可读标签 + OS + 形态提示
 */
function resolveClientDeviceIdentity(systemInfo: ClientSystemInfo | null | undefined) {
  if (!systemInfo || typeof systemInfo !== 'object') {
    return { kind: 'unknown' as const, label: '未知设备', os: '', formHint: '' }
  }

  const display = systemInfo.display || {}
  const platform = systemInfo.platform || {}
  const caps = systemInfo.capabilities || {}
  const touch = caps.touch === true
  const standalone = caps.standalone === true
  const parsed = parseClientPlatform(platform.userAgent, platform.platform, touch)

  if (parsed.isIPhone || parsed.isAndroidPhone) {
    return { kind: 'phone' as const, label: parsed.os || '手机', os: parsed.os, formHint: '手机' }
  }

  if (parsed.isIPad) {
    return { kind: 'tablet' as const, label: 'iPad', os: 'iPad', formHint: '平板' }
  }

  if (parsed.isAndroidTablet) {
    return { kind: 'tablet' as const, label: 'Android 平板', os: parsed.os, formHint: '平板' }
  }

  // Windows + 触控 + standalone → 墙屏；Windows + 触控 → 平板；否则桌面
  if (parsed.isWindows) {
    if (touch && standalone) {
      return { kind: 'tablet' as const, label: 'Windows 墙屏', os: 'Windows', formHint: '墙屏' }
    }
    if (touch) {
      return { kind: 'tablet' as const, label: 'Windows 平板', os: 'Windows', formHint: '平板' }
    }
    return { kind: 'desktop' as const, label: 'Windows 电脑', os: 'Windows', formHint: '电脑' }
  }

  if (parsed.isMac) {
    return { kind: 'desktop' as const, label: 'Mac', os: 'macOS', formHint: '电脑' }
  }

  if (parsed.isLinux) {
    return { kind: 'desktop' as const, label: 'Linux 终端', os: 'Linux', formHint: '电脑' }
  }

  // 通用触屏终端：tabletLike + standalone / 非 mobile UA → 墙屏
  if (touch && display.tabletLike && (standalone || !parsed.isMobileUA)) {
    return { kind: 'tablet' as const, label: '触屏终端', os: parsed.os, formHint: '墙屏' }
  }

  if (display.tabletLike && touch) {
    return {
      kind: 'tablet' as const,
      label: parsed.os ? `${parsed.os} 平板` : '平板',
      os: parsed.os,
      formHint: '平板',
    }
  }

  return {
    kind: 'desktop' as const,
    label: parsed.os ? `${parsed.os} 终端` : '桌面终端',
    os: parsed.os,
    formHint: '电脑',
  }
}
/**
 * 返回设备形态枚举（tablet / phone / desktop / unknown）。
 *
 * @param systemInfo 客户端系统信息对象
 * @returns 设备形态枚举
 */
export function getClientDeviceKind(systemInfo: ClientSystemInfo | null | undefined): ClientDeviceKind {
  return resolveClientDeviceIdentity(systemInfo).kind
}

/**
 * 返回设备形态的可读标签（如 "iPad" / "Windows 电脑"）。
 *
 * @param systemInfo 客户端系统信息对象
 * @returns 设备标签字符串
 */
export function getClientDeviceKindLabel(systemInfo: ClientSystemInfo | null | undefined) {
  return resolveClientDeviceIdentity(systemInfo).label
}

/**
 * 生成建议的终端标签（设备标签 · clientId）。
 *
 * @param systemInfo 客户端系统信息对象
 * @param clientId 客户端 id
 * @returns 形如 "iPad · abc123" 的标签；均缺失时返回 '未命名终端'
 */
export function getClientSuggestedLabel(systemInfo: ClientSystemInfo | null | undefined, clientId: string = '') {
  const { label } = resolveClientDeviceIdentity(systemInfo)
  const id = String(clientId || '').trim()
  if (label && id) return `${label} · ${id}`
  if (label) return label
  if (id) return `终端 · ${id}`
  return '未命名终端'
}

/**
 * 生成硬件规格芯片数组（性能等级 / 核心数 / 内存 / 分辨率）。
 *
 * @param systemInfo 客户端系统信息对象
 * @returns 芯片数组（key / label / tone）；systemInfo 无效时返回空数组
 */
export function getClientSystemSpecChips(systemInfo: ClientSystemInfo | null | undefined) {
  if (!systemInfo || typeof systemInfo !== 'object') return []
  const hw = (systemInfo.hardware || systemInfo) as {
    tier?: string
    cores?: number
    deviceMemory?: number
  }
  const display = systemInfo.display || {}
  const chips: Array<{ key: string; label: string; tone?: string }> = []

  if (hw.tier) {
    const tier = String(hw.tier).toLowerCase()
    const tone = tier === 'high' ? 'emerald' : tier === 'low' ? 'amber' : 'neutral'
    chips.push({ key: 'tier', label: `性能 ${hw.tier}`, tone })
  }
  if (hw.cores) chips.push({ key: 'cores', label: `${hw.cores} 核` })
  if (hw.deviceMemory != null) chips.push({ key: 'mem', label: `${hw.deviceMemory} GB 内存` })
  if (display.width && display.height) {
    chips.push({ key: 'res', label: `${display.width} × ${display.height}`, tone: 'sky' })
  }

  return chips
}

/**
 * 解析电量状态（百分比 + 充电中）。
 *
 * @param systemInfo 客户端系统信息对象
 * @returns { supported, percent, charging }；battery.supported 为假时 percent / charging 为 null
 */
export function getClientBatteryState(systemInfo: ClientSystemInfo | null | undefined) {
  const bat = systemInfo?.battery
  if (!bat?.supported) return { supported: false, percent: null, charging: null }
  const level = bat.level
  if (level == null || !Number.isFinite(level)) {
    return { supported: true, percent: null, charging: bat.charging ?? null }
  }
  // 采集与后端均已统一为 0–100 百分比，无需再按 `<= 1` 启发式换算
  const percent = Math.round(level)
  return { supported: true, percent, charging: bat.charging ?? null }
}

/**
 * 从客户端行数据中提取 systemInfo 对象。
 *
 * @param row 客户端行数据（含 systemInfo 字段）
 * @returns systemInfo 对象；row 无效或不含 systemInfo 时返回 null
 */
export function getSystemInfoFromClientRow(row: unknown): ClientSystemInfo | null {
  if (!row || typeof row !== 'object') return null
  const systemInfo = (row as { systemInfo?: unknown }).systemInfo
  if (systemInfo && typeof systemInfo === 'object') {
    return systemInfo as ClientSystemInfo
  }
  return null
}

/** HTTP 局域网访问时的电量不可用提示 */
const BATTERY_HINT_INSECURE = '当前为 HTTP 局域网访问，浏览器禁止读取电量，请改用 HTTPS 访问'
/** Safari / iOS 不支持 Battery API 的提示 */
const BATTERY_HINT_SAFARI = 'Safari / iOS 不支持 Battery API，无法采集电量'
/** 浏览器不支持电量 API 的通用提示 */
const BATTERY_HINT_API = '当前浏览器不支持电量 API'

/**
 * 本机浏览器环境下的电量不可用提示（设置页本机 ID 旁）。
 *
 * @returns 提示文案；电量 API 可用时返回空字符串
 */
export function getLocalBatteryUnsupportedHint() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return ''
  if (typeof navigator.getBattery === 'function' && window.isSecureContext) return ''
  if (!window.isSecureContext) return BATTERY_HINT_INSECURE
  const ua = navigator.userAgent || ''
  if (/iPhone|iPod|iPad/i.test(ua) || (/Safari/i.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox/i.test(ua))) {
    return BATTERY_HINT_SAFARI
  }
  return BATTERY_HINT_API
}

/** 打开前端的客户端系统信息采集（电量为其中一项） */


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
  return /iPhone|iPod|iPad/i.test(ua) || (/Safari/i.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox/i.test(ua))
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
      // 应用级单例监听：BatteryManager 是浏览器全局对象、上面 `if (!batteryManager)` 保证只注册一次，
      // 不存在「重复注册」也无人可摘（管理器活到页面结束），故不配对 removeEventListener。
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
  if (!refreshStatic && cachedStaticSystemInfo && now - cachedStaticSystemAt < STATIC_SYSTEM_CACHE_MS) {
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
  const coarsePointer = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true
  // standalone = PWA / 墙屏模式
  const standalone = typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches === true

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
      tabletLike: isTabletLikeViewport(width, height),
    },
    capabilities: {
      touch: coarsePointer || (nav?.maxTouchPoints ?? 0) > 0,
      standalone,
      serviceWorker: typeof nav?.serviceWorker !== 'undefined',
      reducedMotion:
        typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
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
