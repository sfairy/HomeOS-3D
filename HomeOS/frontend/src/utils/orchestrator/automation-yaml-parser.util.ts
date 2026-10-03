/**
 * 自动化 YAML 解析器：将 HA automation YAML（含 HA 导入格式）反向解析为联动器表单结构。
 *
 * 所属模块：联动器 / Orchestrator
 * 职责：把用户粘贴/导入的 HA automation YAML 文本解析回联动器可编辑结构，
 *   实现双向编辑闭环（画布/表单 ↔ YAML）。
 *
 * 依赖：
 *   - `@homeos/shared`：提供 YAML 加载、时长解析、触发器规范化、区段抽取、实体 ID 转换等基础能力。
 *   - `./yaml-action-parse.util`：提供动作序列解析与默认动作构造。
 *   - `@/types/orchestrator-builder`：表单结构类型定义。
 *
 * 解析转换规则：
 *   - 触发器：先经 `normalizeTriggers` 规范化（统一 platform/entity_id 等字段），
 *     再按 platform 反向映射到表单 type；above/below → numOp/numValue；
 *     for → forSeconds；offset（秒）→ sunOffset（分钟，四舍五入）。
 *   - 条件：先 `detectConditionRootLogic` 判定根逻辑（存在 `condition: or` 即 or，否则 and）。
 *     叶子条件按 kind 分支：numeric_state/template/sun/time/state/not。
 *     template 识别 contains（`'x' in states('y')`）与数值比较（`states('y') | float >= n`）；
 *     其余复杂模板返回 null（不支持回填）。
 *     `not + state` 反向为 neq 算子。顶层 and/or 节点按分组结构还原 conditionGroups。
 *   - 动作：委托 `parseYamlSeqAction`，按 automation variant 解析。
 *   - alias → automationName；mode 仅接受 single/restart/queued/parallel。
 */
import {
  loadHaYaml,
  parseHaDurationToFormString,
  normalizeTriggers,
  extractAutomationYamlSections,
  entityIdToFormString,
  parseSunOffsetMinutes,
  toUnknownList,
  type ParsedTrigger,
} from '@homeos/shared'
import {
  parseYamlSeqAction,
  createDefaultOrchestratorAction,
} from './yaml-action-parse.util'
import { parseHomeosTriggerMeta } from './automation-trigger-yaml.util'
import type {
  AutomationConditionForm,
  AutomationConditionGroup,
  AutomationFormParsed,
  AutomationTriggerForm,
} from '@/types/orchestrator-builder'

/**
 * 构造一个全字段的默认触发器表单行。
 * 各字段给出合理缺省值（state 类型、to=on、sunrise、above、enter、start 等），
 * 便于解析时仅覆盖实际存在的字段，其余保持缺省。
 *
 * @returns 默认触发器表单对象。
 */
function defaultTrigger(): AutomationTriggerForm {
  return {
    type: 'state',
    entityId: '',
    stateFrom: '',
    stateTo: 'on',
    forSeconds: '',
    at: '',
    days: [],
    sunEvent: 'sunrise',
    sunOffset: 0,
    numOp: 'above',
    numValue: '',
    haEvent: 'start',
    eventType: '',
    eventDataKey: '',
    eventDataVal: '',
    presenceKind: 'arrive',
    zoneId: '',
    zoneEvent: 'enter',
    calendarEvent: 'start',
    intervalSeconds: 60,
    loopControlVar: '',
    varKey: '',
    sequenceSteps: [],
  }
}

/**
 * 构造一个默认的动作表单行（automation variant）。
 *
 * @returns 默认动作表单对象。
 */
function defaultAction() {
  return createDefaultOrchestratorAction('automation')
}

/** HA `for` 时长 → 表单字符串的转换函数别名（复用 shared 实现） */
const parseForSeconds = parseHaDurationToFormString

