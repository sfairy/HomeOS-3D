/**
 * choose 分支条件工具
 *
 * 职责：
 * - 在 choose 分支的扁平 cond* 字段（condEntityId / condOp / condState ...）与
 *   conditions[] + condLogic 之间互转，便于编辑器单条编辑与序列化复用。
 * - 提供分支条件的新增 / 切换 / 删除 / 同步等操作。
 *
 * 依赖：@/types/orchestrator-builder 的 AutomationConditionForm / OrchestratorChooseBranch。
 *
 * 注意：operator / 字段名为配置值，不翻译。
 */
import type {
  AutomationConditionForm,
  OrchestratorChooseBranch,
} from '@/types/orchestrator-builder'

/** 创建空条件表单（默认 operator=eq、state=on、varScope=global），可被 partial 覆盖 */
export function createEmptyAutomationCondition(
  partial?: Partial<AutomationConditionForm>,
): AutomationConditionForm {
  return {
    entityId: '',
    operator: 'eq',
    state: 'on',
    attribute: '',
    forSeconds: '',
    stateTo: '',
    days: undefined,
    sunOffset: 0,
    varKey: '',
    varScope: 'global',
    negated: false,
    ...partial,
  }
}

/** 扁平分支字段 → 单条条件表单 */
function flatChooseBranchToCondition(
  br: OrchestratorChooseBranch | Record<string, unknown> | null | undefined,
): AutomationConditionForm {
  const b = (br || {}) as Record<string, unknown>
  return createEmptyAutomationCondition({
    entityId: b.condEntityId != null ? String(b.condEntityId) : '',
    operator: String(b.condOp || 'eq'),
    state: (b.condState as string | number | undefined) ?? 'on',
    stateTo: b.condStateTo != null ? String(b.condStateTo) : '',
    attribute: b.condAttribute != null ? String(b.condAttribute) : '',
    varKey: b.condVarKey != null ? String(b.condVarKey) : '',
    varScope: b.condVarScope === 'rule' ? 'rule' : 'global',
    forSeconds: b.condForSeconds != null ? String(b.condForSeconds) : '',
    days: Array.isArray(b.condDays) ? ([...b.condDays] as number[]) : undefined,
    sunOffset:
      b.condSunOffset != null
        ? Number(b.condSunOffset)
        : b.sunOffset != null
          ? Number(b.sunOffset)
          : 0,
    negated: Boolean(b.condNegated),
  })
}

/** 条件表单 → 写回扁平分支字段 */
export function applyConditionToChooseBranchFlat(
  br: OrchestratorChooseBranch,
  c: AutomationConditionForm | null | undefined,
) {
  const cond = c || createEmptyAutomationCondition()
  br.condEntityId = cond.entityId || ''
  br.condOp = cond.operator || 'eq'
  br.condState = cond.state != null ? String(cond.state) : 'on'
  br.condStateTo = cond.stateTo != null ? String(cond.stateTo) : ''
  br.condAttribute = cond.attribute || ''
  br.condVarKey = cond.varKey || ''
  br.condVarScope = cond.varScope === 'rule' ? 'rule' : 'global'
  br.condForSeconds = cond.forSeconds != null ? String(cond.forSeconds) : ''
  br.condDays = Array.isArray(cond.days) ? [...cond.days] : undefined
  br.condSunOffset = Number(cond.sunOffset) || 0
  br.condNegated = Boolean(cond.negated)
}

/** 确保分支有 conditions[]；空则从扁平字段合成 */
export function ensureChooseBranchConditions(
  br: OrchestratorChooseBranch,
): AutomationConditionForm[] {
  if (!Array.isArray(br.conditions) || !br.conditions.length) {
    br.conditions = [flatChooseBranchToCondition(br)]
  }
  if (br.condLogic !== 'or' && br.condLogic !== 'and') {
    br.condLogic = 'and'
  }
  return br.conditions
}

/** 取分支条件列表（不修改原对象时可只读） */
export function getChooseBranchConditions(
  br: OrchestratorChooseBranch | Record<string, unknown> | null | undefined,
): AutomationConditionForm[] {
  const b = br as OrchestratorChooseBranch | null | undefined
  if (!b) return [createEmptyAutomationCondition()]
  if (Array.isArray(b.conditions) && b.conditions.length) return b.conditions
  return [flatChooseBranchToCondition(b)]
}

/** 将当前扁平字段写回 conditions[index]，并保持扁平与首条（或当前条）同步 */
export function syncChooseBranchConditionAt(
  br: OrchestratorChooseBranch,
  index: number,
) {
  const list = ensureChooseBranchConditions(br)
  const i = Math.min(Math.max(0, index), list.length - 1)
  list[i] = flatChooseBranchToCondition(br)
  br.conditions = list
  // 扁平字段始终对齐当前编辑条，便于旧逻辑读取
  applyConditionToChooseBranchFlat(br, list[i])
}

/** 切换当前编辑条件：先保存当前扁平，再加载目标条 */
export function selectChooseBranchCondition(
  br: OrchestratorChooseBranch,
  fromIndex: number,
  toIndex: number,
) {
  const list = ensureChooseBranchConditions(br)
  if (fromIndex >= 0 && fromIndex < list.length) {
    list[fromIndex] = flatChooseBranchToCondition(br)
  }
  const i = Math.min(Math.max(0, toIndex), list.length - 1)
  applyConditionToChooseBranchFlat(br, list[i])
  br.conditions = list
  return i
}

/** 在分支尾部新增空条件，并把扁平字段对齐到新条；返回新条索引 */
export function addChooseBranchCondition(
  br: OrchestratorChooseBranch,
  currentIndex: number = 0,
): number {
  const list = ensureChooseBranchConditions(br)
  const i = Math.min(Math.max(0, currentIndex), list.length - 1)
  list[i] = flatChooseBranchToCondition(br)
  list.push(createEmptyAutomationCondition({ operator: 'eq', state: 'on' }))
  br.conditions = list
  const next = list.length - 1
  applyConditionToChooseBranchFlat(br, list[next])
  return next
}

/** 删除指定索引的条件（仅剩 1 条时不删，返回 0），并把扁平字段对齐到下一可编辑条 */
export function removeChooseBranchCondition(
  br: OrchestratorChooseBranch,
  index: number,
): number {
  const list = ensureChooseBranchConditions(br)
  if (list.length <= 1) return 0
  const i = Math.min(Math.max(0, index), list.length - 1)
  list.splice(i, 1)
  br.conditions = list
  const next = Math.min(i, list.length - 1)
  applyConditionToChooseBranchFlat(br, list[next])
  return next
}
