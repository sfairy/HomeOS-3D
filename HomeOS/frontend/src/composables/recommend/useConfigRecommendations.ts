/**
 * @file useConfigRecommendations.ts
 * @module composables/recommend
 * @description 配置推荐 composable，拉取后端生成的配置优化建议列表。
 *   - 通过 fetchRecommendationInsights 获取推荐项与待处理计数
 *   - 支持 quiet 模式静默刷新（不切换 loading、不显示错误）
 *   - 异常时记录 debug 日志并清空列表，避免阻塞 UI
 * @dependencies vue, @/services/api/system, @/utils/core/logger, @/utils/recommend/types
 */
import { ref } from 'vue'
import { fetchRecommendationInsights } from '@/services/api/system'
import { logger } from '@/utils/core/logger'
import type { RecommendInsightResult } from '@/utils/recommend/types'

/**
 * 配置推荐项，在推荐结果基础上补充 domain 字段
 */
interface ConfigInsightItem extends RecommendInsightResult {
  /** 推荐项所属域（如 light / switch / automation） */
  domain: string
}

/**
 * 配置推荐 composable
 * @returns 响应式状态与加载方法
 *   - loading: 加载中标记
 *   - insights: 推荐项列表
 *   - pendingCount: 待处理项数量
 *   - error: 错误文案
 *   - load: 加载方法，支持 quiet 静默模式
 */
export function useConfigRecommendations() {
  // 加载中标记
  const loading = ref(false)
  // 推荐项列表
  const insights = ref<ConfigInsightItem[]>([])
  // 待处理项数量，用于角标展示
  const pendingCount = ref(0)
  // 错误文案，空字符串表示无错误
  const error = ref('')

  /**
   * 加载配置推荐
   * @param options.quiet 静默模式：不切换 loading、不写入 error
   * @sideEffects 更新 insights/pendingCount/error/loading
   * @exceptions 静默模式不抛错；非静默模式记录 error 文案
   */
  async function load(options?: { quiet?: boolean }) {
    // 非静默模式切换 loading，触发 UI 加载态
    if (!options?.quiet) loading.value = true
    error.value = ''
    try {
      const { data } = await fetchRecommendationInsights()
      // 防御性处理：后端可能返回非数组
      insights.value = Array.isArray(data?.insights) ? data.insights : []
      // 优先使用后端 pendingCount，缺省时按 hasActionable 统计
      pendingCount.value =
        Number(data?.pendingCount) || insights.value.filter((i) => i.hasActionable).length
    } catch (e) {
      // 静默刷新失败仅记日志，不打扰用户
      logger.debug('配置推荐加载失败', e)
      if (!options?.quiet) error.value = '加载失败'
      insights.value = []
      pendingCount.value = 0
    } finally {
      if (!options?.quiet) loading.value = false
    }
  }

  return {
    loading,
    insights,
    pendingCount,
    error,
    load,
  }
}