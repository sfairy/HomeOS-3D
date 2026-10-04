/**
 * 全屋关闭推荐模块。
 *
 * 职责：
 * - 识别执行「全屋关闭」时可能被误关的常开设备；
 * - 建议将其加入排除列表，避免一键关闭影响常驻设备（如冰箱、路由器）；
 * - 产出 RecommendInsightResult 供设置页全屋关闭 tab 渲染。
 *
 * 依赖：recommend.types 类型。
 */
import { getEntityLeaf } from '@homeos/shared'
import type { RecommendInsightResult } from '@/utils/recommend/types'

/** 全屋关闭推荐输入 */
interface WholeHomeOffRecommendInput {
  /** 被识别为「常开」的实体列表（可能漏关，也可能不应被关） */
  forgottenEntities: Array<{ entity_id?: string; entityId?: string; name?: string }>
  /** 已配置的排除实体 ID 列表，用于去重 */
  excludeEntityIds: string[]
}

/**
 * 构建全屋关闭推荐结果。
 *
 * 算法流程：
 * 1. 将 excludeEntityIds 转为集合用于去重；
 * 2. 遍历 forgottenEntities，跳过已排除项；
 * 3. 生成 chips（meta 标记「常开」），上限 6 个避免卡片过长。
 *
 * @param input 推荐输入
 * @returns 推荐结果对象
 */
export function buildWholeHomeOffRecommendations(
  input: WholeHomeOffRecommendInput,
): RecommendInsightResult {
  const excludeSet = new Set(input.excludeEntityIds.map((id) => String(id).trim()).filter(Boolean))
  const chips = []

  for (const item of input.forgottenEntities) {
    // 兼容 entity_id 与 entityId 两种字段命名
    const id = String(item.entity_id || item.entityId || '').trim()
    if (!id || excludeSet.has(id)) continue
    chips.push({
      id,
      label: item.name || getEntityLeaf(id),
      meta: '常开',
      title: id,
      variant: 'entity' as const,
      payload: { entityId: id },
    })
    if (chips.length >= 6) break
  }

  const hasActionable = chips.length > 0
  return {
    domain: 'whole-home-off',
    title: '全屋关闭推荐',
    summary: hasActionable
      ? `建议将 ${chips.length} 个常开设备加入排除列表，避免误关`
      : '排除列表已覆盖主要常开设备',
    hasActionable,
    groups: chips.length ? [{ id: 'exclude', label: '建议排除实体', chips }] : [],
    linkTo: '/settings?tab=general&section=whole-home-off',
    linkLabel: '全屋关闭设置',
  }
}