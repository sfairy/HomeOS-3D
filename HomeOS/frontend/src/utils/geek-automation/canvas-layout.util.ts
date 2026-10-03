/**
 * 画布布局：GeekGraph → 自动纵向/横向排布的画布节点与边。
 */
import type { GeekGraph } from './graph-types'
import type { OrchestratorActionForm } from '@/types/orchestrator-builder'
import {
  BRANCH_X,
  COL,
  GROUP_HEAD,
  GROUP_TAIL,
  ROW,
  actionSummary,
  cloneAction,
  conditionSummary,
  thenHandleId,
  thenHandleLabel,
  triggerSummary,
  type GeekCanvasEdge,
  type GeekCanvasNode,
} from './canvas-shared.util'

type LayoutConnectFrom = {
  source: string
  sourceHandle?: string | null
  label?: string
}

/** 容器节点在画布上清空嵌套（由 then/else/body 边表达，避免双份真相） */
function shellContainerAction(a: OrchestratorActionForm): OrchestratorActionForm {
  const copy = cloneAction(a)
  if (copy.type === 'choose' && Array.isArray(copy.branches)) {
    // 全部满足支 + 否则均展开到画布，统一清空 actions
    copy.branches = copy.branches.map((b) => ({ ...b, actions: [] }))
  }
  if (copy.type === 'repeat') {
    copy.repeatActions = []
  }
  if (copy.type === 'parallel') {
    copy.parallelActions = []
    copy.parallelBranches = []
  }
  if (copy.type === 'sequence') {
    copy.parallelActions = []
    copy.parallelBranches = []
  }
  return copy
}

function parallelBranchActions(a: OrchestratorActionForm): OrchestratorActionForm[][] {
  if (Array.isArray(a.parallelBranches) && a.parallelBranches.length) {
    return a.parallelBranches.map((b) => (Array.isArray(b) ? (b as OrchestratorActionForm[]) : []))
  }
  if (Array.isArray(a.parallelActions) && a.parallelActions.length) {
    return a.parallelActions.map((x) => [x as OrchestratorActionForm])
  }
  return []
}

function chooseBranchActions(a: OrchestratorActionForm): {
  thenBranches: Array<{
    index: number
    handle: string
    label: string
    acts: OrchestratorActionForm[]
  }>
  elseActs: OrchestratorActionForm[]
} {
  const branches = Array.isArray(a.branches) ? a.branches : []
  const nonDefault = branches.filter((b) => !b.isDefault)
  const def = branches.find((b) => b.isDefault)
  const thenList = nonDefault.length
    ? nonDefault
    : branches[0]
      ? [branches[0]]
      : []
  return {
    thenBranches: thenList.map((b, i) => ({
      index: i,
      handle: thenHandleId(i),
      label: thenHandleLabel(i),
      acts: Array.isArray(b.actions) ? b.actions : [],
    })),
    elseActs: Array.isArray(def?.actions) ? def.actions : [],
  }
}

/**
 * 递归展开动作链：choose/repeat 内嵌动作变成带端口的画布节点（经典 YAML → 图关键）。
 */
