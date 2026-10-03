/**
 * 智能顾问 tip 分类归一化与统计
 *
 * 所属模块：智能顾问（Advisor）总览
 * 职责：将后端返回的 tip 依据 category 字段归一化到固定枚举集合，
 *   并按分类聚合计数，供总览卡渲染「分组数量 / 用量条占比」使用。
 * 依赖：无外部依赖，纯函数工具。
 */

/** 顾问 tip 支持的分类 id（与后端 category 字段对齐） */
type AdvisorTipCategoryId = 'security' | 'env' | 'energy' | 'water'

/**
 * 将任意 category 输入归一化为受支持的分类 id。
 *
 * @param category 后端 tip 原始 category 字段（可能为字符串 / undefined / null）
 * @returns 小写化后命中枚举的 id；未命中时回退到 'energy'（能源为默认分组）
 */
export function normalizeAdvisorTipCategoryId(category: unknown): AdvisorTipCategoryId {
  const c = String(category || '').toLowerCase()
  if (c === 'security' || c === 'env' || c === 'energy' || c === 'water') return c
  return 'energy'
}

/**
 * 基于 tip 列表构建总览统计：总数 + 各分类计数 + 分类标签。
 *
 * @param tips 顾问 tip 列表（可为空）；每项包含可选 category 字段
 * @param categoryLabels 各分类 id → 展示标签映射；缺失时回退为 id 本身
 * @returns { tipCount, categories } 总数与分类聚合数组（含 id / count / label）
 */
export function buildAdvisorOverview(
  tips: Array<{ category?: unknown }> | null | undefined,
  categoryLabels: Record<string, { label?: string }>,
) {
  const list = tips || []
  const counts: Record<string, number> = {}
  for (const tip of list) {
    const id = normalizeAdvisorTipCategoryId(tip.category)
    counts[id] = (counts[id] || 0) + 1
  }
  const categories = Object.entries(counts).map(([id, count]) => ({
    id,
    count,
    label: categoryLabels[id]?.label ?? id,
  }))
  return { tipCount: list.length, categories }
}

/**
 * 将单分类计数换算为用量条百分比（0–100）。
 *
 * @param count 当前分类计数（null / undefined 视为 0）
 * @param maxCount 所有分类中的最大计数（用于归一化）；为 0 时返回 0 避免除零
 * @returns 向下取整后的百分比
 */
export function usageBarPercent(count: number | null | undefined, maxCount: number): number {
  if (!maxCount) return 0
  return Math.round(((count || 0) / maxCount) * 100)
}

/**
 * 从用量行集合中解析出最大 onCount，用作用量条的归一化分母。
 *
 * @param rows 用量行数组（每项含可选 onCount）；为空时返回 1 避免除零
 * @returns 最大 onCount（至少为 1）
 */
export function resolveUsageMaxCount(rows: Array<{ onCount?: number }> | null | undefined): number {
  if (!rows?.length) return 1
  return Math.max(...rows.map((r) => r.onCount || 0), 1)
}