/**
 * 将规范化后的触发器（ParsedTrigger）转换为 Builder 表单行。
 *
 * 转换规则：
 *   - platform → 表单 type（numeric_state→numeric，其余同名）。
 *   - entity_id → 表单 entityId（经 entityIdToFormString 转字符串）。
 *   - from/to → stateFrom/stateTo。
 *   - above/below → numOp=above/below + numValue。
 *   - at → at；event 按类型写入 sunEvent/haEvent/zoneEvent/calendarEvent。
 *   - event_type → eventType；zone → zoneId。
 *   - for → forSeconds（字符串）；offset（秒）→ sunOffset（分钟，Math.round）。
 *
 * @param t - 规范化后的触发器对象。
 * @returns 表单触发器行（基于默认值覆盖实际字段）。
 */
function normalizedTriggerToForm(t: ParsedTrigger): AutomationTriggerForm {
  const tr = defaultTrigger()
  const platform = t.platform || 'state'

  // platform → 表单 type 反向映射；未知 platform 直接透传为字符串
  if (platform === 'state') tr.type = 'state'
  else if (platform === 'numeric_state') tr.type = 'numeric'
  else if (platform === 'time') tr.type = 'time'
  else if (platform === 'sun') tr.type = 'sun'
  else if (platform === 'homeassistant') tr.type = 'homeassistant'
  else if (platform === 'event') tr.type = 'event'
  else if (platform === 'zone') tr.type = 'zone'
  else if (platform === 'calendar') tr.type = 'calendar'
  else if (platform === 'device') tr.type = 'device'
  else tr.type = String(platform)

  tr.entityId = entityIdToFormString(t.entity_id)
  if (t.attribute != null && String(t.attribute)) tr.attribute = String(t.attribute)
  if (t.from != null) tr.stateFrom = String(t.from)
  if (t.to != null) tr.stateTo = String(t.to)
  if (t.above != null) {
    tr.numOp = 'above'
    tr.numValue = String(t.above)
  }
  if (t.below != null) {
    if (t.above != null) {
      tr.numBelow = String(t.below)
    } else {
      tr.numOp = 'below'
      tr.numValue = String(t.below)
    }
  }
  if (t.at != null) tr.at = String(t.at)
  // 定时触发器星期过滤（0=周日…6=周六，normalizeTriggers 已由 weekday 转换），与条件 days 同一约定
  if (tr.type === 'time' && Array.isArray(t.days) && t.days.length) {
    tr.days = [...t.days]
  }
  // event 字段按触发器类型写入对应表单字段
  if (t.event != null && tr.type === 'sun') tr.sunEvent = String(t.event)
  if (t.event != null && tr.type === 'homeassistant') tr.haEvent = String(t.event)
  if (t.event != null && tr.type === 'zone') tr.zoneEvent = String(t.event)
  if (t.event != null && tr.type === 'calendar') tr.calendarEvent = String(t.event)
  if (t.event_type != null) tr.eventType = String(t.event_type)
  if (t.zone != null) tr.zoneId = String(t.zone)
  if (t.for != null) tr.forSeconds = parseForSeconds(t.for) || String(t.for)
  // offset 在 HA 中以秒为单位，表单以分钟为单位，需除以 60 并四舍五入
  if (t.offset != null) tr.sunOffset = Math.round(t.offset / 60)
  // HA device 触发器字段
  if (tr.type === 'device') {
    if (t.device_id != null) tr.deviceId = String(t.device_id)
    if (t.domain != null) tr.domain = String(t.domain)
    if (t.device_type != null) tr.deviceType = String(t.device_type)
  }

  // 识别 HomeOS / 在场 编译产物，还原表单类型
  if (tr.type === 'event') {
    const et = String(tr.eventType || '')
    if (et === 'presence.everyoneLeft') {
      tr.type = 'presence'
      tr.presenceKind = 'leave_all'
    } else if (et === 'presence.changed') {
      tr.type = 'presence'
      tr.presenceKind = 'arrive'
    } else if (et === 'homeos.automation.enabled') {
      tr.type = 'onload'
    } else if (et === 'homeos.interval.tick') {
      tr.type = 'interval'
      const ed = (t.event_data || {}) as Record<string, unknown>
      tr.intervalSeconds = Number(ed.interval) || 60
      if (ed.control_var != null) tr.loopControlVar = String(ed.control_var)
    } else if (et === 'homeos.var_changed') {
      tr.type = 'variable'
      const ed = (t.event_data || {}) as Record<string, unknown>
      if (ed.key != null) tr.varKey = String(ed.key)
      tr.varScope = ed.scope === 'rule' ? 'rule' : 'global'
      if (ed.value != null) tr.varValue = String(ed.value)
    } else {
      const ed = (t.event_data || {}) as Record<string, unknown>
      const keys = Object.keys(ed)
      if (keys.length) {
        tr.eventDataKey = keys[0]
        tr.eventDataVal = ed[keys[0]] != null ? String(ed[keys[0]]) : ''
      }
    }
  }
  return tr
}
/**
 * 检测条件列表的根逻辑（and / or）。
 *
 * 规则：条件列表中若存在 `condition: or` 节点，则根逻辑为 or；否则为 and。
 * 用于决定表单 condRootLogic 的初值。
 *
 * @param conditions - 原始条件（可能为数组、单对象或空值）。
 * @returns 'and' 或 'or'。
 */
