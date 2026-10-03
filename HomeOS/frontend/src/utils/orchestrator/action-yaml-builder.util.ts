/**
 * 联动器动作 YAML 构建器
 *
 * 职责：
 * - 把编排器动作表单（OrchestratorActionForm）构建为 HA 动作 YAML 片段。
 * - 复用 choose / data / 时长 / 实体 / 标量等格式化工具，对齐 HA 自动化语义。
 *
 * 依赖：./yaml-preview-helpers.util 的 YAML 格式化工具与表单类型。
 *
 * 注意：
 * - 动作 type（callService / delay / choose / ...）与 HA service 名为配置值，不翻译。
 * - YAML key 与 HA 自动化字段对齐，不翻译。
 */
import {
  formatChooseActionYaml,
  formatDataYamlLines,
  formatDurationSeconds,
  formatYamlEntityId,
  formatYamlScalar,
  resolveActionData,
} from './yaml-preview-helpers.util'
import { formatWaitForTriggerYamlLines, waitActionToTriggerForm } from './automation-trigger-yaml.util'
import type {
  OrchestratorActionForm,
  OrchestratorActionYamlContext,
  OrchestratorBranchAction,
  ServiceDataPanel,
} from '@/types/orchestrator-builder'
import { dumpHaYaml, loadHaYaml } from '@homeos/shared'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 自动化 / 脚本 Builder 共用的 action YAML 行生成
 */
export function formatOrchestratorActionYamlLines(
  a: OrchestratorActionForm,
  ctx: OrchestratorActionYamlContext,
) {
  const indent = ctx.indent ?? '  '
  const L = formatOrchestratorActionYamlLinesBody(a, ctx)
  if (a.continueOnError && L.length > 0) {
    L.push(`${indent}  continue_on_error: true`)
  }
  return L
}

/**
 * 动作主体 YAML 行生成（不含 continue_on_error）。
 *
 * 按 a.type 分支派发：callService / delay / choose / repeat / parallel / 变量族 / 事件族 等。
 * 各分支产出 HA 自动化语义下的动作片段，未识别的 type 返回空列表（保守降级）。
 */
