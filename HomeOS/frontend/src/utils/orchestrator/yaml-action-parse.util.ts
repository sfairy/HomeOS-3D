/**
 * 编排器 YAML 动作 / sequence 项解析（脚本与自动化共用）
 *
 * 职责：
 * - 提供编排器动作表单的默认值工厂（createDefaultOrchestratorAction）。
 * - 把 HA 自动化 / 脚本的 YAML sequence 项解析为 OrchestratorActionForm 表单结构。
 * - 处理 call_service / delay / choose / wait / scene / 等动作变体与 choose 分支嵌套。
 * - 反向把表单序列化为 YAML，对齐 HA 自动化语义。
 *
 * 依赖：
 * - @homeos/shared 的 entityIdToFormString / parseSunOffsetMinutes / parseWeekdays / dumpHaYaml。
 * - @/types/orchestrator-builder 的表单类型。
 * - @/utils/orchestrator/choose-branch-condition.util 的分支条件工具。
 *
 * 注意：
 * - 动作 type（callService / delay / choose / ...）为表单 key，不翻译。
 * - HA service 名（light.turn_on / ...）为配置值，不翻译。
 */
import { entityIdToFormString, parseSunOffsetMinutes, parseWeekdays, dumpHaYaml } from '@homeos/shared'
import type {
  AutomationConditionForm,
  OrchestratorActionForm,
  OrchestratorActionVariant,
  OrchestratorBranchAction,
  OrchestratorChooseBranch,
  YamlActionParseContext,
} from '@/types/orchestrator-builder'
import {
  applyConditionToChooseBranchFlat,
  createEmptyAutomationCondition,
} from '@/utils/orchestrator/choose-branch-condition.util'

/**
 * 创建默认编排器动作表单。
 *
 * 入参：variant（automation / script），用于决定附加字段（automation: sceneId/scriptId；script: notifySvc）。
 * 返回：OrchestratorActionForm 的默认值（type=callService、seconds=1、repeatType=count 等）。
 */
export function createDefaultOrchestratorAction(
  variant: OrchestratorActionVariant = 'automation',
): OrchestratorActionForm {
  const base: OrchestratorActionForm = {
    type: 'callService',
    domain: '',
    service: '',
    entityId: '',
    data: '',
    seconds: 1,
    message: '',
    notifyMsg: '',
    eventType: '',
    eventData: '',
    waitTimeout: '',
    waitTemplate: '',
    waitTriggerType: 'state',
    waitStateTo: 'on',
    waitEventType: '',
    waitNumOp: 'above',
    waitNumValue: '',
    branches: [],
    repeatCount: 1,
    repeatType: 'count',
    repeatEntityId: '',
    repeatCondState: 'on',
  }
  if (variant === 'automation') {
    return { ...base, sceneId: '', scriptId: '' }
  }
  return { ...base, notifySvc: '' }
}

/** entity_id 归一化为表单字符串（数组 / 标量统一） */
function entityIdStr(v: unknown) {
  return entityIdToFormString(v)
}

/**
 * 把 delay 原始值解析为秒数。
 *
 * - 数字直接返回。
 * - 字符串优先调用 parseForSeconds（HA duration），失败回退到 parseInt。
 * - 默认返回 1，避免 0 秒无效延迟。
 */
function parseDelaySeconds(
  raw: unknown,
  parseForSeconds?: ((raw: unknown) => string) | null,
) {
  if (typeof raw === 'number') return raw
  if (parseForSeconds) return parseInt(parseForSeconds(raw), 10) || 1
  return parseInt(String(raw), 10) || 1
}

