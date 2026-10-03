/**
 * 画布同步与节点创建：画布 → 写回 geekGraph 数组 + flow 快照、根逻辑推导、
 * 新建节点、实时执行轨迹命中着色。
 */
import type {
  AutomationConditionForm,
  AutomationTriggerForm,
  OrchestratorActionForm,
} from '@/types/orchestrator-builder'
import { createEmptyGeekGraph, type GeekGraph } from './graph-types'
import { createGeekAction, createGeekCondition, createGeekTrigger } from './defaults'
import {
  actionSummary,
  conditionSummary,
  stripEphemeralNodeData,
  triggerSummary,
  uid,
  type GeekCanvasEdge,
  type GeekCanvasNode,
} from './canvas-shared.util'
import { topoOrder } from './canvas-topology.util'
import { foldConditionFailBranches } from './canvas-fold.util'

/** 画布 → 写回 graph 数组 + flow 快照（保留多组） */
export function syncGraphFromCanvas(
  graph: GeekGraph,
  nodes: GeekCanvasNode[],
  edges: GeekCanvasEdge[],
): GeekGraph {
  const triggerGroupNodes = nodes.filter((n) => n.data?.kind === 'trigger_group')
  const conditionGroupNodes = nodes.filter((n) => n.data?.kind === 'condition_group')
  const triggerNodes = topoOrder(nodes, edges, 'trigger')
  const conditionNodes = topoOrder(nodes, edges, 'condition')

  const triggerGroups =
    triggerGroupNodes.length > 0
      ? triggerGroupNodes.map((gn) => {
          const gid = gn.id
          const members = triggerNodes
            .filter((n) => n.data?.groupId === gid || (!n.data?.groupId && triggerGroupNodes[0]?.id === gid))
            .map((n) => n.data.trigger || createGeekTrigger())
          // 无 groupId 的旧节点：全部归入第一组（上面已处理首组）；其余组仅收显式 groupId
          const explicit = triggerNodes
            .filter((n) => n.data?.groupId === gid)
            .map((n) => n.data.trigger || createGeekTrigger())
          const triggers =
            explicit.length || triggerGroupNodes.length > 1
              ? explicit
              : members
          return {
            logic: (gn.data.groupLogic === 'and' ? 'and' : 'or') as string,
            triggers:
              triggers.length > 0
                ? triggers
                : triggerGroupNodes.length === 1
                  ? triggerNodes.map((n) => n.data.trigger || createGeekTrigger())
                  : [],
          }
        })
      : triggerNodes.length
        ? [
            {
              logic: (graph.triggerLogic === 'and' ? 'and' : 'or') as string,
              triggers: triggerNodes.map((n) => n.data.trigger || createGeekTrigger()),
            },
          ]
        : []

  // 去重：若多组时未分配 groupId 的节点漏掉，补进末组
  if (triggerGroupNodes.length > 1) {
    const assigned = new Set(
      triggerNodes.filter((n) => n.data?.groupId).map((n) => n.id),
    )
    const orphans = triggerNodes.filter((n) => !assigned.has(n.id))
    if (orphans.length && triggerGroups.length) {
      const last = triggerGroups[triggerGroups.length - 1]!
      last.triggers.push(...orphans.map((n) => n.data.trigger || createGeekTrigger()))
    }
  }

  const conditionGroups =
    conditionGroupNodes.length > 0
      ? conditionGroupNodes.map((gn) => {
          const gid = gn.id
          const explicit = conditionNodes
            .filter((n) => n.data?.groupId === gid)
            .map((n) => ({ id: n.id, condition: n.data.condition || createGeekCondition() }))
          const members =
            explicit.length > 0
              ? explicit
              : conditionGroupNodes.length === 1
                ? conditionNodes.map((n) => ({
                    id: n.id,
                    condition: n.data.condition || createGeekCondition(),
                  }))
                : []
          return {
            logic: (gn.data.groupLogic === 'or' ? 'or' : 'and') as string,
            members,
          }
        })
      : conditionNodes.length
        ? [
            {
              logic: (graph.condRootLogic === 'or' ? 'or' : 'and') as string,
              members: conditionNodes.map((n) => ({
                id: n.id,
                condition: n.data.condition || createGeekCondition(),
              })),
            },
          ]
        : []

  if (conditionGroupNodes.length > 1) {
    const assigned = new Set(
      conditionNodes.filter((n) => n.data?.groupId).map((n) => n.id),
    )
    const orphans = conditionNodes.filter((n) => !assigned.has(n.id))
    if (orphans.length && conditionGroups.length) {
      const last = conditionGroups[conditionGroups.length - 1]!
      last.members.push(
        ...orphans.map((n) => ({
          id: n.id,
          condition: n.data.condition || createGeekCondition(),
        })),
      )
    }
  }

  const plainConditions = conditionGroups.flatMap((g) => g.members.map((m) => m.condition))
  const orderedActions = topoOrder(nodes, edges, 'action').filter(
    (n) => n.data?.action?.type !== 'note',
  )
  const { conditions, actions, keepCondIds } = foldConditionFailBranches(
    nodes,
    edges,
    plainConditions,
    orderedActions,
  )

  // fail 折叠后按 keepCondIds 写回各组，避免多组时原条件与 choose 双重生效
  const nextConditionGroups = conditionGroups
    .map((g) => ({
      logic: g.logic,
      conditions: g.members
        .filter((m) => keepCondIds.has(m.id))
        .map((m) => m.condition),
    }))
    .filter((g) => (g.conditions?.length || 0) > 0)
  if (!nextConditionGroups.length && conditions.length) {
    nextConditionGroups.push({
      logic: graph.condRootLogic === 'or' ? 'or' : 'and',
      conditions,
    })
  }
  const conditionGroupsFinal = nextConditionGroups

  const rootLogic = deriveRootLogicFromCanvasGroups(
    triggerGroups,
    conditionGroupsFinal,
    graph,
  )

  // 刷新摘要
  const nextNodes = nodes.map((n) => {
    if (n.data.kind === 'note') {
      return {
        ...n,
        data: {
          ...n.data,
          label: '注释',
          detail: n.data.noteText || n.data.detail || '双击编辑',
        },
      }
    }
    if (n.data.kind === 'trigger_group') {
      const logic = n.data.groupLogic === 'and' ? 'and' : 'or'
      return {
        ...n,
        data: {
          ...n.data,
          label: n.data.label || '触发组',
          detail: logic === 'and' ? '组内全部' : '组内任一',
          groupLogic: logic,
        },
      }
    }
    if (n.data.kind === 'condition_group') {
      const logic = n.data.groupLogic === 'or' ? 'or' : 'and'
      return {
        ...n,
        data: {
          ...n.data,
          label: n.data.label || '条件组',
          detail: logic === 'or' ? '组内任一' : '组内全部',
          groupLogic: logic,
        },
      }
    }
    if (n.data.kind === 'trigger' && n.data.trigger) {
      const s = triggerSummary(n.data.trigger)
      return { ...n, data: { ...n.data, label: s.label, detail: s.detail } }
    }
    if (n.data.kind === 'condition' && n.data.condition) {
      const s = conditionSummary(n.data.condition)
      return { ...n, data: { ...n.data, label: s.label, detail: s.detail } }
    }
    if (n.data.kind === 'action' && n.data.action) {
      const s = actionSummary(n.data.action)
      return { ...n, data: { ...n.data, label: s.label, detail: s.detail } }
    }
    if (n.data.kind === 'start') {
      const tgCount = triggerGroups.filter((g) => (g.triggers?.length || 0) > 0).length
      const cgCount = conditionGroupsFinal.length
      const bits: string[] = []
      if (tgCount > 1) {
        bits.push(rootLogic.triggerLogic === 'and' ? '触发·全部组' : '触发·任一组')
      } else if (tgCount === 1) {
        bits.push(rootLogic.triggerLogic === 'and' ? '触发·组内全部' : '触发·组内任一')
      }
      if (cgCount > 1) {
        bits.push(rootLogic.condRootLogic === 'or' ? '条件·任一组' : '条件·全部组')
      }
      return {
        ...n,
        data: {
          ...n.data,
          detail: bits.length ? bits.join(' · ') : '流程入口',
        },
      }
    }
    return n
  })

  return createEmptyGeekGraph({
    ...graph,
    version: 2,
    ...rootLogic,
    triggerGroups,
    conditionGroups: conditionGroupsFinal,
    actions,
    flowNodes: nextNodes.map((n) => ({
      ...n,
      data: stripEphemeralNodeData({ ...(n.data || {}) }),
    })) as GeekGraph['flowNodes'],
    flowEdges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      label: typeof e.label === 'string' ? e.label : undefined,
      animated: e.animated,
    })),
  })
}

