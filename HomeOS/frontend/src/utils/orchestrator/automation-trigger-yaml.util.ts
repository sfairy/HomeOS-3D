/**
 * 自动化触发器 ↔ YAML 行序列化（含 AND 编译为 wait_for_trigger 链）。
 */
import {
  formatDurationSeconds,
  formatNumericThresholdLines,
  formatSunOffsetMinutes,
  formatYamlEntityId,
  formatYamlScalar,
} from './yaml-preview-helpers.util'
import type { AutomationTriggerForm, AutomationTriggerGroup } from '@/types/orchestrator-builder'
import { dumpHaYaml } from '@homeos/shared'

const HOMEOS_TRIGGER_META_RE =
  /#\s*homeos_meta:\s*(\{[^}]*\})\s*$/m

interface HomeosTriggerMeta {
  triggerLogic?: string
  triggerAndTimeout?: number
  /** 含 sequence 触发器时标记，便于解析还原 */
  hasSequence?: boolean
}

/** 单条触发器 → YAML 行（不含列表前缀缩进控制外的 platform 块） */
export function formatTriggerYamlLines(t: AutomationTriggerForm, indent = '  '): string[] {
  const L: string[] = []
  const pad = indent
  const pad2 = `${indent}  `

  if (t.type === 'state') {
    L.push(`${pad}- platform: state`)
    const ids = Array.isArray(t.entityIds) && t.entityIds.length
      ? t.entityIds
      : String(t.entityId || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
    if (ids.length > 1) {
      L.push(`${pad2}entity_id:`)
      for (const id of ids) L.push(`${pad2}  - ${formatYamlEntityId(id)}`)
    } else {
      L.push(`${pad2}entity_id: ${formatYamlEntityId(ids[0] || t.entityId)}`)
    }
    if (t.attribute) L.push(`${pad2}attribute: ${formatYamlScalar(t.attribute)}`)
    if (t.stateFrom) L.push(`${pad2}from: ${formatYamlScalar(t.stateFrom)}`)
    if (t.stateTo && t.stateTo !== 'any') L.push(`${pad2}to: ${formatYamlScalar(t.stateTo)}`)
    if (t.forSeconds) L.push(`${pad2}for: ${formatDurationSeconds(t.forSeconds)}`)
  } else if (t.type === 'numeric') {
    L.push(`${pad}- platform: numeric_state`)
    L.push(`${pad2}entity_id: ${formatYamlEntityId(t.entityId)}`)
    if (t.attribute) L.push(`${pad2}attribute: ${formatYamlScalar(t.attribute)}`)
    if (t.numBelow != null && String(t.numBelow) !== '') {
      L.push(`${pad2}above: ${formatYamlScalar(t.numValue ?? 0)}`)
      L.push(`${pad2}below: ${formatYamlScalar(t.numBelow)}`)
    } else {
      L.push(...formatNumericThresholdLines(t.numOp, t.numValue, pad2.length))
    }
    if (t.forSeconds) L.push(`${pad2}for: ${formatDurationSeconds(t.forSeconds)}`)
  } else if (t.type === 'time') {
    L.push(`${pad}- platform: time`)
    L.push(`${pad2}at: ${formatYamlScalar(t.at || '08:00:00')}`)
    const days = Array.isArray(t.days) ? t.days : []
    if (days.length) {
      L.push(`${pad2}weekday: [${days.join(', ')}]`)
    }
  } else if (t.type === 'sun') {
    L.push(`${pad}- platform: sun`)
    L.push(`${pad2}event: ${formatYamlScalar(t.sunEvent || 'sunrise')}`)
    if (t.sunOffset) L.push(`${pad2}offset: ${formatSunOffsetMinutes(t.sunOffset)}`)
  } else if (t.type === 'homeassistant') {
    L.push(`${pad}- platform: homeassistant`)
    L.push(`${pad2}event: ${formatYamlScalar(t.haEvent || 'start')}`)
  } else if (t.type === 'onload') {
    L.push(`${pad}- platform: event`)
    L.push(`${pad2}event_type: homeos.automation.enabled`)
  } else if (t.type === 'event') {
    L.push(`${pad}- platform: event`)
    L.push(`${pad2}event_type: ${formatYamlScalar(t.eventType || 'custom_event')}`)
    if (t.eventDataKey) {
      L.push(`${pad2}event_data:`)
      L.push(`${pad2}  ${t.eventDataKey}: ${formatYamlScalar(t.eventDataVal || '')}`)
    }
  } else if (t.type === 'presence') {
    if (t.presenceKind === 'leave_all') {
      L.push(`${pad}- platform: event`)
      L.push(`${pad2}event_type: presence.everyoneLeft`)
    } else {
      L.push(`${pad}- platform: event`)
      L.push(`${pad2}event_type: presence.changed`)
      L.push(`${pad2}event_data:`)
      L.push(`${pad2}  atHome: true`)
    }
  } else if (t.type === 'zone') {
    L.push(`${pad}- platform: zone`)
    L.push(`${pad2}entity_id: ${formatYamlEntityId(t.entityId)}`)
    L.push(`${pad2}zone: ${formatYamlScalar(t.zoneId || 'zone.home')}`)
    L.push(`${pad2}event: ${formatYamlScalar(t.zoneEvent || 'enter')}`)
  } else if (t.type === 'calendar') {
    L.push(`${pad}- platform: calendar`)
    L.push(`${pad2}entity_id: ${formatYamlEntityId(t.entityId)}`)
    L.push(`${pad2}event: ${formatYamlScalar(t.calendarEvent || 'start')}`)
  } else if (t.type === 'interval') {
    L.push(`${pad}- platform: event`)
    L.push(`${pad2}event_type: homeos.interval.tick`)
    L.push(`${pad2}event_data:`)
    L.push(`${pad2}  interval: ${Number(t.intervalSeconds) || 60}`)
    if (t.loopControlVar) {
      L.push(`${pad2}  control_var: ${formatYamlScalar(t.loopControlVar)}`)
    }
  } else if (t.type === 'sequence') {
    // 序列入口 = 第一步；后续由 wait 链补齐。无步骤时勿递归自身。
    const steps = Array.isArray(t.sequenceSteps) ? t.sequenceSteps : []
    if (!steps.length) {
      L.push(`${pad}- platform: state`)
      L.push(`${pad2}entity_id: binary_sensor.sequence_placeholder`)
      L.push(`${pad2}to: "on"`)
      return L
    }
    const step = steps[0] as AutomationTriggerForm
    return formatTriggerYamlLines(
      {
        ...step,
        type: step.type || 'state',
      },
      indent,
    )
  } else if (t.type === 'variable') {
    L.push(`${pad}- platform: event`)
    L.push(`${pad2}event_type: homeos.var_changed`)
    L.push(`${pad2}event_data:`)
    L.push(`${pad2}  key: ${formatYamlScalar(t.varKey || '')}`)
    L.push(`${pad2}  scope: ${formatYamlScalar(t.varScope === 'rule' ? 'rule' : 'global')}`)
    if (t.varValue != null && String(t.varValue) !== '') {
      L.push(`${pad2}  value: ${formatYamlScalar(t.varValue)}`)
    }
  } else if (t.type === 'device') {
    // HA device 触发器：保真写回，避免保存后丢失
    L.push(`${pad}- platform: device`)
    const deviceId = String(t.deviceId || t.device_id || '')
    if (deviceId) L.push(`${pad2}device_id: ${formatYamlScalar(deviceId)}`)
    const domain = String(t.domain || '')
    if (domain) L.push(`${pad2}domain: ${formatYamlScalar(domain)}`)
    const deviceType = String(t.deviceType || t.haDeviceType || '')
    if (deviceType) L.push(`${pad2}type: ${formatYamlScalar(deviceType)}`)
    if (t.entityId) L.push(`${pad2}entity_id: ${formatYamlEntityId(t.entityId)}`)
  } else if (t.opaquePayload && typeof t.opaquePayload === 'object' && !Array.isArray(t.opaquePayload)) {
    // mqtt / webhook / template 等：原样往返
    return formatOpaqueObjectYamlLines(t.opaquePayload as Record<string, unknown>, indent)
  } else if (t.type) {
    // 未知类型兜底：至少写出 platform，避免空触发器
    L.push(`${pad}- platform: ${formatYamlScalar(t.type === 'numeric' ? 'numeric_state' : t.type)}`)
  }
  return L
}

/** wait_for_trigger 动作 YAML（可附带额外触发器原样往返） */
export function formatWaitForTriggerYamlLines(
  t: AutomationTriggerForm,
  timeoutSec: number,
  indent = '  ',
  continueOnTimeout = false,
  includeTimeout = true,
  extraTriggers?: Record<string, unknown>[],
): string[] {
  const L: string[] = []
  L.push(`${indent}- wait_for_trigger:`)
  L.push(...formatTriggerYamlLines(t, `${indent}  `))
  for (const extra of extraTriggers || []) {
    if (!extra || typeof extra !== 'object') continue
    L.push(...formatRawWaitTriggerYamlLines(extra, `${indent}  `))
  }
  if (includeTimeout && Number(timeoutSec) > 0) {
    L.push(`${indent}  timeout: ${formatDurationSeconds(timeoutSec)}`)
  }
  L.push(`${indent}  continue_on_timeout: ${continueOnTimeout ? 'true' : 'false'}`)
  return L
}

/** 将导入保留的额外 wait / opaque 触发器对象写成 YAML 列表项 */
function formatOpaqueObjectYamlLines(
  wt: Record<string, unknown>,
  indent: string,
): string[] {
  try {
    const dumped = dumpHaYaml([wt]).trimEnd()
    return dumped.split('\n').map((line) => {
      if (!line) return line
      if (line.startsWith('- ')) return `${indent}- ${line.slice(2)}`
      if (line.startsWith('  ')) return `${indent}  ${line.slice(2)}`
      return `${indent}${line}`
    })
  } catch {
    const platform = String(wt.platform || 'state')
    return [`${indent}- platform: ${formatYamlScalar(platform)}`]
  }
}

/** 将导入保留的额外 wait 触发器对象写成 YAML 列表项 */
function formatRawWaitTriggerYamlLines(wt: Record<string, unknown>, indent: string): string[] {
  return formatOpaqueObjectYamlLines(wt, indent)
}

/**
 * 从 wait_for_trigger 动作表单还原触发器字段（含导入时挂在 _wait* 上的复杂 platform）。
 */
export function waitActionToTriggerForm(
  a: Record<string, unknown> | null | undefined,
): AutomationTriggerForm {
  const waitType = String(a?.waitTriggerType || a?._waitTriggerType || 'state')
  const waitEvent = String(a?._waitEvent || '')
  return {
    type: waitType,
    entityId: String(a?.entityId || ''),
    attribute: String(a?.waitAttribute || a?.attribute || ''),
    stateFrom: String(a?._waitStateFrom || ''),
    stateTo: String(a?.waitStateTo || a?._waitStateTo || 'on'),
    forSeconds: String(a?._waitForSeconds || a?.forSeconds || ''),
    at: String(a?._waitAt || a?.at || ''),
    days: Array.isArray(a?._waitDays) ? [...(a._waitDays as number[])] : undefined,
    sunEvent: waitType === 'sun' ? waitEvent || String(a?.sunEvent || 'sunrise') : String(a?.sunEvent || 'sunrise'),
    sunOffset: Number(a?._waitSunOffset ?? a?.sunOffset ?? 0) || 0,
    numOp: String(a?.waitNumOp || a?._waitNumOp || 'above'),
    numValue: String(a?.waitNumValue || a?._waitNumValue || ''),
    haEvent:
      waitType === 'homeassistant' ? waitEvent || String(a?.haEvent || 'start') : String(a?.haEvent || 'start'),
    eventType: String(a?.waitEventType || a?._waitEventType || a?.eventType || ''),
    eventDataKey: String(a?.waitEventDataKey || ''),
    eventDataVal: String(a?.waitEventDataVal || ''),
    zoneId: String(a?._waitZoneId || a?.zoneId || ''),
    zoneEvent:
      waitType === 'zone' ? waitEvent || String(a?.zoneEvent || 'enter') : String(a?.zoneEvent || 'enter'),
    calendarEvent:
      waitType === 'calendar'
        ? waitEvent || String(a?.calendarEvent || 'start')
        : String(a?.calendarEvent || 'start'),
    intervalSeconds: Number(a?._waitIntervalSeconds ?? a?.intervalSeconds) || undefined,
    varKey: String(a?._waitVarKey || a?.varKey || ''),
    varValue: a?._waitVarValue != null ? String(a._waitVarValue) : a?.varValue != null ? String(a.varValue) : '',
    deviceId: String(a?._waitDeviceId || a?.deviceId || ''),
    domain: String(a?._waitDomain || a?.domain || ''),
    deviceType: String(a?._waitDeviceType || a?.deviceType || ''),
  } as AutomationTriggerForm
}

/** 需要实体 ID 的等待平台 */
export const WAIT_TYPES_NEED_ENTITY = new Set([
  'state',
  'numeric',
  'zone',
  'calendar',
  'device',
])

/** 表单三选一可完整编辑的等待平台 */
export const WAIT_TYPES_SIMPLE_UI = new Set(['state', 'numeric', 'event'])


/** flattenTriggerForms：函数，按签名入参返回处理结果。 */
export function flattenTriggerForms(groups: AutomationTriggerGroup[]): AutomationTriggerForm[] {
  return groups.flatMap((g) => g.triggers || [])
}

/**
 * 是否应将触发器编译为 AND（入口 + wait 链）。
 * 根 AND，或仅一组且组内 AND。
 */
export function shouldCompileTriggerAnd(
  triggerLogic: string,
  groups: AutomationTriggerGroup[],
): boolean {
  if (triggerLogic === 'and') return true
  if (groups.length === 1 && groups[0]?.logic === 'and' && (groups[0].triggers?.length || 0) > 1) {
    return true
  }
  return false
}

/**
 * 多触发组 + 组内 AND 在 HA 扁平 trigger 中无法保真。
 * 返回用户可读错误；可编译时返回 null。
 */
export function validateTriggerGroupsForCompile(
  triggerLogic: string,
  groups: AutomationTriggerGroup[],
): string | null {
  if (!groups || groups.length <= 1) return null
  for (const g of groups) {
    if (g.logic === 'and' && (g.triggers?.length || 0) > 1) {
      return '多个触发组时，组内「全部」无法正确编译为 HA YAML。请合并为一组，或改为组内「任一」。'
    }
  }
  if (triggerLogic === 'and') {
    for (const g of groups) {
      if (g.logic === 'or' && (g.triggers?.length || 0) > 1) {
        return '组间「全部」且存在多个触发组时，组内「任一」会被展平。请合并触发组，或改组间为「任一」。'
      }
    }
  }
  return null
}

/** 展开 sequence 类型为有序步骤列表 */
export function expandSequenceTriggers(triggers: AutomationTriggerForm[]): AutomationTriggerForm[] {
  const out: AutomationTriggerForm[] = []
  for (const t of triggers) {
    if (t.type === 'sequence' && Array.isArray(t.sequenceSteps) && t.sequenceSteps.length) {
      out.push(...(t.sequenceSteps as AutomationTriggerForm[]))
    } else {
      out.push(t)
    }
  }
  return out
}

/** buildHomeosTriggerMetaComment：函数，按签名入参返回处理结果。 */
export function buildHomeosTriggerMetaComment(meta: HomeosTriggerMeta): string {
  return `# homeos_meta: ${JSON.stringify(meta)}`
}

/** parseHomeosTriggerMeta：函数，按签名入参返回处理结果。 */
export function parseHomeosTriggerMeta(yamlStr: string): HomeosTriggerMeta | null {
  const m = String(yamlStr || '').match(HOMEOS_TRIGGER_META_RE)
  if (!m?.[1]) return null
  try {
    return JSON.parse(m[1]) as HomeosTriggerMeta
  } catch {
    return null
  }
}
