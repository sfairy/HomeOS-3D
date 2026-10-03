/**
 * @file useRecommendInsight.ts
 * @module composables/recommend
 * @description 推荐卡片属性聚合 composable，将推荐结果转换为卡片组件可直接消费的 props。
 *   - 合并 insight 自身字段与外部传入的 loading/meta/visible
 *   - 缺省字段做安全回退（标题、分组、横幅、链接等）
 * @dependencies vue, @/utils/recommend/types
 */
import { computed, type ComputedRef, type Ref } from 'vue'
import type { RecommendInsightResult } from '@/utils/recommend/types'

/**
 * 推荐卡片 composable 的配置项
 */
interface UseRecommendInsightOptions {
  /** 加载中标记 */
  loading: Ref<boolean>
  /** 推荐结果计算属性 */
  insight: ComputedRef<RecommendInsightResult>
  /** 卡片元信息（覆盖 insight.meta） */
  meta?: ComputedRef<string | undefined>
  /** 是否可见（覆盖 insight 默认可见） */
  visible?: ComputedRef<boolean>
}

/**
 * 推荐卡片属性聚合 composable
 * @param options 配置项
 * @returns cardProps 计算属性，供卡片组件绑定
 */
export function useRecommendInsight(options: UseRecommendInsightOptions) {
  // 聚合卡片所需字段：优先使用外部覆盖值，缺省回退到 insight 自身或空值
  const cardProps = computed(() => {
    const insight = options.insight.value
    return {
      // 标题缺省回退为"智能推荐"
      title: insight.title || '智能推荐',
      // meta 优先取外部传入，其次 insight.meta，最后空串
      meta: options.meta?.value ?? insight.meta ?? '',
      summary: insight.summary,
      loading: options.loading.value,
      // 是否存在可执行动作
      actionable: insight.hasActionable,
      // 有可执行动作时才显示"应用"按钮
      showApply: insight.hasActionable,
      groups: insight.groups || [],
      banners: insight.banners || [],
      linkTo: insight.linkTo || '',
      linkLabel: insight.linkLabel || '',
      // 可见性缺省为 true
      visible: options.visible?.value ?? true,
    }
  })

  return { cardProps }
}