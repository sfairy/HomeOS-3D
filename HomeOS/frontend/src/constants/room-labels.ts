/**
 * 房间 area id → 中文显示名映射
 *
 * 职责：
 * - 供气候控制、照明、安防、户型图等多模块共用，统一房间文案来源。
 *
 * 依赖：@homeos/shared 中的 `resolveRoomLabel`（按 area_id 解析中文标签）。
 *
 * 注意：
 * - area_id 属于配置 key，不翻译。
 * - 仅面向用户的房间显示名使用简体中文。
 */
import { resolveRoomLabel } from '@homeos/shared'

/**
 * 根据 area_id 解析中文房间显示名。
 *
 * 委托 `resolveRoomLabel` 在默认房间目录中查找。
 *
 * @param room - HA area_id；为空时返回空字符串。
 * @returns 面向用户的中文房间名；未命中时由 `resolveRoomLabel` 兜底返回原始值。
 */
export function roomLabel(room: string | undefined | null): string {
  if (!room) return ''
  return resolveRoomLabel(room)
}
