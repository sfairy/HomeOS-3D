/**
 * Display profile 维度的部件过滤工具
 *
 * 职责：
 * - 维护各 display profile 允许的侧栏 widget 类型白名单（未列出的 profile 不限制）。
 * - 提供按 profile 过滤部件列表的能力，保留原始元素类型（id / config 等字段不丢失）。
 *
 * 依赖：无外部依赖，纯静态白名单 + 纯函数。
 *
 * 注意：
 * - profile id（bedroom-tablet / living-room-wall ...）与 widget type（clock / weather ...）
 *   均为配置 key，不翻译。
 */

/** 部件选择器超过该数量时启用 VirtualList */
export const WIDGET_PICKER_VIRTUAL_THRESHOLD = 24

/**
 * Display profile 允许的侧栏 widget 类型（未列出的 profile 不限制）
 *
 * value 为 Set 时表示白名单；为 null 表示该 profile 不限制类型。
 */
const PROFILE_ALLOWED_WIDGET_TYPES = {
  'bedroom-tablet': new Set(['clock', 'weather', 'quickActions', 'homeClimateChart']),
  'living-room-wall': null,
}

/**
 * 判定指定 widget 类型是否被允许出现在该 profile 下。
 *
 * @param profileId display profile id；空表示不做限制
 * @param widgetType 微件类型 key
 * @returns true 表示允许；profile 未配置白名单时一律放行
 */
function isWidgetAllowedForProfile(
  profileId: string | undefined,
  widgetType: string | undefined,
) {
  if (!profileId) return true
  const allowed = (PROFILE_ALLOWED_WIDGET_TYPES as Record<string, Set<string> | null>)[profileId]
  if (!allowed) return true
  if (!widgetType) return false
  return allowed.has(widgetType)
}

/**
 * 按 profile 过滤部件列表，保留原始元素类型。
 *
 * @param profileId display profile id；空表示不过滤
 * @param widgets 待过滤部件数组（每项含可选 type 字段）
 * @returns 通过白名单的部件数组；输入非数组时返回空数组
 * @template T 保留原始元素类型（如 PanelWidget），避免调用方丢失 id/config 等字段
 */
export function filterWidgetsForProfile<T extends { type?: string }>(
  profileId: string | undefined,
  widgets: T[] | null | undefined,
) {
  if (!Array.isArray(widgets)) return [] as T[]
  return widgets.filter((w) => isWidgetAllowedForProfile(profileId, w?.type))
}
