/**
 * 画布连通性校验：连线合法性（端口语义）与保存前校验（触发/动作完备 + start 可达 + 字段完整性）。
 */
import type { OrchestratorActionForm } from '@/types/orchestrator-builder'
import { WAIT_TYPES_NEED_ENTITY } from '@/utils/orchestrator/automation-trigger-yaml.util'
import { getChooseBranchConditions } from '@/utils/orchestrator/choose-branch-condition.util'
import {
  isChooseElseHandle,
  thenHandleIndex,
  type GeekCanvasEdge,
  type GeekCanvasNode,
} from './canvas-shared.util'

/** 连线合法性（含 Node-RED 式端口语义） */
export function isValidGeekConnection(params: {
  sourceNode?: GeekCanvasNode | null
  targetNode?: GeekCanvasNode | null
  sourceHandle?: string | null
}): boolean {
  const sk = params.sourceNode?.data?.kind
  const tk = params.targetNode?.data?.kind
  if (!sk || !tk) return false
  if (sk === 'note' || tk === 'note') return false
  if (params.sourceNode?.id === params.targetNode?.id) return false
  if (sk === 'start') {
    return (
      tk === 'trigger' ||
      tk === 'condition' ||
      tk === 'action' ||
      tk === 'trigger_group' ||
      tk === 'condition_group'
    )
  }
  if (sk === 'trigger_group') {
    return (
      tk === 'trigger' ||
      tk === 'condition' ||
      tk === 'condition_group' ||
      tk === 'action' ||
      tk === 'trigger_group'
    )
  }
  if (sk === 'condition_group') {
    return tk === 'condition' || tk === 'condition_group' || tk === 'action'
  }
  if (sk === 'trigger') {
    return (
      tk === 'trigger' ||
      tk === 'condition' ||
      tk === 'action' ||
      tk === 'condition_group' ||
      tk === 'trigger_group'
    )
  }
  if (sk === 'condition') {
    // fail 口只连动作（旁路）；pass 可连条件或动作
    if (params.sourceHandle === 'fail') return tk === 'action'
    return tk === 'condition' || tk === 'action'
  }
  if (sk === 'action') {
    const at = params.sourceNode?.data?.action?.type
    if (at === 'choose' && params.sourceHandle === 'done') return tk === 'action'
    if (
      at === 'choose' &&
      (isChooseElseHandle(params.sourceHandle) || thenHandleIndex(params.sourceHandle) != null)
    ) {
      return tk === 'action'
    }
    if (at === 'repeat' && params.sourceHandle === 'done') return tk === 'action'
    if (at === 'repeat' && (params.sourceHandle === 'body' || !params.sourceHandle)) {
      return tk === 'action'
    }
    if (at === 'sequence' && params.sourceHandle === 'done') return tk === 'action'
    if (
      at === 'sequence' &&
      (params.sourceHandle === 'body' ||
        params.sourceHandle === 'out' ||
        !params.sourceHandle)
    ) {
      return tk === 'action'
    }
    if (at === 'parallel' && params.sourceHandle === 'done') return tk === 'action'
    return tk === 'action'
  }
  return false
}