/**
 * 单组时根逻辑跟随组内逻辑；多组时保留用户在「开始」上设的组间逻辑。
 */
function deriveRootLogicFromCanvasGroups(
  triggerGroups: { logic?: string; triggers?: unknown[] }[],
  conditionGroups: { logic?: string; conditions?: unknown[] }[],
  prev: { triggerLogic?: string; condRootLogic?: string },
): { triggerLogic: 'and' | 'or'; condRootLogic: 'and' | 'or' } {
  let triggerLogic: 'and' | 'or' = prev.triggerLogic === 'and' ? 'and' : 'or'
  if (triggerGroups.length <= 1) {
    const g = triggerGroups[0]
    triggerLogic = g?.logic === 'and' ? 'and' : 'or'
  }

  let condRootLogic: 'and' | 'or' = prev.condRootLogic === 'or' ? 'or' : 'and'
  if (conditionGroups.length <= 1) {
    const g = conditionGroups[0]
    condRootLogic = g?.logic === 'or' ? 'or' : 'and'
  }

  return { triggerLogic, condRootLogic }
}

/** createCanvasNode：函数，按签名入参返回处理结果。 */
export function createCanvasNode(
  kind: 'trigger' | 'condition' | 'action' | 'note',
  position: { x: number; y: number },
  partial?: Partial<AutomationTriggerForm & AutomationConditionForm & OrchestratorActionForm> & {
    actionType?: string
    noteText?: string
  },
): GeekCanvasNode {
  if (kind === 'note') {
    const text = partial?.noteText || '在这里写说明…'
    return {
      id: uid('note'),
      type: 'geekNote',
      position,
      data: { kind: 'note', label: '注释', detail: text, noteText: text },
    }
  }
  if (kind === 'trigger') {
    const trigger = createGeekTrigger(partial)
    const s = triggerSummary(trigger)
    return {
      id: uid('trigger'),
      type: 'geekTrigger',
      position,
      data: { kind: 'trigger', label: s.label, detail: s.detail, trigger },
    }
  }
  if (kind === 'condition') {
    const condition = createGeekCondition(partial)
    const s = conditionSummary(condition)
    return {
      id: uid('condition'),
      type: 'geekCondition',
      position,
      data: { kind: 'condition', label: s.label, detail: s.detail, condition },
    }
  }
  const action = createGeekAction(partial?.actionType || 'callService')
  if (partial?.actionType === 'note') {
    action.type = 'note'
    action.noteText = partial.noteText || '注释'
  }
  if (partial?.actionType === 'debug') {
    action.type = 'debug'
    action.notifyMsg = '调试点'
  }
  const s = actionSummary(action)
  return {
    id: uid('action'),
    type: 'geekAction',
    position,
    data: { kind: 'action', label: s.label, detail: s.detail, action },
  }
}

