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

export function coverIsMoving(state: string | null | undefined): boolean {
  return state != null && state !== 'closed' && state !== 'open'
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

/** 根据当前开合状态解析下一档 toggle 服务（列表行短按用） */
export function coverToggleService(state: string): 'open_cover' | 'close_cover' {
  const openStates = new Set(['open', 'opening'])
  return openStates.has(state) ? 'close_cover' : 'open_cover'
}
