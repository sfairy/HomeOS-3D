/**
 * @file template-yaml-blocks.util.ts
 * @module shared/ha
 *
 * HA Template YAML 块解析与匹配工具：
 *  - FLOW_TO_YAML_KEYS / extractSuggestedValuesFromDataSchema / flowOptionsToTemplateYaml
 *  - findTemplateBlockByUniqueId / templateBlockToYaml / enrichStubFromEntityState
 *
 * 外部依赖：
 *  - ../../shared/types：HaEntity 类型
 *  - @homeos/shared：HA YAML 解析 / 模板元信息 / 块收集工具
 */
import type { HaEntity } from '../types';
import {
  TEMPLATE_FLOW_TO_YAML_KEYS,
  TEMPLATE_META_KEYS,
  collectTemplateBlocks,
  dumpHaYaml,
  loadHaYamlObject,
} from '@homeos/shared';

/** Flow 表单字段 → configuration.yaml 字段 */
const FLOW_TO_YAML_KEYS: Record<string, string> = { ...TEMPLATE_FLOW_TO_YAML_KEYS };

/**
 * Options Flow 表单字段描述（HA data_schema 中的单项）。
 * section 类型字段会嵌套 schema 数组。
 */
type FlowSchemaField = {
  name?: string;
  type?: string;
  schema?: FlowSchemaField[];
  description?: { suggested_value?: unknown };
  default?: unknown;
};

/**
 * 从 Options Flow 的 data_schema 提取 suggested_value。
 * @param schema HA Options Flow 返回的 data_schema 数组
 * @returns 字段名 → suggested_value 的映射对象
 * 递归处理 section 类型字段（其 schema 字段为嵌套数组）。
 * 跳过 null / undefined / 空字符串值，避免覆盖有效默认值。
 */
export function extractSuggestedValuesFromDataSchema(schema: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!Array.isArray(schema)) return out;
  for (const raw of schema) {
    const field = raw as FlowSchemaField;
    if (!field || typeof field !== 'object') continue;
    if (field.type === 'section' && Array.isArray(field.schema)) {
      Object.assign(out, extractSuggestedValuesFromDataSchema(field.schema));
      continue;
    }
    const name = field.name;
    if (!name) continue;
    const suggested = field.description?.suggested_value ?? field.default;
    if (suggested !== undefined && suggested !== null && suggested !== '') {
      out[name] = suggested;
    }
  }
  return out;
}

/**
 * Options/Flow 配置 → configuration.yaml 片段。
 * @param platform 模板平台（sensor / binary_sensor 等）
 * @param options 从 Options Flow 收集的字段值
 * @returns 序列化后的 YAML 字符串（含 template: 顶层键）
 * 跳过模板元信息字段与空值；flowKey → yamlKey 映射通过 FLOW_TO_YAML_KEYS 完成。
 */
export function flowOptionsToTemplateYaml(
  platform: string,
  options: Record<string, unknown>,
): string {
  const item: Record<string, unknown> = {};
  // 模板流程元信息字段，不应写入 configuration.yaml
  const skip = new Set(['template_type', 'next_step_id', 'advanced_options']);

  for (const [flowKey, val] of Object.entries(options)) {
    if (skip.has(flowKey) || val == null || val === '') continue;
    const yamlKey = FLOW_TO_YAML_KEYS[flowKey] || flowKey;
    if (yamlKey in item && item[yamlKey] != null) continue;
    item[yamlKey] = val;
  }

  if (options.name) item.name = options.name;
  if (options.unique_id) item.unique_id = options.unique_id;

  const tplPlatform = platform || String(options.template_type || 'sensor');
  return dumpHaYaml({ template: [{ [tplPlatform]: [item] }] }, { lineWidth: 120 });
}

/**
 * 判定 template 列表项是否匹配目标 unique_id / entity_id。
 * 匹配规则（任一即匹配）：
 *  1. unique_id 完全相等
 *  2. default_entity_id 完全相等
 *  3. entity_id 以 name（小写、空格转下划线）结尾（HA 的 object_id 命名约定）
 */
function templateItemMatches(
  item: Record<string, unknown>,
  uniqueId: string,
  entityId?: string,
): boolean {
  const uid = String(item.unique_id || '');
  if (uid && uid === uniqueId) return true;
  if (entityId && item.default_entity_id === entityId) return true;
  const name = String(item.name || '');
  if (entityId && name && entityId.endsWith(name.toLowerCase().replace(/\s+/g, '_'))) return true;
  return false;
}

/**
 * 按 unique_id 定位完整 template 块（保留 trigger + sensor 等并列结构）
 * 适用于 configuration.yaml 中的 trigger-based template。
 * @param parsed 已解析的 configuration.yaml 对象
 * @param uniqueId 目标 unique_id
 * @param entityId 可选的辅助匹配 entity_id
 * @returns 匹配的 template 块对象（深拷贝）；未找到返回 null
 */
export function findTemplateBlockByUniqueId(
  parsed: Record<string, unknown>,
  uniqueId: string,
  entityId?: string,
): Record<string, unknown> | null {
  const templateRoot = parsed.template;
  if (!templateRoot) return null;

  for (const block of collectTemplateBlocks(templateRoot)) {
    for (const [key, items] of Object.entries(block)) {
      if (TEMPLATE_META_KEYS.has(key) || !Array.isArray(items)) continue;
      for (const raw of items) {
        if (!raw || typeof raw !== 'object') continue;
        if (templateItemMatches(raw as Record<string, unknown>, uniqueId, entityId)) {
          return { ...block };
        }
      }
    }
  }
  return null;
}

/** 将 template 块对象序列化为 YAML 字符串。 */
export function templateBlockToYaml(block: Record<string, unknown>): string {
  return dumpHaYaml({ template: [block] }, { lineWidth: 120 });
}
/**
 * 用实体运行态属性增强占位 YAML（无法替代完整 configuration.yaml）。
 *
 * @param yamlStr 占位 YAML 字符串
 * @param entity HA 实体运行态（含 attributes）
 * @returns 增强后的 YAML 字符串；解析失败时返回原 yamlStr
 *
 * 仅补全缺失的属性字段（unit_of_measurement / device_class / icon / state_class），
 * 已存在的字段不覆盖。增强后仍是占位，不能替代真实 configuration.yaml。
 */
export function enrichStubFromEntityState(yamlStr: string, entity: HaEntity | null): string {
  if (!entity) return yamlStr;
  const attrs = (entity.attributes || {}) as Record<string, unknown>;
  try {
    const parsed = loadHaYamlObject(yamlStr);
    if (!parsed?.template) return yamlStr;
    const blocks = Array.isArray(parsed.template) ? parsed.template : [parsed.template];
    for (const block of blocks) {
      if (!block || typeof block !== 'object') continue;
      for (const items of Object.values(block as Record<string, unknown>)) {
        if (!Array.isArray(items) || !items[0]) continue;
        const item = items[0] as Record<string, unknown>;
        // 仅补全缺失字段，已有字段不覆盖
        if (attrs.unit_of_measurement && !item.unit_of_measurement) {
          item.unit_of_measurement = attrs.unit_of_measurement;
        }
        if (attrs.device_class && !item.device_class) {
          item.device_class = attrs.device_class;
        }
        if (attrs.icon && !item.icon) item.icon = attrs.icon;
        if (attrs.state_class && !item.state_class) item.state_class = attrs.state_class;
      }
    }
    return dumpHaYaml(parsed, { lineWidth: 120 });
  } catch {
    return yamlStr;
  }
}