/** 解析单条叶子条件为 AutomationConditionForm */
function parseOneLeafCondition(c: unknown): AutomationConditionForm | null {
  if (!c || typeof c !== 'object') return null
  const cond = c as Record<string, unknown>
  const kind = cond.condition

  if (kind === 'homeos_variable') {
    const opRaw = String(cond.operator || '==')
    const opMap: Record<string, string> = {
      '==': 'var_eq',
      '=': 'var_eq',
      '>': 'var_gt',
      '<': 'var_lt',
      '>=': 'var_gte',
      '<=': 'var_lte',
      '!=': 'var_neq',
      '<>': 'var_neq',
    }
    return createEmptyAutomationCondition({
      operator: opMap[opRaw] || 'var_eq',
      varKey: cond.key != null ? String(cond.key) : '',
      varScope: cond.scope === 'rule' ? 'rule' : 'global',
      state:
        cond.value != null ? String(cond.value) : cond.state != null ? String(cond.state) : '',
    })
  }

  if (kind === 'numeric_state') {
    const attr =
      cond.attribute != null && String(cond.attribute) ? String(cond.attribute) : undefined
    const forSec = cond.for != null ? String(cond.for) : ''
    if (cond.above != null && cond.below != null) {
      return createEmptyAutomationCondition({
        entityId: entityIdStr(cond.entity_id),
        operator: 'between',
        state: String(cond.above),
        stateTo: String(cond.below),
        attribute: attr || '',
        forSeconds: forSec,
      })
    }
    let operator = 'gt'
    let state = '0'
    if (cond.above != null) {
      operator = 'gt'
      state = String(cond.above)
    } else if (cond.below != null) {
      operator = 'lt'
      state = String(cond.below)
    }
    return createEmptyAutomationCondition({
      entityId: entityIdStr(cond.entity_id),
      operator,
      state,
      attribute: attr || '',
      forSeconds: forSec,
    })
  }

  if (kind === 'sun') {
    const offsetRaw = cond.after_offset ?? cond.before_offset
    const sunOffset = offsetRaw != null ? parseSunOffsetMinutes(offsetRaw) : 0
    if (cond.after != null) {
      return createEmptyAutomationCondition({
        operator: 'sun_after',
        state: String(cond.after),
        sunOffset,
        days: [],
      })
    }
    if (cond.before != null) {
      return createEmptyAutomationCondition({
        operator: 'sun_before',
        state: String(cond.before),
        sunOffset,
        days: [],
      })
    }
    return null
  }

  if (kind === 'time') {
    const daysRaw = cond.weekday ?? cond.days
    let days: number[] | undefined
    if (Array.isArray(daysRaw)) {
      const map: Record<string, number> = {
        sun: 0,
        mon: 1,
        tue: 2,
        wed: 3,
        thu: 4,
        fri: 5,
        sat: 6,
      }
      days = daysRaw
        .map((d) => {
          if (typeof d === 'number') return d
          return map[String(d).toLowerCase().slice(0, 3)] ?? Number(d)
        })
        .filter((n) => Number.isFinite(n))
    }
    if (cond.after != null) {
      return createEmptyAutomationCondition({
        operator: 'time_after',
        state: String(cond.after),
        days: days || [],
      })
    }
    if (cond.before != null) {
      return createEmptyAutomationCondition({
        operator: 'time_before',
        state: String(cond.before),
        days: days || [],
      })
    }
    if (days && days.length) {
      return createEmptyAutomationCondition({
        operator: 'weekday',
        state: '',
        days,
      })
    }
    return null
  }

  if (kind === 'template' && cond.value_template) {
    const tpl = String(cond.value_template)
    const numCmp = tpl.match(
      /(?:states\s*\(\s*'([^']+)'\s*\)|state_attr\s*\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\))\s*\|\s*float(?:\([^)]*\))?\s*(>=|<=|>|<)\s*([\d.]+)/i,
    )
    if (numCmp) {
      const opMap: Record<string, string> = {
        '>=': 'gte',
        '<=': 'lte',
        '>': 'gt',
        '<': 'lt',
      }
      const entityId = numCmp[1] || numCmp[2] || ''
      const attr = numCmp[3] || ''
      return createEmptyAutomationCondition({
        entityId,
        operator: opMap[numCmp[4]] || 'gte',
        state: numCmp[5],
        attribute: attr,
      })
    }
    const m = tpl.match(/'\s*([^']*?)\s*'\s+in\s+states\s*\(\s*'([^']+)'\s*\)/)
    if (m) {
      return createEmptyAutomationCondition({
        entityId: m[2],
        operator: 'contains',
        state: m[1],
      })
    }
    return null
  }

  if (kind === 'state') {
    const forSec = cond.for != null ? String(cond.for) : ''
    return createEmptyAutomationCondition({
      entityId: entityIdStr(cond.entity_id),
      operator: forSec ? 'state_for' : 'eq',
      state: String(cond.state ?? 'on'),
      attribute:
        cond.attribute != null && String(cond.attribute) ? String(cond.attribute) : '',
      forSeconds: forSec,
    })
  }

  if (kind === 'not' && Array.isArray(cond.conditions)) {
    const inner = cond.conditions[0] as Record<string, unknown> | undefined
    if (inner?.condition === 'state') {
      return createEmptyAutomationCondition({
        entityId: entityIdStr(inner.entity_id),
        operator: 'neq',
        state: String(inner.state ?? 'on'),
        attribute:
          inner.attribute != null && String(inner.attribute) ? String(inner.attribute) : '',
      })
    }
    const leaf = parseOneLeafCondition(inner)
    if (!leaf) return null
    if (leaf.operator === 'neq') {
      return createEmptyAutomationCondition({
        ...leaf,
        operator: 'eq',
        negated: false,
      })
    }
    if (leaf.negated) {
      return createEmptyAutomationCondition({ ...leaf, negated: false })
    }
    return createEmptyAutomationCondition({ ...leaf, negated: true })
  }

  if (cond.entity_id != null && cond.state != null) {
    return createEmptyAutomationCondition({
      entityId: entityIdStr(cond.entity_id),
      operator: 'eq',
      state: String(cond.state),
      attribute:
        cond.attribute != null && String(cond.attribute) ? String(cond.attribute) : '',
    })
  }

  return null
}