function detectConditionRootLogic(conditions: unknown): 'and' | 'or' {
  const list = Array.isArray(conditions) ? conditions : conditions ? [conditions] : []
  for (const c of list) {
    if (c && typeof c === 'object' && (c as { condition?: string }).condition === 'or') {
      return 'or'
    }
  }
  return 'and'
}

/**
 * 解析单个叶子条件为表单条件行。
 *
 * 按 condition kind 分支：
 *   - numeric_state：above→gt / below→lt。
 *   - template：识别 contains（`'x' in states('y')`）与数值比较（`states('y') | float >= n`）；
 *     其余复杂模板返回 null（不支持回填）。
 *   - sun：after→sun_after / before→sun_before。
 *   - time：after→time_after / before→time_before。
 *   - state：→ eq 算子。
 *   - not + state（单层）：→ neq 算子（取反）。
 *   - 仅有 entity_id + state：按 eq 处理。
 *
 * @param c - 原始条件对象。
 * @returns 表单条件行；无法识别时返回 null。
 */
function parseLeafCondition(c: unknown): AutomationConditionForm | null {
  if (!c || typeof c !== 'object') return null
  const obj = c as Record<string, unknown>
  const kind = obj.condition

  if (kind === 'homeos_variable') {
    const opRaw = String(obj.operator || '==')
    const opMap: Record<string, string> = {
      '==': 'var_eq',
      '=': 'var_eq',
      '!=': 'var_neq',
      '<>': 'var_neq',
      '>': 'var_gt',
      '<': 'var_lt',
      '>=': 'var_gte',
      '<=': 'var_lte',
    }
    return {
      operator: opMap[opRaw] || 'var_eq',
      varKey: String(obj.key || obj.entity_id || ''),
      varScope: obj.scope === 'rule' ? 'rule' : 'global',
      state: obj.state != null ? String(obj.state) : obj.value != null ? String(obj.value) : '',
    }
  }

  if (kind === 'numeric_state') {
    const hasAbove = obj.above != null
    const hasBelow = obj.below != null
    const attr =
      obj.attribute != null && String(obj.attribute) ? String(obj.attribute) : undefined
    const forSec =
      obj.for != null
        ? typeof obj.for === 'number'
          ? String(obj.for)
          : parseHaDurationToFormString(obj.for)
        : ''
    const forFields = forSec ? { forSeconds: forSec } : {}
    if (hasAbove && hasBelow) {
      return {
        entityId: entityIdToFormString(obj.entity_id),
        operator: 'between',
        state: String(obj.above),
        stateTo: String(obj.below),
        ...(attr ? { attribute: attr } : {}),
        ...forFields,
      }
    }
    let operator = 'gt'
    let state = '0'
    if (hasAbove) {
      operator = 'gt'
      state = String(obj.above)
    } else if (hasBelow) {
      operator = 'lt'
      state = String(obj.below)
    }
    return {
      entityId: entityIdToFormString(obj.entity_id),
      operator,
      state,
      ...(attr ? { attribute: attr } : {}),
      ...forFields,
    }
  }

  if (kind === 'template' && obj.value_template) {
    const tpl = String(obj.value_template)
    const numCmp = tpl.match(
      /states\s*\(\s*'([^']+)'\s*\)\s*\|\s*float(?:\([^)]*\))?\s*(>=|<=|>|<)\s*([\d.]+)/i,
    )
    if (numCmp) {
      const opMap: Record<string, string> = {
        '>=': 'gte',
        '<=': 'lte',
        '>': 'gt',
        '<': 'lt',
      }
      return { entityId: numCmp[1], operator: opMap[numCmp[2]] || 'gte', state: numCmp[3] }
    }
    const m = tpl.match(/'\s*([^']*?)\s*'\s+in\s+states\s*\(\s*'([^']+)'\s*\)/)
    if (m) return { entityId: m[2], operator: 'contains', state: m[1] }
    return null
  }

  if (kind === 'sun') {
    const offsetRaw = obj.after_offset ?? obj.before_offset
    const sunOffset =
      offsetRaw != null ? parseSunOffsetMinutes(offsetRaw) : 0
    if (obj.after != null) {
      return {
        operator: 'sun_after',
        state: String(obj.after),
        ...(sunOffset ? { sunOffset } : {}),
      }
    }
    if (obj.before != null) {
      return {
        operator: 'sun_before',
        state: String(obj.before),
        ...(sunOffset ? { sunOffset } : {}),
      }
    }
    return null
  }

  if (kind === 'time') {
    const daysRaw = obj.weekday ?? obj.days
    let days: number[] | undefined
    if (Array.isArray(daysRaw)) {
      days = daysRaw
        .map((d) => {
          if (typeof d === 'number') return d
          const map: Record<string, number> = {
            sun: 0,
            mon: 1,
            tue: 2,
            wed: 3,
            thu: 4,
            fri: 5,
            sat: 6,
          }
          return map[String(d).toLowerCase().slice(0, 3)] ?? Number(d)
        })
        .filter((n) => Number.isFinite(n))
    }
    if (obj.after != null) {
      return { operator: 'time_after', state: String(obj.after), days }
    }
    if (obj.before != null) {
      return { operator: 'time_before', state: String(obj.before), days }
    }
    if (days && days.length) {
      return { operator: 'weekday', state: '', days }
    }
    return null
  }

  if (kind === 'state') {
    const forSec =
      obj.for != null
        ? typeof obj.for === 'number'
          ? String(obj.for)
          : parseHaDurationToFormString(obj.for)
        : ''
    const attr =
      obj.attribute != null && String(obj.attribute) ? String(obj.attribute) : undefined
    if (forSec) {
      return {
        entityId: entityIdToFormString(obj.entity_id),
        operator: 'state_for',
        state: String(obj.state ?? 'on'),
        forSeconds: forSec,
        ...(attr ? { attribute: attr } : {}),
      }
    }
    return {
      entityId: entityIdToFormString(obj.entity_id),
      operator: 'eq',
      state: String(obj.state ?? 'on'),
      ...(attr ? { attribute: attr } : {}),
    }
  }

  // not：state 叶子 → neq；其它叶子 → negated；嵌套 not 对偶抵消
  if (kind === 'not' && Array.isArray(obj.conditions)) {
    const inner = obj.conditions[0] as Record<string, unknown> | undefined
    if (inner?.condition === 'state') {
      const attr =
        inner.attribute != null && String(inner.attribute)
          ? String(inner.attribute)
          : undefined
      return {
        entityId: entityIdToFormString(inner.entity_id),
        operator: 'neq',
        state: String(inner.state ?? 'on'),
        ...(attr ? { attribute: attr } : {}),
      }
    }
    const leaf = parseLeafCondition(inner)
    if (!leaf) return null
    if (leaf.operator === 'neq') {
      return { ...leaf, operator: 'eq', negated: false }
    }
    if (leaf.negated) {
      return { ...leaf, negated: false }
    }
    return { ...leaf, negated: true }
  }

  // 兜底：仅有 entity_id + state 字段时按 eq 处理
  if (obj.entity_id != null && obj.state != null) {
    const attr =
      obj.attribute != null && String(obj.attribute) ? String(obj.attribute) : undefined
    return {
      entityId: entityIdToFormString(obj.entity_id),
      operator: 'eq',
      state: String(obj.state),
      ...(attr ? { attribute: attr } : {}),
    }
  }

  return null
}

