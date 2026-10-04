/**
 * 面板 / 侧栏微件卡片高度工具
 *
 * 职责：
 * - 解析用户配置的微件卡片高度（兼容 number / "240" / "240px" 等输入形式）。
 * - 钳制到与设置页滑块 min/max 对齐的合法范围，避免越界值。
 * - 在侧栏场景下融合「自定义高度优先、否则回退类型预设」的解析逻辑
 *   （时钟回退 0 表示内容自适应）。
 *
 * 依赖：@/utils/registry/widget-registry-meta 提供微件类型规范化与默认高度查询。
 */
import {
  canonicalizeWidgetType,
  getSidebarWidgetDefaultHeight,
} from '@/utils/registry/widget-registry-meta'

/** 卡片高度下限（与设置页滑块对齐） */
const PANEL_CARD_HEIGHT_MIN = 60
/** 卡片高度上限（与设置页滑块对齐） */
const PANEL_CARD_HEIGHT_MAX = 600

/** 解析 cardHeight（兼容 number / "240" / "240px"） */
export function parsePanelCardHeightPx(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.round(raw)
  if (typeof raw === 'string') {
    const match = raw.trim().match(/^(-?\d+(?:\.\d+)?)/)
    if (match) return Math.round(Number(match[1]))
  }
  return 0
}

/** 夹到可保存的正高度；无效则返回 0（表示清除自定义） */
export function clampPanelCardHeightPx(raw: unknown): number {
  const n = parsePanelCardHeightPx(raw)
  if (!(n > 0)) return 0
  return Math.min(PANEL_CARD_HEIGHT_MAX, Math.max(PANEL_CARD_HEIGHT_MIN, n))
}

/**
 * 侧栏实际采用的卡片高度：有自定义用自定义，否则用类型预设。
 * 时钟无自定义时返回 0，保持内容自适应，避免裁切秒/日期行。
 */
export function resolveSidebarWidgetHeightPx(type: string, cardHeight: unknown): number {
  const custom = parsePanelCardHeightPx(cardHeight)
  if (custom > 0) return custom
  if (canonicalizeWidgetType(type) === 'clock') return 0
  return getSidebarWidgetDefaultHeight(type)
}