function layoutActionSequence(
  actions: OrchestratorActionForm[],
  nodes: GeekCanvasNode[],
  edges: GeekCanvasEdge[],
  opts: {
    x: number
    y: number
    idPrefix: string
    connectFrom: LayoutConnectFrom[]
  },
): { firstId: string | null; exitFrom: LayoutConnectFrom[]; nextY: number } {
  let y = opts.y
  let prev = opts.connectFrom
  let firstId: string | null = null

  for (let i = 0; i < actions.length; i++) {
    const a = actions[i]!
    const id = `${opts.idPrefix}${i}`
    if (!firstId) firstId = id

    const s = actionSummary(a)
    nodes.push({
      id,
      type: 'geekAction',
      position: { x: opts.x, y },
      data: {
        kind: 'action',
        label: s.label,
        detail: s.detail,
        action: shellContainerAction(a),
      },
    })

    for (const from of prev) {
      edges.push({
        id: `e-${from.source}-${id}-${from.sourceHandle || 'out'}`,
        source: from.source,
        target: id,
        sourceHandle: from.sourceHandle ?? undefined,
        label: from.label,
      })
    }

    if (a.type === 'choose') {
      const { thenBranches, elseActs } = chooseBranchActions(a)
      let branchBottom = y
      for (let ti = 0; ti < thenBranches.length; ti++) {
        const tb = thenBranches[ti]!
        if (!tb.acts.length) continue
        const r = layoutActionSequence(tb.acts, nodes, edges, {
          x: opts.x + BRANCH_X,
          y: ti === 0 ? y - 30 : Math.max(y + 40, branchBottom),
          idPrefix: `${id}:${tb.handle}:`,
          connectFrom: [{ source: id, sourceHandle: tb.handle, label: tb.label }],
        })
        branchBottom = Math.max(branchBottom, r.nextY)
      }
      if (elseActs.length) {
        const r = layoutActionSequence(elseActs, nodes, edges, {
          x: opts.x + BRANCH_X,
          y: Math.max(y + 80, branchBottom),
          idPrefix: `${id}:else:`,
          connectFrom: [{ source: id, sourceHandle: 'else', label: '否则' }],
        })
        branchBottom = Math.max(branchBottom, r.nextY)
      }
      // HA：choose 整段结束后继续后续动作 → done 口
      prev = [{ source: id, sourceHandle: 'done', label: '完成后' }]
      y = branchBottom + ROW
      continue
    }

    if (a.type === 'repeat') {
      const body = Array.isArray(a.repeatActions) ? a.repeatActions : []
      let bodyBottom = y
      if (body.length) {
        const r = layoutActionSequence(body, nodes, edges, {
          x: opts.x + BRANCH_X,
          y,
          idPrefix: `${id}:body:`,
          connectFrom: [{ source: id, sourceHandle: 'body', label: '循环体' }],
        })
        bodyBottom = Math.max(bodyBottom, r.nextY)
      }
      prev = [{ source: id, sourceHandle: 'done', label: '完成后' }]
      y = bodyBottom + ROW
      continue
    }

    if (a.type === 'parallel') {
      const branches = parallelBranchActions(a)
      let branchBottom = y
      for (let bi = 0; bi < branches.length; bi++) {
        const acts = branches[bi] || []
        if (!acts.length) continue
        const r = layoutActionSequence(acts, nodes, edges, {
          x: opts.x + BRANCH_X,
          y: bi === 0 ? y - 30 : Math.max(y + 40, branchBottom),
          idPrefix: `${id}:p${bi}:`,
          connectFrom: [
            {
              source: id,
              sourceHandle: 'out',
              label: branches.length > 1 ? `并行${bi + 1}` : '并行',
            },
          ],
        })
        branchBottom = Math.max(branchBottom, r.nextY)
      }
      prev = [{ source: id, sourceHandle: 'done', label: '完成后' }]
      y = branchBottom + ROW
      continue
    }

    if (a.type === 'sequence') {
      const steps = Array.isArray(a.parallelActions) ? (a.parallelActions as OrchestratorActionForm[]) : []
      let bodyBottom = y
      if (steps.length) {
        const r = layoutActionSequence(steps, nodes, edges, {
          x: opts.x + BRANCH_X,
          y,
          idPrefix: `${id}:seq:`,
          connectFrom: [{ source: id, sourceHandle: 'body', label: '步骤' }],
        })
        bodyBottom = Math.max(bodyBottom, r.nextY)
      }
      prev = [{ source: id, sourceHandle: 'done', label: '完成后' }]
      y = bodyBottom + ROW
      continue
    }

    prev = [{ source: id }]
    y += ROW
  }

  return { firstId, exitFrom: prev, nextY: y }
}