/** 从 choose / repeat 条件块解析（支持多条件 and/or） */
function parseSimpleStateCondition(conds: unknown): OrchestratorChooseBranch {
  const rawList = Array.isArray(conds) ? conds : conds ? [conds] : []
  let logic: 'and' | 'or' = 'and'
  let items: unknown[] = rawList

  if (rawList.length === 1 && rawList[0] && typeof rawList[0] === 'object') {
    const only = rawList[0] as Record<string, unknown>
    if (only.condition === 'and' || only.condition === 'or') {
      logic = only.condition
      items = Array.isArray(only.conditions) ? only.conditions : []
    }
  }

  const conditions: AutomationConditionForm[] = []
  for (const c of items) {
    const leaf = parseOneLeafCondition(c)
    if (leaf) {
      conditions.push(leaf)
      continue
    }
    // 嵌套 and/or：展平一层子叶子
    if (c && typeof c === 'object') {
      const obj = c as Record<string, unknown>
      if (
        (obj.condition === 'and' || obj.condition === 'or') &&
        Array.isArray(obj.conditions)
      ) {
        if (obj.condition === 'or') logic = 'or'
        for (const k of obj.conditions) {
          const inner = parseOneLeafCondition(k)
          if (inner) conditions.push(inner)
        }
      }
    }
  }

  const branchConditions = conditions.length ? conditions : [createEmptyAutomationCondition()]
  const branch: OrchestratorChooseBranch = {
    actions: [] as OrchestratorBranchAction[],
    condLogic: logic,
    conditions: branchConditions,
  }
  applyConditionToChooseBranchFlat(branch, branchConditions[0])
  return branch
}

/** choose 分支内单条动作（子集，对齐 OrchestratorActionEditor 分支动作模型） */
function parseBranchYamlAction(
  a: unknown,
  ctx: YamlActionParseContext,
): OrchestratorBranchAction | null {
  const act = parseBranchYamlActionBody(a, ctx)
  if (!act) return null
  if (a && typeof a === 'object' && 'continue_on_error' in (a as object)) {
    act.continueOnError = Boolean((a as Record<string, unknown>).continue_on_error)
  }
  return act
}

/** choose 分支内单条动作：复用顶层解析，保留 variable/repeat/wait 等完整字段 */
function parseBranchYamlActionBody(
  a: unknown,
  ctx: YamlActionParseContext,
): OrchestratorBranchAction | null {
  if (!a || typeof a !== 'object') return null
  const full = parseYamlSeqAction(a, ctx)
  if (!full) return null
  return { ...full } as OrchestratorBranchAction
}

/**
 * 解析 choose 块的分支列表（含 default）。
 *
 * - 对每个分支调用 parseSimpleStateCondition 解析 conditions。
 * - 分支 actions 调用 parseBranchYamlAction 解析。
 * - default 分支单独标记 isDefault=true。
 */
