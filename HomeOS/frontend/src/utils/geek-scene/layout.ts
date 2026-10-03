/**
 * 极客场景星形布局算法
 *
 * 职责：
 * - 场景星形布局：中心 sceneRoot + 实体节点圆周分布。
 * - reconcile 保留已有节点拖拽位置；ensure 强制重排。
 * - 提供图规范化、节点数据同步、罗盘方向与对侧句柄解析等工具。
 *
 * 依赖：
 * - @/utils/orchestrator/scene-yaml-form.util 的 SceneEntityForm。
 * - ./graph-types 的 SceneGeekGraph 与节点 / 边类型。
 *
 * 注意：
 * - 坐标 / 半径 / 角度为运行时数值，不翻译。
 */
import type { SceneEntityForm } from '@/utils/orchestrator/scene-yaml-form.util'
import {
  createEmptySceneGeekGraph,
  isSceneGeekGraph,
  type SceneGeekFlowEdge,
  type SceneGeekFlowNode,
  type SceneGeekGraph,
} from './graph-types'

const SCENE_ROOT_ID = 'scene_root'

type SceneHandleSide = 'top' | 'right' | 'bottom' | 'left'

/** entityNodeId：函数，按签名入参返回处理结果。 */
export function entityNodeId(index: number, entityId?: string): string {
  const base = (entityId?.trim() || 'empty').replace(/[^a-zA-Z0-9_.-]/g, '_')
  // 索引前缀：同 entity_id 可并存（复制粘贴）且节点 id 唯一
  return `scene_entity_${index}_${base}`
}

function entityStateSummary(ent: SceneEntityForm): string {
  const state = ent.state === '__custom__' ? ent.customState || '?' : ent.state || '?'
  const parts = [state]
  if (ent.brightness != null) parts.push(`${ent.brightness}%`)
  if (ent.position != null) parts.push(`pos ${ent.position}%`)
  return parts.join(' · ')
}

/** 实体相对中心的方位（屏幕坐标：y 向下） */
function compassSideFromVector(dx: number, dy: number): SceneHandleSide {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'bottom' : 'top'
}

function oppositeHandleSide(side: SceneHandleSide): SceneHandleSide {
  if (side === 'top') return 'bottom'
  if (side === 'bottom') return 'top'
  if (side === 'left') return 'right'
  return 'left'
}

function defaultCenter() {
  return { x: 420, y: 280 }
}

function defaultRadius(count: number) {
  return Math.max(140, 72 + count * 22)
}

function applyHandleSides(
  nodes: SceneGeekFlowNode[],
  edges: SceneGeekFlowEdge[],
  center: { x: number; y: number },
): { nodes: SceneGeekFlowNode[]; edges: SceneGeekFlowEdge[] } {
  const nextNodes = nodes.map((n) => {
    if (n.data.kind !== 'sceneEntity') return n
    const dx = n.position.x - center.x
    const dy = n.position.y - center.y
    const compass = compassSideFromVector(dx, dy)
    const targetSide = oppositeHandleSide(compass)
    return {
      ...n,
      data: {
        ...n.data,
        sourceSide: compass,
        targetSide,
      },
    }
  })

  const nextEdges = edges.map((e) => {
    const target = nextNodes.find((n) => n.id === e.target)
    const compass = (target?.data?.sourceSide as SceneHandleSide) || 'bottom'
    const targetSide = (target?.data?.targetSide as SceneHandleSide) || 'top'
    return {
      ...e,
      sourceHandle: `src-${compass}`,
      targetHandle: `tgt-${targetSide}`,
    }
  })

  return { nodes: nextNodes, edges: nextEdges }
}

function layoutSceneStar(
  entities: SceneEntityForm[],
  sceneName?: string,
  center = defaultCenter(),
  lossyEntityIds?: Iterable<string> | null,
): { nodes: SceneGeekFlowNode[]; edges: SceneGeekFlowEdge[] } {
  const radius = defaultRadius(entities.length)
  const nodes: SceneGeekFlowNode[] = []
  const edges: SceneGeekFlowEdge[] = []
  const lossy = new Set(
    [...(lossyEntityIds || [])].map((id) => String(id || '').trim()).filter(Boolean),
  )

  nodes.push({
    id: SCENE_ROOT_ID,
    type: 'sceneNode',
    position: { ...center },
    draggable: false,
    data: {
      kind: 'sceneRoot',
      label: sceneName?.trim() || '场景',
      detail: entities.length ? `${entities.length} 个实体` : '暂无实体',
    },
  })

  entities.forEach((ent, i) => {
    const angle = (2 * Math.PI * i) / Math.max(entities.length, 1) - Math.PI / 2
    const eid = ent.entityId || ''
    const id = entityNodeId(i, eid)
    nodes.push({
      id,
      type: 'sceneNode',
      position: {
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle),
      },
      draggable: true,
      data: {
        kind: 'sceneEntity',
        entityIndex: i,
        entityId: eid,
        label: eid || `实体 ${i + 1}`,
        detail: entityStateSummary(ent),
        needsHa: eid ? lossy.has(eid) : false,
      },
    })
    edges.push({
      id: `edge_${SCENE_ROOT_ID}_${id}`,
      source: SCENE_ROOT_ID,
      target: id,
      animated: false,
    })
  })

  return applyHandleSides(nodes, edges, center)
}

/**
 * 保留已有节点位置，仅对新增实体落位、删除孤儿节点，并刷新锚点。
 */
