/**
 * @file agent-panel-stats.internals.ts
 * @module frontend/src/features/settings/interact/composables
 */
/** 智能管家设置：模型就绪统计派生 */
import { computed, type Ref } from 'vue'
import type { AgentPingResult } from '@/services/api/agent'

type AgentUsageToday = NonNullable<AgentPingResult['usageToday']>

/** 今日 token 预算使用率（0-100）；未配置预算时返回 null，侧栏进度条据此隐藏 */
function usagePercentOf(usage: AgentUsageToday | null | undefined): number | null {
  const budget = usage?.dailyTokenBudget ?? 0
  return budget > 0 && usage ? Math.round((usage.totalTokens / budget) * 100) : null
}

export function useAgentModelStats(opts: {
  pending: Ref<number>
  pingInfo: Ref<AgentPingResult | null>
  providerLabel: Ref<string>
}) {
  const { pending, pingInfo, providerLabel } = opts
  const modelStatProvider = computed(() => {
    if (pending.value > 0) return providerLabel.value
    return pingInfo.value?.provider ?? providerLabel.value
  })
  const modelStatReadyLabel = computed(() => {
    if (pending.value > 0) return '待保存'
    if (!pingInfo.value) return '—'
    return pingInfo.value.ready ? '就绪' : '未就绪'
  })
  const modelStatReadyClass = computed(() => {
    if (pending.value > 0) return 'agent-stat--amber'
    if (!pingInfo.value) return 'agent-stat--sky'
    return pingInfo.value.ready ? 'agent-stat--emerald' : 'agent-stat--amber'
  })
  const modelStatReadyValClass = computed(() => {
    if (pending.value > 0) return 'agent-stat-val--amber'
    if (!pingInfo.value) return 'agent-stat-val--sky'
    return pingInfo.value.ready ? 'agent-stat-val--emerald' : 'agent-stat-val--amber'
  })

  //: 计价来源文案：区分「provider 默认价」与「未知 provider 回退 DeepSeek 估算」
  const PRICING_SOURCE_LABELS: Record<string, string> = {
    'provider-default': 'provider 默认价',
    'fallback-deepseek': '按 DeepSeek 估算',
    env: '环境变量指定',
  }

  /** 当前模型 + 计价口径（设置页用于避免「显示 deepseek 却在用豆包」的误判） */
  const modelStatDetail = computed(() => {
    const info = pingInfo.value
    if (!info) return ''
    const model = (info.model || '').trim()
    const pricing = info.pricing
    const parts: string[] = []
    if (model) parts.push(`模型 ${model}`)
    if (pricing) {
      const source = PRICING_SOURCE_LABELS[pricing.source] || pricing.source
      parts.push(
        `计价 ${source}（入 ¥${pricing.inputMissCNY}/百万 · 出 ¥${pricing.outputCNY}/百万）`,
      )
    }
    return parts.join(' · ')
  })

  /** 今日用量（token / 成本 / 预算），无配额配置时只显示已用 */
  const usageTodayLabel = computed(() => {
    const usage = pingInfo.value?.usageToday
    if (!usage) return ''
    const parts = [`今日 ${usage.totalTokens.toLocaleString()} token`, `¥${usage.costCNY.toFixed(4)}`]
    if (usage.dailyTokenBudget > 0) {
      parts.push(`额度 ${Math.round((usage.totalTokens / usage.dailyTokenBudget) * 100)}%`)
    }
    if (usage.dailyCostBudgetCNY > 0) {
      parts.push(`预算 ¥${usage.dailyCostBudgetCNY.toFixed(2)}`)
    }
    return parts.join(' · ')
  })

  /** 今日 token 预算使用率（0-100；未配置预算时为 null，用于侧栏进度条） */
  const modelUsagePercent = computed(() => usagePercentOf(pingInfo.value?.usageToday))

  return {
    modelStatProvider,
    modelStatReadyLabel,
    modelStatReadyClass,
    modelStatReadyValClass,
    modelStatDetail,
    usageTodayLabel,
    modelUsagePercent,
  }
}
