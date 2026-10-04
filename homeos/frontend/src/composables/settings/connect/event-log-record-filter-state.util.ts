/**
 * EventLog 记录筛选状态读取
 *
 * 职责：从 GET /system/config 的 ops 段解析 EventLog 筛选开关与域名/实体名单。
 */
import type { SystemConfig } from '@/types/system-config'
import type { SharedOpsConfig } from '@homeos/shared'

interface EventLogRecordFilterState {
  enabled: boolean
  mode: 'block' | 'allow_domains'
  blockDomains: string[]
  allowDomains: string[]
  blockEntityIds: string[]
}

/** 从 GET /system/config 读取 EventLog 筛选状态；ops 缺失时返回 null（避免误重置为关闭） */
export function readEventLogRecordFilterState(
  cfg: SystemConfig | null | undefined,
): EventLogRecordFilterState | null {
  const ops = cfg?.ops as SharedOpsConfig | undefined
  if (!ops || typeof ops !== 'object') return null
  return {
    enabled: ops.eventLogRecordFilterEnabled === true,
    mode: ops.eventLogRecordFilterMode === 'allow_domains' ? 'allow_domains' : 'block',
    blockDomains: Array.isArray(ops.eventLogRecordBlockDomains)
      ? [...ops.eventLogRecordBlockDomains]
      : [],
    allowDomains: Array.isArray(ops.eventLogRecordAllowDomains)
      ? [...ops.eventLogRecordAllowDomains]
      : [],
    blockEntityIds: Array.isArray(ops.eventLogRecordBlockEntityIds)
      ? [...ops.eventLogRecordBlockEntityIds]
      : [],
  }
}