/** 保存前校验：至少 1 触发 + 1 动作，且关键节点均从 start 可达；script 模式仅需动作 */
export function validateGeekCanvasConnectivity(
  nodes: GeekCanvasNode[],
  edges: GeekCanvasEdge[],
  opts?: { mode?: 'automation' | 'script' },
): string | null {
  const scriptMode = opts?.mode === 'script'
  const triggers = nodes.filter((n) => n.data?.kind === 'trigger')
  const conditions = nodes.filter((n) => n.data?.kind === 'condition')
  const actions = nodes.filter((n) => n.data?.kind === 'action' && n.data?.action?.type !== 'note')
  if (!scriptMode && !triggers.length) return '请添加至少一个触发节点'
  if (!actions.length) return '请添加至少一个动作节点'

  const outs = new Map<string, string[]>()
  for (const e of edges) {
    if (!outs.has(e.source)) outs.set(e.source, [])
    outs.get(e.source)!.push(e.target)
  }
  const reach = new Set<string>()
  const stack = ['start']
  while (stack.length) {
    const id = stack.pop()!
    if (reach.has(id)) continue
    reach.add(id)
    for (const t of outs.get(id) || []) stack.push(t)
  }
  if (!scriptMode) {
    const orphanTrig = triggers.find((t) => !reach.has(t.id))
    if (orphanTrig) return `触发节点「${orphanTrig.data.label}」未连到流程，请从「开始」连线`
    const orphanCond = conditions.find((c) => !reach.has(c.id))
    if (orphanCond) return `条件节点「${orphanCond.data.label}」未连到流程，请接到触发或开始之后`
  }
  const orphanAct = actions.find((a) => !reach.has(a.id))
  if (orphanAct) {
    return scriptMode
      ? `动作节点「${orphanAct.data.label}」未连到流程，请从「开始」连线`
      : `动作节点「${orphanAct.data.label}」未连到流程，请把触发/条件连到动作`
  }

  if (scriptMode) {
    for (const a of actions) {
      const err = validateGeekActionFields(a.data.action, a.data.label || '动作', {
        nodeId: a.id,
        edges,
      })
      if (err) return err
    }
    return null
  }

  for (const t of triggers) {
    const tr = t.data.trigger
    if (!tr) continue
    if (tr.type === 'variable' && !String(tr.varKey || '').trim()) {
      return `触发「${t.data.label}」请填写变量名`
    }
    if (tr.type === 'event' && !String(tr.eventType || '').trim()) {
      return `触发「${t.data.label}」请填写事件类型`
    }
    if (tr.type === 'time' && !String(tr.at || '').trim()) {
      return `触发「${t.data.label}」请填写时刻`
    }
    if (tr.type === 'numeric' && (tr.numValue == null || String(tr.numValue).trim() === '')) {
      return `触发「${t.data.label}」请填写阈值`
    }
    if (tr.type === 'device' && !String(tr.deviceId || tr.entityId || '').trim()) {
      return `触发「${t.data.label}」请填写 device_id`
    }
    if (tr.type === 'interval' && !(Number(tr.intervalSeconds) > 0)) {
      return `触发「${t.data.label}」请填写大于 0 的间隔秒数`
    }
    if (tr.type === 'sequence') {
      const steps = Array.isArray(tr.sequenceSteps) ? tr.sequenceSteps : []
      if (!steps.length) return `触发「${t.data.label}」请添加序列步骤`
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i]
        if (
          (s.type === 'state' || s.type === 'numeric' || s.type === 'zone') &&
          !String(s.entityId || '').trim()
        ) {
          return `触发「${t.data.label}」第 ${i + 1} 步请选择实体`
        }
      }
    }
    if (
      (tr.type === 'state' || tr.type === 'numeric' || tr.type === 'zone' || tr.type === 'calendar') &&
      !String(tr.entityId || '').trim() &&
      !(Array.isArray(tr.entityIds) && tr.entityIds.some(Boolean))
    ) {
      return `触发「${t.data.label}」请选择实体`
    }
  }

  // 多触发组时组内 AND 无法在 HA 扁平 trigger 中保真（会静默变成 OR）
  const trigGroups = nodes.filter((n) => n.data?.kind === 'trigger_group')
  if (trigGroups.length > 1) {
    for (const g of trigGroups) {
      const logic = String(g.data?.groupLogic || 'or')
      const members = triggers.filter((t) => t.data?.groupId === g.id)
      if (logic === 'and' && members.length > 1) {
        return '多个触发组时，组内「全部」无法正确编译为 HA YAML。请合并为一组，或改为组内「任一」。'
      }
    }
  }
  for (const c of conditions) {
    const cond = c.data.condition
    if (!cond) continue
    const op = String(cond.operator || '')
    if (op.startsWith('var_') && !String(cond.varKey || '').trim()) {
      return `条件「${c.data.label}」请填写变量名`
    }
    if (
      !op.startsWith('var_') &&
      !op.startsWith('sun_') &&
      !op.startsWith('time_') &&
      op !== 'weekday' &&
      !String(cond.entityId || '').trim()
    ) {
      return `条件「${c.data.label}」请选择实体`
    }
    if (op === 'weekday' && !(Array.isArray(cond.days) && cond.days.length)) {
      return `条件「${c.data.label}」请选择生效星期`
    }
    if (
      (op === 'time_after' || op === 'time_before') &&
      !String(cond.state || '').trim()
    ) {
      return `条件「${c.data.label}」请填写时刻`
    }
    if (op === 'state_for' && !(Number(cond.forSeconds) > 0 || String(cond.forSeconds || '').trim())) {
      return `条件「${c.data.label}」请填写持续秒数`
    }
    if (op === 'between' && (cond.state == null || cond.state === '' || cond.stateTo == null || cond.stateTo === '')) {
      return `条件「${c.data.label}」请填写上下界`
    }
  }
  for (const a of actions) {
    const err = validateGeekActionFields(a.data.action, a.data.label || '动作', {
      nodeId: a.id,
      edges,
    })
    if (err) return err
  }
  return null
}

