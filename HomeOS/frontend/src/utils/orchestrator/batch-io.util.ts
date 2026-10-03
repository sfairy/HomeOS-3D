/**
 * 联动器批量管理 / 导入导出工具（automation / script / scene）。
 *
 * - 导出 JSON：{ version, kind, exportedAt, items[] }
 * - 导出 YAML：多文档 YAML（--- 分隔），每份为规则自身 YAML 原文
 * - 导入：兼容上述 JSON 与多文档 YAML，逐条映射为创建载荷
 */
import { loadAll, dump, CORE_SCHEMA } from 'js-yaml'
import { downloadBlob } from '@/utils/core/misc.util'

/** 批量管理的联动器类型 */
export type OrchestratorBatchKind = 'automation' | 'script' | 'scene'

/** 单条导入项：name / yaml / entities（场景）/ enabled / runOnHa / geekGraph / geekSceneGraph */
export interface OrchestratorBatchImportItem {
  name: string
  yaml?: string
  entities?: string | unknown[]
  enabled?: boolean
  runOnHa?: boolean
  geekGraph?: unknown
  geekSceneGraph?: unknown
}

/** 列表行 → 导出条目（剥离后端专用字段，只保留可重建内容） */
function mapOrchestratorItemForExport(
  item: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { name: item.name ?? '未命名' }
  if (typeof item.yaml === 'string' && item.yaml.trim()) out.yaml = item.yaml
  if (item.entities != null) out.entities = item.entities
  if (typeof item.enabled === 'boolean') out.enabled = item.enabled
  if (typeof item.runOnHa === 'boolean') out.runOnHa = item.runOnHa
  if (item.geekGraph) out.geekGraph = item.geekGraph
  if (item.geekSceneGraph) out.geekSceneGraph = item.geekSceneGraph
  return out
}

/** 生成 JSON 导出载荷 */
function buildOrchestratorExportPayload(
  kind: OrchestratorBatchKind,
  items: Record<string, unknown>[],
): Record<string, unknown> {
  return {
    version: 1,
    kind,
    exportedAt: new Date().toISOString(),
    items: items.map(mapOrchestratorItemForExport),
  }
}

/** 触发 JSON 下载 */
export function downloadOrchestratorJson(
  kind: OrchestratorBatchKind,
  items: Record<string, unknown>[],
): void {
  const payload = buildOrchestratorExportPayload(kind, items)
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  downloadBlob(blob, `homeos-${kind}-${dateStamp()}.json`)
}

/** 触发多文档 YAML 下载（每份为规则自身 YAML，附带名称注释） */
export function downloadOrchestratorYaml(
  kind: OrchestratorBatchKind,
  items: Record<string, unknown>[],
): void {
  const docs: string[] = []
  for (const item of items) {
    const name = typeof item.name === 'string' && item.name.trim() ? item.name : '未命名'
    let yaml = typeof item.yaml === 'string' ? item.yaml.trim() : ''
    if (!yaml && kind === 'scene' && item.entities != null) {
      yaml = sceneYamlFromEntities(name, item.entities)
    }
    docs.push(yaml ? `# ${name}\n${yaml}` : `# ${name}\n# （无可导出 YAML 原文）`)
  }
  const text = `# HomeOS ${kind} 导出 · ${new Date().toLocaleString()}\n---\n${docs.join('\n---\n')}\n`
  const blob = new Blob([text], { type: 'text/yaml;charset=utf-8' })
  downloadBlob(blob, `homeos-${kind}-${dateStamp()}.yaml`)
}

/** 由场景实体列表生成 HA 风格场景 YAML */
function sceneYamlFromEntities(name: string, entities: unknown): string {
  let rows: Array<{ entityId: string; state: unknown }> = []
  if (Array.isArray(entities)) {
    rows = entities
      .map((e) => {
        if (!e || typeof e !== 'object') return { entityId: String(e), state: undefined }
        const row = e as Record<string, unknown>
        return { entityId: String(row.entityId ?? row.entity_id ?? ''), state: row.state }
      })
      .filter((x) => x.entityId)
  } else if (entities && typeof entities === 'object') {
    rows = Object.entries(entities as Record<string, unknown>).map(([entityId, state]) => ({
      entityId,
      state,
    }))
  }
  if (!rows.length) return ''
  const entityLines = rows.map((r) => `      ${r.entityId}: ${quoteYamlScalar(r.state ?? '')}`)
  return [
    'scene:',
    `  - name: ${quoteYamlScalar(name)}`,
    '    entities:',
    ...entityLines,
  ].join('\n')
}

