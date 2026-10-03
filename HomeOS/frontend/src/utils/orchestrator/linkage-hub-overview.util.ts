/**
 * 联动中心总览数据聚合
 *
 * 职责：
 * - 聚合联动中心总览卡片所需的状态：占位项 / 漂移项 / 未完成项统计。
 * - 提供同步状态映射、列表项分类与汇总文案生成，供联动中心页渲染。
 *
 * 依赖：
 * - 调用方注入的 OrchestratorListItem 与 SyncStatusMap 类型。
 * - 相关占位 / 漂移 / 未完成判定工具。
 *
 * 注意：
 * - 项类型 / 状态 key 为配置 key，不翻译。
 * - 仅面向用户的汇总文案使用简体中文。
 */
import {
  orchestratorHasPlaceholder,
  orchestratorItemHasDrift,
  isIncompleteOrchestratorItem,
  type OrchestratorListItem,
  type SyncStatusMap,
} from '@/utils/orchestrator/list.util'
import {
  LINKAGE_HUB_KIND_META,
  type LinkageHubKind,
} from '@/composables/orchestrator/linkage-hub.types'

/** 联动类型分桶：每类总数 / 需关注数 / 漂移数 + emoji 与强调色 */
type LinkageOverviewKindBucket = {
  kind: LinkageHubKind
  label: string
  emoji: string
  accent: string
  total: number
  attention: number
  drift: number
}

/** 联动总览「需关注项」条目：id / 类型 / 名称 / 关注原因列表 */
type LinkageOverviewAttentionItem = {
  id: string
  kind: LinkageHubKind
  name: string
  reasons: string[]
}

/** 执行历史记录：联动总览的时间线 / 成功率统计输入 */
export type LinkageOverviewExecutionRecord = {
  id: string
  type: string
  name: string
  success: boolean
  executedAt: string
  detail?: string
  meta?: { source?: string; level?: string; entityId?: string }
}

/** 健康度分桶：正常 / 需关注 / 漂移 */
type LinkageOverviewHealthBucket = {
  key: 'healthy' | 'attention' | 'drift'
  label: string
  count: number
  color: string
}

/** 执行时间线分桶：标签 / 总数 / 失败数 */
type LinkageOverviewTimelineBucket = {
  label: string
  total: number
  failures: number
}

/** 各联动类型的强调色（用于卡片视觉区分） */
const KIND_ACCENTS: Record<LinkageHubKind, string> = {
  scene: '#38bdf8',
  automation: '#fbbf24',
  script: '#34d399',
  template: '#a78bfa',
}

/** 收集项需要关注的理由（漂移 / 占位 / 阻塞 / 不完整 / 模板补全 / 自动化禁用） */
function itemAttentionReasons(
  item: OrchestratorListItem,
  syncMap: SyncStatusMap,
  kind: LinkageHubKind,
): string[] {
  const reasons: string[] = []
  if (orchestratorItemHasDrift(item, syncMap)) reasons.push('漂移')
  if (orchestratorHasPlaceholder(item)) reasons.push('占位符')
  if (item.blockedReason) reasons.push(String(item.blockedReason))
  if (isIncompleteOrchestratorItem(item)) reasons.push('不完整')
  if (kind === 'template' && (item.needsAttention || item.stubYaml)) {
    reasons.push(item.stubYaml ? '需补全' : '片段')
  }
  if (kind === 'automation' && item.enabled === false) reasons.push('已禁用')
  return reasons
}

/** 项是否需要在联动总览中关注（含任意 reason 即为 true） */
function itemNeedsOverviewAttention(
  item: OrchestratorListItem,
  syncMap: SyncStatusMap,
  kind: LinkageHubKind,
): boolean {
  return itemAttentionReasons(item, syncMap, kind).length > 0
}

/**
 * 按联动类型分桶：scene / automation / script / template 各产出一个 kind bucket。
 *
 * 入参：四类列表 + 各自同步状态映射。
 * 返回：每个类型的总数 / 需关注数 / 漂移数 + 元信息（label / emoji / accent）。
 */
export function buildLinkageKindBuckets(input: {
  scene: OrchestratorListItem[]
  automation: OrchestratorListItem[]
  script: OrchestratorListItem[]
  template: OrchestratorListItem[]
  syncMaps: Record<LinkageHubKind, SyncStatusMap>
}): LinkageOverviewKindBucket[] {
  const kinds: LinkageHubKind[] = ['scene', 'automation', 'script', 'template']
  const lists: Record<LinkageHubKind, OrchestratorListItem[]> = {
    scene: input.scene,
    automation: input.automation,
    script: input.script,
    template: input.template,
  }

  return kinds.map((kind) => {
    const items = lists[kind]
    const syncMap = input.syncMaps[kind]
    const meta = LINKAGE_HUB_KIND_META[kind]
    let attention = 0
    let drift = 0
    for (const item of items) {
      if (orchestratorItemHasDrift(item, syncMap)) drift += 1
      if (itemNeedsOverviewAttention(item, syncMap, kind)) attention += 1
    }
    return {
      kind,
      label: meta.label,
      emoji: meta.emoji,
      accent: KIND_ACCENTS[kind],
      total: items.length,
      attention,
      drift,
    }
  })
}

/**
 * 构造联动总览「需关注项」列表（按关注原因加权打分排序）。
 *
 * 评分规则：漂移 +40 / 占位 +30 / 不完整 +25 / 模板补全 +20 / 已禁用 +10。
 * 返回前 limit 条（默认 10）。
 */
