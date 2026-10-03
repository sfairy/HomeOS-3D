/**
 * 极客自动化动作「能力」层
 *
 * 职责：
 * - 维护中文能力名 ↔ HA domain.service 的映射，隐藏服务名上手成本。
 * - 提供能力查询、常用能力、能力应用到动作、能力 ID 解析、服务参数字段读写等工具。
 *
 * 依赖：./capability-model.util 的能力模型与参数 schema。
 *
 * 注意：
 * - 服务名（light.turn_on / ...）为 HA service，不翻译。
 * - 仅面向用户的能力 / 服务中文名使用简体中文。
 */
import {
  paramsForCapabilityDef,
  popularCapabilityDefs,
  resolveCapabilitiesForEntity,
  type GeekCapability,
  type GeekCapParamDef,
} from './capability-model.util'

export type { GeekCapability }

/** 通用服务中文名 */
const SERVICE_LABELS: Record<string, string> = {
  turn_on: '打开',
  turn_off: '关闭',
  toggle: '切换',
  open_cover: '打开',
  close_cover: '关闭',
  stop_cover: '停止',
  set_cover_position: '设置位置',
  set_temperature: '设置温度',
  set_hvac_mode: '设置模式',
  media_play: '播放',
  media_pause: '暂停',
  media_stop: '停止',
  volume_set: '设置音量',
  volume_up: '音量+',
  volume_down: '音量-',
  lock: '上锁',
  unlock: '解锁',
  open: '打开',
  start: '开始',
  pause: '暂停',
  stop: '停止',
  return_to_base: '回充',
  locate: '定位',
  clean_spot: '局部清扫',
  set_fan_speed: '设置风速',
  send_command: '发送命令',
  set_percentage: '设置百分比',
  alarm_arm_home: '在家布防',
  alarm_arm_away: '离家布防',
  alarm_arm_night: '夜间布防',
  alarm_disarm: '撤防',
  trigger: '触发',
  reload: '重载',
  set_value: '设值',
  increment: '加一',
  decrement: '减一',
  select_option: '选择选项',
  select_next: '下一项',
  select_previous: '上一项',
  send_message: '发送消息',
  create: '创建',
  dismiss: '关闭',
  cancel: '取消',
  finish: '结束',
  reset: '重置',
  set_humidity: '设置湿度',
  set_mode: '设置模式',
}

const DOMAIN_LABELS: Record<string, string> = {
  light: '灯光',
  switch: '开关',
  cover: '窗帘/遮盖',
  climate: '空调',
  media_player: '媒体',
  lock: '门锁',
  vacuum: '扫地机',
  fan: '风扇',
  alarm_control_panel: '报警',
  scene: '场景',
  script: '脚本',
  automation: '自动化',
  input_boolean: '开关输入',
  input_number: '数值输入',
  input_select: '选项输入',
  valve: '阀门',
  humidifier: '加湿器',
  water_heater: '热水器',
  notify: '通知',
  timer: '计时器',
  counter: '计数器',
}

/** domainFromEntityId：函数，按签名入参返回处理结果。 */
export function domainFromEntityId(entityId: string | null | undefined): string {
  const s = String(entityId || '')
  const i = s.indexOf('.')
  return i > 0 ? s.slice(0, i) : ''
}

function labelForService(service: string): string {
  return SERVICE_LABELS[service] || service
}

/** labelForDomain：函数，按签名入参返回处理结果。 */
export function labelForDomain(domain: string): string {
  return DOMAIN_LABELS[domain] || domain
}

/** 某实体可选能力列表（按域 + 可选 device_class） */
export function capabilitiesForEntity(
  entityId: string | null | undefined,
  attrs?: Record<string, unknown> | null,
): GeekCapability[] {
  return resolveCapabilitiesForEntity(entityId, attrs)
}

/** 无实体时展示的常用域快捷能力 */
export function popularCapabilities(): GeekCapability[] {
  return popularCapabilityDefs()
}

/** applyCapabilityToAction：函数，按签名入参返回处理结果。 */
export function applyCapabilityToAction(
  action: { domain?: string; service?: string; entityId?: string },
  cap: GeekCapability,
) {
  action.domain = cap.domain
  action.service = cap.service
  const ed = domainFromEntityId(action.entityId)
  if (ed && ed !== cap.domain) action.entityId = `${cap.domain}.`
}

/** capabilityIdOfAction：函数，按签名入参返回处理结果。 */
export function capabilityIdOfAction(action: {
  domain?: string
  service?: string
}): string {
  if (!action.domain || !action.service) return ''
  return `${action.domain}.${action.service}`
}

type GeekServiceParamField = GeekCapParamDef

/** 已选能力若需要 service data，返回表单字段 */
export function serviceParamFieldsForAction(action: {
  domain?: string
  service?: string
} | null): GeekServiceParamField[] {
  if (!action?.domain || !action?.service) return []
  return paramsForCapabilityDef(action.domain, action.service)
}

