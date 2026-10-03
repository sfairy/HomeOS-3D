/**
 * 极客场景 YAML / 表单 → geek 星形图 反编译
 *
 * 职责：
 * - 把场景 YAML / entities / 已存 geekSceneGraph 反编译为 geek 星形图。
 * - 优先复用已存图，陈旧时从 YAML / entities 还原。
 *
 * 依赖：
 * - @/utils/orchestrator/scene-yaml-form.util 的场景表单解析与默认值。
 * - @/utils/orchestrator/crud.util 的场景实体序列化。
 * - ./graph-types、./layout 的图与布局工具。
 *
 * 注意：反编译产出的图节点 kind 为标识符，不翻译。
 */
import {
  newSceneEntityDefaults,
  parseSceneYamlIntoForm,
  type SceneEntityForm,
} from '@/utils/orchestrator/scene-yaml-form.util'
import { serializeSceneEntitiesForSave } from '@/utils/orchestrator/crud.util'
import { analyzeSceneYamlImport } from '@/utils/orchestrator/scene-yaml-import.util'
import { compileSceneGeekGraphToYaml } from './compile'
import { createEmptySceneGeekGraph, type SceneGeekGraph } from './graph-types'
import { reconcileSceneGraphLayout, normalizeSceneGeekGraph } from './layout'
import { resolveStoredGeekGraph } from '@/utils/orchestrator/geek-stored-graph-resolver.util'
import { fingerprintSceneYaml } from '@homeos/shared'

/** DecompileSceneResult：类型定义，字段语义见声明。 */
export type DecompileSceneResult = {
  graph: SceneGeekGraph
  fromStoredGraph: boolean
  approximate: boolean
  staleGraph?: boolean
  importHints?: string[]
  suggestRunOnHa?: boolean
}

function parseEntitiesInput(raw: unknown): SceneEntityForm[] {
  const ents =
    Array.isArray(raw) ? raw : typeof raw === 'string' ? (JSON.parse(raw || '[]') as unknown) : []
  return (Array.isArray(ents) ? ents : []).map((e) => ({
    ...newSceneEntityDefaults(),
    ...(e as Partial<SceneEntityForm>),
  }))
}

/** 覆盖 serialize 全部字段，避免仅 id/state 匹配时复用陈旧亮度等属性 */
function fingerprintSceneEntities(entities: SceneEntityForm[]): string {
  return serializeSceneEntitiesForSave(entities)
    .map((e) => JSON.stringify(e))
    .sort()
    .join('\n')
}

function sceneEntitiesMatchStored(stored: SceneGeekGraph, optsEntities: unknown): boolean {
  if (optsEntities == null) return true
  try {
    const dbEntities = parseEntitiesInput(optsEntities)
    return fingerprintSceneEntities(dbEntities) === fingerprintSceneEntities(stored.entities || [])
  } catch {
    return false
  }
}

/** 指纹匹配时仍用 DB entities 覆盖图内实体，防止属性漂移 */
function mergeStoredGraphWithDbEntities(
  stored: SceneGeekGraph,
  optsEntities: unknown,
  name?: string,
): SceneGeekGraph {
  const next = { ...stored }
  if (optsEntities != null) {
    try {
      next.entities = parseEntitiesInput(optsEntities)
    } catch {
      /* 保留已存值 */
    }
  }
  if (name && !next.name) next.name = name
  return reconcileSceneGraphLayout(next)
}

/** digest / compile 反推指纹命中：DB entities 覆盖 + 有损分析 */
function storedHitFromYaml(
  stored: SceneGeekGraph,
  optsEntities: unknown,
  name: string | undefined,
  yamlText: string,
): DecompileSceneResult {
  const analysis = analyzeSceneYamlImport(yamlText)
  const graph = mergeStoredGraphWithDbEntities(stored, optsEntities, name)
  graph.lossyEntityIds = analysis.lossyEntityIds.length ? analysis.lossyEntityIds : undefined
  return {
    graph: reconcileSceneGraphLayout(graph),
    fromStoredGraph: true,
    approximate: Boolean(analysis.hints.length),
    importHints: analysis.hints.length ? analysis.hints : undefined,
    suggestRunOnHa: analysis.fromHaImportSuggestRunOnHa,
  }
}

/** decompileToSceneGeekGraph：函数，按签名入参返回处理结果。 */
export function decompileToSceneGeekGraph(opts: {
  geekGraph?: unknown
  yaml?: string | null
  entities?: unknown
  name?: string
}): DecompileSceneResult {
  const stored = normalizeSceneGeekGraph(opts.geekGraph)
  const yamlText = opts.yaml?.trim() || ''

  const matched = resolveStoredGeekGraph({
    stored,
    yamlText,
    fingerprint: fingerprintSceneYaml,
    readDigest: (g) => String(g.yamlDigest || '').trim(),
    writeDigest: (g, digest) => {
      g.yamlDigest = digest
    },
    onDigestMatch: (g) => storedHitFromYaml(g, opts.entities, opts.name, yamlText),
    onNoYamlMatch: (g) =>
      g.entities.length && sceneEntitiesMatchStored(g, opts.entities)
        ? {
            graph: mergeStoredGraphWithDbEntities(g, opts.entities, opts.name),
            fromStoredGraph: true,
            approximate: false,
          }
        : undefined,
    compileStoredToYaml: (g) => compileSceneGeekGraphToYaml(g),
    onCompiledMatch: (g) => storedHitFromYaml(g, opts.entities, opts.name, yamlText),
  })
  if (matched) return matched

  const staleGraph = Boolean(stored && (yamlText || opts.entities != null))
  let name = opts.name || ''
  let entities: SceneEntityForm[] = []
  let importHints: string[] | undefined
  let suggestRunOnHa = false

  let lossyEntityIds: string[] | undefined
  if (yamlText) {
    const parsed = parseSceneYamlIntoForm(yamlText)
    name = parsed.sceneName || name
    entities = parsed.entities
    const analysis = analyzeSceneYamlImport(yamlText)
    importHints = analysis.hints.length ? analysis.hints : undefined
    suggestRunOnHa = analysis.fromHaImportSuggestRunOnHa
    lossyEntityIds = analysis.lossyEntityIds.length ? analysis.lossyEntityIds : undefined
  } else if (opts.entities != null) {
    entities = parseEntitiesInput(opts.entities)
    // 纯 entities 本地场景不强制 HA
    suggestRunOnHa = false
  }

  const graph = reconcileSceneGraphLayout(
    createEmptySceneGeekGraph({
      name,
      entities,
      yamlDigest: yamlText ? fingerprintSceneYaml(yamlText) : undefined,
      lossyEntityIds,
    }),
  )

  const entitiesOnlyApprox = !yamlText && opts.entities != null && Boolean(stored)

  return {
    graph,
    fromStoredGraph: false,
    approximate: Boolean(importHints?.length) || staleGraph || entitiesOnlyApprox,
    staleGraph: staleGraph || undefined,
    importHints,
    suggestRunOnHa,
  }
}
