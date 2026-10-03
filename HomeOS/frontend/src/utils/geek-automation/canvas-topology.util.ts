/**
 * 画布拓扑：稳定拓扑排序、动作出口解析、可达动作链收集。
 *
 * 供画布折叠（canvas-fold）与同步（canvas-sync）复用。
 */
import type {
  GeekCanvasEdge,
  GeekCanvasKind,
  GeekCanvasNode,
} from './canvas-shared.util'

/** topoOrder：函数，按签名入参返回处理结果。 */
export function topoOrder(
  nodes: GeekCanvasNode[],
  edges: GeekCanvasEdge[],
  kind: GeekCanvasKind,
): GeekCanvasNode[] {
  const ofKind = nodes.filter((n) => n.data?.kind === kind)
  if (ofKind.length <= 1) return ofKind
  const ids = new Set(ofKind.map((n) => n.id))
  const indeg = new Map<string, number>()
  const outs = new Map<string, string[]>()
  for (const n of ofKind) {
    indeg.set(n.id, 0)
    outs.set(n.id, [])
  }
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue
    indeg.set(e.target, (indeg.get(e.target) || 0) + 1)
    outs.get(e.source)?.push(e.target)
  }
  const queue = ofKind.filter((n) => (indeg.get(n.id) || 0) === 0).map((n) => n.id)
  // 稳定：同层按 y
  queue.sort((a, b) => {
    const na = ofKind.find((n) => n.id === a)!
    const nb = ofKind.find((n) => n.id === b)!
    return na.position.y - nb.position.y
  })
  const ordered: string[] = []
  const seen = new Set<string>()
  while (queue.length) {
    const id = queue.shift()!
    if (seen.has(id)) continue
    seen.add(id)
    ordered.push(id)
    for (const t of outs.get(id) || []) {
      indeg.set(t, (indeg.get(t) || 1) - 1)
      if ((indeg.get(t) || 0) <= 0) queue.push(t)
    }
  }
  for (const n of ofKind) {
    if (!seen.has(n.id)) ordered.push(n.id)
  }
  return ordered.map((id) => ofKind.find((n) => n.id === id)!).filter(Boolean)
}

function actionOutTargets(
  nodeId: string,
  edges: GeekCanvasEdge[],
  nodesById: Map<string, GeekCanvasNode>,
): string[] {
  const node = nodesById.get(nodeId)
  const t = node?.data?.action?.type
  // 容器：内部 then/else/body/out 单独折叠；本链仅沿 done 继续
  if (t === 'choose' || t === 'repeat' || t === 'parallel' || t === 'sequence') {
    return edges
      .filter((e) => e.source === nodeId && e.sourceHandle === 'done')
      .map((e) => e.target)
  }
  const targets: string[] = []
  for (const e of edges) {
    if (e.source !== nodeId) continue
    targets.push(e.target)
  }
  return targets
}

/** 从分支入口收集动作链（遇嵌套 choose/repeat 只收录节点本身） */
export function collectActionChainIds(
  startIds: string[],
  edges: GeekCanvasEdge[],
  nodes: GeekCanvasNode[],
): string[] {
  const actionIds = new Set(
    nodes.filter((n) => n.data?.kind === 'action').map((n) => n.id),
  )
  const nodesById = new Map(nodes.map((n) => [n.id, n]))
  const ordered: string[] = []
  const seen = new Set<string>()
  const queue = [...startIds]
  while (queue.length) {
    const id = queue.shift()!
    if (!actionIds.has(id) || seen.has(id)) continue
    seen.add(id)
    ordered.push(id)
    for (const t of actionOutTargets(id, edges, nodesById)) queue.push(t)
  }
  return ordered
}

/**
 * 从入口收集可达动作；可穿过条件节点的 pass（非 fail）边。
 * 遇 choose/repeat/parallel 收录节点本身，并沿 done 继续（内部支由折叠展开）。
 */
export function collectReachableActionIds(
  startIds: string[],
  edges: GeekCanvasEdge[],
  nodes: GeekCanvasNode[],
): string[] {
  const nodesById = new Map(nodes.map((n) => [n.id, n]))
  const actionIds = new Set(
    nodes.filter((n) => n.data?.kind === 'action').map((n) => n.id),
  )
  const ordered: string[] = []
  const seen = new Set<string>()
  const queue = [...startIds]

  function outs(id: string): string[] {
    const node = nodesById.get(id)
    if (!node) return []
    if (node.data?.kind === 'action') {
      // 容器仅沿 done 继续；内部 then/else/body 由折叠展开
      return actionOutTargets(id, edges, nodesById)
    }
    if (node.data?.kind === 'condition') {
      return edges
        .filter(
          (e) =>
            e.source === id &&
            e.sourceHandle !== 'fail' &&
            (e.sourceHandle === 'pass' ||
              e.sourceHandle == null ||
              e.sourceHandle === '' ||
              e.sourceHandle === 'out'),
        )
        .map((e) => e.target)
    }
    return edges.filter((e) => e.source === id).map((e) => e.target)
  }

  while (queue.length) {
    const id = queue.shift()!
    if (seen.has(id)) continue
    seen.add(id)
    const node = nodesById.get(id)
    if (!node) continue
    if (actionIds.has(id)) {
      ordered.push(id)
      for (const t of outs(id)) queue.push(t)
      continue
    }
    if (node.data?.kind === 'condition') {
      for (const t of outs(id)) queue.push(t)
    }
  }
  return ordered
}

/** 收集容器节点（含自身）的全部下游动作 id，用于 fail→choose 从 remaining 排除 */
export function collectDescendantActionIds(
  rootId: string,
  edges: GeekCanvasEdge[],
  nodes: GeekCanvasNode[],
): string[] {
  const actionIds = new Set(
    nodes.filter((n) => n.data?.kind === 'action').map((n) => n.id),
  )
  const ordered: string[] = []
  const seen = new Set<string>()
  const queue = [rootId]
  while (queue.length) {
    const id = queue.shift()!
    if (seen.has(id)) continue
    seen.add(id)
    if (id !== rootId && actionIds.has(id)) ordered.push(id)
    for (const e of edges) {
      if (e.source === id) queue.push(e.target)
    }
  }
  return ordered
}