function formatOrchestratorActionYamlLinesBody(
  a: OrchestratorActionForm,
  ctx: OrchestratorActionYamlContext,
) {
  const indent = ctx.indent ?? '  '
  const L: string[] = []

  if (a.type === 'callService') {
    L.push(`${indent}- service: ${a.domain || 'light'}.${a.service || 'turn_on'}`)
    pushServiceTargetYamlLines(L, indent, a)
    const dataObj = resolveActionData(a, ctx.dataPanel as ServiceDataPanel | null | undefined, ctx.panelOpen)
    if (dataObj && Object.keys(dataObj).length) {
      L.push(`${indent}  data:`)
      L.push(...formatDataYamlLines(dataObj, indent.length + 4))
    }
    return L
  }

  if (a.type === 'trigger_automation') {
    L.push(`${indent}- service: automation.trigger`)
    L.push(`${indent}  target:`)
    L.push(`${indent}    entity_id: ${formatYamlEntityId(a.entityId)}`)
    return L
  }

  if (a.type === 'delay') {
    L.push(`${indent}- delay: ${a.seconds || 1}`)
    return L
  }

  if (a.type === 'note') {
    // 画布注释：不进入可执行动作
    return L
  }

  if (a.type === 'debug') {
    L.push(`${indent}- event: homeos.geek_debug`)
    L.push(`${indent}  event_data:`)
    L.push(`${indent}    message: ${formatYamlScalar(a.notifyMsg || a.noteText || 'debug')}`)
    return L
  }

  if (a.type === 'notify_homeos') {
    L.push(`${indent}- event: notification.homeos.send`)
    L.push(`${indent}  event_data:`)
    L.push(`${indent}    message: ${formatYamlScalar(a.notifyMsg || a.message || '通知')}`)
    return L
  }

  if (a.type === 'home_mode') {
    L.push(`${indent}- event: homeMode.activate.request`)
    L.push(`${indent}  event_data:`)
    L.push(`${indent}    mode_id: ${formatYamlScalar(a.modeId || a.entityId || '')}`)
    return L
  }

  if (a.type === 'notify') {
    const notifyTarget = String(
      (ctx.variant === 'script' ? a.notifySvc : a.message) || a.notifySvc || a.message || '',
    ).trim()
    // HA 常用 notify.mobile_app_xxx 作为完整服务名；仅 notify.notify 才带 target
    if (notifyTarget.startsWith('notify.') && notifyTarget !== 'notify.notify') {
      L.push(`${indent}- service: ${notifyTarget}`)
    } else {
      L.push(`${indent}- service: notify.notify`)
      if (notifyTarget) {
        L.push(`${indent}  target:`)
        L.push(`${indent}    entity_id: ${formatYamlEntityId(notifyTarget)}`)
      }
    }
    L.push(`${indent}  data:`)
    L.push(`${indent}    message: ${formatYamlScalar(a.notifyMsg || '通知')}`)
    return L
  }

  if (a.type === 'deviceAction') {
    let deviceId = ''
    try {
      const raw = a.data ? JSON.parse(String(a.data)) : null
      if (raw && typeof raw === 'object' && raw.device_id != null) deviceId = String(raw.device_id)
    } catch {
      /* 忽略 */
    }
    if (!deviceId) deviceId = String(a.entityId || '').trim()
    L.push(`${indent}- device_id: ${formatYamlScalar(deviceId)}`)
    if (a.domain) L.push(`${indent}  domain: ${formatYamlScalar(a.domain)}`)
    if (a.service) L.push(`${indent}  type: ${formatYamlScalar(a.service)}`)
    if (a.entityId && a.entityId !== deviceId) {
      L.push(`${indent}  entity_id: ${formatYamlEntityId(a.entityId)}`)
    }
    return L
  }

  if (a.type === 'stop') {
    L.push(`${indent}- stop: ${formatYamlScalar(a.notifyMsg || '')}`)
    if (String(a.data || '').includes('error')) L.push(`${indent}  error: true`)
    return L
  }

  if (a.type === 'scene') {
    const sceneRef = String(a.sceneId || a.entityId || '').trim()
    if (UUID_RE.test(sceneRef)) {
      L.push(`${indent}- event: homeos.scene.execute`)
      L.push(`${indent}  event_data:`)
      L.push(`${indent}    scene_id: ${formatYamlScalar(sceneRef)}`)
    } else {
      L.push(`${indent}- service: scene.turn_on`)
      L.push(`${indent}  target:`)
      L.push(`${indent}    entity_id: ${formatYamlEntityId(sceneRef, 'placeholderScene')}`)
    }
    return L
  }

  if (a.type === 'script') {
    const scriptRef = String(a.scriptId || a.entityId || '').trim()
    if (UUID_RE.test(scriptRef)) {
      L.push(`${indent}- event: homeos.script.execute`)
      L.push(`${indent}  event_data:`)
      L.push(`${indent}    script_id: ${formatYamlScalar(scriptRef)}`)
    } else {
      L.push(`${indent}- service: script.turn_on`)
      L.push(`${indent}  target:`)
      L.push(`${indent}    entity_id: ${formatYamlEntityId(scriptRef, 'placeholderScript')}`)
    }
    return L
  }

  if (a.type === 'fire_event') {
    L.push(`${indent}- event: ${formatYamlScalar(a.eventType || '')}`)
    if (a.eventData) {
      try {
        L.push(`${indent}  event_data: ${JSON.stringify(JSON.parse(a.eventData))}`)
      } catch {
        L.push(`${indent}  event_data:`)
        L.push(`${indent}    ${a.eventData}`)
      }
    }
    return L
  }

  if (a.type === 'wait_template') {
    L.push(`${indent}- wait_template: ${formatYamlScalar(a.waitTemplate || '')}`)
    const timeoutRaw = a.waitTimeout
    const timeoutSec =
      timeoutRaw != null && String(timeoutRaw).trim() !== '' ? Number(timeoutRaw) : NaN
    if (Number.isFinite(timeoutSec) && timeoutSec > 0) {
      L.push(`${indent}  timeout: ${formatDurationSeconds(timeoutSec)}`)
      L.push(`${indent}  continue_on_timeout: ${a.continueOnTimeout ? 'true' : 'false'}`)
    }
    return L
  }

  if (a.type === 'wait_for_trigger') {
    const waitTrig = waitActionToTriggerForm(a as Record<string, unknown>)
    const timeoutRaw = a.waitTimeout
    const timeoutSec =
      timeoutRaw != null && String(timeoutRaw).trim() !== '' ? Number(timeoutRaw) : NaN
    const hasTimeout = Number.isFinite(timeoutSec) && timeoutSec > 0
    return formatWaitForTriggerYamlLines(
      waitTrig,
      hasTimeout ? timeoutSec : 0,
      indent,
      Boolean(a.continueOnTimeout),
      hasTimeout,
      Array.isArray(a.waitExtraTriggers) ? a.waitExtraTriggers : undefined,
    )
  }

  if (a.type === 'loop_start' || a.type === 'loop_stop') {
    L.push(`${indent}- event: homeos.${a.type === 'loop_start' ? 'loop_start' : 'loop_stop'}`)
    L.push(`${indent}  event_data:`)
    L.push(
      `${indent}    automation_id: ${formatYamlScalar(a.entityId || ctx.automationId || '')}`,
    )
    return L
  }

  if (a.type === 'choose') {
    const nest = (ba: OrchestratorBranchAction, ind: string) =>
      formatOrchestratorActionYamlLines(ba as OrchestratorActionForm, { ...ctx, indent: ind })
    L.push(...formatChooseActionYaml(a, indent.length, nest))
    return L
  }

  if (a.type === 'repeat') {
    L.push(`${indent}- repeat:`)
    if (a.repeatType === 'for_each') {
      L.push(...formatRepeatForEachYamlLines(String(a.repeatForEach || ''), `${indent}    `))
    } else if (a.repeatType === 'while' || a.repeatType === 'until') {
      L.push(`${indent}    ${a.repeatType}:`)
      L.push(`${indent}    - condition: state`)
      L.push(`${indent}      entity_id: ${formatYamlEntityId(a.repeatEntityId)}`)
      L.push(`${indent}      state: ${formatYamlScalar(a.repeatCondState || 'on')}`)
    } else {
      L.push(`${indent}    count: ${a.repeatCount || 1}`)
    }
    const seq = a.repeatActions || []
    L.push(`${indent}    sequence:`)
    if (!seq.length) {
      L.push(`${indent}      []`)
    } else {
      for (const ba of seq) {
        L.push(
          ...formatOrchestratorActionYamlLines(ba as OrchestratorActionForm, {
            ...ctx,
            indent: `${indent}      `,
          }),
        )
      }
    }
    return L
  }

  if (a.type === 'variables') {
    const map: Record<string, string> = {}
    for (const part of String(a.variablesMap || '').split(',')) {
      const [k, ...rest] = part.split('=')
      if (k?.trim()) map[k.trim()] = rest.join('=').trim()
    }
    L.push(`${indent}- variables:`)
    for (const [k, v] of Object.entries(map)) {
      L.push(`${indent}    ${k}: ${formatYamlScalar(v)}`)
    }
    return L
  }

  if (a.type === 'variable_set') {
    L.push(`${indent}- service: homeos.variable_set`)
    L.push(`${indent}  data:`)
    L.push(`${indent}    key: ${formatYamlScalar(a.varKey || '')}`)
    L.push(`${indent}    scope: ${formatYamlScalar(a.varScope || 'global')}`)
    L.push(`${indent}    op: ${formatYamlScalar(a.varOp || 'set')}`)
    L.push(`${indent}    type: ${formatYamlScalar(a.varType || 'string')}`)
    if (a.varValue != null && a.varValue !== '') {
      L.push(`${indent}    value: ${formatYamlScalar(a.varValue)}`)
    }
    if (a.varSourceVar) {
      L.push(`${indent}    source_var: ${formatYamlScalar(a.varSourceVar)}`)
    } else if (a.varSourceEntityId) {
      L.push(`${indent}    source_entity_id: ${formatYamlEntityId(a.varSourceEntityId)}`)
      if (a.varSourceAttribute) {
        L.push(`${indent}    source_attribute: ${formatYamlScalar(a.varSourceAttribute)}`)
      }
    }
    return L
  }

  if (a.type === 'var_math') {
    L.push(`${indent}- service: homeos.variable_math`)
    L.push(`${indent}  data:`)
    L.push(`${indent}    key: ${formatYamlScalar(a.varKey || '')}`)
    L.push(`${indent}    scope: ${formatYamlScalar(a.varScope || 'global')}`)
    L.push(`${indent}    op: ${formatYamlScalar(a.mathOp || '+')}`)
    if (a.mathLhsVar) L.push(`${indent}    lhs_var: ${formatYamlScalar(a.mathLhsVar)}`)
    else L.push(`${indent}    lhs: ${formatYamlScalar(a.mathLhs ?? 0)}`)
    if (a.mathRhsVar) L.push(`${indent}    rhs_var: ${formatYamlScalar(a.mathRhsVar)}`)
    else L.push(`${indent}    rhs: ${formatYamlScalar(a.mathRhs ?? 0)}`)
    return L
  }

  if (a.type === 'var_concat') {
    L.push(`${indent}- service: homeos.variable_set`)
    L.push(`${indent}  data:`)
    L.push(`${indent}    key: ${formatYamlScalar(a.varKey || '')}`)
    L.push(`${indent}    scope: ${formatYamlScalar(a.varScope || 'global')}`)
    L.push(`${indent}    op: concat`)
    L.push(`${indent}    type: string`)
    const srcVar = a.concatSourceVar || a.mathRhsVar || a.varSourceVar
    if (srcVar) {
      L.push(`${indent}    source_var: ${formatYamlScalar(srcVar)}`)
    } else {
      L.push(`${indent}    value: ${formatYamlScalar(a.concatParts || a.varValue || '')}`)
    }
    return L
  }

  if (a.type === 'var_fn') {
    L.push(`${indent}- service: homeos.variable_fn`)
    L.push(`${indent}  data:`)
    L.push(`${indent}    key: ${formatYamlScalar(a.varKey || '')}`)
    L.push(`${indent}    scope: ${formatYamlScalar(a.varScope || 'global')}`)
    L.push(`${indent}    fn: ${formatYamlScalar(a.fnName || 'round')}`)
    if (a.fnArgVar) L.push(`${indent}    arg_var: ${formatYamlScalar(a.fnArgVar)}`)
    else if (a.fnArg != null && a.fnArg !== '') L.push(`${indent}    arg: ${formatYamlScalar(a.fnArg)}`)
    if (a.varSourceEntityId) {
      L.push(`${indent}    source_entity_id: ${formatYamlEntityId(a.varSourceEntityId)}`)
    }
    if (a.varSourceAttribute) {
      L.push(`${indent}    source_attribute: ${formatYamlScalar(a.varSourceAttribute)}`)
    }
    if (a.fnDigits != null) L.push(`${indent}    digits: ${Number(a.fnDigits) || 0}`)
    return L
  }

  if (a.type === 'sequence') {
    L.push(`${indent}- sequence:`)
    const steps = (a.parallelActions || []) as OrchestratorActionForm[]
    if (!steps.length) {
      L.push(`${indent}    []`)
      return L
    }
    for (const step of steps) {
      L.push(
        ...formatOrchestratorActionYamlLines(step, {
          ...ctx,
          indent: `${indent}  `,
        }),
      )
    }
    return L
  }

  if (a.type === 'parallel') {
    L.push(`${indent}- parallel:`)
    // parallelBranches 可含多步 sequence；parallelActions 多为各支首步（侧栏/折叠截断）。
    // 多步时必须优先 branches，否则会丢失支内后续动作。
    const branches = resolveParallelBranchesForYaml(a)
    if (!branches.length) {
      L.push(`${indent}    []`)
      return L
    }
    for (const branch of branches) {
      const steps = Array.isArray(branch) ? branch : []
      if (steps.length > 1) {
        L.push(`${indent}  - sequence:`)
        for (const pa of steps) {
          L.push(
            ...formatOrchestratorActionYamlLines(pa as OrchestratorActionForm, {
              ...ctx,
              indent: `${indent}    `,
            }),
          )
        }
      } else if (steps.length === 1) {
        L.push(
          ...formatOrchestratorActionYamlLines(steps[0] as OrchestratorActionForm, {
            ...ctx,
            indent: `${indent}  `,
          }),
        )
      }
    }
    return L
  }

  return L
}

