/**
 * 模板实体导入/导出工具。
 *
 * 职责：
 * - 组装模板实体的导出 payload（版本、时间、YAML、槽位映射、扩展属性）
 * - 解析导入 JSON 并做版本/字段校验
 * - 触发浏览器下载导出文件
 *
 * 依赖：@homeos/shared 的 buildSlotPayload / normalizeSlotPayload 与槽位类型。
 */

import {
  buildSlotPayload,
  normalizeSlotPayload,
  type SlotMeta,
  type SlotSchemaPayload,
} from '@homeos/shared'

/** 导出文件格式版本号（向后兼容判断用，当前固定为 1） */
const TEMPLATE_ENTITY_EXPORT_VERSION = 1 as const

/**
 * 模板实体导出/导入文件的结构。
 * 与 buildTemplateEntityExportPayload 输出、parseTemplateEntityImportJson 输入一致。
 */
export interface TemplateEntityExportPayload {
  version: typeof TEMPLATE_ENTITY_EXPORT_VERSION
  exportedAt: string
  name: string
  type: string
  yaml: string
  slotMapping?: SlotSchemaPayload
  extraUnit?: string
  extraDeviceClass?: string
  extraIcon?: string
  triggerSensor?: Record<string, unknown>
  triggerShowRawYaml?: boolean
}

/**
 * 由当前编辑表单数据组装导出 payload。
 *
 * 调用场景：用户点击导出时，把表单中的 YAML、槽位、扩展属性打包为可序列化结构。
 * 仅当 slots 与 slotsList 同时存在且槽位非空时才生成 slotMapping。
 *
 * @param input 表单输入（名称/类型/YAML/槽位/扩展属性等）
 * @returns 可直接 JSON 序列化的导出 payload
 */
export function buildTemplateEntityExportPayload(input: {
  name: string
  type: string
  yaml: string
  slots?: Record<string, string>
  slotsList?: SlotMeta[]
  extraUnit?: string
  extraDeviceClass?: string
  extraIcon?: string
  triggerSensor?: Record<string, unknown>
  triggerShowRawYaml?: boolean
}): TemplateEntityExportPayload {
  const slotMapping =
    input.slots && input.slotsList?.length
      ? buildSlotPayload(input.slots, input.slotsList)
      : undefined
  return {
    version: TEMPLATE_ENTITY_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    name: input.name,
    type: input.type,
    yaml: input.yaml,
    slotMapping: slotMapping && Object.keys(slotMapping.mapping).length ? slotMapping : undefined,
    extraUnit: input.extraUnit || undefined,
    extraDeviceClass: input.extraDeviceClass || undefined,
    extraIcon: input.extraIcon || undefined,
    triggerSensor: input.triggerSensor,
    triggerShowRawYaml: input.triggerShowRawYaml,
  }
}

/**
 * 解析导入 JSON 字符串并校验。
 *
 * 校验项：JSON 合法性、对象类型、版本号一致、name/type/yaml 非空；
 * 通过后对 slotMapping 做归一化。校验失败返回 { ok: false, message }。
 *
 * @param raw 用户粘贴或文件读取的 JSON 字符串
 * @returns 成功时 { ok: true, data }，失败时 { ok: false, message }
 */
export function parseTemplateEntityImportJson(
  raw: string,
): { ok: true; data: TemplateEntityExportPayload } | { ok: false; message: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, message: 'JSON 格式无效' }
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, message: '配置必须是 JSON 对象' }
  }
  const o = parsed as TemplateEntityExportPayload
  if (o.version !== TEMPLATE_ENTITY_EXPORT_VERSION) {
    return { ok: false, message: `不支持的配置版本：${String(o.version)}` }
  }
  if (!o.name?.trim()) return { ok: false, message: '缺少 name' }
  if (!o.type?.trim()) return { ok: false, message: '缺少 type' }
  if (!o.yaml?.trim()) return { ok: false, message: '缺少 yaml' }
  if (o.slotMapping) normalizeSlotPayload(o.slotMapping)
  return { ok: true, data: o }
}

/**
 * 触发浏览器下载导出 payload 为 JSON 文件。
 *
 * 副作用：创建临时 Blob URL 并模拟点击 a[download]，下载完成后释放 URL。
 *
 * @param payload 已组装的导出结构
 * @param filename 可选文件名，缺省时按 template-entity-{name|export}.json 生成
 */
export function downloadTemplateEntityJson(
  payload: TemplateEntityExportPayload,
  filename?: string,
) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || `template-entity-${payload.name || 'export'}.json`
  a.click()
  URL.revokeObjectURL(url)
}
