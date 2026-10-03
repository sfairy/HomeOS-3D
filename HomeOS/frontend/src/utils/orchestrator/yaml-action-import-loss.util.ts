/**
 * 动作 / 分支条件 YAML 导入损失统计
 *
 * 职责：automation / script 共用的损失统计，包括：
 * - choose / if / repeat / parallel 等嵌套结构的条件降级。
 * - wait_for_trigger 多触发器编辑器限制提示。
 * - 嵌套 sequence 内未能解析的动作数。
 * - 顶层 conditions 中未能还原的叶子数。
 *
 * 依赖：
 * - @homeos/shared 的 toUnknownList / parseHaDurationToFormString。
 * - ./yaml-action-parse.util 的 parseYamlSeqAction。
 * - @/types/orchestrator-builder 的 OrchestratorActionForm。
 *
 * 注意：条件 / 动作类型名为 HA 配置值，不翻译；仅统计结果用于用户提示。
 */
import { toUnknownList, parseHaDurationToFormString } from '@homeos/shared'
import type { OrchestratorActionForm } from '@/types/orchestrator-builder'
import { parseYamlSeqAction } from './yaml-action-parse.util'

/** 把时长原始值归一化为表单秒数字符串：数字直转，否则按 HA duration 解析 */
export function parseForSeconds(raw: unknown): string {
  if (typeof raw === 'number') return String(raw)
  return parseHaDurationToFormString(raw) || String(raw ?? '')
}

/** choose / if 叶子条件支持的类型白名单 */
const SUPPORTED_CHOOSE_COND = new Set([
  'state',
  'numeric_state',
  'homeos_variable',
  'not',
  'and',
  'or',
  'sun',
  'time',
])

/** 是否为 and/or 条件组节点 */
function isAndOrCondNode(cond: unknown): boolean {
  if (!cond || typeof cond !== 'object') return false
  const k = String((cond as Record<string, unknown>).condition || '')
  return k === 'and' || k === 'or'
}

/**
 * 叶子条件是否可被 choose 分支完整还原（不含嵌套 and/or 组）。
 *
 * 特例处理：
 * - not：仅当只包一个可还原叶子时支持。
 * - template：仅在已知模板模式（states in / state_attr 比较等）下支持。
 * - zone / trigger / device：不支持。
 * - time：仅在 after/before 或 weekday 命中时支持。
 * - 无 condition 字段但有 entity_id+state：视为隐式 state 条件，支持。
 */
function chooseLeafFullySupported(cond: unknown): boolean {
  if (!cond || typeof cond !== 'object') return false
  const c = cond as Record<string, unknown>
  const kind = String(c.condition || '')
  if (kind === 'and' || kind === 'or') return false
  if (kind === 'not') {
    const kids = toUnknownList(c.conditions)
    return kids.length === 1 && chooseLeafFullySupported(kids[0])
  }
  if (kind === 'template') {
    const tpl = String(c.value_template || '')
    if (/'\s*[^']*\s*'\s+in\s+states\s*\(\s*'[^']+'\s*\)/i.test(tpl)) return true
    if (
      /(?:states\s*\(|state_attr\s*\().*\|\s*float(?:\([^)]*\))?\s*(?:>=|<=|>|<)\s*[\d.]+/i.test(
        tpl,
      )
    ) {
      return true
    }
    return false
  }
  if (kind === 'zone' || kind === 'trigger' || kind === 'device') return false
  if (kind === 'time') {
    if (c.after != null || c.before != null) return true
    const days = c.weekday ?? c.days
    return Array.isArray(days) && days.length > 0
  }
  if (!kind && c.entity_id != null && c.state != null) return true
  return SUPPORTED_CHOOSE_COND.has(kind)
}

/**
 * choose/if 条件是否可被扁平 condLogic+conditions 完整还原。
 *
 * and/or 组需递归判断每个叶子是否可还原；其他类型走 chooseLeafFullySupported。
 */
function chooseCondFullySupported(cond: unknown): boolean {
  if (!cond || typeof cond !== 'object') return false
  const c = cond as Record<string, unknown>
  const kind = String(c.condition || '')
  if (kind === 'and' || kind === 'or') {
    const kids = toUnknownList(c.conditions)
    if (!kids.length) return false
    return kids.every((k) => chooseLeafFullySupported(k))
  }
  return chooseLeafFullySupported(cond)
}

/** 分支 conditions 列表是否存在还原损失：单 and/or 节点直接判断，否则按叶子计数 */
function countBranchConditionLosses(conds: unknown): number {
  const list = toUnknownList(conds)
  if (!list.length) return 0

  if (list.length === 1 && isAndOrCondNode(list[0])) {
    return chooseCondFullySupported(list[0]) ? 0 : 1
  }

  let n = 0
  for (const c of list) {
    if (isAndOrCondNode(c)) n += 1
    else if (!chooseLeafFullySupported(c)) n += 1
  }
  return n
}

/**
 * 统计 choose / if / repeat / parallel / sequence 内分支条件的还原损失。
 *
 * 深度遍历所有动作容器，对每个 choose / if 的 conditions 累加 countBranchConditionLosses。
 */
