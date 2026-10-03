/**
 * 模板实体上下文解析工具。
 *
 * 职责：
 * - 为模板实体构建可识别的 YAML 来源标签（HomeOS / Helper / 配置 / 占位等）
 * - 在实体 store 中按命名启发式推断功率类触发传感器 entity_id
 * - 远程拉取 Home Assistant 模板上下文（解析不完整 YAML 或缺失 trigger 实体时）
 * - 模板导入后补全 DB 记录（同步 YAML、触发实体、类型并回写）
 *
 * 依赖：
 * - template-trigger-sensor.util：解析/构建触发式传感器 YAML，判断 YAML 是否为占位片段
 * - template-yaml-parser.util：判断是否为 trigger-based 模板，从 item 解析编辑类型
 * - logger：调试与告警日志
 * - @/types/orchestrator-builder：上下文解析与同步导入的入参/出参类型
 */

import {
  defaultTriggerSensorForm,
  parseTriggerSensorYaml,
  buildTriggerSensorYaml,
  isIncompleteTemplateYaml,
} from '@/utils/template/trigger-sensor.util'
import {
  isTriggerBasedTemplateYaml,
  resolveEditEntityTypeFromItem,
} from '@/utils/template/yaml-parser.util'
import { logger } from '@/utils/core/logger'
import type {
  OrchestratorSavedItem,
  SyncImportedTemplateOptions,
  TemplateEntityContextOptions,
  TemplateEntityContextResult,
} from '@/types/orchestrator-builder'

/** YAML 来源标识 → 展示标签映射（用于 UI 显示 YAML 的来源出处） */
const YAML_SOURCE_LABELS: Record<string, string> = {
  homeos: 'HomeOS', // 由 HomeOS 平台创建
  config_entry: 'Helper', // 来自 HA Helper（template helper 配置项）
  configuration_yaml: '配置', // 来自 configuration.yaml 原文
  stub: '占位', // 仅占位片段，需补全
  entity_state: '实体状态', // 来自实体状态推断
  template: '模板', // 一般模板来源
}

/**
 * 将 YAML 来源标识转换为可读展示标签。
 *
 * @param src 原始来源标识（未知类型，会被强转为字符串）
 * @returns 对应的中文/产品名标签；无来源时返回 '—'；未命中映射时返回原标识
 */
export function yamlSourceLabel(src: unknown) {
  const key = String(src || '').trim()
  if (!key) return '—'
  return YAML_SOURCE_LABELS[key] ?? key
}

/** 从实体 store 推断功率触发传感器 entity_id */
export function guessTriggerEntityFromStore(
  uniqueId: unknown,
  entName: unknown,
  entities: Record<string, unknown> = {},
) {
  const hay = `${uniqueId || ''} ${entName || ''}`.toLowerCase()
  if (!/power|state|电视|tv|dian/.test(hay)) return ''
  const keys = Object.keys(entities)
  const candidates = keys.filter(
    (id: string) =>
      id.startsWith('sensor.') &&
      id !== `sensor.${uniqueId}` &&
      /electric_power|_power_|power_p_/i.test(id),
  )
  if (candidates.length === 1) return candidates[0]
  const xiaomi = candidates.filter((id: string) => /xiaomi/i.test(id))
  return xiaomi.length === 1 ? xiaomi[0] : candidates[0] || ''
}

/**
 * 判断是否需要在导入后重建 trigger 传感器 YAML。
 *
 * 触发条件：
 * - YAML 不完整（占位片段或标记 yamlComplete=false）
 * - 或 YAML 不属于 trigger-based 模板结构（结构与类型不符）
 *
 * @param yamlStr 当前 YAML 字符串
 * @param yamlComplete YAML 是否已完整的标记
 * @returns 是否需要重建
 */
export function shouldReplaceTriggerYaml(yamlStr: unknown, yamlComplete: unknown) {
  return (
    isIncompleteTemplateYaml(yamlStr, yamlComplete) || !isTriggerBasedTemplateYaml(String(yamlStr || ''))
  )
}