function parseChooseBranches(
  chooseRaw: unknown,
  ctx: YamlActionParseContext,
): OrchestratorChooseBranch[] {
  const branches: OrchestratorChooseBranch[] = []
  if (chooseRaw == null) return branches

  const list = Array.isArray(chooseRaw) ? chooseRaw : [chooseRaw]
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const obj = item as Record<string, unknown>

    if ('default' in obj) {
      const branch = parseSimpleStateCondition(null)
      branch.isDefault = true
      const seq = Array.isArray(obj.default) ? obj.default : obj.default ? [obj.default] : []
      branch.actions = seq
        .map((a) => parseBranchYamlAction(a, ctx))
        .filter((x): x is OrchestratorBranchAction => Boolean(x))
      branches.push(branch)
      continue
    }

    const branch = parseSimpleStateCondition(obj.conditions)
    const seqRaw = obj.sequence ?? obj.actions
    const seq = Array.isArray(seqRaw) ? seqRaw : seqRaw ? [seqRaw] : []
    branch.actions = seq
      .map((a) => parseBranchYamlAction(a, ctx))
      .filter((x): x is OrchestratorBranchAction => Boolean(x))
    branches.push(branch)
  }
  return branches
}

/**
 * 解析 repeat 块到 act 字段：for_each / count / while / until 四种模式 + 子序列。
 *
 * - for_each：保留原始字符串 / YAML 序列化形式。
 * - while / until：复用 parseSimpleStateCondition 提取 entityId / condState。
 * - 子序列 repeatActions 走 parseBranchYamlAction。
 */
function parseRepeatBlock(
  repeat: Record<string, unknown>,
  act: OrchestratorActionForm,
  ctx: YamlActionParseContext,
) {
  if (repeat.for_each != null) {
    act.repeatType = 'for_each'
    try {
      act.repeatForEach =
        typeof repeat.for_each === 'string'
          ? repeat.for_each
          : dumpHaYaml(repeat.for_each).trimEnd()
    } catch {
      act.repeatForEach = String(repeat.for_each)
    }
  } else if (repeat.count != null) {
    act.repeatType = 'count'
    act.repeatCount = Number(repeat.count) || 1
  } else if (repeat.while != null) {
    act.repeatType = 'while'
    const cond = parseSimpleStateCondition(repeat.while)
    act.repeatEntityId = cond.condEntityId
    act.repeatCondState = cond.condState
  } else if (repeat.until != null) {
    act.repeatType = 'until'
    const cond = parseSimpleStateCondition(repeat.until)
    act.repeatEntityId = cond.condEntityId
    act.repeatCondState = cond.condState
  }

  const seq = Array.isArray(repeat.sequence)
    ? repeat.sequence
    : repeat.sequence
      ? [repeat.sequence]
      : []
  if (seq.length) {
    act.repeatActions = seq
      .map((a) => parseBranchYamlAction(a, ctx))
      .filter((x): x is OrchestratorBranchAction => Boolean(x))
  }
}

/**
 * 将 YAML sequence 项解析为表单动作（delay / fire_event / 服务调用）。
 */
export function parseYamlSeqAction(
  a: unknown,
  ctx: YamlActionParseContext,
): OrchestratorActionForm | null {
  const act = parseYamlSeqActionBody(a, ctx)
  if (!act) return null
  if (a && typeof a === 'object' && 'continue_on_error' in (a as object)) {
    act.continueOnError = Boolean((a as Record<string, unknown>).continue_on_error)
  }
  return act
}

/**
 * YAML sequence 项主体解析（不含 continue_on_error）。
 *
 * 按 YAML key 分支：delay / event / wait_template / wait_for_trigger / choose /
 * repeat / parallel / if / sequence / stop / variables / scene / device / service 调用族。
 *
 * 各分支产出 OrchestratorActionForm；未识别返回 null。
 */