export function countChooseConditionLosses(raw: unknown): number {
  let n = 0
  const walkAction = (a: unknown) => {
    if (!a || typeof a !== 'object') return
    const obj = a as Record<string, unknown>
    if (obj.choose != null) {
      for (const item of toUnknownList(obj.choose)) {
        if (!item || typeof item !== 'object') continue
        const br = item as Record<string, unknown>
        n += countBranchConditionLosses(br.conditions)
        for (const child of toUnknownList(br.sequence ?? br.actions)) walkAction(child)
      }
      for (const child of toUnknownList(obj.default)) walkAction(child)
    }
    if (obj.if != null) {
      n += countBranchConditionLosses(obj.if)
      for (const child of toUnknownList(obj.then)) walkAction(child)
      for (const child of toUnknownList(obj.else)) walkAction(child)
    }
    if (obj.repeat && typeof obj.repeat === 'object') {
      const r = obj.repeat as Record<string, unknown>
      for (const child of toUnknownList(r.sequence)) walkAction(child)
    }
    if (obj.parallel != null) {
      for (const child of toUnknownList(obj.parallel)) walkAction(child)
    }
    if (obj.sequence != null) {
      for (const child of toUnknownList(obj.sequence)) walkAction(child)
    }
  }
  for (const a of toUnknownList(raw)) walkAction(a)
  return n
}

/** wait_for_trigger 含多个触发器：编辑器仅展示首个，其余原样往返（仅统计数量） */
export function countWaitMultiTriggerNotices(raw: unknown): number {
  let n = 0
  const walkAction = (a: unknown) => {
    if (!a || typeof a !== 'object') return
    const obj = a as Record<string, unknown>
    if (obj.wait_for_trigger != null) {
      const list = toUnknownList(obj.wait_for_trigger)
      if (list.length > 1) n += 1
    }
    if (obj.choose != null) {
      for (const item of toUnknownList(obj.choose)) {
        if (!item || typeof item !== 'object') continue
        const br = item as Record<string, unknown>
        for (const child of toUnknownList(br.sequence ?? br.actions)) walkAction(child)
      }
      for (const child of toUnknownList(obj.default)) walkAction(child)
    }
    if (obj.if != null) {
      for (const child of toUnknownList(obj.then)) walkAction(child)
      for (const child of toUnknownList(obj.else)) walkAction(child)
    }
    if (obj.repeat && typeof obj.repeat === 'object') {
      for (const child of toUnknownList((obj.repeat as Record<string, unknown>).sequence)) {
        walkAction(child)
      }
    }
    if (obj.parallel != null) {
      for (const child of toUnknownList(obj.parallel)) walkAction(child)
    }
    if (obj.sequence != null) {
      for (const child of toUnknownList(obj.sequence)) walkAction(child)
    }
  }
  for (const a of toUnknownList(raw)) walkAction(a)
  return n
}

/** 嵌套动作解析上下文：默认动作工厂 / 时长解析器 / 变体（automation | script） */
type ActionImportLossParseCtx = {
  defaultAction: () => OrchestratorActionForm
  parseForSeconds: (raw: unknown) => string
  variant: 'automation' | 'script'
}

/** 统计嵌套 sequence 内未能解析的动作（不含顶层，避免与 droppedActions 重复） */
export function countNestedDropped(raw: unknown, ctx: ActionImportLossParseCtx): number {
  let dropped = 0
  const countSeq = (list: unknown[]) => {
    for (const item of list) {
      if (!parseYamlSeqAction(item, ctx)) dropped += 1
      walkContainers(item)
    }
  }
  const walkContainers = (item: unknown) => {
    if (!item || typeof item !== 'object') return
    const obj = item as Record<string, unknown>
    if (obj.choose != null) {
      for (const br of toUnknownList(obj.choose)) {
        if (!br || typeof br !== 'object') continue
        const b = br as Record<string, unknown>
        countSeq(toUnknownList(b.sequence ?? b.actions))
      }
      countSeq(toUnknownList(obj.default))
      return
    }
    if (obj.if != null) {
      countSeq(toUnknownList(obj.then))
      countSeq(toUnknownList(obj.else))
      return
    }
    if (obj.repeat && typeof obj.repeat === 'object') {
      countSeq(toUnknownList((obj.repeat as Record<string, unknown>).sequence))
      return
    }
    if (obj.parallel != null) countSeq(toUnknownList(obj.parallel))
    if (obj.sequence != null) countSeq(toUnknownList(obj.sequence))
  }
  for (const item of toUnknownList(raw)) walkContainers(item)
  return dropped
}

/** 统计顶层 conditions 中未能还原的叶子（含 and/or 树内递归） */
export function countDroppedTopLevelConditions(raw: unknown): number {
  let rawLeaves = 0
  let ok = 0
  const walk = (items: unknown[]) => {
    for (const c of items) {
      if (!c || typeof c !== 'object') {
        rawLeaves += 1
        continue
      }
      const obj = c as Record<string, unknown>
      if (
        (obj.condition === 'and' || obj.condition === 'or') &&
        Array.isArray(obj.conditions)
      ) {
        walk(obj.conditions)
        continue
      }
      rawLeaves += 1
      if (chooseLeafFullySupported(c)) ok += 1
    }
  }
  walk(toUnknownList(raw))
  return Math.max(0, rawLeaves - ok)
}
