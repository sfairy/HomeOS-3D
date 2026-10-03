/**
 * 模板实体表单本地校验工具。
 *
 * 职责：在提交保存前对名称/类型/触发实体/槽位/YAML 做与后端规则对齐的本地校验，
 * 提前拦截占位 ID、空字段与不完整 YAML，避免无效请求。
 *
 * 依赖：@homeos/shared 的占位/槽位校验函数，./yaml-parser.util 判断 trigger 模板。
 */

import {
  findPlaceholderEntityIdsInYaml,
  isPlaceholderEntityId,
  validateApplianceSlotMapping,
  hasOrchestratorPlaceholder,
} from '@homeos/shared'
import { APPLIANCE_TYPE_IDS } from '@homeos/shared'
import { isTriggerBasedTemplateYaml } from './yaml-parser.util'

/**
 * 保存前本地校验（与后端规则对齐）。
 *
 * 校验顺序：名称 → 类型 → trigger 实体（trigger_sensor 模式）→ 家电槽位 → YAML 非空 →
 * YAML 占位片段 → YAML 中残留的占位 entity_id → trigger 实体二次确认。
 * 任一项不通过即返回 { valid: false, message }，全部通过返回 { valid: true, message: '' }。
 *
 * @param opts 表单字段（entName/entType/yaml/slots/triggerEntityId/triggerShowRawYaml）
 * @returns 校验结果对象
 */
export function validateTemplateEntityForm(opts: {
  entName: string
  entType: string
  yaml: string
  slots?: Record<string, string>
  triggerEntityId?: string
  triggerShowRawYaml?: boolean
}) {
  const { entName, entType, yaml, slots = {}, triggerEntityId, triggerShowRawYaml } = opts
  if (!entName?.trim()) return { valid: false, message: '请输入名称' }
  if (!entType) return { valid: false, message: '请选择家电类型' }

  if (entType === 'trigger_sensor' && !triggerShowRawYaml) {
    if (!triggerEntityId?.trim()) return { valid: false, message: '请选择触发实体' }
    if (isPlaceholderEntityId(triggerEntityId)) {
      return { valid: false, message: '触发实体不能为占位 ID' }
    }
  }

  // 仅对家电聚合类型校验槽位映射（trigger_sensor / yaml_import 走各自的校验路径）
  if (
    entType !== 'trigger_sensor' &&
    entType !== 'yaml_import' &&
    APPLIANCE_TYPE_IDS.has(entType)
  ) {
    const slotCheck = validateApplianceSlotMapping(entType, slots)
    if (!slotCheck.valid) return slotCheck
  }

  if (!yaml?.trim()) return { valid: false, message: '请填写 YAML 配置' }
  if (hasOrchestratorPlaceholder(yaml)) {
    return { valid: false, message: 'YAML 含 _placeholder 占位符，请填写真实实体 ID' }
  }
  const placeholders = findPlaceholderEntityIdsInYaml(yaml)
  if (placeholders.length) {
    return { valid: false, message: `YAML 含占位实体 ID：${placeholders.join(', ')}` }
  }
  // trigger 模板且未启用原始 YAML 编辑时，二次确认触发实体必填
  if (isTriggerBasedTemplateYaml(yaml) && entType === 'trigger_sensor' && !triggerShowRawYaml) {
    if (!triggerEntityId?.trim()) return { valid: false, message: '请选择触发实体' }
  }
  return { valid: true, message: '' }
}
