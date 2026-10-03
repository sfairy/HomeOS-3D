/**
 * 极客自动化触发预设（米家式中文点选 → AutomationTriggerForm）
 *
 * 职责：
 * - 维护常见触发场景的预设表（设备开关 / 状态保持 / 数值跨越 / 时间 / 等）。
 * - 提供 apply（应用预设到表单）与 match（识别表单是否匹配预设）工具。
 * - 供触发器面板以中文点选方式快速生成与回显触发配置。
 *
 * 依赖：
 * - @/types/orchestrator-builder 的 AutomationTriggerForm 类型。
 * - ./defaults 的 createGeekTrigger 触发节点工厂。
 * - ./capabilities.util 的 domainFromEntityId。
 *
 * 注意：
 * - `id`（device_on / ...）与 `group`（设备 / ...）为预设 key，不翻译。
 * - `stateTo` / `stateFrom` 等 HA state 值为配置值，不翻译。
 * - 仅面向用户的 label / 分组名使用简体中文。
 */
import type { AutomationTriggerForm } from '@/types/orchestrator-builder'
import { createGeekTrigger } from './defaults'
import { domainFromEntityId } from './capabilities.util'

type GeekTriggerPreset = {
  id: string
  label: string
  group: string
  apply: (t: AutomationTriggerForm) => void
  /** 是否需要实体 */
  needsEntity?: boolean
  match?: (t: AutomationTriggerForm) => boolean
}

