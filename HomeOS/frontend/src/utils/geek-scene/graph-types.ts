/**
 * 极客场景星形图模型
 *
 * 职责：
 * - 定义场景星形图数据模型（SceneGeekGraph），为并行状态快照。
 * - 图的边仅表示归属（实体挂在场景根下），不表示执行顺序。
 * - 提供空图工厂、图合法性判定等工具。
 *
 * 依赖：@/utils/orchestrator/scene-yaml-form.util 的 SceneEntityForm 类型。
 *
 * 注意：
 * - `SCENE_GEEK_GRAPH_VERSION` 为图模型版本号，不翻译。
 * - `SceneGeekNodeKind`（sceneRoot / sceneEntity）为节点类型标识符，不翻译。
 */
import type { SceneEntityForm } from '@/utils/orchestrator/scene-yaml-form.util'

const SCENE_GEEK_GRAPH_VERSION = 1 as const

type SceneGeekNodeKind = 'sceneRoot' | 'sceneEntity'

/** SceneGeekFlowNode：类型定义，字段语义见声明。 */
export interface SceneGeekFlowNode {
  id: string
  type?: string
  position: { x: number; y: number }
  data: {
    kind: SceneGeekNodeKind
    label: string
    detail?: string
    /** 对应 graph.entities 下标 */
    entityIndex?: number
    /** 实体 ID（节点展示友好名时用） */
    entityId?: string
    /** 相对中心方位（根节点连出） */
    sourceSide?: 'top' | 'right' | 'bottom' | 'left'
    /** 实体节点连入方位 */
    targetSide?: 'top' | 'right' | 'bottom' | 'left'
    /** YAML 属性有损，建议 HA 执行完整快照 */
    needsHa?: boolean
  }
  draggable?: boolean
}

/** SceneGeekFlowEdge：类型定义，字段语义见声明。 */
export interface SceneGeekFlowEdge {
  id: string
  source: string
  target: string
  animated?: boolean
  sourceHandle?: string
  targetHandle?: string
}

/** SceneGeekGraph：类型定义，字段语义见声明。 */
export interface SceneGeekGraph {
  version: typeof SCENE_GEEK_GRAPH_VERSION | number
  name: string
  entities: SceneEntityForm[]
  flowNodes?: SceneGeekFlowNode[]
  flowEdges?: SceneGeekFlowEdge[]
  yamlDigest?: string
  /** 会话级：YAML 有损实体 ID（不落库） */
  lossyEntityIds?: string[]
}

/** createEmptySceneGeekGraph：函数，按签名入参返回处理结果。 */
export function createEmptySceneGeekGraph(partial?: Partial<SceneGeekGraph>): SceneGeekGraph {
  const { version: _v, entities: _e, flowNodes: _fn, flowEdges: _fe, ...rest } = partial || {}
  return {
    name: '',
    ...rest,
    version: SCENE_GEEK_GRAPH_VERSION,
    entities: [...(partial?.entities || [])],
    flowNodes: partial?.flowNodes ? [...partial.flowNodes] : undefined,
    flowEdges: partial?.flowEdges ? [...partial.flowEdges] : undefined,
  }
}

/** isSceneGeekGraph：函数，按签名入参返回处理结果。 */
export function isSceneGeekGraph(raw: unknown): raw is SceneGeekGraph {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
  const g = raw as Record<string, unknown>
  if (!Array.isArray(g.entities) || typeof g.name !== 'string') return false
  const ver = Number(g.version)
  if (!Number.isFinite(ver) || ver !== SCENE_GEEK_GRAPH_VERSION) return false
  return g.entities.every((e) => e != null && typeof e === 'object' && !Array.isArray(e))
}