export function reconcileSceneGraphLayout(graph: SceneGeekGraph): SceneGeekGraph {
  const prevRoot = graph.flowNodes?.find((n) => n.data.kind === 'sceneRoot')
  const center = prevRoot?.position ? { ...prevRoot.position } : defaultCenter()

  const prevByEntityId = new Map<string, SceneGeekFlowNode>()
  const prevByIndex = new Map<number, SceneGeekFlowNode>()
  for (const n of graph.flowNodes || []) {
    if (n.data.kind !== 'sceneEntity') continue
    if (n.data.entityId) prevByEntityId.set(String(n.data.entityId), n)
    if (n.data.entityIndex != null) prevByIndex.set(n.data.entityIndex, n)
  }

  const fresh = layoutSceneStar(graph.entities, graph.name, center, graph.lossyEntityIds)
  const flowNodes = fresh.nodes.map((n) => {
    if (n.data.kind === 'sceneRoot') {
      return {
        ...n,
        position: { ...center },
        data: {
          ...n.data,
          label: graph.name?.trim() || '场景',
          detail: graph.entities.length ? `${graph.entities.length} 个实体` : '暂无实体',
        },
      }
    }
    const eid = String(n.data.entityId || '')
    let prev: SceneGeekFlowNode | undefined
    // 优先按槽位复用坐标（支持同 entity_id 多节点 / 拖放落点）
    if (n.data.entityIndex != null && prevByIndex.has(n.data.entityIndex)) {
      const candidate = prevByIndex.get(n.data.entityIndex)
      if (
        candidate &&
        (!candidate.data.entityId || candidate.data.entityId === eid || !eid)
      ) {
        prev = candidate
      }
    }
    if (!prev && eid && prevByEntityId.has(eid)) {
      prev = prevByEntityId.get(eid)
    }
    if (prev?.position) {
      return {
        ...n,
        position: { ...prev.position },
        data: { ...n.data },
      }
    }
    return n
  })

  const { nodes, edges } = applyHandleSides(flowNodes, fresh.edges, center)
  return { ...graph, flowNodes: nodes, flowEdges: edges }
}

/** syncSceneGraphNodeData：函数，按签名入参返回处理结果。 */
export function syncSceneGraphNodeData(graph: SceneGeekGraph): SceneGeekGraph {
  if (!graph.flowNodes?.length) return reconcileSceneGraphLayout(graph)
  const entityCount = graph.entities.length
  const nodeCount = graph.flowNodes.filter((n) => n.data.kind === 'sceneEntity').length
  if (nodeCount !== entityCount) return reconcileSceneGraphLayout(graph)

  const root = graph.flowNodes.find((n) => n.data.kind === 'sceneRoot')
  const center = root?.position ? { ...root.position } : defaultCenter()

  const flowNodes = graph.flowNodes.map((n) => {
    if (n.data.kind === 'sceneRoot') {
      return {
        ...n,
        data: {
          ...n.data,
          label: graph.name?.trim() || '场景',
          detail: entityCount ? `${entityCount} 个实体` : '暂无实体',
        },
      }
    }
    if (n.data.kind === 'sceneEntity' && n.data.entityIndex != null) {
      const ent = graph.entities[n.data.entityIndex]
      if (!ent) return n
      const eid = ent.entityId || ''
      const lossy = new Set((graph.lossyEntityIds || []).map(String))
      return {
        ...n,
        data: {
          ...n.data,
          entityId: eid,
          label: eid || `实体 ${n.data.entityIndex + 1}`,
          detail: entityStateSummary(ent),
          needsHa: eid ? lossy.has(eid) : false,
        },
      }
    }
    return n
  })

  const edges =
    graph.flowEdges?.length && graph.flowEdges.length === entityCount
      ? graph.flowEdges
      : layoutSceneStar(graph.entities, graph.name, center).edges

  const applied = applyHandleSides(flowNodes, edges, center)
  return { ...graph, flowNodes: applied.nodes, flowEdges: applied.edges }
}

/** 强制星形重排（用户点击「重新排版」） */
export function ensureSceneGraphLayout(graph: SceneGeekGraph): SceneGeekGraph {
  const prevRoot = graph.flowNodes?.find((n) => n.data.kind === 'sceneRoot')
  const center = prevRoot?.position ? { ...prevRoot.position } : defaultCenter()
  const laid = layoutSceneStar(graph.entities, graph.name, center)
  return {
    ...graph,
    flowNodes: laid.nodes,
    flowEdges: laid.edges,
  }
}

/** normalizeSceneGeekGraph：函数，按签名入参返回处理结果。 */
export function normalizeSceneGeekGraph(raw: unknown): SceneGeekGraph | null {
  if (!raw) return null
  if (typeof raw === 'string') {
    try {
      return normalizeSceneGeekGraph(JSON.parse(raw))
    } catch {
      return null
    }
  }
  if (!isSceneGeekGraph(raw)) return null
  return createEmptySceneGeekGraph({
    ...(raw as SceneGeekGraph),
    entities: [...((raw as SceneGeekGraph).entities || [])],
    flowNodes: Array.isArray((raw as SceneGeekGraph).flowNodes)
      ? [...((raw as SceneGeekGraph).flowNodes || [])]
      : undefined,
    flowEdges: Array.isArray((raw as SceneGeekGraph).flowEdges)
      ? [...((raw as SceneGeekGraph).flowEdges || [])]
      : undefined,
  })
}
