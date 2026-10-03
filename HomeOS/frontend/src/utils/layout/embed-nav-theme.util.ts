/**
 * 内嵌页导航主题色工具。
 *
 * 职责：按图标 key 或内嵌页序号解析 Tab 主题色（accent），并复用 embed-icons 的标签与配色。
 *
 * 依赖：@/utils/layout/embed-icons.util 提供图标 accent 与 label 映射。
 */
import { EMBED_ICON_ACCENTS } from '@/utils/layout/embed-icons.util'

/** 内嵌页列表序号 → Tab 主题色（按序循环） */
export const EMBED_TAB_ACCENTS = [
  '#22d3ee', // 0 青
  '#c084fc', // 1 紫
  '#4ade80', // 2 绿
  '#fbbf24', // 3 琥珀
  '#fb7185', // 4 玫红
  '#60a5fa', // 5 蓝
  '#fb923c', // 6 橙
  '#2dd4bf', // 7 蓝绿
]

/**
 * 按图标 key 解析主题色。
 * @param icon 图标 key，缺省回退 MonitorPlay
 * @returns 主题色，无匹配时回退首个 Tab 主题色
 */
export function resolveEmbedIconAccent(icon: string | null | undefined) {
  return EMBED_ICON_ACCENTS[icon || 'MonitorPlay'] || EMBED_TAB_ACCENTS[0]
}

/**
 * 按内嵌页序号解析 Tab 主题色。
 * @param _embed 内嵌页配置（暂未使用，保留以备扩展）
 * @param idx 内嵌页序号
 * @returns 主题色（按序循环）
 */
export function resolveEmbedTabAccent(_embed: unknown, idx: number) {
  return EMBED_TAB_ACCENTS[Math.max(0, idx) % EMBED_TAB_ACCENTS.length]
}

/**
 * 解析内嵌导航项的主题色（等价于按序号取 Tab 主题色）。
 * @param embed 内嵌页配置
 * @param idx 序号
 * @returns 主题色
 */
export function resolveEmbedNavAccent(embed: unknown, idx: number) {
  return resolveEmbedTabAccent(embed, idx)
}