function canvasHasBranchEdges(
  nodeId: string | undefined,
  edges: GeekCanvasEdge[] | undefined,
): boolean {
  if (!nodeId || !edges?.length) return false
  return edges.some((e) => {
    if (e.source !== nodeId) return false
    const h = e.sourceHandle == null || e.sourceHandle === '' ? 'out' : String(e.sourceHandle)
    return h !== 'done' && h !== 'fail'
  })
}

function validateGeekActionFields(
  action: OrchestratorActionForm | null | undefined,
  label: string,
  canvasCtx?: { nodeId?: string; edges?: GeekCanvasEdge[] },
): string | null {
  if (!action) return `动作「${label}」配置无效`
  const t = String(action.type || '')
  if (t === 'note') return null
  if (t === 'callService') {
    if (!action.domain || !action.service) {
      return `动作「${label}」请选择实体与能力`
    }
    const hasTarget =
      String(action.entityId || '').trim() ||
      String(action.targetAreaId || '').trim() ||
      String(action.targetDeviceId || '').trim() ||
      String(action.targetLabelId || '').trim()
    if (!hasTarget) {
      return `动作「${label}」请选择实体与能力`
    }
  }
  if (t === 'trigger_automation' && !String(action.entityId || '').trim()) {
    return `动作「${label}」请选择自动化实体`
  }
  if (t === 'wait_for_trigger') {
    const wt = String(action.waitTriggerType || 'state')
    if (wt === 'event') {
      if (!String(action.waitEventType || action.eventType || '').trim()) {
        return `动作「${label}」请填写等待事件类型`
      }
    } else if (WAIT_TYPES_NEED_ENTITY.has(wt)) {
      if (!String(action.entityId || '').trim()) {
        return `动作「${label}」请选择等待实体`
      }
    }
    // sun / time / homeassistant / onload / interval / variable 等无实体平台不强制 entityId
    if (
      wt === 'numeric' &&
      (action.waitNumValue == null || String(action.waitNumValue).trim() === '')
    ) {
      return `动作「${label}」请填写等待数值阈值`
    }
  }
  if (t === 'wait_template' && !String(action.waitTemplate || '').trim()) {
    return `动作「${label}」请填写等待模板`
  }
  if (t === 'variables' && !String(action.variablesMap || '').trim()) {
    return `动作「${label}」请填写变量（如 key=value）`
  }
  if (t === 'scene' && !String(action.sceneId || action.entityId || '').trim()) {
    return `动作「${label}」请选择场景`
  }
  if (t === 'script' && !String(action.scriptId || action.entityId || '').trim()) {
    return `动作「${label}」请选择脚本`
  }
  if (t === 'home_mode' && !String(action.modeId || '').trim()) {
    return `动作「${label}」请选择模式`
  }
  if ((t === 'notify' || t === 'notify_homeos') && !String(action.notifyMsg || action.message || '').trim()) {
    return `动作「${label}」请填写通知内容`
  }
  if (t === 'fire_event' && !String(action.eventType || '').trim()) {
    return `动作「${label}」请填写事件类型`
  }
  if (t === 'deviceAction') {
    let deviceId = ''
    try {
      const raw = action.data ? JSON.parse(String(action.data)) : null
      if (raw && typeof raw === 'object' && raw.device_id != null) deviceId = String(raw.device_id)
    } catch {
      /* 忽略 */
    }
    if (!deviceId && !String(action.entityId || '').trim()) {
      return `动作「${label}」请填写 device_id`
    }
  }
  if (t === 'delay' && !(Number(action.seconds) > 0)) {
    return `动作「${label}」请填写延迟秒数`
  }
  if (
    (t === 'variable_set' || t === 'var_concat' || t === 'var_math' || t === 'var_fn') &&
    !String(action.varKey || '').trim()
  ) {
    return `动作「${label}」请填写变量名`
  }
  if (t === 'parallel') {
    const fromForm =
      (Array.isArray(action.parallelActions) && action.parallelActions.length) ||
      (Array.isArray(action.parallelBranches) && action.parallelBranches.length)
    // 画布模式：子动作由 out 口连线表达，容器节点上数组为空
    const fromCanvas = canvasHasBranchEdges(canvasCtx?.nodeId, canvasCtx?.edges)
    if (!fromForm && !fromCanvas) return `动作「${label}」请添加并行子动作（从「并行分支」口连线）`
  }
  if (t === 'sequence') {
    const fromForm = Array.isArray(action.parallelActions) && action.parallelActions.length
    const fromCanvas = canvasHasBranchEdges(canvasCtx?.nodeId, canvasCtx?.edges)
    if (!fromForm && !fromCanvas) {
      return `动作「${label}」请添加顺序步骤（从「步骤」口连线）`
    }
  }
  if (t === 'choose' && Array.isArray(action.branches)) {
    for (let i = 0; i < action.branches.length; i++) {
      const br = action.branches[i]
      if (br.isDefault) continue
      const conds = getChooseBranchConditions(br)
      for (let ci = 0; ci < conds.length; ci++) {
        const c = conds[ci]!
        const op = String(c.operator || '')
        const tag =
          conds.length > 1
            ? `动作「${label}」分支 ${i + 1}·条件 ${ci + 1}`
            : `动作「${label}」分支 ${i + 1}`
        if (op.startsWith('var_') && !String(c.varKey || '').trim()) {
          return `${tag} 请填写变量名`
        }
        if (
          !op.startsWith('var_') &&
          !op.startsWith('sun_') &&
          !op.startsWith('time_') &&
          op !== 'weekday' &&
          !String(c.entityId || '').trim()
        ) {
          return `${tag} 请选择实体`
        }
        if (op === 'weekday' && !(Array.isArray(c.days) && c.days.length)) {
          return `${tag} 请选择生效星期`
        }
        if (
          (op === 'time_after' || op === 'time_before') &&
          !String(c.state || '').trim()
        ) {
          return `${tag} 请填写时刻`
        }
      }
      for (const ba of br.actions || []) {
        const sub = validateGeekActionFields(ba as OrchestratorActionForm, `${label}·分支${i + 1}`)
        if (sub) return sub
      }
    }
  }
  if (t === 'repeat' && Array.isArray(action.repeatActions)) {
    if (action.repeatType === 'for_each' && !String(action.repeatForEach || '').trim()) {
      return `动作「${label}」请填写遍历列表`
    }
    if (
      (action.repeatType === 'while' || action.repeatType === 'until') &&
      !String(action.repeatEntityId || '').trim()
    ) {
      return `动作「${label}」请填写循环条件实体`
    }
    for (const ba of action.repeatActions) {
      const sub = validateGeekActionFields(ba as OrchestratorActionForm, `${label}·重复`)
      if (sub) return sub
    }
  }
  return null
}
