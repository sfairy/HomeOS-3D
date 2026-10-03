/**
 * 编排器 YAML 预览辅助工具
 *
 * 职责：
 * - 提供编排器表单（触发器 / 条件 / 动作 / 分支）到 YAML 预览片段的格式化函数。
 * - 维护空表单占位文案、标量格式化、引号判定、颜色 / 时长等专用字段的 YAML 化。
 * - 与 js-yaml 的 load/dump 配合，产出可读且与 HA 自动化对齐的 YAML。
 *
 * 依赖：
 * - @homeos/shared 的 getEntityDomain / formatHaDuration。
 * - js-yaml 的 load / dump / CORE_SCHEMA。
 * - @/utils/ui/progress-bar.util 的 kelvinToMireds（色温转换）。
 * - @/types/orchestrator-builder 的表单类型。
 *
 * 注意：
 * - `@homeos-preview` 注释行作为占位哨兵，不翻译。
 * - YAML key 与 HA service 字段名为配置 key，不翻译。
 * - 仅面向用户的占位提示文案使用简体中文。
 */
import { getEntityDomain } from '@homeos/shared'
import { formatHaDuration } from '@homeos/shared'
import { load, dump, CORE_SCHEMA } from 'js-yaml'
import { kelvinToMireds } from '../ui/progress-bar.util'
import type {
  AutomationConditionForm,
  OrchestratorActionForm,
  OrchestratorBranchAction,
  OrchestratorChooseBranch,
  ServiceDataPanel,
} from '@/types/orchestrator-builder'

/** 空表单 YAML 预览占位文案 */
const YAML_PREVIEW_PLACEHOLDERS = {
  addActions: '请添加动作',
  addEntities: '请添加实体',
  addTriggersAndActions: '请添加触发器与动作',
  placeholderEntity: '输入实体',
  placeholderScene: '选择场景',
  placeholderScript: '选择脚本',
}

/** 空表单 YAML 预览占位（@homeos-preview 供 beautify 跳过） */
export function yamlPreviewPlaceholder(key: string) {
  return `# @homeos-preview ${(YAML_PREVIEW_PLACEHOLDERS as Record<string, string>)[key] ?? key}`
}

/** 是否需要引号的 YAML 字符串 */
function yamlNeedsQuotes(str: unknown) {
  if (str == null || str === '') return true
  const s = String(str)
  if (/^(true|false|null|yes|no|on|off)$/i.test(s)) return true
  if (/^[+-]?\d+(\.\d+)?$/.test(s)) return false
  if (/^[A-Za-z_][\w.-]*$/.test(s)) return false
  return true
}