/**
 * 解析条件节点为分组（logic + 叶子条件列表）。
 *
 * 处理 `condition: or` / `condition: and` 节点：递归调用 parseLeafCondition
 * 收集叶子条件；空结果返回 null。单个叶子节点归为 and 分组（单元素）。
 *
 * @param c - 原始条件节点。
 * @returns 分组对象（logic + conditions）；无可识别条件时返回 null。
 */
function parseConditionGroupNode(
  c: unknown,
): { logic: 'and' | 'or'; conditions: AutomationConditionForm[] } | null {
  if (!c || typeof c !== 'object') return null
  const obj = c as Record<string, unknown>
  const kind = obj.condition

  if (kind === 'or' && Array.isArray(obj.conditions)) {
    const conditions = obj.conditions
      .map(parseLeafCondition)
      .filter((x): x is AutomationConditionForm => Boolean(x))
    if (conditions.length) return { logic: 'or', conditions }
    return null
  }

  if (kind === 'and' && Array.isArray(obj.conditions)) {
    const conditions = obj.conditions
      .map(parseLeafCondition)
      .filter((x): x is AutomationConditionForm => Boolean(x))
    if (conditions.length) return { logic: 'and', conditions }
    return null
  }

  // 单个叶子节点归为 and 分组
  const leaf = parseLeafCondition(c)
  if (leaf) return { logic: 'and', conditions: [leaf] }
  return null
}
/**
 * 将原始条件结构解析为表单的根逻辑 + 条件分组列表。
 *
 * 解析策略（按优先级）：
 *   1. 单个 `condition: and` 节点 + conditions 数组：按子节点还原为多分组（每组一个 and/or）。
 *   2. 单个 `condition: or` 节点 + conditions 数组：扁平化为单个 or 分组。
 *   3. 其他情况：detectConditionRootLogic 判定根逻辑，所有叶子条件扁平化为单分组。
 * 任何分支下若无可识别叶子条件，返回空（and + []）。
 *
 * @param conditions - 原始条件（数组/单对象/空值）。
 * @returns 包含 condRootLogic 与 conditionGroups 的表单结构。
 */
