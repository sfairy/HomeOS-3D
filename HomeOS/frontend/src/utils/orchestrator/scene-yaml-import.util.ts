/**
 * 粘贴/导入场景 YAML 时的实体属性还原损失分析。
 */
import { loadHaYaml } from '@homeos/shared'
import { createBulkImportSummarizer } from './yaml-import-bulk-summary.util'

/** 与后端 haSceneMapToEntities 一致的可映射 HA 属性键 */
const SCENE_SUPPORTED_HA_ATTR_KEYS = new Set([
  'state',
  'brightness',
  'brightness_pct',
  'color_temp',
  'color_temp_kelvin',
  'rgb_color',
  'transition',
  'effect',
  'position',
  'temperature',
  'hvac_mode',
  'volume_level',
  'source',
  'percentage',
  'option',
  'value',
  'humidity',
  'code',
  'fan_speed',
])

type SceneEntitiesImportAnalysis = {
  entityCount: number
  entitiesWithDroppedAttrs: number
  droppedAttrCount: number
  /** 有属性丢失的实体 ID（画布角标用） */
  lossyEntityIds: string[]
  /** 本地 YAML 分析不判定 HA-only 特性 */
  needsHaExecution: false
  /** 自 HA 导入时建议启用 runOnHa（场景由 HA 执行） */
  fromHaImportSuggestRunOnHa: boolean
  hints: string[]
}

function analyzeSceneEntitiesImport(
  haMap: Record<string, Record<string, unknown>>,
): SceneEntitiesImportAnalysis {
  const empty: SceneEntitiesImportAnalysis = {
    entityCount: 0,
    entitiesWithDroppedAttrs: 0,
    droppedAttrCount: 0,
    lossyEntityIds: [],
    needsHaExecution: false,
    fromHaImportSuggestRunOnHa: false,
    hints: [],
  }
  if (!haMap || typeof haMap !== 'object') return empty

  const entries = Object.entries(haMap)
  const entityCount = entries.length
  let entitiesWithDroppedAttrs = 0
  let droppedAttrCount = 0
  const lossyEntityIds: string[] = []

  for (const [entityId, attrs] of entries) {
    if (!attrs || typeof attrs !== 'object') continue
    let entityDropped = 0
    for (const key of Object.keys(attrs)) {
      if (!SCENE_SUPPORTED_HA_ATTR_KEYS.has(key)) {
        entityDropped += 1
        droppedAttrCount += 1
      }
    }
    if (entityDropped > 0) {
      entitiesWithDroppedAttrs += 1
      if (entityId) lossyEntityIds.push(entityId)
    }
  }

  // 仅在有属性损失时建议 HA 执行（完整快照由 scene.turn_on 保证）
  const fromHaImportSuggestRunOnHa = droppedAttrCount > 0
  const hints: string[] = []
  if (droppedAttrCount > 0) {
    hints.push(
      `${entitiesWithDroppedAttrs} 个实体的 ${droppedAttrCount} 项属性未能完整还原；建议勾选「由 HA 执行」以保留完整快照`,
    )
  }

  return {
    entityCount,
    entitiesWithDroppedAttrs,
    droppedAttrCount,
    lossyEntityIds,
    needsHaExecution: false,
    fromHaImportSuggestRunOnHa,
    hints,
  }
}

/** analyzeSceneYamlImport：函数，按签名入参返回处理结果。 */
export function analyzeSceneYamlImport(yamlStr: string | null | undefined): SceneEntitiesImportAnalysis {
  const text = String(yamlStr || '').trim()
  if (!text) {
    return analyzeSceneEntitiesImport({})
  }
  try {
    const doc = loadHaYaml(text)
    if (!doc || typeof doc !== 'object') {
      return analyzeSceneEntitiesImport({})
    }
    const entities = (doc as Record<string, unknown>).entities
    if (!entities || typeof entities !== 'object') {
      return analyzeSceneEntitiesImport({})
    }
    return analyzeSceneEntitiesImport(entities as Record<string, Record<string, unknown>>)
  } catch {
    return analyzeSceneEntitiesImport({})
  }
}

/** 导入成功提示文案（无损失时返回 null） */
export function formatSceneImportHint(yaml: string | null | undefined): string | null {
  const { hints } = analyzeSceneYamlImport(yaml)
  return hints.length ? hints.join('；') : null
}

/**
 * 从已存场景记录提取导入损失提示（优先 yaml；entities 为 HA map 时也可分析）。
 */
export function formatSceneRowImportHint(row: {
  yaml?: unknown
  entities?: unknown
} | null | undefined): string | null {
  if (!row) return null
  const yaml = String(row.yaml || '').trim()
  if (yaml) return formatSceneImportHint(yaml)
  const ents = row.entities
  if (ents && typeof ents === 'object' && !Array.isArray(ents)) {
    const { hints } = analyzeSceneEntitiesImport(ents as Record<string, Record<string, unknown>>)
    return hints.length ? hints.join('；') : null
  }
  return null
}

/** summarizeSceneBulkImport：常量，取值语义见定义处。 */
export const summarizeSceneBulkImport = createBulkImportSummarizer<{
  yaml?: unknown
  entities?: unknown
}>({
  entityLabel: '场景',
  lossyMessage: (n) => `${n} 条存在属性还原损失，打开编辑可查看详情`,
  analyzeItem: (item) => {
    const yaml = String(item.yaml || '').trim()
    let analysis: SceneEntitiesImportAnalysis
    if (yaml) {
      analysis = analyzeSceneYamlImport(yaml)
    } else if (item.entities && typeof item.entities === 'object' && !Array.isArray(item.entities)) {
      analysis = analyzeSceneEntitiesImport(
        item.entities as Record<string, Record<string, unknown>>,
      )
    } else {
      return null
    }
    return { lossy: analysis.droppedAttrCount > 0 }
  },
})