export function buildLinkageAttentionItems(input: {
  scene: OrchestratorListItem[]
  automation: OrchestratorListItem[]
  script: OrchestratorListItem[]
  template: OrchestratorListItem[]
  syncMaps: Record<LinkageHubKind, SyncStatusMap>
  limit?: number
}): LinkageOverviewAttentionItem[] {
  const limit = input.limit ?? 10
  const entries: Array<{ item: OrchestratorListItem; kind: LinkageHubKind; score: number }> = []
  const kinds: LinkageHubKind[] = ['scene', 'automation', 'script', 'template']
  const lists: Record<LinkageHubKind, OrchestratorListItem[]> = {
    scene: input.scene,
    automation: input.automation,
    script: input.script,
    template: input.template,
  }

  for (const kind of kinds) {
    const syncMap = input.syncMaps[kind]
    for (const item of lists[kind]) {
      const reasons = itemAttentionReasons(item, syncMap, kind)
      if (!reasons.length) continue
      let score = 0
      if (reasons.includes('漂移')) score += 40
      if (reasons.includes('占位符')) score += 30
      if (reasons.includes('不完整')) score += 25
      if (reasons.includes('需补全') || reasons.includes('Stub') || reasons.includes('片段')) score += 20
      if (reasons.includes('已禁用')) score += 10
      entries.push({ item, kind, score })
    }
  }

  return entries
    .sort((a, b) => b.score - a.score || String(a.item.name || '').localeCompare(String(b.item.name || ''), 'zh'))
    .slice(0, limit)
    .map(({ item, kind }) => ({
      id: String(item.id ?? ''),
      kind,
      name: String(item.name || item.id || '未命名'),
      reasons: itemAttentionReasons(item, input.syncMaps[kind], kind),
    }))
}

/**
 * 构造联动总览健康度分桶：正常 / 需关注 / 漂移。
 *
 * 漂移项不计入需关注；healthy = total - attention - drift。
 */
export function buildLinkageHealthBuckets(input: {
  scene: OrchestratorListItem[]
  automation: OrchestratorListItem[]
  script: OrchestratorListItem[]
  template: OrchestratorListItem[]
  syncMaps: Record<LinkageHubKind, SyncStatusMap>
}): LinkageOverviewHealthBucket[] {
  let drift = 0
  let attention = 0
  let total = 0
  const kinds: LinkageHubKind[] = ['scene', 'automation', 'script', 'template']
  const lists: Record<LinkageHubKind, OrchestratorListItem[]> = {
    scene: input.scene,
    automation: input.automation,
    script: input.script,
    template: input.template,
  }

  for (const kind of kinds) {
    const syncMap = input.syncMaps[kind]
    for (const item of lists[kind]) {
      total += 1
      const hasDrift = orchestratorItemHasDrift(item, syncMap)
      if (hasDrift) {
        drift += 1
        continue
      }
      if (itemNeedsOverviewAttention(item, syncMap, kind)) attention += 1
    }
  }

  const healthy = Math.max(0, total - attention - drift)
  return [
    { key: 'healthy', label: '正常', count: healthy, color: '#34d399' },
    { key: 'attention', label: '需关注', count: attention, color: '#fbbf24' },
    { key: 'drift', label: '漂移', count: drift, color: '#f87171' },
  ]
}

/**
 * 构造执行时间线分桶：按 hours 内的窗口切分（≤48h 用小时，否则按天）。
 *
 * 入参：records + hours（默认 24）。
 * 返回：每个桶的标签 / 总数 / 失败数。
 */
export function buildExecutionTimelineBuckets(
  records: LinkageOverviewExecutionRecord[],
  hours = 24,
): LinkageOverviewTimelineBucket[] {
  const now = Date.now()
  const windowMs = hours * 60 * 60 * 1000
  const bucketMs = hours <= 48 ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000
  const bucketCount = Math.ceil(windowMs / bucketMs)
  const buckets: LinkageOverviewTimelineBucket[] = []

  for (let i = bucketCount - 1; i >= 0; i -= 1) {
    const start = now - (i + 1) * bucketMs
    const end = now - i * bucketMs
    const inBucket = records.filter((r) => {
      const ts = new Date(r.executedAt).getTime()
      return ts >= start && ts < end
    })
    const label =
      hours <= 48
        ? new Date(end - bucketMs / 2).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
        : new Date(end - bucketMs / 2).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
    buckets.push({
      label,
      total: inBucket.length,
      failures: inBucket.filter((r) => !r.success).length,
    })
  }
  return buckets
}

/**
 * 汇总执行记录：返回近 hours 小时内的总数 / 失败数 / 成功率 / 按类型分组计数。
 *
 * 无记录时成功率视为 100%（避免 0/0）。
 */
export function summarizeExecutionRecords(
  records: LinkageOverviewExecutionRecord[],
  hours = 24,
) {
  const cutoff = Date.now() - hours * 60 * 60 * 1000
  const recent = records.filter((r) => new Date(r.executedAt).getTime() >= cutoff)
  const failures = recent.filter((r) => !r.success)
  const byType: Record<string, number> = {}
  for (const r of recent) {
    byType[r.type] = (byType[r.type] || 0) + 1
  }
  return {
    total: recent.length,
    failures: failures.length,
    successRate: recent.length ? Math.round(((recent.length - failures.length) / recent.length) * 100) : 100,
    byType,
  }
}
