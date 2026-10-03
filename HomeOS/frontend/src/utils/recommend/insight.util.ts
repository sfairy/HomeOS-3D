/**
 * 推荐结果组装工具。
 *
 * 职责：把各推荐子模块已算好的 chips/groups/banners 组装为 RecommendInsightResult，
 * 消除「hasActionable + 双摘要 + 固定字段」的重复样板。
 */
import type {
  RecommendBanner,
  RecommendGroup,
  RecommendInsightResult,
} from '@/utils/recommend/types'

/** buildRecommendInsight 入参 */
interface BuildRecommendInsightInput {
  domain: string
  title?: string
  hasActionable: boolean
  /**
   * 摘要：可传完整字符串，或按 hasActionable 二选一的 actionable/idle。
   */
  summary: string | { actionable: string; idle: string }
  groups?: RecommendGroup[]
  banners?: RecommendBanner[]
  meta?: string
  linkTo?: string
  linkLabel?: string
}

/**
 * 组装 RecommendInsightResult。
 * 不参与领域判定，仅统一结果骨架。
 */
export function buildRecommendInsight(
  input: BuildRecommendInsightInput,
): RecommendInsightResult {
  const summary =
    typeof input.summary === 'string'
      ? input.summary
      : input.hasActionable
        ? input.summary.actionable
        : input.summary.idle

  return {
    domain: input.domain,
    title: input.title,
    summary,
    hasActionable: input.hasActionable,
    groups: input.groups,
    banners: input.banners,
    meta: input.meta,
    linkTo: input.linkTo,
    linkLabel: input.linkLabel,
  }
}