/** 远程解析 HA 模板上下文（不完整 YAML 或缺 trigger 实体时） */
export async function resolveTemplateContext(
  item: OrchestratorSavedItem | Record<string, unknown>,
  { remote, haConfigReadable, apiGet, entities = {} }: TemplateEntityContextOptions = {},
): Promise<TemplateEntityContextResult> {
  const haConfigId = item.haConfigId || item.ha_config_id
  const entityId = item.haEntityId || item.entity_id
  const ctx: TemplateEntityContextResult = {
    yaml: String(item.yaml || ''),
    triggerEntityId: String(item.trigger_entity_id || item.triggerEntityId || ''),
  }
  if (!haConfigId) return ctx
  if (!ctx.triggerEntityId) {
    ctx.triggerEntityId = guessTriggerEntityFromStore(haConfigId, item.name, entities)
  }
  const needResolve = isIncompleteTemplateYaml(item.yaml, item.yamlComplete) || !ctx.triggerEntityId
  if (!needResolve) return ctx
  if (!remote) return ctx
  try {
    const r = await apiGet?.('/template-entity/sync/resolve-preview', {
      params: { haConfigId, entity_id: entityId || undefined },
      timeout: 12_000,
    })
    if (r?.data?.yaml_complete && r.data?.yaml) ctx.yaml = String(r.data.yaml)
    if (r?.data?.trigger_entity_id) ctx.triggerEntityId = String(r.data.trigger_entity_id)
  } catch (err) {
    logger.warn('解析 HA 模板上下文失败(已使用本地推断):', err)
    if (!haConfigReadable) {
      logger.debug('提示:配置 haConfigDir 或粘贴完整 YAML 可补全占位片段')
    }
  }
  return ctx
}

/** 导入后补全 DB 记录，返回更新后的 item */
export async function syncImportedTemplateRecord(
  item: OrchestratorSavedItem,
  { apiGet, apiPut, haConfigReadable, entities }: SyncImportedTemplateOptions,
) {
  const ctx = await resolveTemplateContext(item, {
    remote: true,
    haConfigReadable,
    apiGet,
    entities,
  })
  const work: OrchestratorSavedItem = {
    ...item,
    yaml: ctx.yaml,
    trigger_entity_id: ctx.triggerEntityId || item.trigger_entity_id,
  }
  const resolved = resolveEditEntityTypeFromItem(work)
  if (!resolved.meta.triggerEntityId) {
    resolved.meta.triggerEntityId = guessTriggerEntityFromStore(
      item.haConfigId,
      item.name,
      entities,
    )
  }
  const putBody: Record<string, unknown> = {}
  if (resolved.type && resolved.type !== item.type) putBody.type = resolved.type
  const yaml = ctx.yaml

  if (resolved.type === 'trigger_sensor') {
    const form = parseTriggerSensorYaml(yaml, resolved.meta)
    if (shouldReplaceTriggerYaml(yaml, item.yamlComplete) || form.triggerEntityId) {
      putBody.yaml = buildTriggerSensorYaml({ ...defaultTriggerSensorForm(), ...form }, item.name)
      putBody.yamlComplete = true
    } else if (yaml && yaml !== item.yaml) {
      putBody.yaml = yaml
    }
  } else if (yaml && yaml !== item.yaml) {
    putBody.yaml = yaml
    if (ctx.yaml && !isIncompleteTemplateYaml(ctx.yaml, false)) putBody.yamlComplete = true
  }

  if (Object.keys(putBody).length) {
    try {
      await apiPut(`/template-entity/${item.id}`, putBody)
      Object.assign(item, putBody)
      if (putBody.yaml) item.yaml = String(putBody.yaml)
    } catch (err) {
      logger.warn('更新导入模板失败:', err)
    }
  }
  return item
}