/** 从数组自动生成纵向/横向布局的画布（按组排列） */
export function layoutCanvasFromGraph(graph: GeekGraph): {
  nodes: GeekCanvasNode[]
  edges: GeekCanvasEdge[]
} {
  const nodes: GeekCanvasNode[] = []
  const edges: GeekCanvasEdge[] = []

  nodes.push({
    id: 'start',
    type: 'geekStart',
    position: { x: COL.start, y: 40 },
    data: {
      kind: 'start',
      label: '开始',
      detail: graph.triggerLogic === 'and' ? '触发·组内全部' : '流程入口',
    },
    draggable: false,
  })

  const triggerGroupsRaw = Array.isArray(graph.triggerGroups) ? graph.triggerGroups : []
  // 排版时跳过空组，避免占位空白与悬空连线
  const triggerGroups = triggerGroupsRaw.filter((g) => (g.triggers?.length || 0) > 0)

  const conditionGroupsRaw = Array.isArray(graph.conditionGroups) ? graph.conditionGroups : []
  const conditionGroups = conditionGroupsRaw.filter((g) => (g.conditions?.length || 0) > 0)

  let triggerY = 40
  triggerGroups.forEach((grp, gi) => {
    const gid = `tg:${gi}`
    const logic = grp.logic === 'and' ? 'and' : 'or'
    const count = grp.triggers?.length || 0
    nodes.push({
      id: gid,
      type: 'geekGroup',
      position: { x: COL.trigger, y: triggerY },
      data: {
        kind: 'trigger_group',
        label: `触发组 ${gi + 1}`,
        detail: logic === 'and' ? '组内全部' : '组内任一',
        groupLogic: logic,
        groupId: gid,
      },
    })
    edges.push({
      id: `e-start-${gid}`,
      source: 'start',
      target: gid,
      animated: graph.triggerLogic === 'and',
    })
    triggerY += GROUP_HEAD
    ;(grp.triggers || []).forEach((t, i) => {
      const id = `trigger:${gi}:${i}`
      const s = triggerSummary(t)
      nodes.push({
        id,
        type: 'geekTrigger',
        // 与组头同列竖直堆叠，避免右移叠在组头上
        position: { x: COL.trigger, y: triggerY + i * ROW },
        data: {
          kind: 'trigger',
          label: s.label,
          detail: s.detail,
          trigger: t,
          groupId: gid,
        },
      })
      edges.push({ id: `e-${gid}-${id}`, source: gid, target: id })
    })
    triggerY += count * ROW + GROUP_TAIL
  })

  let condY = 40
  conditionGroups.forEach((grp, gi) => {
    const gid = `cg:${gi}`
    const logic = grp.logic === 'or' ? 'or' : 'and'
    const count = grp.conditions?.length || 0
    nodes.push({
      id: gid,
      type: 'geekGroup',
      position: { x: COL.condition, y: condY },
      data: {
        kind: 'condition_group',
        label: `条件组 ${gi + 1}`,
        detail: logic === 'or' ? '组内任一' : '组内全部',
        groupLogic: logic,
        groupId: gid,
      },
    })
    condY += GROUP_HEAD
    ;(grp.conditions || []).forEach((c, i) => {
      const id = `condition:${gi}:${i}`
      const s = conditionSummary(c)
      nodes.push({
        id,
        type: 'geekCondition',
        position: { x: COL.condition, y: condY + i * ROW },
        data: {
          kind: 'condition',
          label: s.label,
          detail: s.detail,
          condition: c,
          groupId: gid,
        },
      })
      edges.push({ id: `e-${gid}-${id}`, source: gid, target: id })
    })
    condY += count * ROW + GROUP_TAIL
  })

  const firstCondGroup = conditionGroups.length ? 'cg:0' : null
  if (firstCondGroup) {
    const tgIds = triggerGroups.map((_, gi) => `tg:${gi}`)
    for (const tid of tgIds) {
      edges.push({ id: `e-${tid}-${firstCondGroup}`, source: tid, target: firstCondGroup })
    }
    if (!tgIds.length) {
      edges.push({
        id: `e-start-${firstCondGroup}`,
        source: 'start',
        target: firstCondGroup,
      })
    }
  }

  for (let i = 0; i < conditionGroups.length - 1; i++) {
    edges.push({
      id: `e-cg:${i}-cg:${i + 1}`,
      source: `cg:${i}`,
      target: `cg:${i + 1}`,
    })
  }

  const actionConnect: LayoutConnectFrom[] = []
  if (conditionGroups.length) {
    actionConnect.push({ source: `cg:${conditionGroups.length - 1}` })
  } else if (triggerGroups.length) {
    for (let gi = 0; gi < triggerGroups.length; gi++) actionConnect.push({ source: `tg:${gi}` })
  } else if ((graph.actions?.length || 0) > 0) {
    actionConnect.push({ source: 'start' })
  }

  if ((graph.actions?.length || 0) > 0) {
    layoutActionSequence(graph.actions || [], nodes, edges, {
      x: COL.action,
      y: 40,
      idPrefix: 'action:',
      connectFrom: actionConnect,
    })
  }

  return { nodes, edges }
}

/** 保证图带有可用 flow 布局（缺 start / 无边时重排） */
export function ensureGeekGraphLayout(graph: GeekGraph): GeekGraph {
  const rawNodes = graph.flowNodes
  const rawEdges = graph.flowEdges
  const hasNodes = Array.isArray(rawNodes) && rawNodes.length > 0
  const hasStart =
    hasNodes &&
    rawNodes!.some((n) => n.id === 'start' || (n as GeekCanvasNode).data?.kind === 'start')
  const hasEdges = Array.isArray(rawEdges)
  if (hasNodes && hasStart && hasEdges) return graph
  const laid = layoutCanvasFromGraph(graph)
  return {
    ...graph,
    flowNodes: laid.nodes as GeekGraph['flowNodes'],
    flowEdges: laid.edges as GeekGraph['flowEdges'],
  }
}

/** 若已有 flow 布局则还原，否则自动布局 */
export function canvasFromGeekGraph(graph: GeekGraph): {
  nodes: GeekCanvasNode[]
  edges: GeekCanvasEdge[]
} {
  const ensured = ensureGeekGraphLayout(graph)
  const rawNodes = ensured.flowNodes
  const rawEdges = ensured.flowEdges
  if (Array.isArray(rawNodes) && rawNodes.length && Array.isArray(rawEdges)) {
    return {
      nodes: rawNodes.map((n) => {
        const x = Number(n.position?.x)
        const y = Number(n.position?.y)
        return {
          ...n,
          position: {
            x: Number.isFinite(x) ? x : 0,
            y: Number.isFinite(y) ? y : 0,
          },
          data: { ...n.data },
        }
      }) as GeekCanvasNode[],
      edges: rawEdges.map((e) => ({ ...e })) as GeekCanvasEdge[],
    }
  }
  return layoutCanvasFromGraph(ensured)
}