/** readActionServiceData：函数，按签名入参返回处理结果。 */
export function readActionServiceData(action: { data?: string } | null): Record<string, unknown> {
  if (!action?.data) return {}
  try {
    const parsed = JSON.parse(action.data)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

/** writeActionServiceDataKey：函数，按签名入参返回处理结果。 */
export function writeActionServiceDataKey(
  action: { data?: string },
  key: string,
  raw: string | number | null | undefined,
) {
  const data = readActionServiceData(action)
  if (raw === '' || raw == null) delete data[key]
  else if (
    typeof raw === 'number' ||
    (typeof raw === 'string' &&
      raw.trim() !== '' &&
      !Number.isNaN(Number(raw)) &&
      key !== 'option' &&
      key !== 'hvac_mode' &&
      key !== 'code' &&
      key !== 'effect')
  ) {
    data[key] = typeof raw === 'number' ? raw : Number(raw)
  } else {
    data[key] = raw
  }
  action.data = Object.keys(data).length ? JSON.stringify(data) : ''
}

/** 人读摘要：灯光 · 打开 light.xxx */
export function friendlyActionDetail(action: {
  type?: string
  domain?: string
  service?: string
  entityId?: string
  seconds?: number
  notifyMsg?: string
  message?: string
  notifySvc?: string
  varKey?: string
  varOp?: string
  varValue?: string
  varSourceEntityId?: string
  varSourceAttribute?: string
  varSourceVar?: string
  repeatType?: string
  repeatCount?: number
  repeatEntityId?: string
  repeatActions?: unknown[]
  noteText?: string
  data?: string
}): string {
  if (action.type === 'delay') return `延时 ${action.seconds || 1} 秒`
  if (action.type === 'note') return action.noteText || action.notifyMsg || '注释'
  if (action.type === 'debug') return `调试 ${action.notifyMsg || ''}`.trim()
  if (action.type === 'notify_homeos') return action.notifyMsg || '通知'
  if (action.type === 'notify') {
    return `${action.notifyMsg || '通知'} → ${action.message || action.notifySvc || ''}`
  }
  if (action.type === 'repeat') {
    if (action.repeatType === 'while' || action.repeatType === 'until') {
      return `${action.repeatType} ${action.repeatEntityId || ''} ×${(action.repeatActions || []).length} 步`
    }
    return `重复 ${action.repeatCount || 1} 次 · ${(action.repeatActions || []).length} 步`
  }
  if (action.type === 'variable_set') {
    if (action.varSourceVar) {
      return `变量 ${action.varSourceVar} → ${action.varKey || ''}`
    }
    if (action.varSourceEntityId) {
      return `设备 ${action.varSourceEntityId}${action.varSourceAttribute ? '.' + action.varSourceAttribute : ''} → ${action.varKey || ''}`
    }
    return `变量 ${action.varKey || ''} ${action.varOp || 'set'} ${action.varValue ?? ''}`
  }
  if (action.type === 'var_math') {
    const lhs = (action as { mathLhsVar?: string; mathLhs?: string }).mathLhsVar
      || (action as { mathLhs?: string }).mathLhs
      || ''
    const rhs = (action as { mathRhsVar?: string; mathRhs?: string }).mathRhsVar
      || (action as { mathRhs?: string }).mathRhs
      || ''
    return `${lhs} ${(action as { mathOp?: string }).mathOp || '+'} ${rhs} → ${action.varKey || ''}`
  }
  if (action.type === 'var_concat') {
    return `拼接 → ${action.varKey || ''}`
  }
  if (action.type === 'var_fn') {
    return `${(action as { fnName?: string }).fnName || 'round'} → ${action.varKey || ''}`
  }
  if (action.type === 'scene') return `场景 ${action.entityId || (action as { sceneId?: string }).sceneId || ''}`
  if (action.type === 'script') return `脚本 ${action.entityId || (action as { scriptId?: string }).scriptId || ''}`
  if (action.type === 'trigger_automation') return `触发 ${action.entityId || ''}`
  if (action.type === 'deviceAction') {
    let deviceId = ''
    try {
      const raw = action.data ? JSON.parse(String(action.data)) : null
      if (raw && typeof raw === 'object' && raw.device_id != null) deviceId = String(raw.device_id)
    } catch {
      /* 忽略 */
    }
    return `${action.service || 'device'} ${deviceId || action.entityId || ''}`.trim()
  }
  if (action.type === 'stop') return action.notifyMsg || '停止'
  if (action.type === 'parallel') {
    const n =
      (action as { parallelBranches?: unknown[] }).parallelBranches?.length ||
      (action as { parallelActions?: unknown[] }).parallelActions?.length ||
      0
    return n ? `并行 ${n} 路` : '并行（画布连线）'
  }
  if (action.type === 'choose') {
    const br = (action as { branches?: unknown[] }).branches || []
    return `分支 ${br.length || 0} 条`
  }
  if (action.type === 'wait_template') {
    const tpl = String((action as { waitTemplate?: string }).waitTemplate || '')
    return tpl ? `等待 ${tpl.slice(0, 28)}${tpl.length > 28 ? '…' : ''}` : '等待模板'
  }
  if (action.type === 'wait_for_trigger') {
    const kind = (action as { waitTriggerType?: string }).waitTriggerType || 'state'
    return `等待 ${kind} ${action.entityId || ''}`.trim()
  }
  if (action.type === 'variables') {
    const map = String((action as { variablesMap?: string }).variablesMap || '')
    return map ? `变量 ${map}` : '运行时变量'
  }
  if (action.type === 'fire_event') {
    return `事件 ${(action as { eventType?: string }).eventType || ''}`
  }
  if (action.type === 'home_mode') return `模式 ${(action as { modeId?: string }).modeId || ''}`
  if (action.type && action.type !== 'callService') return action.entityId || action.type
  const d = labelForDomain(action.domain || '')
  const s = labelForService(action.service || '')
  let dataHint = ''
  try {
    if (action.data) {
      const obj = JSON.parse(action.data) as Record<string, unknown>
      const keys = Object.keys(obj)
      if (keys.length) {
        dataHint = keys
          .slice(0, 2)
          .map((k) => `${k}=${obj[k]}`)
          .join(' ')
      }
    }
  } catch {
    dataHint = ''
  }
  return `${d} · ${s} ${action.entityId || ''} ${dataHint}`.trim()
}
