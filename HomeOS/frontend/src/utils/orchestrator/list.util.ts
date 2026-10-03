/**
 * @file orchestrator-list.util.ts
 * @module frontend/src/utils
 *
 * 联动 / 场景 / 脚本通用列表视图辅助工具。
 *
 * 职责：
 *  - 定义列表项通用类型 OrchestratorListItem（包含 id / name / yaml / entities 等可选字段）。
 *  - 提供 hasOrchestratorPlaceholder 等占位文本判定，供列表搜索空态与占位向导入口判断使用。
 *  - （扩展点）联动列表特有过滤 / 排序 / 分组钩子统一通过本文件导出，保持联动三域视图的一致性。
 * 依赖：@homeos/shared 的 hasOrchestratorPlaceholder，用于在前端统一复用后端 placeholder 判定逻辑。
 */
import { hasOrchestratorPlaceholder } from '@homeos/shared'

/** OrchestratorListItem：类型定义，字段语义见声明。 */
export type OrchestratorListItem = Record<string, unknown> & {
  id?: string | number
  name?: string
  yaml?: string
  entities?: string | Record<string, unknown> | unknown[]
  sequence?: string
  runOnHa?: boolean
  blockedReason?: string
  incomplete?: boolean
}

/** SyncStatusMap：类型定义，字段语义见声明。 */
export type SyncStatusMap = Record<string, { drift?: boolean }>

function orchestratorRawYaml(item: OrchestratorListItem): string {
  const entities = item.entities
  if (entities != null && typeof entities === 'object') {
    try {
      return JSON.stringify(entities)
    } catch {
      /* 落入下一分支 */
    }
  }
  if (typeof entities === 'string' && entities.trim()) return entities
  return String(item.yaml || item.sequence || '')
}

/** orchestratorHasPlaceholder：函数，按签名入参返回处理结果。 */
export function orchestratorHasPlaceholder(item: OrchestratorListItem): boolean {
  return hasOrchestratorPlaceholder(orchestratorRawYaml(item))
}

/** isIncompleteOrchestratorItem：函数，按签名入参返回处理结果。 */
export function isIncompleteOrchestratorItem(item: OrchestratorListItem): boolean {
  return item.incomplete === true || String(item.yaml || '').includes('无法读取完整配置')
}

/** orchestratorItemHasDrift：函数，按签名入参返回处理结果。 */
export function orchestratorItemHasDrift(
  item: OrchestratorListItem,
  syncStatusMap: SyncStatusMap,
): boolean {
  const id = String(item.id ?? '')
  return Boolean(id && syncStatusMap[id]?.drift)
}

/** countOrchestratorDrift：函数，按签名入参返回处理结果。 */
export function countOrchestratorDrift(
  items: OrchestratorListItem[],
  syncStatusMap: SyncStatusMap,
): number {
  return items.filter((item) => orchestratorItemHasDrift(item, syncStatusMap)).length
}
