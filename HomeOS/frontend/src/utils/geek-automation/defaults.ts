/**
 * 极客自动化节点默认值工厂
 *
 * 职责：
 * - 提供触发器（createGeekTrigger）、条件（createGeekCondition）、
 *   动作（createGeekAction）节点的默认值工厂。
 * - 默认值对齐 AutomationTriggerForm / AutomationConditionForm / OrchestratorActionForm。
 *
 * 依赖：
 * - @/utils/orchestrator/yaml-action-parse.util 的 createDefaultOrchestratorAction。
 * - @/types/orchestrator-builder 的表单类型。
 *
 * 注意：
 * - 触发 type（state / time / numeric / ...）、条件 type、动作 type 均为表单 key，不翻译。
 * - HA state / sunEvent / presenceKind 等为配置值，不翻译。
 */
import { createDefaultOrchestratorAction } from '@/utils/orchestrator/yaml-action-parse.util'
import type {
  AutomationConditionForm,
  AutomationTriggerForm,
  OrchestratorActionForm,
} from '@/types/orchestrator-builder'

/** createGeekTrigger：函数，按签名入参返回处理结果。 */
export function createGeekTrigger(partial?: Partial<AutomationTriggerForm>): AutomationTriggerForm {
  return {
    type: 'state',
    entityId: '',
    stateFrom: '',
    stateTo: 'on',
    forSeconds: '',
    at: '08:00:00',
    days: [],
    sunEvent: 'sunrise',
    sunOffset: 0,
    numOp: 'above',
    numValue: '',
    numBelow: '',
    haEvent: 'start',
    eventType: '',
    eventDataKey: '',
    eventDataVal: '',
    presenceKind: 'arrive',
    zoneId: 'zone.home',
    zoneEvent: 'enter',
    calendarEvent: 'start',
    intervalSeconds: 60,
    loopControlVar: '',
    varKey: '',
    varValue: '',
    varScope: 'global',
    attribute: '',
    entityIds: [],
    sequenceSteps: [],
    sequenceTimeout: 60,
    ...partial,
  }
}

/** createGeekCondition：函数，按签名入参返回处理结果。 */
export function createGeekCondition(
  partial?: Partial<AutomationConditionForm>,
): AutomationConditionForm {
  return {
    operator: 'eq',
    entityId: '',
    state: 'on',
    forSeconds: '',
    stateTo: '',
    days: [],
    varKey: '',
    varScope: 'global',
    attribute: '',
    negated: false,
    ...partial,
  }
}

/** createGeekAction：函数，按签名入参返回处理结果。 */
export function createGeekAction(type = 'callService'): OrchestratorActionForm {
  const a = createDefaultOrchestratorAction('automation')
  a.type = type
  if (type === 'delay') a.seconds = 5
  if (type === 'notify_homeos') a.notifyMsg = '通知'
  if (type === 'notify') {
    a.notifyMsg = '通知'
    a.message = ''
    a.notifySvc = ''
  }
  if (type === 'note') {
    a.noteText = '在这里写说明…'
  }
  if (type === 'debug') {
    a.notifyMsg = '调试点'
  }
  if (type === 'repeat') {
    a.repeatType = 'count'
    a.repeatCount = 2
    a.repeatEntityId = ''
    a.repeatCondState = 'on'
    a.repeatActions = []
  }
  if (type === 'variable_set') {
    a.varKey = ''
    a.varScope = 'global'
    a.varOp = 'set'
    a.varType = 'number'
    a.varValue = '0'
    a.varSourceKind = 'literal'
  }
  if (type === 'wait_for_trigger') {
    a.waitTriggerType = 'state'
    a.waitStateTo = 'on'
    a.waitTimeout = '60'
    a.waitAttribute = ''
    a.waitNumOp = 'above'
    a.waitNumValue = ''
    a.waitEventType = ''
    a.waitEventDataKey = ''
    a.waitEventDataVal = ''
    a.continueOnTimeout = false
  }
  if (type === 'wait_template') {
    a.waitTemplate = '{{ is_state(\'binary_sensor.x\', \'on\') }}'
    a.waitTimeout = '60'
    a.continueOnTimeout = false
  }
  if (type === 'choose') {
    a.branches = [
      {
        isDefault: false,
        condEntityId: '',
        condOp: 'eq',
        condState: 'on',
        actions: [],
      },
      {
        isDefault: true,
        condEntityId: '',
        condOp: 'eq',
        condState: '',
        actions: [],
      },
    ]
  }
  if (type === 'deviceAction') {
    a.domain = ''
    a.service = ''
    a.entityId = ''
    a.data = JSON.stringify({ device_id: '' })
  }
  if (type === 'trigger_automation') {
    a.entityId = ''
    a.domain = 'automation'
    a.service = 'trigger'
  }
  if (type === 'stop') {
    a.notifyMsg = ''
    a.data = ''
  }
  if (type === 'scene') {
    a.sceneId = ''
    a.entityId = ''
  }
  if (type === 'script') {
    a.scriptId = ''
    a.entityId = ''
  }
  if (type === 'fire_event') {
    a.eventType = ''
    a.eventData = ''
  }
  if (type === 'variables') {
    a.variablesMap = ''
  }
  if (type === 'parallel') {
    a.parallelActions = []
  }
  if (type === 'sequence') {
    a.parallelActions = []
  }
  if (type === 'loop_start' || type === 'loop_stop') {
    a.entityId = ''
  }
  if (type === 'home_mode') {
    a.modeId = ''
  }
  if (type === 'var_math') {
    a.varKey = ''
    a.varScope = 'global'
    a.varType = 'number'
    a.mathOp = '+'
    a.mathLhs = '0'
    a.mathRhs = '0'
    a.mathLhsVar = ''
    a.mathRhsVar = ''
    a.mathLhsKind = 'literal'
    a.mathRhsKind = 'literal'
  }
  if (type === 'var_concat') {
    a.varKey = ''
    a.varScope = 'global'
    a.varType = 'string'
    a.concatParts = ''
    a.concatSourceKind = 'literal'
  }
  if (type === 'var_fn') {
    a.varKey = ''
    a.varScope = 'global'
    a.varType = 'number'
    a.fnName = 'round'
    a.fnArg = ''
    a.fnArgVar = ''
    a.fnArgKind = 'literal'
    a.fnDigits = 0
  }
  return a
}