/** applyTraceHits：函数，按签名入参返回处理结果。 */
export function applyTraceHits(
  nodes: GeekCanvasNode[],
  trace: Array<{ step?: string; ok?: boolean }>,
  success: boolean | null,
): GeekCanvasNode[] {
  if (!trace?.length) {
    // 无轨迹时保持引用稳定，避免 paintNodes 每次新建对象引发递归更新
    let changed = false
    const next = nodes.map((n) => {
      if (n.data?.hit == null) return n
      changed = true
      return { ...n, data: { ...n.data, hit: null } }
    })
    return changed ? next : nodes
  }
  return nodes.map((n) => {
    if (n.data.kind === 'start') return { ...n, data: { ...n.data, hit: true } }
    if (n.data.kind === 'trigger') return { ...n, data: { ...n.data, hit: true } }
    if (n.data.kind === 'condition') {
      const cond = trace.find((s) => String(s.step || '').includes('condition'))
      return { ...n, data: { ...n.data, hit: cond ? !!cond.ok : null } }
    }
    const a = n.data.action
    if (!a) return { ...n, data: { ...n.data, hit: success } }
    const candidates = [
      a.type,
      a.domain && a.service ? `${a.domain}.${a.service}` : '',
      a.type === 'notify_homeos' ? 'notification.homeos' : '',
      a.type === 'variable_set' ? 'homeos.variable_set' : '',
      a.type === 'var_math' ? 'homeos.variable_math' : '',
      a.type === 'var_fn' ? 'homeos.variable_fn' : '',
      a.type === 'var_concat' ? 'homeos.variable_set' : '',
      a.type === 'scene' ? 'homeos.scene.execute' : '',
      a.type === 'scene' ? 'scene.turn_on' : '',
      a.type === 'script' ? 'homeos.script.execute' : '',
      a.type === 'script' ? 'script.turn_on' : '',
      a.type === 'home_mode' ? 'homeos.home_mode' : '',
      a.type === 'debug' ? 'homeos.geek_debug' : '',
      a.type === 'delay' ? 'delay' : '',
      a.type === 'choose' ? 'choose' : '',
      a.type === 'repeat' ? 'repeat' : '',
      a.type === 'parallel' ? 'parallel' : '',
      a.type === 'wait_for_trigger' ? 'wait_for_trigger' : '',
    ].filter(Boolean)
    for (const name of candidates) {
      const hit = trace.find((s) => String(s.step || '').includes(name))
      if (hit) return { ...n, data: { ...n.data, hit: !!hit.ok } }
    }
    return { ...n, data: { ...n.data, hit: null } }
  })
}
