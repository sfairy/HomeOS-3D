/**
 * 设置页 Tab emoji 图标工具
 *
 * 职责：
 * - 维护安防模式 Tab 的 emoji 映射（按 HA alarm state 取图标）。
 * - 维护家庭模式 Tab 的 emoji 映射（兼容 lucide key 与旧 emoji 配置）。
 * - 转发 @homeos/shared 的房间 Tab emoji 解析。
 *
 * 依赖：@homeos/shared 的 roomTabEmoji。
 *
 * 注意：
 * - 对象 key（armed_away / door-open / moon ...）为 HA state 或 lucide 图标 key，
 *   属于配置 key，不翻译。
 * - value 为 emoji 字符，不翻译。
 */

import { roomTabEmoji as sharedRoomTabEmoji } from '@homeos/shared'

/** 安防模式 Tab emoji：key 为 HA alarm_control_panel state */
const SECURITY_MODE_TAB_EMOJI: Record<string, string> = {
  armed_away: '🛡️',
  armed_home: '🏠',
  armed_night: '🌙',
  disarmed: '🔓',
  emergency: '🆘',
}

/** 家庭模式 lucide key / 旧配置 → emoji */
const HOME_MODE_TAB_EMOJI: Record<string, string> = {
  '🏠': '🏠',
  '🚪': '🚪',
  '🌙': '🌙',
  '🎬': '🎬',
  '🍽': '🍽️',
  '🌴': '🌴',
  '🚗': '🚗',
  'door-open': '🚪',
  'door-closed': '🚪',
  moon: '🌙',
  film: '🎬',
  utensils: '🍽️',
  palmtree: '🌴',
  users: '👥',
  vacuum: '🤖',
  home: '🏠',
}

/**
 * 环境房间 Tab emoji：转发 @homeos/shared 的 roomTabEmoji。
 *
 * @param roomId 房间 area_id
 * @returns 对应的房间 emoji 字符
 */
export function envRoomTabEmoji(roomId: string) {
  return sharedRoomTabEmoji(roomId)
}

/**
 * 解析家庭模式 Tab emoji：优先查映射表，未命中回退「🏠」。
 *
 * @param icon 输入图标配置（lucide key 或已有 emoji）
 * @returns 对应的 emoji 字符
 */
export function resolveHomeModeTabEmoji(icon: string | null | undefined) {
  const raw = String(icon || '🏠').trim()
  if (HOME_MODE_TAB_EMOJI[raw]) return HOME_MODE_TAB_EMOJI[raw]
  return '🏠'
}

/**
 * 解析安防模式 Tab emoji：按 HA alarm state 查表，未命中回退「🛡️」。
 *
 * @param key 安防模式 key（armed_away / disarmed / ...）
 * @returns 对应的 emoji 字符
 */
export function securityModeTabEmoji(key: string) {
  return SECURITY_MODE_TAB_EMOJI[key] || '🛡️'
}
