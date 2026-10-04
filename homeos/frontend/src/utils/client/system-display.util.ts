/**
 * 客户端系统信息展示文案
 *
 * 职责：从 systemInfo 推断设备形态（手机 / 平板 / 墙屏 / 电脑）、OS 标签、
 *   硬件规格芯片、电量状态；提供电量不可用的本地浏览器提示文案。
 * 依赖：无外部依赖，纯函数 + 常量。
 */

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
    (platform === 'MacIntel' &&
      touch &&
      /Macintosh/i.test(userAgent) &&
      !/iPhone|iPod/i.test(userAgent))
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
export function getClientSuggestedLabel(
  systemInfo: ClientSystemInfo | null | undefined,
  clientId: string = '',
) {
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
export function getSystemInfoFromClientRow(
  row: unknown,
): ClientSystemInfo | null {
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
  if (
    /iPhone|iPod|iPad/i.test(ua) ||
    (/Safari/i.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox/i.test(ua))
  ) {
    return BATTERY_HINT_SAFARI
  }
  return BATTERY_HINT_API
}