/** 侧栏编辑 parallelActions 后同步为单步 branches，避免陈旧多步 branches 盖住表单 */
export function syncParallelBranchesFromActions(a: OrchestratorActionForm) {
  const actions = Array.isArray(a.parallelActions) ? a.parallelActions : []
  a.parallelBranches = actions.map((x) =>
    Array.isArray(x) ? (x as OrchestratorActionForm[]) : [x as OrchestratorActionForm],
  )
}

/** 解析 parallel 分支：多步 parallelBranches 优先于截断的 parallelActions */
function resolveParallelBranchesForYaml(
  a: OrchestratorActionForm,
): Array<OrchestratorActionForm[] | OrchestratorBranchAction[]> {
  const branchesRaw = Array.isArray(a.parallelBranches)
    ? a.parallelBranches.filter((b): b is OrchestratorActionForm[] => Array.isArray(b))
    : []
  const actionsRaw = Array.isArray(a.parallelActions) ? a.parallelActions : []
  const fromActions = actionsRaw.map((x) =>
    Array.isArray(x) ? (x as OrchestratorActionForm[]) : [x as OrchestratorBranchAction],
  )
  const branchSteps = branchesRaw.reduce((n, b) => n + b.length, 0)
  const actionSteps = fromActions.reduce((n, b) => n + b.length, 0)
  const branchesRicher =
    branchesRaw.length > 0 &&
    (branchesRaw.some((b) => b.length > 1) || branchSteps > actionSteps)
  if (branchesRicher) return branchesRaw
  if (fromActions.length) return fromActions
  return branchesRaw
}

