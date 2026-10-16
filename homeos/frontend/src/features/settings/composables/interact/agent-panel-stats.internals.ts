/**
 * @file agent-panel-stats.internals.ts
 * @module frontend/src/features/settings/composables/interact
 */
/** 智能管家设置：模型就绪统计派生 */
import { computed, type Ref } from 'vue'
import type { AgentPingResult } from '@/services/api/agent'

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
  return { modelStatProvider, modelStatReadyLabel, modelStatReadyClass, modelStatReadyValClass }
}