function parseConditionsToForm(conditions: unknown): {
  condRootLogic: 'and' | 'or'
  conditionGroups: AutomationConditionGroup[]
} {
  const empty = { condRootLogic: 'and' as const, conditionGroups: [] as AutomationConditionGroup[] }
  const list = Array.isArray(conditions) ? conditions : conditions ? [conditions] : []
  if (!list.length) return empty

  // 分支 1：单个 and 节点，按子节点还原多分组
  const first = list[0] as Record<string, unknown> | undefined
  if (list.length === 1 && first?.condition === 'and' && Array.isArray(first.conditions)) {
    const groups: AutomationConditionGroup[] = []
    for (const child of first.conditions) {
      const g = parseConditionGroupNode(child)
      if (g) groups.push(g)
    }
    if (groups.length) return { condRootLogic: 'and', conditionGroups: groups }
  }

  // 分支 2：单个 or 节点，扁平化为单个 or 分组
  if (list.length === 1 && first?.condition === 'or' && Array.isArray(first.conditions)) {
    const conditionsFlat = first.conditions
      .map(parseLeafCondition)
      .filter((x): x is AutomationConditionForm => Boolean(x))
    if (conditionsFlat.length) {
      return {
        condRootLogic: 'or',
        conditionGroups: [{ logic: 'or', conditions: conditionsFlat }],
      }
    }
  }

  // 分支 3：兜底，按根逻辑扁平化为单分组
  const rootLogic = detectConditionRootLogic(conditions)
  const flat = list
    .map(parseLeafCondition)
    .filter((x): x is AutomationConditionForm => Boolean(x))
  if (!flat.length) return empty
  return { condRootLogic: rootLogic, conditionGroups: [{ logic: rootLogic, conditions: flat }] }
}