/** GEEK_TRIGGER_PRESETS：常量集合，成员语义见定义处。 */
export const GEEK_TRIGGER_PRESETS: GeekTriggerPreset[] = [
  {
    id: 'device_on',
    label: '设备变为打开',
    group: '设备',
    needsEntity: true,
    apply: (t) => {
      Object.assign(t, createGeekTrigger({ type: 'state', stateFrom: '', stateTo: 'on' }))
    },
    match: (t) =>
      t.type === 'state' && String(t.stateTo) === 'on' && !(Number(t.forSeconds) > 0),
  },
  {
    id: 'device_off',
    label: '设备变为关闭',
    group: '设备',
    needsEntity: true,
    apply: (t) => {
      Object.assign(t, createGeekTrigger({ type: 'state', stateTo: 'off' }))
    },
    match: (t) =>
      t.type === 'state' && String(t.stateTo) === 'off' && !(Number(t.forSeconds) > 0),
  },
  {
    id: 'device_any',
    label: '实体状态任意变化',
    group: '设备',
    needsEntity: true,
    apply: (t) => {
      Object.assign(t, createGeekTrigger({ type: 'state', stateTo: 'any' }))
    },
    match: (t) =>
      t.type === 'state' &&
      (t.stateTo === 'any' || t.stateTo === '') &&
      !(Number(t.forSeconds) > 0),
  },
  {
    id: 'state_held',
    label: '状态维持了一段时间',
    group: '时间',
    needsEntity: true,
    apply: (t) => {
      Object.assign(
        t,
        createGeekTrigger({ type: 'state', stateTo: 'on', forSeconds: 60 }),
      )
    },
    match: (t) => t.type === 'state' && Number(t.forSeconds) > 0,
  },
  {
    id: 'numeric_above',
    label: '数值高于…',
    group: '设备',
    needsEntity: true,
    apply: (t) => {
      Object.assign(t, createGeekTrigger({ type: 'numeric', numOp: 'above', numValue: '50' }))
    },
    match: (t) => t.type === 'numeric' && t.numOp === 'above',
  },
  {
    id: 'numeric_below',
    label: '数值低于…',
    group: '设备',
    needsEntity: true,
    apply: (t) => {
      Object.assign(t, createGeekTrigger({ type: 'numeric', numOp: 'below', numValue: '50' }))
    },
    match: (t) => t.type === 'numeric' && t.numOp === 'below',
  },
  {
    id: 'time_at',
    label: '到点触发',
    group: '时间',
    apply: (t) => {
      Object.assign(t, createGeekTrigger({ type: 'time', at: '08:00:00', days: [] }))
    },
    match: (t) => t.type === 'time',
  },
  {
    id: 'sun_rise',
    label: '日出',
    group: '时间',
    apply: (t) => {
      Object.assign(t, createGeekTrigger({ type: 'sun', sunEvent: 'sunrise' }))
    },
    match: (t) => t.type === 'sun' && t.sunEvent === 'sunrise',
  },
  {
    id: 'sun_set',
    label: '日落',
    group: '时间',
    apply: (t) => {
      Object.assign(t, createGeekTrigger({ type: 'sun', sunEvent: 'sunset' }))
    },
    match: (t) => t.type === 'sun' && t.sunEvent === 'sunset',
  },
  {
    id: 'presence_arrive',
    label: '有人回家',
    group: '人员',
    apply: (t) => {
      Object.assign(t, createGeekTrigger({ type: 'presence', presenceKind: 'arrive' }))
    },
    match: (t) => t.type === 'presence' && t.presenceKind !== 'leave_all',
  },
  {
    id: 'presence_leave',
    label: '全部离开',
    group: '人员',
    apply: (t) => {
      Object.assign(t, createGeekTrigger({ type: 'presence', presenceKind: 'leave_all' }))
    },
    match: (t) => t.type === 'presence' && t.presenceKind === 'leave_all',
  },
  {
    id: 'zone_enter',
    label: '进入区域',
    group: '人员',
    needsEntity: true,
    apply: (t) => {
      Object.assign(
        t,
        createGeekTrigger({ type: 'zone', zoneEvent: 'enter', zoneId: 'zone.home', entityId: '' }),
      )
    },
    match: (t) => t.type === 'zone' && t.zoneEvent !== 'leave',
  },
  {
    id: 'zone_leave',
    label: '离开区域',
    group: '人员',
    needsEntity: true,
    apply: (t) => {
      Object.assign(
        t,
        createGeekTrigger({ type: 'zone', zoneEvent: 'leave', zoneId: 'zone.home', entityId: '' }),
      )
    },
    match: (t) => t.type === 'zone' && t.zoneEvent === 'leave',
  },
  {
    id: 'interval',
    label: '循环间隔',
    group: '高级',
    apply: (t) => {
      Object.assign(t, createGeekTrigger({ type: 'interval', intervalSeconds: 60 }))
    },
    match: (t) => t.type === 'interval',
  },
  {
    id: 'sequence',
    label: '顺序事件',
    group: '高级',
    apply: (t) => {
      Object.assign(
        t,
        createGeekTrigger({
          type: 'sequence',
          sequenceTimeout: 60,
          sequenceSteps: [
            createGeekTrigger({ type: 'state', stateTo: 'on' }),
            createGeekTrigger({ type: 'state', stateTo: 'on' }),
          ],
        }),
      )
    },
    match: (t) => t.type === 'sequence',
  },
  {
    id: 'onload',
    label: '自动化启用时',
    group: '高级',
    apply: (t) => {
      Object.assign(t, createGeekTrigger({ type: 'onload' }))
    },
    match: (t) => t.type === 'onload',
  },
  {
    id: 'variable',
    label: '变量变更',
    group: '高级',
    apply: (t) => {
      Object.assign(t, createGeekTrigger({ type: 'variable', varKey: '' }))
    },
    match: (t) => t.type === 'variable' && (t.varValue == null || String(t.varValue) === ''),
  },
  {
    id: 'var_reached',
    label: '达到指定次数时',
    group: '流程',
    apply: (t) => {
      Object.assign(
        t,
        createGeekTrigger({ type: 'variable', varKey: 'run_count', varValue: '3' }),
      )
    },
    match: (t) => t.type === 'variable' && t.varValue != null && String(t.varValue) !== '',
  },
  {
    id: 'calendar',
    label: '日历事件',
    group: '高级',
    needsEntity: true,
    apply: (t) => {
      Object.assign(
        t,
        createGeekTrigger({ type: 'calendar', entityId: '', calendarEvent: 'start' }),
      )
    },
    match: (t) => t.type === 'calendar',
  },
  {
    id: 'homeassistant',
    label: 'HA 启动/停止',
    group: '高级',
    apply: (t) => {
      Object.assign(t, createGeekTrigger({ type: 'homeassistant', haEvent: 'start' }))
    },
    match: (t) => t.type === 'homeassistant',
  },
  {
    id: 'ha_device',
    label: 'HA 设备触发（需 HA 执行）',
    group: '高级',
    needsEntity: true,
    apply: (t) => {
      Object.assign(
        t,
        createGeekTrigger({
          type: 'device',
          deviceId: '',
          domain: '',
          deviceType: 'turned_on',
          entityId: '',
        }),
      )
    },
    match: (t) => t.type === 'device',
  },
  {
    id: 'event',
    label: '自定义事件',
    group: '高级',
    apply: (t) => {
      Object.assign(t, createGeekTrigger({ type: 'event', eventType: '', eventDataKey: '', eventDataVal: '' }))
    },
    match: (t) => t.type === 'event',
  },
]

