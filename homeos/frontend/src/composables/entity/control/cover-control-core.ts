/**
 * 窗帘 / cover 控制核心（无 Vue）：能力位、动作错误文案、位置解析。
 * 栈 A CoverControlPopup 与未来栈 C·D 共用。
 */

import { clampInRange } from '@/utils/ui/progress-bar.util'

/** HA cover supported_features：bit 2 = SET_POSITION */
const COVER_SUPPORT_SET_POSITION = 4

const COVER_ACTION_ERRORS: Record<string, string> = {
  open_cover: '窗帘打开操作失败',
  close_cover: '窗帘关闭操作失败',
  stop_cover: '窗帘停止操作失败',
}

export function coverHasPositionControl(supportedFeatures: unknown): boolean {
  return (Number(supportedFeatures) & COVER_SUPPORT_SET_POSITION) !== 0
}

/**
 * 是否处于「运动中」（opening / closing）。
 *
 * 之前用「非 closed 且非 open 即为运动中」的反向判定，会把 `unavailable` / `unknown`
 * 也当成运动态：设备离线时 UI 永远显示运动中的进度动画并禁用控制。
 * 改为白名单判定，未知状态既不算运动态，也不参与 toggle 方向推断。
 */
export function coverIsMoving(state: string | null | undefined): boolean {
  return state === 'opening' || state === 'closing'
}

export function coverPositionFromAttributes(
  attributes: Record<string, unknown> | undefined,
  fallback = 50,
): number {
  const raw = attributes?.current_position
  const n = raw == null ? fallback : Number(raw)
  return clampInRange(Number.isFinite(n) ? n : fallback, 0, 100, fallback)
}

export function coverActionErrorMessage(action: string): string {
  return COVER_ACTION_ERRORS[action] || '窗帘操作失败'
}

const COVER_OPEN_STATES = new Set(['open', 'opening'])
const COVER_CLOSED_STATES = new Set(['closed', 'closing'])
/** 无有效开合信息的状态：不可用 / 未知 / 空，不可据此下发命令 */
const COVER_UNKNOWN_STATES = new Set(['unavailable', 'unknown', 'none', ''])

/**
 * 根据当前开合状态解析下一档 toggle 服务（列表行短按用）。
 * 返回 null 表示状态不可用/未知，调用方应跳过控制而不是对离线设备发命令。
 */
export function coverToggleService(state: string): 'open_cover' | 'close_cover' | null {
  if (state == null || COVER_UNKNOWN_STATES.has(state)) return null
  if (COVER_OPEN_STATES.has(state)) return 'close_cover'
  if (COVER_CLOSED_STATES.has(state)) return 'open_cover'
  return null
}
