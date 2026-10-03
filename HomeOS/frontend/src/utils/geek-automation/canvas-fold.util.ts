/**
 * 画布折叠：choose / repeat / sequence / parallel 下游连线折叠回嵌套动作，
 * 以及条件节点「不满足」口 → 合成 choose（避免 HA 前置条件 AND 与分支语义冲突）。
 */
import type {
  AutomationConditionForm,
  OrchestratorActionForm,
} from '@/types/orchestrator-builder'
import { createGeekAction, createGeekCondition } from './defaults'
import {
  cloneAction,
  isChooseElseHandle,
  thenHandleIndex,
  type GeekCanvasEdge,
  type GeekCanvasNode,
} from './canvas-shared.util'
import {
  collectActionChainIds,
  collectDescendantActionIds,
  collectReachableActionIds,
  topoOrder,
} from './canvas-topology.util'

function ensureChooseBranches(action: OrchestratorActionForm) {
  if (!Array.isArray(action.branches) || action.branches.length < 2) {
    action.branches = [
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
  const main = action.branches.find((b) => !b.isDefault) || action.branches[0]!
  let def = action.branches.find((b) => b.isDefault)
  if (!def) {
    def = { isDefault: true, actions: [] }
    action.branches.push(def)
  }
  return { main, def }
}

/**
 * 将 choose / repeat 下游连线折叠进嵌套动作，并从顶层 actions 剔除，避免 YAML 双跑。
 */
function foldChooseActionsFromCanvas(
  nodes: GeekCanvasNode[],
  edges: GeekCanvasEdge[],
  orderedActionNodes: GeekCanvasNode[],
): OrchestratorActionForm[] {
  const nodesById = new Map(nodes.map((n) => [n.id, n]))
  const nested = new Set<string>()
  const chooseFold = new Map<
    string,
    { byThen: Map<number, string[]>; elseIds: string[] }
  >()
  const repeatFold = new Map<string, string[]>()

  for (const n of orderedActionNodes) {
    if (n.data?.action?.type !== 'choose') continue
    const byThen = new Map<number, string[]>()
    const startsByIndex = new Map<number, string[]>()
    for (const e of edges) {
      if (e.source !== n.id) continue
      if (e.sourceHandle === 'done') continue
      if (isChooseElseHandle(e.sourceHandle)) continue
      const idx = thenHandleIndex(e.sourceHandle)
      if (idx == null) continue
      const list = startsByIndex.get(idx) || []
      list.push(e.target)
      startsByIndex.set(idx, list)
    }
    const claimed = new Set<string>()
    const sortedIdx = [...startsByIndex.keys()].sort((a, b) => a - b)
    for (const idx of sortedIdx) {
      const starts = startsByIndex.get(idx) || []
      const ids = collectActionChainIds(starts, edges, nodes).filter((id) => !claimed.has(id))
      byThen.set(idx, ids)
      for (const id of ids) {
        claimed.add(id)
        nested.add(id)
      }
    }
    const elseStarts = edges
      .filter((e) => e.source === n.id && isChooseElseHandle(e.sourceHandle))
      .map((e) => e.target)
    const elseIds = collectActionChainIds(elseStarts, edges, nodes).filter((id) => !claimed.has(id))
    for (const id of elseIds) nested.add(id)
    chooseFold.set(n.id, { byThen, elseIds })
  }

  for (const n of orderedActionNodes) {
    if (n.data?.action?.type !== 'repeat') continue
    const bodyStarts = edges
      .filter(
        (e) =>
          e.source === n.id &&
          (e.sourceHandle === 'body' || e.sourceHandle == null || e.sourceHandle === ''),
      )
      .map((e) => e.target)
    // done 出口不折叠进循环体，留在顶层顺序中
    const ids = collectActionChainIds(bodyStarts, edges, nodes).filter((id) => !nested.has(id))
    repeatFold.set(n.id, ids)
    for (const id of ids) nested.add(id)
  }

  /** sequence：步骤口连线折叠为顺序列表 */
  const sequenceFold = new Map<string, string[]>()
  for (const n of orderedActionNodes) {
    if (n.data?.action?.type !== 'sequence') continue
    const bodyStarts = edges
      .filter(
        (e) =>
          e.source === n.id &&
          e.sourceHandle !== 'done' &&
          (e.sourceHandle === 'body' ||
            e.sourceHandle == null ||
            e.sourceHandle === '' ||
            e.sourceHandle === 'out'),
      )
      .map((e) => e.target)
    const ids: string[] = []
    const claimed = new Set<string>()
    for (const sid of [...new Set(bodyStarts)]) {
      if (nested.has(sid) || claimed.has(sid)) continue
      const chain = collectActionChainIds([sid], edges, nodes).filter(
        (id) => !nested.has(id) && !claimed.has(id),
      )
      for (const id of chain) {
        claimed.add(id)
        nested.add(id)
        ids.push(id)
      }
    }
    sequenceFold.set(n.id, ids)
  }

  /** parallel：显式 parallel 节点，或多出边自动扇出（done 口留给后续主链） */
  const parallelFold = new Map<string, string[]>()
  for (const n of orderedActionNodes) {
    if (n.data?.action?.type !== 'parallel') continue
    const starts = edges
      .filter(
        (e) =>
          e.source === n.id &&
          e.sourceHandle !== 'done' &&
          (e.sourceHandle == null ||
            e.sourceHandle === '' ||
            e.sourceHandle === 'out' ||
            e.sourceHandle === 'then'),
      )
      .map((e) => e.target)
    const ids = [...new Set(starts)].filter((id) => {
      const t = nodesById.get(id)
      return t?.data?.kind === 'action' && !nested.has(id)
    })
    if (ids.length) {
      parallelFold.set(n.id, ids)
      for (const startId of ids) {
        for (const id of collectActionChainIds([startId], edges, nodes)) nested.add(id)
      }
    }
  }

  /** 普通动作 ≥2 条出边 → 后续并行（米家一出多连） */
  const fanOutAfter = new Map<string, string[]>()
  for (const n of orderedActionNodes) {
    const t = n.data?.action?.type
    if (!t || t === 'choose' || t === 'repeat' || t === 'parallel' || t === 'sequence' || t === 'note')
      continue
    if (nested.has(n.id)) continue
    const starts = edges
      .filter(
        (e) =>
          e.source === n.id &&
          (e.sourceHandle == null ||
            e.sourceHandle === '' ||
            e.sourceHandle === 'out' ||
            e.sourceHandle === 'then'),
      )
      .map((e) => e.target)
    const ids = [...new Set(starts)].filter((id) => {
      const tgt = nodesById.get(id)
      return tgt?.data?.kind === 'action' && !nested.has(id)
    })
    if (ids.length >= 2) {
      fanOutAfter.set(n.id, ids)
      for (const startId of ids) {
        for (const id of collectActionChainIds([startId], edges, nodes)) nested.add(id)
      }
    }
  }

  function materialize(id: string): OrchestratorActionForm {
    const node = nodesById.get(id)
    const base = cloneAction(node?.data?.action || createGeekAction('callService'))
    if (base.type === 'choose') {
      const fold = chooseFold.get(id)
      const prevNonDefault = (base.branches || []).filter((b) => !b.isDefault)
      const { def } = ensureChooseBranches(base)
      const maxIdx = Math.max(
        prevNonDefault.length - 1,
        ...(fold?.byThen.keys() || [-1]),
        0,
      )
      const thenBranches = []
      for (let i = 0; i <= maxIdx; i++) {
        const existing = prevNonDefault[i] || {
          isDefault: false,
          condEntityId: '',
          condOp: 'eq',
          condState: 'on',
          actions: [] as OrchestratorActionForm[],
        }
        thenBranches.push({
          ...existing,
          isDefault: false,
          actions: (fold?.byThen.get(i) || []).map((cid) => materialize(cid)),
        })
      }
      def.actions = (fold?.elseIds || []).map((cid) => materialize(cid))
      base.branches = [...thenBranches, def]
    } else if (base.type === 'repeat') {
      if (!base.repeatType) base.repeatType = 'count'
      if (!base.repeatCount && base.repeatType === 'count') base.repeatCount = 2
      base.repeatActions = (repeatFold.get(id) || []).map((cid) => materialize(cid))
    } else if (base.type === 'sequence') {
      const ids = sequenceFold.get(id) || []
      if (ids.length) {
        base.parallelActions = ids.map((cid) => materialize(cid)) as never
      } else if (!Array.isArray(base.parallelActions)) {
        base.parallelActions = []
      }
    } else if (base.type === 'parallel') {
      const ids = parallelFold.get(id) || []
      if (ids.length) {
        base.parallelBranches = ids.map((sid) => materializeChain(sid))
        base.parallelActions = base.parallelBranches
          .map((b) => b[0])
          .filter(Boolean) as OrchestratorActionForm[]
      } else if (!Array.isArray(base.parallelActions)) {
        base.parallelActions = []
      }
    }
    return base
  }

  function materializeChain(startId: string): OrchestratorActionForm[] {
    const chain = collectActionChainIds([startId], edges, nodes).filter(
      (id) => nodesById.get(id)?.data?.kind === 'action',
    )
    return chain.map((cid) => materialize(cid))
  }

  const out: OrchestratorActionForm[] = []
  for (const n of orderedActionNodes) {
    if (nested.has(n.id)) continue
    out.push(materialize(n.id))
    const fan = fanOutAfter.get(n.id)
    if (fan?.length) {
      const parallel = createGeekAction('parallel')
      parallel.parallelBranches = fan.map((sid) => materializeChain(sid))
      parallel.parallelActions = parallel.parallelBranches
        .map((b) => b[0])
        .filter(Boolean) as OrchestratorActionForm[]
      out.push(parallel)
    }
  }
  return out
}

function conditionHasFailEdge(nodeId: string, edges: GeekCanvasEdge[]): boolean {
  return edges.some((e) => e.source === nodeId && e.sourceHandle === 'fail')
}

function conditionToChooseBranchFields(c: AutomationConditionForm | undefined) {
  const cond = c || { operator: 'eq', state: 'on' }
  const negated = Boolean(cond.negated)
  return {
    condEntityId: cond.entityId || '',
    condOp: cond.operator || 'eq',
    condState: (cond.state as string) ?? 'on',
    condStateTo: (cond.stateTo as string) ?? '',
    condAttribute: cond.attribute || '',
    condVarKey: cond.varKey || '',
    condVarScope: cond.varScope || 'global',
    condForSeconds: cond.forSeconds || '',
    condDays: Array.isArray(cond.days) ? [...cond.days] : undefined,
    condSunOffset: Number(cond.sunOffset) || 0,
    condNegated: negated,
    condLogic: 'and' as const,
    conditions: [
      {
        entityId: cond.entityId || '',
        operator: cond.operator || 'eq',
        state: cond.state ?? 'on',
        stateTo: cond.stateTo,
        attribute: cond.attribute,
        varKey: cond.varKey,
        varScope: cond.varScope,
        forSeconds: cond.forSeconds,
        days: Array.isArray(cond.days) ? [...cond.days] : undefined,
        sunOffset: Number(cond.sunOffset) || 0,
        negated,
      },
    ],
  }
}

/**
 * 条件节点「不满足」口 → 合成 choose，并从顶层 conditions 剔除这些条件，
 * 避免 HA「前置条件 AND」与分支语义冲突。
 */
export function foldConditionFailBranches(
  nodes: GeekCanvasNode[],
  edges: GeekCanvasEdge[],
  plainConditions: AutomationConditionForm[],
  orderedActionNodes: GeekCanvasNode[],
): {
  conditions: AutomationConditionForm[]
  actions: OrchestratorActionForm[]
  keepCondIds: Set<string>
} {
  const condNodes = nodes.filter((n) => n.data?.kind === 'condition')
  const branching = condNodes.filter((n) => conditionHasFailEdge(n.id, edges))
  if (!branching.length) {
    return {
      conditions: plainConditions,
      actions: foldChooseActionsFromCanvas(nodes, edges, orderedActionNodes),
      keepCondIds: new Set(condNodes.map((n) => n.id)),
    }
  }

  const nodesById = new Map(nodes.map((n) => [n.id, n]))
  const nestedFromFail = new Set<string>()
  const synthetic: OrchestratorActionForm[] = []

  const keepCondIds = new Set(
    condNodes.filter((n) => !conditionHasFailEdge(n.id, edges)).map((n) => n.id),
  )
  const conditions = topoOrder(nodes, edges, 'condition')
    .filter((n) => keepCondIds.has(n.id))
    .map((n) => n.data.condition || createGeekCondition())

  const materializeLeaf = (id: string): OrchestratorActionForm => {
    const node = nodesById.get(id)
    const base = cloneAction(node?.data?.action || createGeekAction('callService'))
    // 叶子链内若还有 choose/repeat/parallel，用子图再折叠一次
    if (base.type === 'choose' || base.type === 'repeat' || base.type === 'parallel' || base.type === 'sequence') {
      const sub = foldChooseActionsFromCanvas(nodes, edges, [node!].filter(Boolean))
      return sub[0] || base
    }
    return base
  }

  for (const cNode of branching) {
    const passStarts = edges
      .filter(
        (e) =>
          e.source === cNode.id &&
          e.sourceHandle !== 'fail' &&
          (e.sourceHandle === 'pass' ||
            e.sourceHandle == null ||
            e.sourceHandle === '' ||
            e.sourceHandle === 'out'),
      )
      .map((e) => e.target)
    const failStarts = edges
      .filter((e) => e.source === cNode.id && e.sourceHandle === 'fail')
      .map((e) => e.target)

    const thenIds = collectReachableActionIds(passStarts, edges, nodes)
    const elseIds = collectReachableActionIds(failStarts, edges, nodes).filter(
      (id) => !thenIds.includes(id),
    )
    for (const id of thenIds) {
      nestedFromFail.add(id)
      for (const d of collectDescendantActionIds(id, edges, nodes)) nestedFromFail.add(d)
    }
    for (const id of elseIds) {
      nestedFromFail.add(id)
      for (const d of collectDescendantActionIds(id, edges, nodes)) nestedFromFail.add(d)
    }

    const fields = conditionToChooseBranchFields(cNode.data.condition)
    const choose = createGeekAction('choose')
    const { main, def } = ensureChooseBranches(choose)
    Object.assign(main, fields)
    main.actions = thenIds.map(materializeLeaf)
    def.actions = elseIds.map(materializeLeaf)
    choose.branches = [main, def]
    synthetic.push(choose)
  }

  const remainingNodes = orderedActionNodes.filter((n) => !nestedFromFail.has(n.id))
  const remainingActions = foldChooseActionsFromCanvas(nodes, edges, remainingNodes)

  return {
    conditions,
    actions: [...synthetic, ...remainingActions],
    keepCondIds,
  }
}
