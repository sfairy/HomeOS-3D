/**
 * 极客场景图 → Scene YAML 编译
 *
 * 职责：把 SceneGeekGraph 编译为 HA Scene YAML，复用 buildSceneYaml。
 *
 * 依赖：
 * - @/utils/orchestrator/scene-yaml-builder.util 的 buildSceneYaml。
 * - ./graph-types 的 SceneGeekGraph。
 * - @/types/orchestrator-builder 的场景表单类型。
 *
 * 注意：编译产出的 YAML key 与 HA 场景字段对齐，不翻译。
 */
import { buildSceneYaml } from '@/utils/orchestrator/scene-yaml-builder.util'
import type { SceneGeekGraph } from './graph-types'
import type { SceneEntityForm as BuilderSceneEntityForm } from '@/types/orchestrator-builder'

/** compileSceneGeekGraphToYaml：函数，按签名入参返回处理结果。 */
export function compileSceneGeekGraphToYaml(graph: SceneGeekGraph): string {
  return buildSceneYaml({
    sceneName: graph.name,
    entities: graph.entities as BuilderSceneEntityForm[],
  })
}