function parseYamlSeqActionBody(
  a: unknown,
  ctx: YamlActionParseContext,
): OrchestratorActionForm | null {
  if (!a || typeof a !== 'object') return null
  const obj = a as Record<string, unknown>
  const { defaultAction, parseForSeconds, variant } = ctx

  if (obj.delay != null && !obj.service && !obj.action) {
    const act = defaultAction()
    act.type = 'delay'
    act.seconds = parseDelaySeconds(obj.delay, parseForSeconds)
    return act
  }

  if (obj.event != null && !obj.service && !obj.action) {
    const eventName = String(obj.event)
    const eventData =
      obj.event_data && typeof obj.event_data === 'object'
        ? (obj.event_data as Record<string, unknown>)
        : null
    if (eventName === 'homeMode.activate.request' || eventName === 'homeos.home_mode.set') {
      const act = defaultAction()
      act.type = 'home_mode'
      act.modeId = eventData?.mode_id != null ? String(eventData.mode_id) : ''
      return act
    }
    if (eventName === 'notification.homeos.send') {
      const act = defaultAction()
      act.type = 'notify_homeos'
      act.notifyMsg = eventData?.message != null ? String(eventData.message) : ''
      return act
    }
    if (variant === 'automation' && (eventName === 'homeos.loop_start' || eventName === 'homeos.loop_stop')) {
      const act = defaultAction()
      act.type = eventName === 'homeos.loop_start' ? 'loop_start' : 'loop_stop'
      act.entityId = eventData?.automation_id != null ? String(eventData.automation_id) : ''
      return act
    }
    if (eventName === 'homeos.geek_debug') {
      const act = defaultAction()
      act.type = 'debug'
      act.notifyMsg = eventData?.message != null ? String(eventData.message) : '调试点'
      return act
    }
    if (eventName === 'homeos.scene.execute') {
      const act = defaultAction()
      act.type = 'scene'
      const sid = eventData?.scene_id != null ? String(eventData.scene_id) : ''
      act.sceneId = sid
      act.entityId = sid
      return act
    }
    if (eventName === 'homeos.script.execute') {
      const act = defaultAction()
      act.type = 'script'
      const sid = eventData?.script_id != null ? String(eventData.script_id) : ''
      act.scriptId = sid
      act.entityId = sid
      return act
    }
    const act = defaultAction()
    act.type = 'fire_event'
    act.eventType = eventName
    act.eventData = obj.event_data ? JSON.stringify(obj.event_data) : ''
    return act
  }

  // choose/repeat/parallel/wait/stop 等为脚本与自动化共用结构（不再门控 automation）
  if (obj.wait_template != null) {
    const act = defaultAction()
    act.type = 'wait_template'
    act.waitTemplate = String(obj.wait_template)
    if (obj.timeout != null && parseForSeconds) act.waitTimeout = parseForSeconds(obj.timeout)
    if (obj.continue_on_timeout != null) {
      act.continueOnTimeout =
        obj.continue_on_timeout === true ||
        obj.continue_on_timeout === 'true' ||
        obj.continue_on_timeout === 1
    } else {
      act.continueOnTimeout = false
    }
    return act
  }
  if (obj.wait_for_trigger != null) {
    const act = defaultAction()
    act.type = 'wait_for_trigger'
    if (obj.timeout != null && parseForSeconds) act.waitTimeout = parseForSeconds(obj.timeout)
    if (obj.continue_on_timeout != null) {
      act.continueOnTimeout =
        obj.continue_on_timeout === true ||
        obj.continue_on_timeout === 'true' ||
        obj.continue_on_timeout === 1
    } else {
      act.continueOnTimeout = false
    }
    const waitRaw = obj.wait_for_trigger
    const waitList = Array.isArray(waitRaw) ? waitRaw : waitRaw ? [waitRaw] : []
    const first = waitList[0]
    if (waitList.length > 1) {
      act.waitExtraTriggers = waitList
        .slice(1)
        .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object')
        .map((x) => ({ ...(x as Record<string, unknown>) }))
    }
    if (first && typeof first === 'object') {
      const wt = first as Record<string, unknown>
      const platform = String(wt.platform || 'state')
      act.entityId = entityIdToFormString(
        wt.entity_id ?? (wt.target as Record<string, unknown> | undefined)?.entity_id,
      )
      // 保留原始 platform，便于 AND / sequence 还原（不只是 state/numeric/event）
      act.waitTriggerType = platform === 'numeric_state' ? 'numeric' : platform
      act._waitTriggerType = act.waitTriggerType
      if (wt.to != null) {
        act.waitStateTo = String(wt.to)
        act._waitStateTo = String(wt.to)
      }
      if (wt.from != null) act._waitStateFrom = String(wt.from)
      if (wt.event_type != null) {
        act.waitEventType = String(wt.event_type)
        act._waitEventType = String(wt.event_type)
      }
      if (wt.above != null) {
        act.waitNumOp = 'above'
        act.waitNumValue = String(wt.above)
        act._waitNumOp = 'above'
        act._waitNumValue = String(wt.above)
      }
      if (wt.below != null) {
        act.waitNumOp = 'below'
        act.waitNumValue = String(wt.below)
        act._waitNumOp = 'below'
        act._waitNumValue = String(wt.below)
      }
      if (wt.at != null) act._waitAt = String(wt.at)
      if (wt.weekday != null || wt.days != null) {
        const wd = parseWeekdays(wt.weekday ?? wt.days)
        if (Array.isArray(wd) && wd.length) act._waitDays = wd
      }
      if (wt.zone != null) act._waitZoneId = String(wt.zone)
      if (wt.event != null) act._waitEvent = String(wt.event)
      if (wt.offset != null) {
        act._waitSunOffset = parseSunOffsetMinutes(wt.offset)
      }
      if (wt.interval != null || (wt.event_data && typeof wt.event_data === 'object')) {
        const ed =
          wt.event_data && typeof wt.event_data === 'object' && !Array.isArray(wt.event_data)
            ? (wt.event_data as Record<string, unknown>)
            : null
        if (ed?.interval != null) act._waitIntervalSeconds = Number(ed.interval) || 60
        if (ed?.key != null) act._waitVarKey = String(ed.key)
        if (ed?.value != null) act._waitVarValue = String(ed.value)
      }
      if (wt.device_id != null) act._waitDeviceId = String(wt.device_id)
      if (wt.domain != null) act._waitDomain = String(wt.domain)
      if (wt.type != null && platform === 'device') act._waitDeviceType = String(wt.type)
      if (wt.attribute != null) {
        act.waitAttribute = String(wt.attribute)
        act.attribute = String(wt.attribute)
      }
      if (wt.event_data && typeof wt.event_data === 'object' && !Array.isArray(wt.event_data)) {
        const ed = wt.event_data as Record<string, unknown>
        const keys = Object.keys(ed)
        if (keys[0]) {
          act.waitEventDataKey = keys[0]
          act.waitEventDataVal = ed[keys[0]] != null ? String(ed[keys[0]]) : ''
        }
      }
    } else {
      act.waitTriggerType = 'state'
      act.waitStateTo = 'on'
    }
    return act
  }
  if (obj.choose != null) {
    const act = defaultAction()
    act.type = 'choose'
    act.branches = parseChooseBranches(obj.choose, ctx)
    if (obj.default != null) {
      const defaultBranch = parseSimpleStateCondition(null)
      defaultBranch.isDefault = true
      const seq = Array.isArray(obj.default) ? obj.default : obj.default ? [obj.default] : []
      defaultBranch.actions = seq
        .map((item: unknown) => parseBranchYamlAction(item, ctx))
        .filter((x): x is OrchestratorBranchAction => Boolean(x))
      act.branches.push(defaultBranch)
    }
    return act
  }
  if (obj.repeat != null) {
    const act = defaultAction()
    act.type = 'repeat'
    const repeat =
      typeof obj.repeat === 'object' && obj.repeat
        ? (obj.repeat as Record<string, unknown>)
        : { count: obj.repeat }
    parseRepeatBlock(repeat, act, ctx)
    if (act.repeatType !== 'for_each' && act.repeatCount == null) {
      act.repeatCount = Number(repeat.count) || 1
    }
    return act
  }
  if (obj.parallel != null) {
    const act = defaultAction()
    act.type = 'parallel'
    const raw = Array.isArray(obj.parallel) ? obj.parallel : []
    const branches: OrchestratorActionForm[][] = []
    const flat: OrchestratorBranchAction[] = []
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue
      const row = item as Record<string, unknown>
      if (row.sequence != null) {
        const seq = Array.isArray(row.sequence) ? row.sequence : [row.sequence]
        const steps = seq
          .map((s) => parseYamlSeqAction(s, ctx))
          .filter((x): x is OrchestratorActionForm => Boolean(x))
        if (steps.length) {
          branches.push(steps)
          flat.push(steps[0] as OrchestratorBranchAction)
        }
      } else {
        const one = parseYamlSeqAction(item, ctx)
        if (one) {
          branches.push([one])
          flat.push(one as OrchestratorBranchAction)
        }
      }
    }
    act.parallelBranches = branches
    act.parallelActions = flat
    return act
  }
  // HA if/then/else → choose（规范化）
  if (obj.if != null) {
    const act = defaultAction()
    act.type = 'choose'
    const thenSeq = Array.isArray(obj.then) ? obj.then : obj.then ? [obj.then] : []
    const branch = parseSimpleStateCondition(obj.if)
    branch.actions = thenSeq
      .map((item) => parseBranchYamlAction(item, ctx))
      .filter((x): x is OrchestratorBranchAction => Boolean(x))
    act.branches = [branch]
    if (obj.else != null) {
      const elseBranch = parseSimpleStateCondition(null)
      elseBranch.isDefault = true
      const elseSeq = Array.isArray(obj.else) ? obj.else : [obj.else]
      elseBranch.actions = elseSeq
        .map((item) => parseBranchYamlAction(item, ctx))
        .filter((x): x is OrchestratorBranchAction => Boolean(x))
      act.branches.push(elseBranch)
    }
    return act
  }
  if (obj.sequence != null) {
    const act = defaultAction()
    act.type = 'sequence'
    const seq = Array.isArray(obj.sequence) ? obj.sequence : [obj.sequence]
    const steps = seq
      .map((s) => parseYamlSeqAction(s, ctx))
      .filter((x): x is OrchestratorActionForm => Boolean(x))
    act.parallelActions = steps as OrchestratorBranchAction[]
    return act
  }
  if ('stop' in obj) {
    const act = defaultAction()
    act.type = 'stop'
    act.notifyMsg = typeof obj.stop === 'string' ? obj.stop : ''
    act.data = obj.error ? 'error: true' : ''
    return act
  }
  if (obj.variables && typeof obj.variables === 'object') {
    const act = defaultAction()
    act.type = 'variables'
    act.variablesMap = Object.entries(obj.variables as Record<string, unknown>)
      .map(([k, v]) => `${k}=${v}`)
      .join(',')
    return act
  }
  if (obj.scene != null && obj.scene !== '') {
    const act = defaultAction()
    act.type = 'scene'
    const sceneRaw = String(obj.scene).trim()
    const sceneId = sceneRaw.includes('.') ? sceneRaw : `scene.${sceneRaw}`
    act.sceneId = sceneId
    act.entityId = sceneId
    return act
  }
  if (obj.device_id != null && String(obj.device_id)) {
    const act = defaultAction()
    act.type = 'deviceAction'
    act.entityId = entityIdStr(obj.entity_id)
    act.domain = obj.domain != null ? String(obj.domain) : ''
    act.service = obj.type != null ? String(obj.type) : ''
    act.data = JSON.stringify({
      device_id: String(obj.device_id),
      ...(obj.domain != null ? { domain: String(obj.domain) } : {}),
      ...(obj.type != null ? { type: String(obj.type) } : {}),
    })
    return act
  }

  const svc = obj.service || obj.action
  if (!svc) return null

  const dotIdx = String(svc).indexOf('.')
  const domain = dotIdx >= 0 ? String(svc).slice(0, dotIdx) : ''
  const service = dotIdx >= 0 ? String(svc).slice(dotIdx + 1) : String(svc)
  const target = obj.target as Record<string, unknown> | undefined
  const eid = entityIdStr(obj.entity_id || target?.entity_id)
  const data = obj.data as Record<string, unknown> | undefined

  if (domain === 'scene') {
    const act = defaultAction()
    act.type = 'scene'
    act.sceneId = eid
    act.entityId = eid
    return act
  }
  if (domain === 'script') {
    const act = defaultAction()
    act.type = 'script'
    act.scriptId = eid
    act.entityId = eid
    return act
  }
  if (domain === 'automation' && (service === 'trigger' || service === 'turn_on')) {
    const act = defaultAction()
    act.type = 'trigger_automation'
    act.entityId = eid
    act.domain = 'automation'
    act.service = 'trigger'
    return act
  }
  if (domain === 'notify') {
    const act = defaultAction()
    act.type = 'notify'
    // notify.mobile_app_xxx → 完整服务名；notify.notify + target.entity_id → 目标实体
    let notifyTarget = ''
    if (service && service !== 'notify') {
      notifyTarget = `notify.${service}`
    } else if (eid) {
      notifyTarget = eid.includes('.') ? eid : `notify.${eid}`
    }
    if (variant === 'automation') {
      act.message = notifyTarget
      act.notifyMsg = data?.message != null ? String(data.message) : ''
    } else {
      act.notifySvc = notifyTarget
      act.notifyMsg = data?.message != null ? String(data.message) : ''
    }
    return act
  }

  if (domain === 'homeos' && service === 'variable_set') {
    const act = defaultAction()
    const op = String(data?.op || 'set')
    act.type = op === 'concat' && !data?.source_entity_id ? 'var_concat' : 'variable_set'
    act.varKey = data?.key != null ? String(data.key) : ''
    act.varScope = data?.scope === 'rule' ? 'rule' : 'global'
    act.varOp = op
    act.varType = data?.type === 'number' ? 'number' : 'string'
    act.varValue = data?.value != null ? String(data.value) : ''
    act.concatParts = act.type === 'var_concat' ? act.varValue : ''
    act.concatSourceVar = data?.source_var != null ? String(data.source_var) : ''
    act.mathRhsVar = act.concatSourceVar
    act.varSourceVar = act.type === 'variable_set' && data?.source_var != null ? String(data.source_var) : ''
    act.varSourceEntityId = data?.source_entity_id != null ? String(data.source_entity_id) : ''
    act.varSourceAttribute = data?.source_attribute != null ? String(data.source_attribute) : ''
    return act
  }
  if (domain === 'homeos' && service === 'variable_math') {
    const act = defaultAction()
    act.type = 'var_math'
    act.varKey = data?.key != null ? String(data.key) : ''
    act.varScope = data?.scope === 'rule' ? 'rule' : 'global'
    act.mathOp = data?.op != null ? String(data.op) : '+'
    act.mathLhs = data?.lhs != null ? String(data.lhs) : '0'
    act.mathRhs = data?.rhs != null ? String(data.rhs) : '0'
    act.mathLhsVar = data?.lhs_var != null ? String(data.lhs_var) : ''
    act.mathRhsVar = data?.rhs_var != null ? String(data.rhs_var) : ''
    return act
  }
  if (domain === 'homeos' && service === 'variable_fn') {
    const act = defaultAction()
    act.type = 'var_fn'
    act.varKey = data?.key != null ? String(data.key) : ''
    act.varScope = data?.scope === 'rule' ? 'rule' : 'global'
    act.fnName = data?.fn != null ? String(data.fn) : 'round'
    act.fnArg = data?.arg != null ? String(data.arg) : ''
    act.fnArgVar = data?.arg_var != null ? String(data.arg_var) : ''
    act.fnDigits = data?.digits != null ? Number(data.digits) || 0 : 0
    act.varSourceEntityId = data?.source_entity_id != null ? String(data.source_entity_id) : ''
    act.varSourceAttribute = data?.source_attribute != null ? String(data.source_attribute) : ''
    return act
  }

  const act = defaultAction()
  act.type = 'callService'
  act.domain = domain
  act.service = service
  act.entityId = eid
  applyServiceTargetFields(act, target)
  if (data && Object.keys(data).length > 0) act.data = JSON.stringify(data)
  return act
}

/** target.area_id / device_id / label_id → 表单字段（数组转逗号分隔） */
function applyServiceTargetFields(
  act: OrchestratorActionForm,
  target: Record<string, unknown> | undefined,
) {
  if (!target || typeof target !== 'object') return
  const area = targetIdToForm(target.area_id)
  const device = targetIdToForm(target.device_id)
  const label = targetIdToForm(target.label_id)
  if (area) act.targetAreaId = area
  if (device) act.targetDeviceId = device
  if (label) act.targetLabelId = label
}

/** target id 数组转逗号分隔字符串，标量原样返回 */
function targetIdToForm(raw: unknown): string {
  if (raw == null) return ''
  if (Array.isArray(raw)) {
    return raw
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .join(', ')
  }
  return String(raw).trim()
}