/**
 * 解析单个动作节点为表单动作行。
 *
 * 委托 `parseYamlSeqAction`，传入 automation variant 与默认动作工厂、时长解析器。
 *
 * @param a - 原始动作节点。
 * @returns 表单动作行（可能为 null，表示无法识别）。
 */
function parseAction(a: unknown) {
  return parseYamlSeqAction(a, { defaultAction, parseForSeconds, variant: 'automation' })
}

/**
 * 将自动化 YAML（含 HA 导入格式）解析为联动器表单结构。
 *
 * 调用场景：用户粘贴/导入 HA automation YAML 后，回填到联动器编辑态。
 *
 * 解析流程：
 *   1. 空文本返回空表单。
 *   2. `loadHaYaml` 加载 YAML；解析失败返回空表单（不抛错）。
 *   3. `extractAutomationYamlSections` 抽取 alias/mode/triggers/conditions/actions 区段。
 *   4. alias → automationName；mode 仅接受合法值，否则保持缺省 single。
 *   5. triggers 经 normalizeTriggers 规范化后映射为表单行，包成单个 or 分组。
 *   6. conditions 经 parseConditionsToForm 还原根逻辑与分组。
 *   7. actions 逐项解析，过滤 null。
 *
 * @param yamlStr - YAML 文本（可为空）。
 * @returns 表单结构对象；输入非法时返回全空表单。
 */