/** matchTriggerPreset：函数，按签名入参返回处理结果。 */
export function matchTriggerPreset(t: AutomationTriggerForm): string {
  const hit = GEEK_TRIGGER_PRESETS.find((p) => p.match?.(t))
  return hit?.id || ''
}

/** applyTriggerPreset：函数，按签名入参返回处理结果。 */
export function applyTriggerPreset(t: AutomationTriggerForm, presetId: string) {
  const p = GEEK_TRIGGER_PRESETS.find((x) => x.id === presetId)
  if (!p) return
  const keepEntity = t.entityId
  const keepVar = t.varKey
  const keepScope = t.varScope
  p.apply(t)
  if (p.needsEntity && keepEntity) t.entityId = keepEntity
  if (t.type === 'variable') {
    if (keepVar) t.varKey = keepVar
    if (keepScope) t.varScope = keepScope
    else if (!t.varScope) t.varScope = 'global'
  }
}

/** friendlyTriggerDetail：函数，按签名入参返回处理结果。 */
export function friendlyTriggerDetail(t: AutomationTriggerForm): string {
  const preset = GEEK_TRIGGER_PRESETS.find((p) => p.match?.(t))
  if (t.type === 'time') {
    const days = Array.isArray(t.days) ? t.days : []
    if (days.length) {
      const labels = ['日', '一', '二', '三', '四', '五', '六']
      return `${t.at || '08:00:00'}（周${days.map((d) => labels[d] ?? '?').join('/')}）`
    }
    return t.at || '08:00:00'
  }
  if (t.type === 'interval') return `每 ${t.intervalSeconds || 60} 秒`
  if (t.type === 'sequence') return `${(t.sequenceSteps || []).length} 步顺序`
  if (t.type === 'numeric') return `${t.numOp === 'below' ? '低于' : '高于'} ${t.numValue ?? ''}`
  if (t.type === 'variable') {
    if (t.varValue != null && String(t.varValue) !== '') {
      return `${t.varKey || ''} = ${t.varValue}`
    }
    return t.varKey || '变量'
  }
  if (t.type === 'presence') return preset?.label || '在场'
  if (t.type === 'sun') {
    const base = t.sunEvent === 'sunset' ? '日落' : '日出'
    const off = Number(t.sunOffset) || 0
    return off ? `${base} ${off > 0 ? '+' : ''}${off}分钟` : base
  }
  if (t.type === 'device') {
    return `${t.deviceType || 'device'} ${t.deviceId || t.entityId || ''}`.trim()
  }
  if (t.type === 'zone') {
    return `${t.zoneEvent === 'leave' ? '离开' : '进入'} ${t.zoneId || ''} ${t.entityId || ''}`.trim()
  }
  if (t.type === 'onload') return '启用时'
  if (t.type === 'calendar') return `${t.calendarEvent || 'start'} ${t.entityId || ''}`.trim()
  if (t.type === 'homeassistant') return t.haEvent === 'shutdown' ? 'HA 停止' : 'HA 启动'
  if (t.type === 'event') return t.eventType || '自定义事件'
  if (Number(t.forSeconds) > 0) {
    return `${t.entityId || ''} → ${t.stateTo || 'on'} 持续 ${t.forSeconds}s`.trim()
  }
  const domain = domainFromEntityId(t.entityId)
  return `${t.entityId || domain || ''} ${t.stateTo && t.stateTo !== 'any' ? `→ ${t.stateTo}` : ''}`.trim()
}
