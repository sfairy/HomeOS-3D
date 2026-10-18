/** 内嵌页导航主题色工具。 */
import { EMBED_ICON_ACCENTS } from '@/shared/utils/layout/embed-icons.util'

/** 内嵌页列表序号 → Tab 主题色（按序循环） */
export const EMBED_TAB_ACCENTS = [
  'var(--hos-color-accent)', // 0 暖铜
  'var(--hos-color-accent-strong)', // 1 亮铜
  'var(--hos-color-info)', // 2 青
  'var(--hos-color-accent-deep)', // 3 深铜
  'var(--hos-color-warning)', // 4 琥珀
  'var(--hos-color-accent-soft-strong)', // 5 浅铜
  'var(--hos-color-success)', // 6 绿
  'var(--hos-color-danger)', // 7 珊瑚
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