/** 写出 service 动作的 target 段：entity_id / area_id / device_id / label_id，全空时回退占位 entity_id */
function pushServiceTargetYamlLines(
  L: string[],
  indent: string,
  a: OrchestratorActionForm,
) {
  const eid = String(a.entityId || '').trim()
  const area = String(a.targetAreaId || '').trim()
  const device = String(a.targetDeviceId || '').trim()
  const label = String(a.targetLabelId || '').trim()
  L.push(`${indent}  target:`)
  if (!eid && !area && !device && !label) {
    L.push(`${indent}    entity_id: ${formatYamlEntityId('')}`)
    return
  }
  if (eid) L.push(`${indent}    entity_id: ${formatYamlEntityId(eid)}`)
  pushTargetIdYaml(L, `${indent}    `, 'area_id', area)
  pushTargetIdYaml(L, `${indent}    `, 'device_id', device)
  pushTargetIdYaml(L, `${indent}    `, 'label_id', label)
}

/** target id 写入：逗号分隔多值写为列表，单值写为标量，空值跳过 */
function pushTargetIdYaml(L: string[], pad: string, key: string, raw: string) {
  if (!raw) return
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length > 1) {
    L.push(`${pad}${key}:`)
    for (const p of parts) L.push(`${pad}  - ${formatYamlScalar(p)}`)
  } else if (parts.length === 1) {
    L.push(`${pad}${key}: ${formatYamlScalar(parts[0])}`)
  }
}

/** for_each：支持列表 YAML / 模板字符串 */
function formatRepeatForEachYamlLines(raw: string, indent: string): string[] {
  const text = String(raw || '').trim()
  if (!text) return [`${indent}for_each: []`]
  // 纯模板或简单标量
  if (
    (text.startsWith('{{') && text.endsWith('}}')) ||
    (!text.includes('\n') && !text.startsWith('-') && !text.startsWith('[') && !text.startsWith('{'))
  ) {
    return [`${indent}for_each: ${formatYamlScalar(text)}`]
  }
  try {
    const parsed = loadHaYaml(text)
    if (Array.isArray(parsed)) {
      const L = [`${indent}for_each:`]
      const dumped = dumpHaYaml(parsed).trimEnd()
      for (const line of dumped.split('\n')) {
        if (!line) continue
        if (line.startsWith('- ')) L.push(`${indent}  - ${line.slice(2)}`)
        else if (line.startsWith('  ')) L.push(`${indent}    ${line.slice(2)}`)
        else L.push(`${indent}  ${line}`)
      }
      return L
    }
    return [`${indent}for_each: ${formatYamlScalar(parsed)}`]
  } catch {
    return [`${indent}for_each: ${formatYamlScalar(text)}`]
  }
}