/** 格式化 YAML 标量 */
export function formatYamlScalar(value: unknown) {
  if (value == null || value === '') return '""'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  const s = String(value)
  if (!yamlNeedsQuotes(s)) return s
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** entity_id：支持逗号分隔多实体；空值写空字符串，由校验拦截，禁止写入中文占位 */
export function formatYamlEntityId(
  entityId: string | null | undefined,
  _fallbackKey: string = 'placeholderEntity',
) {
  const raw = String(entityId || '').trim()
  if (!raw) return '""'
  if (raw.includes(',')) {
    const ids = raw
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((id: string) => formatYamlScalar(id))
    return `[${ids.join(', ')}]`
  }
  return formatYamlScalar(raw)
}

/** numeric_state 触发器/条件阈值行 */
export function formatNumericThresholdLines(
  op: string | null | undefined,
  value: unknown,
  indent: number,
) {
  const pad = ' '.repeat(indent)
  const key = op === 'below' || op === 'lt' ? 'below' : 'above'
  return [`${pad}${key}: ${formatYamlScalar(value ?? 0)}`]
}

/** 自动化条件 → YAML 行 */
export function formatAutomationConditionYaml(
  condition: AutomationConditionForm | Record<string, unknown> | null | undefined,
  prefix: string = '  ',
): string[] {
  const c = condition || {}
  const entity = formatYamlEntityId(c.entityId != null ? String(c.entityId) : '')
  const lines: string[] = []

  // negated + neq ≡ 双重否定 → 按 eq 输出
  if (c.negated && c.operator === 'neq') {
    return formatAutomationConditionYaml({ ...c, operator: 'eq', negated: false }, prefix)
  }

  if (c.negated) {
    const inner = formatAutomationConditionYaml({ ...c, negated: false }, `${prefix}    `)
    return [`${prefix}- condition: not`, `${prefix}  conditions:`, ...inner]
  }

  if (c.operator === 'neq') {
    lines.push(`${prefix}- condition: not`)
    lines.push(`${prefix}  conditions:`)
    lines.push(`${prefix}    - condition: state`)
    lines.push(`${prefix}      entity_id: ${entity}`)
    if (c.attribute) lines.push(`${prefix}      attribute: ${formatYamlScalar(c.attribute)}`)
    lines.push(`${prefix}      state: ${formatYamlScalar(c.state || 'on')}`)
    return lines
  }

  if (c.operator === 'gt' || c.operator === 'lt') {
    const key = c.operator === 'lt' ? 'below' : 'above'
    lines.push(`${prefix}- condition: numeric_state`)
    lines.push(`${prefix}  entity_id: ${entity}`)
    if (c.attribute) lines.push(`${prefix}  attribute: ${formatYamlScalar(c.attribute)}`)
    lines.push(`${prefix}  ${key}: ${formatYamlScalar(c.state ?? 0)}`)
    if (c.forSeconds) {
      lines.push(`${prefix}  for: ${formatDurationSeconds(c.forSeconds)}`)
    }
    return lines
  }

  // HA numeric_state 的 above/below 均为开区间；>= / <= 用 template 表达
  if (c.operator === 'gte' || c.operator === 'lte') {
    const sq = '\u0027'
    const escSingleQuote = '\\' + sq
    const eid = String(c.entityId || '')
      .replace(/\\/g, '\\\\')
      .replace(/'/g, escSingleQuote)
    const op = c.operator === 'lte' ? '<=' : '>='
    const num = Number.isFinite(Number(c.state)) ? String(Number(c.state)) : '0'
    const attr = c.attribute
      ? `state_attr('${eid}', '${String(c.attribute).replace(/'/g, escSingleQuote)}')`
      : `states('${eid}')`
    lines.push(`${prefix}- condition: template`)
    lines.push(`${prefix}  value_template: "{{ ${attr} | float ${op} ${num} }}"`)
    return lines
  }

  if (c.operator === 'contains') {
    const sq = '\u0027'
    const escSingleQuote = '\\' + sq
    const needle = String(c.state || '')
      .replace(/\\/g, '\\\\')
      .replace(/'/g, escSingleQuote)
    const eid = String(c.entityId || '')
      .replace(/\\/g, '\\\\')
      .replace(/'/g, escSingleQuote)
    lines.push(`${prefix}- condition: template`)
    lines.push(`${prefix}  value_template: "{{ '${needle}' in states('${eid}') }}"`)
    return lines
  }

  if (c.operator === 'sun_after' || c.operator === 'sun_before') {
    const key = c.operator === 'sun_before' ? 'before' : 'after'
    lines.push(`${prefix}- condition: sun`)
    lines.push(`${prefix}  ${key}: ${formatYamlScalar(c.state || 'sunset')}`)
    const offsetMin = Number(c.sunOffset || 0)
    if (offsetMin) {
      const offsetKey = c.operator === 'sun_before' ? 'before_offset' : 'after_offset'
      lines.push(`${prefix}  ${offsetKey}: ${formatSunOffsetMinutes(offsetMin)}`)
    }
    return lines
  }

  if (c.operator === 'time_after' || c.operator === 'time_before') {
    const key = c.operator === 'time_before' ? 'before' : 'after'
    lines.push(`${prefix}- condition: time`)
    lines.push(`${prefix}  ${key}: ${formatYamlScalar(c.state || '22:00:00')}`)
    const days = Array.isArray(c.days) ? c.days : []
    if (days.length) {
      lines.push(`${prefix}  weekday: [${days.join(', ')}]`)
    }
    return lines
  }

  // 纯星期条件：HA condition:time 仅 weekday（引擎支持无 after/before）
  if (c.operator === 'weekday') {
    const days = Array.isArray(c.days) ? c.days : []
    lines.push(`${prefix}- condition: time`)
    lines.push(`${prefix}  weekday: [${days.join(', ')}]`)
    return lines
  }

  if (c.operator === 'between') {
    lines.push(`${prefix}- condition: numeric_state`)
    lines.push(`${prefix}  entity_id: ${entity}`)
    if (c.attribute) lines.push(`${prefix}  attribute: ${formatYamlScalar(c.attribute)}`)
    lines.push(`${prefix}  above: ${formatYamlScalar(c.state ?? 0)}`)
    lines.push(`${prefix}  below: ${formatYamlScalar(c.stateTo ?? 100)}`)
    if (c.forSeconds) {
      lines.push(`${prefix}  for: ${formatDurationSeconds(c.forSeconds)}`)
    }
    return lines
  }

  if (c.operator === 'state_for') {
    lines.push(`${prefix}- condition: state`)
    lines.push(`${prefix}  entity_id: ${entity}`)
    if (c.attribute) lines.push(`${prefix}  attribute: ${formatYamlScalar(c.attribute)}`)
    lines.push(`${prefix}  state: ${formatYamlScalar(c.state || 'on')}`)
    if (c.forSeconds) {
      lines.push(`${prefix}  for: ${formatDurationSeconds(c.forSeconds)}`)
    }
    return lines
  }

  if (
    c.operator === 'var_eq' ||
    c.operator === 'var_neq' ||
    c.operator === 'var_gt' ||
    c.operator === 'var_lt' ||
    c.operator === 'var_gte' ||
    c.operator === 'var_lte'
  ) {
    const key = String(c.varKey || c.entityId || '')
    const op =
      c.operator === 'var_gt'
        ? '>'
        : c.operator === 'var_lt'
          ? '<'
          : c.operator === 'var_gte'
            ? '>='
            : c.operator === 'var_lte'
              ? '<='
              : c.operator === 'var_neq'
                ? '!='
                : '=='
    lines.push(`${prefix}- condition: homeos_variable`)
    lines.push(`${prefix}  key: ${formatYamlScalar(key)}`)
    lines.push(`${prefix}  scope: ${formatYamlScalar(c.varScope === 'rule' ? 'rule' : 'global')}`)
    lines.push(`${prefix}  operator: ${formatYamlScalar(op)}`)
    lines.push(`${prefix}  value: ${formatYamlScalar(c.state ?? '')}`)
    return lines
  }

  lines.push(`${prefix}- condition: state`)
  lines.push(`${prefix}  entity_id: ${entity}`)
  if (c.attribute) lines.push(`${prefix}  attribute: ${formatYamlScalar(c.attribute)}`)
  lines.push(`${prefix}  state: ${formatYamlScalar(c.state || 'on')}`)
  if (c.forSeconds) {
    lines.push(`${prefix}  for: ${formatDurationSeconds(c.forSeconds)}`)
  }
  return lines
}

/** 将 data 对象格式化为 YAML 行（缩进由 indent 指定空格数） */
export function formatDataYamlLines(data: Record<string, unknown> | null | undefined, indent: number = 4) {
  if (!data || typeof data !== 'object' || !Object.keys(data).length) return []
  const pad = ' '.repeat(indent)
  const lines: string[] = []
  for (const [k, v] of Object.entries(data)) {
    if (v == null || v === '') continue
    if (Array.isArray(v)) {
      if (v.every((x) => typeof x === 'number')) {
        lines.push(`${pad}${k}: [${v.join(', ')}]`)
      } else {
        lines.push(`${pad}${k}:`)
        for (const item of v) lines.push(`${pad}  - ${formatYamlScalar(item)}`)
      }
    } else if (typeof v === 'object') {
      lines.push(`${pad}${k}: ${JSON.stringify(v)}`)
    } else {
      lines.push(`${pad}${k}: ${formatYamlScalar(v)}`)
    }
  }
  return lines
}

/** 从 UI 参数面板状态构建 service data（与 applyDataBuilder 逻辑一致） */
export function buildServiceDataFromPanel(
  a: OrchestratorActionForm | { domain?: string; service?: string } | null | undefined,
  panel: ServiceDataPanel | null | undefined,
): Record<string, unknown> | null {
  if (!a || !panel) return null
  const data: Record<string, unknown> = {}
  const is = (dom: string, svc: string) => a.domain === dom && a.service === svc
  const isLock = () => a.domain === 'lock' && ['lock', 'unlock', 'open'].includes(String(a.service))
  const isAlarm = () => a.domain === 'alarm_control_panel' && String(a.service)?.startsWith('alarm_')

  if (is('light', 'turn_on')) {
    data.brightness_pct = panel.brightness_pct
    if ((panel.color_temp ?? 0) > 0) data.color_temp = kelvinToMireds(panel.color_temp!)
    if (panel.transition) data.transition = panel.transition
    if (panel.rgb_color && /^#[0-9a-fA-F]{6}$/.test(panel.rgb_color)) {
      const hex = panel.rgb_color
      data.rgb_color = [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16),
      ]
    }
    if (panel.effect) data.effect = panel.effect
  } else if (is('climate', 'set_temperature')) data.temperature = panel.temperature
  else if (is('cover', 'set_cover_position')) data.position = panel.position
  else if (is('media_player', 'volume_set')) data.volume_level = panel.volume_level
  else if (is('fan', 'set_percentage')) data.percentage = panel.percentage
  else if (is('humidifier', 'set_humidity')) data.humidity = panel.humidity
  else if (is('climate', 'set_hvac_mode')) data.hvac_mode = panel.hvac_mode
  else if (isLock() && panel.code) data.code = panel.code
  else if (is('input_number', 'set_value')) data.value = panel.value
  else if (is('input_select', 'select_option')) data.option = panel.option
  else if (isAlarm() && panel.code) data.code = panel.code
  else return null

  return Object.keys(data).length ? data : null
}

/** 合并已保存 data 与当前参数面板（面板打开时优先面板值） */
export function resolveActionData(
  a: OrchestratorActionForm | { data?: string } | null | undefined,
  panel: ServiceDataPanel | null | undefined,
  panelOpen: boolean,
): Record<string, unknown> | null {
  let persisted: Record<string, unknown> | null = null
  if (a?.data) {
    try {
      persisted = JSON.parse(a.data) as Record<string, unknown>
    } catch {
      persisted = null
    }
  }
  if (!panelOpen) return persisted
  const live = buildServiceDataFromPanel(a as OrchestratorActionForm, panel)
  if (live) return { ...persisted, ...live }
  return persisted
}

/** HA 时长：秒 → "HH:MM:SS" */
export function formatDurationSeconds(totalSec: unknown) {
  return formatHaDuration(totalSec, { quoted: true })
}

/** 日出/日落 offset：分钟 → "+00:30:00" */
export function formatSunOffsetMinutes(minutes: unknown) {
  const min = parseInt(String(minutes), 10) || 0
  const sign = min >= 0 ? '+' : '-'
  const abs = Math.abs(min)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return formatYamlScalar(`${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`)
}

/** choose 分支条件（支持 condLogic + conditions[] 多条件） */
function formatBranchConditionYaml(
  branch: OrchestratorChooseBranch | Record<string, unknown> | null | undefined,
  prefix: string,
) {
  const b = (branch || {}) as OrchestratorChooseBranch
  const list =
    Array.isArray(b.conditions) && b.conditions.length
      ? b.conditions
      : [
          {
            entityId: b.condEntityId != null ? String(b.condEntityId) : '',
            operator: String(b.condOp || 'eq'),
            state: (b.condState as string | number | undefined) ?? 'on',
            stateTo: b.condStateTo != null ? String(b.condStateTo) : '',
            attribute: b.condAttribute != null ? String(b.condAttribute) : '',
            varKey: b.condVarKey != null ? String(b.condVarKey) : '',
            varScope: b.condVarScope === 'rule' ? 'rule' : 'global',
            forSeconds: b.condForSeconds != null ? String(b.condForSeconds) : '',
            days: Array.isArray(b.condDays) ? (b.condDays as number[]) : undefined,
            sunOffset:
              b.condSunOffset != null
                ? Number(b.condSunOffset)
                : b.sunOffset != null
                  ? Number(b.sunOffset)
                  : 0,
            negated: Boolean(b.condNegated),
          },
        ]
  const logic = b.condLogic === 'or' ? 'or' : 'and'

  if (list.length === 1) {
    return formatAutomationConditionYaml(list[0], prefix)
  }

  if (logic === 'or') {
    const lines = [`${prefix}- condition: or`, `${prefix}  conditions:`]
    for (const c of list) {
      lines.push(...formatAutomationConditionYaml(c, `${prefix}    `))
    }
    return lines
  }

  // and：HA 默认对 conditions 列表取 AND，直接平铺
  const lines: string[] = []
  for (const c of list) {
    lines.push(...formatAutomationConditionYaml(c, prefix))
  }
  return lines
}

/** choose 分支内单条动作 */
function formatBranchActionYaml(
  action: OrchestratorBranchAction | Record<string, unknown> | null | undefined,
  indent: string,
): string[] {
  const lines = formatBranchActionYamlBody(action, indent)
  const ba = action || {}
  if (ba.continueOnError && lines.length > 0) {
    lines.push(`${indent}  continue_on_error: true`)
  }
  return lines
}

function formatBranchActionYamlBody(
  action: OrchestratorBranchAction | Record<string, unknown> | null | undefined,
  indent: string,
): string[] {
  const ba = action || {}
  const pad = indent

  if (ba.type === 'delay') {
    return [`${pad}- delay: ${formatYamlScalar(ba.seconds || 1)}`]
  }

  if (ba.type === 'notify_homeos') {
    return [
      `${pad}- event: notification.homeos.send`,
      `${pad}  event_data:`,
      `${pad}    message: ${formatYamlScalar(ba.message || ba.notifyMsg || '通知')}`,
    ]
  }

  if (ba.type === 'variable_set' || ba.type === 'var_concat') {
    const lines = [
      `${pad}- service: homeos.variable_set`,
      `${pad}  data:`,
      `${pad}    key: ${formatYamlScalar(ba.varKey || '')}`,
      `${pad}    scope: ${formatYamlScalar(ba.varScope || 'global')}`,
      `${pad}    op: ${formatYamlScalar(ba.type === 'var_concat' ? 'concat' : ba.varOp || 'set')}`,
      `${pad}    type: ${formatYamlScalar(ba.varType || (ba.type === 'var_concat' ? 'string' : 'string'))}`,
    ]
    const srcVar =
      ba.type === 'var_concat'
        ? ba.concatSourceVar || ba.mathRhsVar || ba.varSourceVar
        : ba.varSourceVar
    const val = ba.type === 'var_concat' ? ba.concatParts || ba.varValue || ba.message : ba.varValue
    if (srcVar) {
      lines.push(`${pad}    source_var: ${formatYamlScalar(srcVar)}`)
    } else if (val != null && val !== '') {
      lines.push(`${pad}    value: ${formatYamlScalar(val)}`)
    }
    if (!srcVar && (ba.varSourceEntityId || ba.entityId)) {
      lines.push(
        `${pad}    source_entity_id: ${formatYamlEntityId(String(ba.varSourceEntityId || ba.entityId))}`,
      )
    }
    if (!srcVar && ba.varSourceAttribute) {
      lines.push(`${pad}    source_attribute: ${formatYamlScalar(ba.varSourceAttribute)}`)
    }
    return lines
  }

  if (ba.type === 'var_math') {
    const lines = [
      `${pad}- service: homeos.variable_math`,
      `${pad}  data:`,
      `${pad}    key: ${formatYamlScalar(ba.varKey || '')}`,
      `${pad}    scope: ${formatYamlScalar(ba.varScope || 'global')}`,
      `${pad}    op: ${formatYamlScalar(ba.mathOp || '+')}`,
    ]
    if (ba.mathLhsVar) lines.push(`${pad}    lhs_var: ${formatYamlScalar(ba.mathLhsVar)}`)
    else lines.push(`${pad}    lhs: ${formatYamlScalar(ba.mathLhs ?? 0)}`)
    if (ba.mathRhsVar) lines.push(`${pad}    rhs_var: ${formatYamlScalar(ba.mathRhsVar)}`)
    else lines.push(`${pad}    rhs: ${formatYamlScalar(ba.mathRhs ?? 0)}`)
    return lines
  }

  if (ba.type === 'var_fn') {
    const lines = [
      `${pad}- service: homeos.variable_fn`,
      `${pad}  data:`,
      `${pad}    key: ${formatYamlScalar(ba.varKey || '')}`,
      `${pad}    scope: ${formatYamlScalar(ba.varScope || 'global')}`,
      `${pad}    fn: ${formatYamlScalar(ba.fnName || 'round')}`,
    ]
    if (ba.fnArgVar) lines.push(`${pad}    arg_var: ${formatYamlScalar(ba.fnArgVar)}`)
    else if (ba.fnArg != null && ba.fnArg !== '') {
      lines.push(`${pad}    arg: ${formatYamlScalar(ba.fnArg)}`)
    }
    if (ba.varSourceEntityId || ba.entityId) {
      lines.push(
        `${pad}    source_entity_id: ${formatYamlEntityId(String(ba.varSourceEntityId || ba.entityId))}`,
      )
    }
    if (ba.varSourceAttribute) {
      lines.push(`${pad}    source_attribute: ${formatYamlScalar(ba.varSourceAttribute)}`)
    }
    if (ba.fnDigits != null) lines.push(`${pad}    digits: ${Number(ba.fnDigits) || 0}`)
    return lines
  }

  if (ba.type === 'fire_event') {
    const lines = [
      `${pad}- event: ${formatYamlScalar(ba.eventType || 'custom_event')}`,
    ]
    if (ba.eventData) {
      try {
        lines.push(`${pad}  event_data: ${JSON.stringify(JSON.parse(String(ba.eventData)))}`)
      } catch {
        lines.push(`${pad}  event_data:`)
        lines.push(`${pad}    ${ba.eventData}`)
      }
    }
    return lines
  }

  if (ba.type === 'choose' && Array.isArray(ba.branches)) {
    return formatChooseActionYaml(
      { branches: ba.branches as OrchestratorChooseBranch[] },
      pad.length,
      (nested, ind) => formatBranchActionYaml(nested, ind),
    )
  }

  if (ba.type === 'notify') {
    const target = String(ba.notifySvc || ba.message || ba.entityId || '').trim()
    const lines: string[] = []
    if (target.startsWith('notify.') && target !== 'notify.notify') {
      lines.push(`${pad}- service: ${target}`)
    } else {
      lines.push(`${pad}- service: notify.notify`)
      if (target) {
        lines.push(`${pad}  target:`)
        lines.push(`${pad}    entity_id: ${formatYamlEntityId(target)}`)
      }
    }
    lines.push(`${pad}  data:`)
    lines.push(`${pad}    message: ${formatYamlScalar(ba.notifyMsg || ba.message || '通知')}`)
    return lines
  }

  if (ba.type === 'deviceAction') {
    let deviceId = ''
    try {
      const raw = ba.data ? JSON.parse(String(ba.data)) : null
      if (raw && typeof raw === 'object' && raw.device_id != null) deviceId = String(raw.device_id)
    } catch {
      /* 忽略 */
    }
    if (!deviceId && ba.entityId) deviceId = String(ba.entityId)
    if (!deviceId) {
      return [`${pad}- device_id: ""`]
    }
    const lines = [`${pad}- device_id: ${formatYamlScalar(deviceId)}`]
    if (ba.domain) lines.push(`${pad}  domain: ${formatYamlScalar(ba.domain)}`)
    if (ba.service) lines.push(`${pad}  type: ${formatYamlScalar(ba.service)}`)
    if (ba.entityId && ba.entityId !== deviceId) {
      lines.push(`${pad}  entity_id: ${formatYamlEntityId(String(ba.entityId))}`)
    }
    return lines
  }

  if (ba.type === 'stop') {
    const lines = [`${pad}- stop: ${formatYamlScalar(ba.notifyMsg || ba.message || '')}`]
    if (String(ba.data || '').includes('error')) lines.push(`${pad}  error: true`)
    return lines
  }

  if (ba.type === 'home_mode') {
    return [
      `${pad}- event: homeMode.activate.request`,
      `${pad}  event_data:`,
      `${pad}    mode_id: ${formatYamlScalar(ba.modeId || ba.entityId || '')}`,
    ]
  }

  if (ba.type === 'wait_template') {
    const lines = [`${pad}- wait_template: ${formatYamlScalar(ba.waitTemplate || '')}`]
    const timeoutRaw = ba.waitTimeout
    const timeoutSec =
      timeoutRaw != null && String(timeoutRaw).trim() !== '' ? Number(timeoutRaw) : NaN
    if (Number.isFinite(timeoutSec) && timeoutSec > 0) {
      lines.push(`${pad}  timeout: ${formatDurationSeconds(timeoutSec)}`)
      lines.push(`${pad}  continue_on_timeout: ${ba.continueOnTimeout ? 'true' : 'false'}`)
    }
    return lines
  }

  if (ba.type === 'wait_for_trigger') {
    try {
      const waitType = String(ba.waitTriggerType || ba._waitTriggerType || 'state')
      const waitEvent = String(ba._waitEvent || '')
      const platform =
        waitType === 'numeric'
          ? 'numeric_state'
          : waitType === 'event'
            ? 'event'
            : waitType || 'state'
      const lines = [`${pad}- wait_for_trigger:`, `${pad}  - platform: ${platform}`]
      if (!['event', 'sun', 'time', 'homeassistant', 'onload', 'interval', 'variable'].includes(platform)) {
        if (ba.entityId) {
          lines.push(`${pad}    entity_id: ${formatYamlEntityId(String(ba.entityId))}`)
        }
      }
      if (ba.waitAttribute) {
        lines.push(`${pad}    attribute: ${formatYamlScalar(ba.waitAttribute)}`)
      }
      if (platform === 'state') {
        lines.push(`${pad}    to: ${formatYamlScalar(ba.waitStateTo || 'on')}`)
      } else if (platform === 'numeric_state') {
        const key = ba.waitNumOp === 'below' ? 'below' : 'above'
        lines.push(`${pad}    ${key}: ${formatYamlScalar(ba.waitNumValue ?? 0)}`)
      } else if (platform === 'event') {
        lines.push(`${pad}    event_type: ${formatYamlScalar(ba.waitEventType || '')}`)
        if (ba.waitEventDataKey) {
          lines.push(`${pad}    event_data:`)
          lines.push(
            `${pad}      ${ba.waitEventDataKey}: ${formatYamlScalar(ba.waitEventDataVal || '')}`,
          )
        }
      } else if (platform === 'sun') {
        lines.push(`${pad}    event: ${formatYamlScalar(waitEvent || ba.sunEvent || 'sunrise')}`)
        if (ba._waitSunOffset != null && Number(ba._waitSunOffset)) {
          lines.push(`${pad}    offset: ${formatSunOffsetMinutes(ba._waitSunOffset)}`)
        }
      } else if (platform === 'time') {
        lines.push(`${pad}    at: ${formatYamlScalar(ba._waitAt || ba.at || '08:00:00')}`)
      } else if (platform === 'homeassistant') {
        lines.push(`${pad}    event: ${formatYamlScalar(waitEvent || ba.haEvent || 'start')}`)
      } else if (platform === 'zone') {
        if (ba.entityId) {
          lines.push(`${pad}    entity_id: ${formatYamlEntityId(String(ba.entityId))}`)
        }
        lines.push(`${pad}    zone: ${formatYamlScalar(ba._waitZoneId || ba.zoneId || 'zone.home')}`)
        lines.push(`${pad}    event: ${formatYamlScalar(waitEvent || ba.zoneEvent || 'enter')}`)
      } else if (platform === 'calendar') {
        if (ba.entityId) {
          lines.push(`${pad}    entity_id: ${formatYamlEntityId(String(ba.entityId))}`)
        }
        lines.push(
          `${pad}    event: ${formatYamlScalar(waitEvent || ba.calendarEvent || 'start')}`,
        )
      }
      if (ba.waitTimeout != null && String(ba.waitTimeout) !== '') {
        lines.push(`${pad}  timeout: ${formatDurationSeconds(ba.waitTimeout)}`)
      }
      const extras = Array.isArray(ba.waitExtraTriggers) ? ba.waitExtraTriggers : []
      // 额外触发器插在 timeout 之前（与 HA 习惯一致：triggers 列表项紧挨）
      if (extras.length) {
        const insertAt = lines.findIndex((l) => l.includes('timeout:') || l.includes('continue_on_timeout:'))
        const extraLines: string[] = []
        for (const extra of extras) {
          if (!extra || typeof extra !== 'object') continue
          try {
            const dumped = dump([extra], { lineWidth: 120 }).trimEnd()
            for (const line of dumped.split('\n')) {
              if (!line) continue
              if (line.startsWith('- ')) extraLines.push(`${pad}  - ${line.slice(2)}`)
              else if (line.startsWith('  ')) extraLines.push(`${pad}    ${line.slice(2)}`)
              else extraLines.push(`${pad}  ${line}`)
            }
          } catch {
            /* 忽略非法额外字段 */
          }
        }
        if (extraLines.length) {
          if (insertAt >= 0) lines.splice(insertAt, 0, ...extraLines)
          else lines.push(...extraLines)
        }
      }
      lines.push(`${pad}  continue_on_timeout: ${ba.continueOnTimeout ? 'true' : 'false'}`)
      return lines
    } catch {
      return [`${pad}- wait_for_trigger: []`]
    }
  }

  if (ba.type === 'loop_start' || ba.type === 'loop_stop') {
    return [
      `${pad}- event: homeos.${ba.type === 'loop_start' ? 'loop_start' : 'loop_stop'}`,
      `${pad}  event_data:`,
      `${pad}    automation_id: ${formatYamlScalar(ba.entityId || '')}`,
    ]
  }

  if (ba.type === 'debug') {
    return [
      `${pad}- event: homeos.geek_debug`,
      `${pad}  event_data:`,
      `${pad}    message: ${formatYamlScalar(ba.notifyMsg || ba.noteText || 'debug')}`,
    ]
  }

  if (ba.type === 'note') {
    return []
  }

  if (ba.type === 'repeat') {
    const lines = [`${pad}- repeat:`]
    if (ba.repeatType === 'for_each') {
      const text = String(ba.repeatForEach || '').trim()
      if (!text) lines.push(`${pad}    for_each: []`)
      else if (text.includes('\n') || text.startsWith('-') || text.startsWith('[')) {
        lines.push(`${pad}    for_each:`)
        for (const line of text.split('\n')) {
          if (!line.trim()) continue
          lines.push(`${pad}      ${line.replace(/^\s*-\s*/, '- ')}`)
        }
      } else {
        lines.push(`${pad}    for_each: ${formatYamlScalar(text)}`)
      }
    } else if (ba.repeatType === 'while' || ba.repeatType === 'until') {
      lines.push(`${pad}    ${ba.repeatType}:`)
      lines.push(`${pad}    - condition: state`)
      lines.push(`${pad}      entity_id: ${formatYamlEntityId(String(ba.repeatEntityId || ''))}`)
      lines.push(`${pad}      state: ${formatYamlScalar(ba.repeatCondState || 'on')}`)
    } else {
      lines.push(`${pad}    count: ${ba.repeatCount || 1}`)
    }
    lines.push(`${pad}    sequence:`)
    const seq = (ba.repeatActions as OrchestratorBranchAction[]) || []
    if (!seq.length) lines.push(`${pad}      []`)
    else {
      for (const nested of seq) {
        lines.push(...formatBranchActionYaml(nested, `${pad}      `))
      }
    }
    return lines
  }

  if (ba.type === 'parallel' || ba.type === 'sequence') {
    const key = ba.type === 'sequence' ? 'sequence' : 'parallel'
    const lines = [`${pad}- ${key}:`]
    if (ba.type === 'parallel') {
      const branchesRaw = Array.isArray(ba.parallelBranches) ? ba.parallelBranches : []
      const actionsRaw = Array.isArray(ba.parallelActions) ? ba.parallelActions : []
      const useBranches =
        branchesRaw.length > 0 &&
        (branchesRaw.some((b) => Array.isArray(b) && b.length > 1) ||
          branchesRaw.reduce((n, b) => n + (Array.isArray(b) ? b.length : 0), 0) >
            actionsRaw.length)
      const branches = useBranches
        ? branchesRaw
        : actionsRaw.map((x) => (Array.isArray(x) ? x : [x]))
      if (!branches.length) {
        lines.push(`${pad}    []`)
        return lines
      }
      for (const branch of branches) {
        const steps = Array.isArray(branch) ? branch : []
        if (steps.length > 1) {
          lines.push(`${pad}  - sequence:`)
          for (const nested of steps) {
            lines.push(...formatBranchActionYaml(nested as OrchestratorBranchAction, `${pad}    `))
          }
        } else if (steps.length === 1) {
          lines.push(...formatBranchActionYaml(steps[0] as OrchestratorBranchAction, `${pad}  `))
        }
      }
      return lines
    }
    const steps = (ba.parallelActions as OrchestratorBranchAction[]) || []
    if (!steps.length) {
      lines.push(`${pad}    []`)
      return lines
    }
    for (const nested of steps) {
      lines.push(...formatBranchActionYaml(nested, `${pad}  `))
    }
    return lines
  }

  if (ba.type === 'variables') {
    const map: Record<string, string> = {}
    for (const part of String(ba.variablesMap || '').split(',')) {
      const [k, ...rest] = part.split('=')
      if (k?.trim()) map[k.trim()] = rest.join('=').trim()
    }
    const lines = [`${pad}- variables:`]
    for (const [k, v] of Object.entries(map)) {
      lines.push(`${pad}    ${k}: ${formatYamlScalar(v)}`)
    }
    return lines
  }

  if (ba.type === 'trigger_automation') {
    return [
      `${pad}- service: automation.trigger`,
      `${pad}  target:`,
      `${pad}    entity_id: ${formatYamlEntityId(String(ba.entityId || ''))}`,
    ]
  }

  let service = 'light.turn_on'
  if (ba.type === 'scene') service = 'scene.turn_on'
  else if (ba.type === 'script') service = 'script.turn_on'
  else if (ba.domain && ba.service) service = `${ba.domain}.${ba.service}`
  else if (ba.entityId) {
    const dom = getEntityDomain(String(ba.entityId))
    if (dom === 'scene') service = 'scene.turn_on'
    else if (dom === 'script') service = 'script.turn_on'
    else if (dom) service = `${dom}.turn_on`
  }

  const eid = ba.entityId || ba.sceneId || ba.scriptId
  const area = String(ba.targetAreaId || '').trim()
  const device = String(ba.targetDeviceId || '').trim()
  const labelId = String(ba.targetLabelId || '').trim()
  const lines = [`${pad}- service: ${service}`]
  if (eid || area || device || labelId) {
    lines.push(`${pad}  target:`)
    if (eid) lines.push(`${pad}    entity_id: ${formatYamlEntityId(String(eid))}`)
    if (area) {
      const parts = area.split(',').map((s) => s.trim()).filter(Boolean)
      if (parts.length > 1) {
        lines.push(`${pad}    area_id:`)
        for (const p of parts) lines.push(`${pad}      - ${formatYamlScalar(p)}`)
      } else lines.push(`${pad}    area_id: ${formatYamlScalar(parts[0] || area)}`)
    }
    if (device) {
      const parts = device.split(',').map((s) => s.trim()).filter(Boolean)
      if (parts.length > 1) {
        lines.push(`${pad}    device_id:`)
        for (const p of parts) lines.push(`${pad}      - ${formatYamlScalar(p)}`)
      } else lines.push(`${pad}    device_id: ${formatYamlScalar(parts[0] || device)}`)
    }
    if (labelId) {
      const parts = labelId.split(',').map((s) => s.trim()).filter(Boolean)
      if (parts.length > 1) {
        lines.push(`${pad}    label_id:`)
        for (const p of parts) lines.push(`${pad}      - ${formatYamlScalar(p)}`)
      } else lines.push(`${pad}    label_id: ${formatYamlScalar(parts[0] || labelId)}`)
    }
  }
  if (ba.data) {
    try {
      const dataObj = JSON.parse(String(ba.data)) as Record<string, unknown>
      if (dataObj && typeof dataObj === 'object' && Object.keys(dataObj).length) {
        lines.push(`${pad}  data:`)
        lines.push(...formatDataYamlLines(dataObj, pad.length + 4))
      }
    } catch {
      /* 忽略无效 data JSON */
    }
  }
  return lines
}

/** choose 动作块；formatAction 用于嵌套动作完整导出（避免分支子集丢字段） */
export function formatChooseActionYaml(
  action: OrchestratorActionForm | { branches?: OrchestratorChooseBranch[] } | null | undefined,
  baseIndent: number = 2,
  formatAction?: (
    ba: OrchestratorBranchAction,
    indent: string,
  ) => string[],
) {
  const pad = ' '.repeat(baseIndent)
  const brs = action?.branches || []
  if (!brs.length) return [`${pad}- choose: []`]

  const fmt =
    formatAction ||
    ((ba: OrchestratorBranchAction, indent: string) => formatBranchActionYaml(ba, indent))

  const lines = [`${pad}- choose:`]
  const itemPad = `${pad}  `

  for (let bi = 0; bi < brs.length; bi++) {
    const br = brs[bi]
    const isDefault = Boolean(br?.isDefault)
    if (isDefault) {
      lines.push(`${itemPad}default:`)
      for (const ba of br.actions || []) {
        lines.push(...fmt(ba, `${itemPad}  `))
      }
    } else {
      lines.push(`${itemPad}- conditions:`)
      lines.push(...formatBranchConditionYaml(br, `${itemPad}    `))
      lines.push(`${itemPad}  sequence:`)
      for (const ba of br.actions || []) {
        lines.push(...fmt(ba, `${itemPad}    `))
      }
    }
  }
  return lines
}

/** 场景 entities 映射键 */
export function formatYamlMapKey(key: unknown) {
  const raw = String(key || '').trim()
  if (/^[A-Za-z_][\w.-]*$/.test(raw)) return raw
  return formatYamlScalar(raw)
}

/** 编辑模式：未改表单时展示库中完整 YAML */
export function pickYamlPreview(
  storedYaml: string | null | undefined,
  formTouched: boolean,
  generated: string,
) {
  if (storedYaml && !formTouched) return storedYaml
  return generated
}

/**
 * 有损还原保护：approximate 且未改表单时，保存仍写库中原始 YAML，
 * 避免预览展示完整 YAML、保存却用编译结果覆盖复杂结构。
 * 用户一旦编辑画布（formTouched），改用 generated。
 */
export function resolveYamlForSave(opts: {
  storedYaml?: string | null
  formTouched: boolean
  generated: string
  approximate?: boolean | string | null
}): { yamlText: string; preservedStored: boolean } {
  const stored = String(opts.storedYaml || '').trim()
  const hasApprox = Boolean(
    typeof opts.approximate === 'string' ? opts.approximate.trim() : opts.approximate,
  )
  if (hasApprox && !opts.formTouched && stored) {
    return { yamlText: stored, preservedStored: true }
  }
  return { yamlText: opts.generated, preservedStored: false }
}

const YAML_PREVIEW_SKIP_RE =
  /^#\s*@homeos-preview\b|^#\s*(添加|选择|请编辑|请填写)|^（暂无/
const YAML_JINJA_RE = /\{%|\{\{/

/**
 * 预览专用：解析并重排缩进，不改变复制/保存用的原始 YAML。
 * - lineWidth 必须为 -1（0 会触发 js-yaml 把标量折成 >- 块）
 * - 使用 CORE_SCHEMA，避免 YAML 1.1 把 on/off/yes/no 收成布尔，导致预览语义失真
 */
export function beautifyYamlForPreview(raw: unknown) {
  const text = String(raw ?? '').trim()
  if (!text || YAML_PREVIEW_SKIP_RE.test(text) || YAML_JINJA_RE.test(text)) return text
  try {
    const parsed = load(text, { schema: CORE_SCHEMA })
    if (parsed === undefined || parsed === null) return text
    return dump(parsed, {
      schema: CORE_SCHEMA,
      indent: 2,
      lineWidth: -1,
      noRefs: true,
    }).replace(/\n$/, '')
  } catch {
    return text
  }
}

function escapeHtml(str: unknown) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function highlightYamlValueTail(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return escapeHtml(value)
  const lead = value.slice(0, value.indexOf(trimmed))
  const singleQuote = '\u0027'
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith(singleQuote) && trimmed.endsWith(singleQuote))
  ) {
    return `${escapeHtml(lead)}<span class="yaml-hl-string">${escapeHtml(trimmed)}</span>`
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return `${escapeHtml(lead)}<span class="yaml-hl-number">${escapeHtml(trimmed)}</span>`
  }
  if (/^(true|false|null|yes|no|on|off)$/i.test(trimmed)) {
    return `${escapeHtml(lead)}<span class="yaml-hl-bool">${escapeHtml(trimmed)}</span>`
  }
  return escapeHtml(value)
}

function highlightYamlLine(line: string) {
  if (/^\s*#/.test(line)) {
    return `<span class="yaml-hl-comment">${escapeHtml(line)}</span>`
  }
  // 纯列表标量：- light.living_room
  const listOnly = line.match(/^(\s*)-\s+(.*)$/)
  if (listOnly && !listOnly[2].includes(':')) {
    const [, indent, rest] = listOnly
    return `${escapeHtml(indent)}<span class="yaml-hl-punct">-</span> ${highlightYamlValueTail(rest)}`
  }
  const m = line.match(/^(\s*)(-\s+)?([^:]+?)(:\s*)(.*)$/)
  if (!m) return escapeHtml(line)
  const [, indent, dash, key, colonSp, rest] = m
  let html = escapeHtml(indent)
  if (dash) html += `<span class="yaml-hl-punct">${escapeHtml(dash.trim())}</span> `
  html += `<span class="yaml-hl-key">${escapeHtml(key.trim())}</span>`
  html += '<span class="yaml-hl-punct">:</span>'
  if (colonSp.length > 1) html += escapeHtml(colonSp.slice(1))
  // 块标量指示符 | > |+ 等
  if (/^[>|][+-]?\s*$/.test(rest.trim())) {
    html += `<span class="yaml-hl-punct">${escapeHtml(rest)}</span>`
    return html
  }
  html += highlightYamlValueTail(rest)
  return html
}

/** 预览区语法高亮（仅展示，复制仍用原始 YAML） */
export function highlightYamlForPreview(raw: unknown) {
  return String(raw ?? '')
    .split('\n')
    .map(highlightYamlLine)
    .join('\n')
}