/** 简易 YAML 标量加引号：含特殊字符 / 首尾空格时用 JSON 序列化 */
function quoteYamlScalar(value: unknown): string {
  const s = String(value ?? '')
  if (s === '' || /[{}[\]&*#?|>'"%@`]/.test(s) || /^\s|\s$/.test(s)) return JSON.stringify(s)
  return s
}

/** 解析导入文本（JSON 或 YAML），返回可创建的条目与错误信息 */
export function parseOrchestratorImportText(
  text: string,
  kind: OrchestratorBatchKind,
): { items: OrchestratorBatchImportItem[]; errors: string[] } {
  const items: OrchestratorBatchImportItem[] = []
  const errors: string[] = []
  const raw = (text || '').trim()
  if (!raw) return { items, errors: ['导入内容为空'] }

  const isJson = raw.startsWith('{') || raw.startsWith('[')
  if (isJson) {
    parseJsonImport(raw, kind, items, errors)
  } else {
    parseYamlImport(raw, kind, items, errors)
  }
  return { items, errors }
}

/** 解析 JSON 导入文本：支持 { items: [] } / [ ... ] / { data: [] } 三种结构 */
function parseJsonImport(
  raw: string,
  kind: OrchestratorBatchKind,
  items: OrchestratorBatchImportItem[],
  errors: string[],
) {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    errors.push('JSON 解析失败')
    return
  }
  let list: unknown
  if (Array.isArray(data)) {
    list = data
  } else if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    if (Array.isArray(obj.items)) list = obj.items
    else if (Array.isArray(obj.data)) list = obj.data
  }
  if (!Array.isArray(list)) {
    errors.push('JSON 中未找到 items 数组')
    return
  }
  list.forEach((entry, i) => {
    if (!entry || typeof entry !== 'object') {
      errors.push(`第 ${i + 1} 条不是对象`)
      return
    }
    const row = entry as Record<string, unknown>
    const name = typeof row.name === 'string' && row.name.trim() ? row.name : `导入项 ${i + 1}`
    const item: OrchestratorBatchImportItem = { name }
    if (typeof row.yaml === 'string' && row.yaml.trim()) item.yaml = row.yaml
    if (row.entities != null) {
      item.entities =
        typeof row.entities === 'string' ? row.entities : JSON.stringify(row.entities)
    }
    if (typeof row.enabled === 'boolean') item.enabled = row.enabled
    if (typeof row.runOnHa === 'boolean') item.runOnHa = row.runOnHa
    if (row.geekGraph) item.geekGraph = row.geekGraph
    if (row.geekSceneGraph) item.geekSceneGraph = row.geekSceneGraph
    if (kind === 'scene' && item.entities == null && !item.yaml) {
      errors.push(`第 ${i + 1} 条「${name}」缺少 entities/yaml`)
      return
    }
    if (kind !== 'scene' && !item.yaml) {
      errors.push(`第 ${i + 1} 条「${name}」缺少 yaml`)
      return
    }
    items.push(item)
  })
}

/** 解析多文档 YAML 导入：每份文档映射为一条 item；场景需要从 entities 提取 */
function parseYamlImport(
  raw: string,
  kind: OrchestratorBatchKind,
  items: OrchestratorBatchImportItem[],
  errors: string[],
) {
  let docs: unknown[] = []
  try {
    docs = loadAll(raw, null, { schema: CORE_SCHEMA }) as unknown[]
  } catch (e) {
    errors.push(`YAML 解析失败：${String((e as { message?: string })?.message || e)}`)
    return
  }
  docs.forEach((doc, i) => {
    if (doc == null) return
    if (typeof doc === 'string') {
      // 纯文本文档：整体作为单条 yaml（容错）
      if (doc.trim()) {
        items.push({ name: `导入项 ${i + 1}`, yaml: doc })
      }
      return
    }
    if (typeof doc !== 'object' || Array.isArray(doc)) {
      errors.push(`第 ${i + 1} 段格式不支持`)
      return
    }
    const obj = doc as Record<string, unknown>
    const name =
      typeof obj.alias === 'string' && obj.alias.trim()
        ? obj.alias
        : typeof obj.name === 'string' && obj.name.trim()
          ? obj.name
          : `导入项 ${i + 1}`
    if (kind === 'scene') {
      // 场景 YAML 需重新规整为 entities；无则跳过并记录
      const entities = sceneEntitiesFromYamlDoc(obj)
      if (entities) {
        items.push({ name, entities: JSON.stringify(entities) })
      } else {
        errors.push(`第 ${i + 1} 段「${name}」无法提取场景实体`)
      }
      return
    }
    const yamlText = dump(obj, { schema: CORE_SCHEMA })
    items.push({ name, yaml: yamlText })
  })
}

/** 从场景 YAML 文档中提取实体声明，兼容 HomeOS 导出与 HA 原生场景格式 */
function sceneEntitiesFromYamlDoc(doc: Record<string, unknown>): unknown[] | null {
  let raw: unknown
  const scene = doc.scene
  if (Array.isArray(scene)) {
    // HA 原生场景：scene: [{ name, entities: { light.x: on } }]
    const first = scene[0]
    raw = first && typeof first === 'object' ? (first as Record<string, unknown>).entities : null
  } else if (scene && typeof scene === 'object') {
    raw = (scene as Record<string, unknown>).entities
  } else {
    raw = doc.entities
  }
  if (Array.isArray(raw)) {
    return raw
      .map((e) => {
        if (!e || typeof e !== 'object') return { entityId: String(e) }
        const row = e as Record<string, unknown>
        return {
          entityId: row.entity_id ?? row.entityId,
          state: row.state,
          brightness: row.brightness,
        }
      })
      .filter((x) => x.entityId)
  }
  if (raw && typeof raw === 'object') {
    // HA 场景实体为映射：{ light.x: 'on' }
    const entries = Object.entries(raw as Record<string, unknown>)
    if (entries.length) {
      return entries.map(([entityId, state]) => ({ entityId, state }))
    }
  }
  return null
}

/** 生成 YYYYMMDD 时间戳，用于导出文件名 */
function dateStamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}
