/**
 * @file useLinkageHubOverview.ts
 * @module frontend/src/composables
 */
import { ref, computed } from 'vue'
import { fetchExecutionHistory } from '@/services/api/orchestrator'
import { notifyError } from '@/services/notify'
import { useScheduledPoll } from '@/composables/widget/useScheduledPoll'
import type { OrchestratorListItem, SyncStatusMap } from '@/utils/orchestrator/list.util'
import {
  buildExecutionTimelineBuckets,
  buildLinkageAttentionItems,
  buildLinkageHealthBuckets,
  buildLinkageKindBuckets,
  summarizeExecutionRecords,
  type LinkageOverviewExecutionRecord,
} from '@/utils/orchestrator/linkage-hub-overview.util'
import { LINKAGE_HUB_KIND_META, type LinkageHubKind } from '@/composables/orchestrator/linkage-hub.types'

type ListBundle = {
  items: { value: OrchestratorListItem[] }
  syncStatusMap: { value: SyncStatusMap }
  loading: { value: boolean }
  error: { value: string }
  driftCount: { value: number }
  loadList: (options?: { background?: boolean }) => Promise<void>
}

/** useLinkageHubOverview：函数，按签名入参返回处理结果。 */
export function useLinkageHubOverview(lists: {
  scene: ListBundle
  automation: ListBundle
  script: ListBundle
  template: ListBundle
}) {
  const executionLoading = ref(false)
  const executionError = ref('')
  const executionRecords = ref<LinkageOverviewExecutionRecord[]>([])

  const syncMaps = computed<Record<LinkageHubKind, SyncStatusMap>>(() => ({
    scene: lists.scene.syncStatusMap.value,
    automation: lists.automation.syncStatusMap.value,
    script: lists.script.syncStatusMap.value,
    template: lists.template.syncStatusMap.value,
  }))

  const kindBuckets = computed(() =>
    buildLinkageKindBuckets({
      scene: lists.scene.items.value,
      automation: lists.automation.items.value,
      script: lists.script.items.value,
      template: lists.template.items.value,
      syncMaps: syncMaps.value,
    }),
  )

  const healthBuckets = computed(() =>
    buildLinkageHealthBuckets({
      scene: lists.scene.items.value,
      automation: lists.automation.items.value,
      script: lists.script.items.value,
      template: lists.template.items.value,
      syncMaps: syncMaps.value,
    }),
  )

  const attentionItems = computed(() =>
    buildLinkageAttentionItems({
      scene: lists.scene.items.value,
      automation: lists.automation.items.value,
      script: lists.script.items.value,
      template: lists.template.items.value,
      syncMaps: syncMaps.value,
      limit: 5,
    }),
  )

  const totalItems = computed(() =>
    kindBuckets.value.reduce((sum, bucket) => sum + bucket.total, 0),
  )

  const totalAttention = computed(() =>
    kindBuckets.value.reduce((sum, bucket) => sum + bucket.attention, 0),
  )

  const totalDrift = computed(() =>
    kindBuckets.value.reduce((sum, bucket) => sum + bucket.drift, 0),
  )

  const enabledAutomations = computed(
    () => lists.automation.items.value.filter((i) => i.enabled && !i.runOnHa && !i.blockedReason).length,
  )

  const executionSummary = computed(() => summarizeExecutionRecords(executionRecords.value, 24))

  const executionTimeline = computed(() => buildExecutionTimelineBuckets(executionRecords.value, 24))

  const recentExecutions = computed(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    return executionRecords.value.filter((r) => new Date(r.executedAt).getTime() >= cutoff)
  })

  const overviewLoading = computed(
    () =>
      lists.scene.loading.value ||
      lists.automation.loading.value ||
      lists.script.loading.value ||
      lists.template.loading.value ||
      executionLoading.value,
  )

  const overviewError = computed(() => {
    const errors = [
      lists.scene.error.value,
      lists.automation.error.value,
      lists.script.error.value,
      lists.template.error.value,
      executionError.value,
    ].filter(Boolean)
    return errors[0] || ''
  })

  const kpiCells = computed(() => [
    {
      key: 'total',
      label: '联动资产',
      value: String(totalItems.value),
      tone: totalItems.value ? 'violet' : 'muted',
    },
    {
      key: 'attention',
      label: '需关注',
      value: String(totalAttention.value),
      tone: totalAttention.value ? 'amber' : 'muted',
    },
    {
      key: 'drift',
      label: '配置漂移',
      value: String(totalDrift.value),
      tone: totalDrift.value ? 'amber' : 'muted',
    },
    {
      key: 'exec',
      label: '24h 执行',
      value: String(executionSummary.value.total),
      tone: executionSummary.value.failures ? 'amber' : 'sky',
    },
    {
      key: 'auto',
      label: '可触发自动化',
      value: String(enabledAutomations.value),
      tone: 'emerald',
    },
  ])

  const analyticsKpiCells = computed(() => {
    const exec = executionSummary.value
    const topKind = kindBuckets.value.reduce(
      (best, bucket) => (bucket.total > (best?.total ?? 0) ? bucket : best),
      kindBuckets.value[0],
    )
    return [
      {
        key: 'total',
        label: '联动资产',
        value: String(totalItems.value),
        hint: '场景 · 自动化 · 脚本 · 模板',
        tone: totalItems.value ? 'accent' : 'muted',
      },
      {
        key: 'attention',
        label: '需关注',
        value: String(totalAttention.value),
        hint: totalAttention.value ? '占位符或健康异常' : '全部正常',
        tone: totalAttention.value ? 'warn' : 'muted',
      },
      {
        key: 'drift',
        label: '配置漂移',
        value: String(totalDrift.value),
        hint: totalDrift.value ? '建议前往联动中心同步' : '与 HA 对齐',
        tone: totalDrift.value ? 'warn' : 'muted',
      },
      {
        key: 'exec',
        label: '24h 执行',
        value: String(exec.total),
        hint: exec.total ? `成功率 ${exec.successRate}%` : '暂无执行',
        tone: exec.failures ? 'warn' : exec.total ? 'sky' : 'muted',
      },
      {
        key: 'top-kind',
        label: '最多类型',
        value: topKind?.total ? topKind.label : '—',
        hint: topKind?.total ? `${topKind.total} 项` : '暂无资产',
        tone: topKind?.total ? 'accent' : 'muted',
      },
    ]
  })

  const categoryCards = computed(() =>
    kindBuckets.value.map((bucket) => ({
      ...bucket,
      meta: LINKAGE_HUB_KIND_META[bucket.kind],
    })),
  )

  async function loadExecutionHistory(options?: { silent?: boolean }) {
    const silent = options?.silent === true
    if (!silent) {
      executionLoading.value = true
      executionError.value = ''
    }
    try {
      const { data } = await fetchExecutionHistory({ limit: 120 })
      const rows = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []
      executionRecords.value = rows.map((row: Record<string, unknown>) => ({
        id: String(row.id ?? ''),
        type: String(row.type ?? 'unknown'),
        name: String(row.name ?? row.id ?? '未命名'),
        success: row.success !== false,
        executedAt: String(row.executedAt ?? row.createdAt ?? ''),
        detail: row.detail ? String(row.detail) : undefined,
        meta:
          row.meta && typeof row.meta === 'object'
            ? (row.meta as LinkageOverviewExecutionRecord['meta'])
            : undefined,
      }))
      if (!silent) executionError.value = ''
    } catch (e) {
      if (!silent) {
        executionError.value = '执行历史加载失败'
        notifyError(e, executionError.value)
      }
    } finally {
      if (!silent) executionLoading.value = false
    }
  }

  useScheduledPoll(() => loadExecutionHistory({ silent: true }), 20_000, {
    key: 'linkage:overview-exec-history',
    immediate: false,
  })

  async function reloadOverview(options?: { background?: boolean }) {
    const background = options?.background ?? false
    await Promise.all([
      lists.scene.loadList({ background }),
      lists.automation.loadList({ background }),
      lists.script.loadList({ background }),
      lists.template.loadList({ background }),
      loadExecutionHistory({ silent: background }),
    ])
  }

  return {
    kindBuckets,
    healthBuckets,
    attentionItems,
    categoryCards,
    kpiCells,
    analyticsKpiCells,
    executionSummary,
    executionTimeline,
    recentExecutions,
    overviewLoading,
    overviewError,
    executionLoading,
    reloadOverview,
    loadExecutionHistory,
  }
}