export function parseAutomationYamlToForm(yamlStr: string | null | undefined): AutomationFormParsed {
  const empty: AutomationFormParsed = {
    automationName: '',
    automationMode: 'single',
    triggerGroups: [],
    conditionGroups: [],
    condRootLogic: 'and',
    triggerLogic: 'or',
    triggerAndTimeout: 60,
    actions: [],
  }
  if (!yamlStr?.trim()) return empty

  // 加载 YAML；解析失败时静默返回空表单，避免阻断用户编辑流程
  let parsed: unknown
  try {
    parsed = loadHaYaml(yamlStr)
  } catch {
    return empty
  }
  if (!parsed || typeof parsed !== 'object') return empty

  const meta = parseHomeosTriggerMeta(yamlStr)
  const sections = extractAutomationYamlSections(parsed as Record<string, unknown>)
  const result: AutomationFormParsed = { ...empty }
  result.automationName = sections.alias
  // mode 仅接受 HA 合法值，其余保持缺省 single
  if (['single', 'restart', 'queued', 'parallel'].includes(sections.mode)) {
    result.automationMode = sections.mode
  }
  if (meta?.triggerLogic === 'and' || meta?.triggerLogic === 'or') {
    result.triggerLogic = meta.triggerLogic
  }
  if (meta?.triggerAndTimeout != null && Number(meta.triggerAndTimeout) > 0) {
    result.triggerAndTimeout = Number(meta.triggerAndTimeout)
  }

  // 触发器：规范化后映射为表单行；opaque platform 保留原始对象以便往返
  const FORM_FIRST_CLASS = new Set([
    'state',
    'numeric_state',
    'time',
    'sun',
    'homeassistant',
    'event',
    'zone',
    'calendar',
    'device',
  ])
  const triggerForms: AutomationTriggerForm[] = sections.triggers
    ? toUnknownList(sections.triggers).map((raw) => {
        const normalized = normalizeTriggers([raw])[0]
        const form = normalized
          ? normalizedTriggerToForm(normalized)
          : defaultTrigger()
        const platform = String(
          (raw && typeof raw === 'object'
            ? (raw as Record<string, unknown>).platform
            : null) ||
            normalized?.platform ||
            form.type ||
            'state',
        )
        if (
          !FORM_FIRST_CLASS.has(platform) &&
          raw &&
          typeof raw === 'object' &&
          !Array.isArray(raw)
        ) {
          form.opaquePayload = { ...(raw as Record<string, unknown>) }
        }
        return form
      })
    : []

  // 动作：逐项解析；识别 AND 编译产生的前置 wait_for_trigger，还原到触发器组
  let actionList: NonNullable<ReturnType<typeof parseAction>>[] = []
  if (sections.actions) {
    actionList = (Array.isArray(sections.actions) ? sections.actions : [sections.actions])
      .map(parseAction)
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
  }

  const recoveredFromWait: AutomationTriggerForm[] = []
  const shouldRecoverWaits = result.triggerLogic === 'and' || Boolean(meta?.hasSequence)
  if (shouldRecoverWaits && actionList.length) {
    while (actionList.length && actionList[0]?.type === 'wait_for_trigger') {
      const waitAct = actionList.shift()!
      const waitTrig: AutomationTriggerForm = {
        ...defaultTrigger(),
        type: String(waitAct.waitTriggerType || waitAct._waitTriggerType || 'state'),
        entityId: String(waitAct.entityId || ''),
        stateFrom: String(waitAct._waitStateFrom || ''),
        stateTo: String(waitAct.waitStateTo || waitAct._waitStateTo || 'on'),
        eventType: String(waitAct.waitEventType || waitAct._waitEventType || ''),
        at: String(waitAct._waitAt || ''),
        zoneId: String(waitAct._waitZoneId || ''),
        numOp: String(waitAct.waitNumOp || waitAct._waitNumOp || 'above'),
        numValue: String(waitAct.waitNumValue || waitAct._waitNumValue || ''),
      }
      if (waitAct._waitEvent != null) {
        if (waitTrig.type === 'sun') waitTrig.sunEvent = String(waitAct._waitEvent)
        if (waitTrig.type === 'zone') waitTrig.zoneEvent = String(waitAct._waitEvent)
        if (waitTrig.type === 'calendar') waitTrig.calendarEvent = String(waitAct._waitEvent)
        if (waitTrig.type === 'homeassistant') waitTrig.haEvent = String(waitAct._waitEvent)
      }
      if (waitTrig.type === 'event' || waitTrig.eventType) {
        const et = waitTrig.eventType
        if (et === 'presence.everyoneLeft') {
          waitTrig.type = 'presence'
          waitTrig.presenceKind = 'leave_all'
        } else if (et === 'presence.changed') {
          waitTrig.type = 'presence'
          waitTrig.presenceKind = 'arrive'
        } else if (et === 'homeos.automation.enabled') {
          waitTrig.type = 'onload'
        }
      }
      recoveredFromWait.push(waitTrig)
      if (waitAct.waitTimeout != null) {
        result.triggerAndTimeout = Number(waitAct.waitTimeout) || result.triggerAndTimeout
      }
    }
  }

  const allTriggers = [...triggerForms, ...recoveredFromWait]
  if (allTriggers.length > 0) {
    if (meta?.hasSequence && allTriggers.length > 1) {
      // 还原为单个 sequence 触发器
      result.triggerGroups = [
        {
          logic: 'or',
          triggers: [
            {
              ...defaultTrigger(),
              type: 'sequence',
              sequenceSteps: allTriggers,
              sequenceTimeout: result.triggerAndTimeout,
            },
          ],
        },
      ]
    } else {
      result.triggerGroups = [
        {
          logic: result.triggerLogic === 'and' ? 'and' : 'or',
          triggers: allTriggers,
        },
      ]
    }
  }

  // 条件：还原根逻辑与分组
  if (sections.conditions) {
    const formConds = parseConditionsToForm(sections.conditions)
    result.condRootLogic = formConds.condRootLogic
    result.conditionGroups = formConds.conditionGroups
  }

  result.actions = actionList
  return result
}