/**
 * 脚本 / 场景画布的浏览器本地「我的模板」。
 * 与自动化 `geek-automation/templates` 分库存储，避免图结构混用。
 */
import { readLocalStorage, writeLocalStorage } from '@/utils/core/local-storage.util'

/**
 * 脚本 / 场景画布的浏览器本地「我的模板」。
 * 与自动化 `geek-automation/templates` 分库存储，避免图结构混用。
 */
import { clonePlain } from '@/utils/core/clone-plain.util'

/** 画布模板类型：script（脚本）/ scene（场景） */
type LocalCanvasTemplateKind = 'script' | 'scene'

/** 单条本地画布模板：id / 名称 / 描述 / 类型 / 更新时间 / 图数据 / 元信息 */
type LocalCanvasTemplate = {
  id: string
  name: string
  description: string
  kind: LocalCanvasTemplateKind
  updatedAt: string
  /** 画布图（脚本为 GeekGraph 子集，场景为 SceneGeekGraph） */
  graph: Record<string, unknown>
  /** 脚本/场景额外字段（输入变量、描述、执行引擎） */
  meta?: {
    fields?: unknown[]
    scriptDesc?: string
    runOnHa?: boolean
  }
}

/** localStorage 存储键按模板类型分库，避免图结构混用 */
const STORAGE_KEYS: Record<LocalCanvasTemplateKind, string> = {
  script: 'homeos_geek_script_custom_templates',
  scene: 'homeos_geek_scene_custom_templates',
}

/** 深拷贝 JSON 值，避免外部引用污染内部缓存 */
function cloneJson<T>(value: T): T {
  return clonePlain(value)
}

/** 取模板类型对应的 localStorage 键 */
function storageKey(kind: LocalCanvasTemplateKind): string {
  return STORAGE_KEYS[kind]
}

/** 读取本地模板列表，SSR / 解析失败时回退空数组 */
function readRaw(kind: LocalCanvasTemplateKind): LocalCanvasTemplate[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = readLocalStorage(storageKey(kind))
    if (!raw) return []
    const list = JSON.parse(raw)
    if (!Array.isArray(list)) return []
    return list
      .filter((t) => t && typeof t.id === 'string' && t.graph && typeof t.graph === 'object')
      .map((t) => ({
        id: String(t.id),
        name: String(t.name || '未命名模板'),
        description: String(t.description || ''),
        kind,
        updatedAt: t.updatedAt ? String(t.updatedAt) : new Date().toISOString(),
        graph: cloneJson(t.graph) as Record<string, unknown>,
        meta: t.meta && typeof t.meta === 'object' ? cloneJson(t.meta) : undefined,
      }))
  } catch {
    return []
  }
}

/** 写入本地模板列表，SSR 环境下静默跳过 */
function writeRaw(kind: LocalCanvasTemplateKind, list: LocalCanvasTemplate[]) {
  if (typeof localStorage === 'undefined') return
  writeLocalStorage(
    storageKey(kind),
    JSON.stringify(
      list.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        kind,
        updatedAt: t.updatedAt,
        graph: t.graph,
        meta: t.meta,
      })),
    ),
  )
}

/** 列出指定类型的全部本地模板 */
export function listLocalCanvasTemplates(kind: LocalCanvasTemplateKind): LocalCanvasTemplate[] {
  return readRaw(kind)
}

/**
 * 保存（新增 / 覆盖）本地模板。
 *
 * - id 为空时自动生成 custom_<时间>_<随机>。
 * - 同 id 直接覆盖，否则插入到列表头。
 * - 入参 graph.name 与模板 name 同步。
 */
export function saveLocalCanvasTemplate(input: {
  kind: LocalCanvasTemplateKind
  id?: string
  name: string
  description?: string
  graph: Record<string, unknown>
  meta?: LocalCanvasTemplate['meta']
}): LocalCanvasTemplate {
  const kind = input.kind
  const name = String(input.name || '').trim() || '我的模板'
  const description = String(input.description || '').trim()
  const list = readRaw(kind)
  const id =
    String(input.id || '').trim() ||
    `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
  const graph = cloneJson(input.graph)
  if (graph && typeof graph === 'object') {
    ;(graph as { name?: string }).name = name
  }
  const row: LocalCanvasTemplate = {
    id,
    name,
    description,
    kind,
    updatedAt: new Date().toISOString(),
    graph,
    meta: input.meta ? cloneJson(input.meta) : undefined,
  }
  const idx = list.findIndex((t) => t.id === id)
  if (idx >= 0) list[idx] = row
  else list.unshift(row)
  writeRaw(kind, list)
  return row
}

/** 更新模板 meta（name / description），同步 graph.name，找不到时返回 null */
export function updateLocalCanvasTemplateMeta(
  kind: LocalCanvasTemplateKind,
  id: string,
  patch: { name?: string; description?: string },
): LocalCanvasTemplate | null {
  const list = readRaw(kind)
  const idx = list.findIndex((t) => t.id === id)
  if (idx < 0) return null
  const cur = list[idx]
  if (patch.name != null) {
    cur.name = String(patch.name).trim() || cur.name
    if (cur.graph && typeof cur.graph === 'object') {
      ;(cur.graph as { name?: string }).name = cur.name
    }
  }
  if (patch.description != null) cur.description = String(patch.description).trim()
  cur.updatedAt = new Date().toISOString()
  list[idx] = cur
  writeRaw(kind, list)
  return cur
}

/** 删除模板：成功返回 true，未找到返回 false */
export function deleteLocalCanvasTemplate(kind: LocalCanvasTemplateKind, id: string): boolean {
  const list = readRaw(kind)
  const next = list.filter((t) => t.id !== id)
  if (next.length === list.length) return false
  writeRaw(kind, next)
  return true
}

/** 脚本：至少有一个动作；场景：至少一个实体 */
export function isLocalCanvasGraphNonEmpty(
  kind: LocalCanvasTemplateKind,
  graph: Record<string, unknown> | null | undefined,
): boolean {
  if (!graph || typeof graph !== 'object') return false
  if (kind === 'script') {
    return Array.isArray(graph.actions) && graph.actions.length > 0
  }
  return Array.isArray(graph.entities) && graph.entities.length > 0
}

/**
 * 计算模板统计：主维度数量 + 标签 + 占位实体集合。
 *
 * - 脚本主维度为动作数；场景主维度为实体数。
 * - 通过正则扫描 graph 内的 `xxx.yyy_placeholder_zzz` 形式占位实体并去重。
 */
export function localCanvasTemplateStats(
  kind: LocalCanvasTemplateKind,
  graph: Record<string, unknown> | null | undefined,
): { primary: number; label: string; placeholders: string[] } {
  const g = graph && typeof graph === 'object' ? graph : {}
  const raw = JSON.stringify(g)
  const found = raw.match(/[a-z][a-z0-9_]*\.[a-z0-9_]*placeholder[a-z0-9_]*/gi) || []
  const placeholders = [...new Set(found.map((s) => s.toLowerCase()))].sort()
  if (kind === 'script') {
    const actions = Array.isArray(g.actions) ? g.actions.length : 0
    return { primary: actions, label: `${actions} 动作`, placeholders }
  }
  const entities = Array.isArray(g.entities) ? g.entities.length : 0
  return { primary: entities, label: `${entities} 实体`, placeholders }
}
