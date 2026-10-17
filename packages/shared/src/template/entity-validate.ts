/** - isPlaceholderEntityId：判定 entity_id 是否为占位符（空字符串、xxx/example、placeholder 关键字、orchestrator 占位标记）； */
import { APPLIANCE_TYPE_IDS, getRequiredSlotGroups } from './appliance-catalog';
import { hasOrchestratorPlaceholder } from './placeholder-marker.util';

export { getRequiredSlotGroups };

/** 家电模板类型（含槽位映射的类型） */
export const APPLIANCE_TEMPLATE_TYPES = APPLIANCE_TYPE_IDS;

const PLACEHOLDER_ENTITY_RE = /\b[a-z][a-z0-9_]*\.(xxx|example)\b/i;

/**
 * 判断一个 HA entity_id 是否为占位符（空字符串、orchestrator 占位标记、xxx/example 对象名、含 placeholder 关键字等）。
 *
 * @param entityId 待检查 entity_id 字符串
 * @returns 匹配任一占位符模式时 true；真实实体 ID 返回 false
 */
export function isPlaceholderEntityId(entityId: string): boolean {
  const id = String(entityId || '').trim();
  if (!id) return true;
  if (hasOrchestratorPlaceholder(id)) return true;
  if (PLACEHOLDER_ENTITY_RE.test(id)) return true;
  const objectId = id.includes('.') ? id.slice(id.indexOf('.') + 1) : id;
  if (/placeholder/i.test(objectId)) return true;
  return false;
}

/**
 * 扫描 YAML 文本中所有 entity_id 字段与 states/is_state/state_attr 模板引用，收集命中 isPlaceholderEntityId 的实体 ID 去重列表。
 *
 * @param yamlStr 模板 YAML 文本（可空；空或非字符串返回空数组）
 * @returns 占位实体 ID 去重后的字符串数组；无占位返回空数组
 */
export function findPlaceholderEntityIdsInYaml(yamlStr: string): string[] {
  if (typeof yamlStr !== 'string' || !yamlStr) {
    return [];
  }
  const found = new Set<string>();
  const patterns = [
    /entity_id:\s*['"]?([a-z][a-z0-9_]*\.[a-z0-9_.]+)['"]?/gi,
    /(?:states|is_state|state_attr)\s*\(\s*['"]([^'"]+)['"]/gi,
  ];
  for (const re of patterns) {
    for (const m of yamlStr.matchAll(re)) {
      const id = m[1];
      if (isPlaceholderEntityId(id)) found.add(id);
    }
  }
  return [...found];
}

/**
 * 检测模板传感器 YAML 是否含「非标准自定义属性」：
 *  - 出现根级或嵌套级 `attributes:` 段（HomeOS 自定义扩展，不在标准 Template 平台段内）；
 *  - 出现非白名单的 `*_template:` 键（表示用户自定义了不在标准字段集内的模板属性）。
 *
 * @param yamlStr 模板 YAML 文本（根可能为单对象或列表）
 * @returns true 表示含有非标准模板属性，需要提示用户或走扩展渲染路径
 */
export function yamlHasNonStandardTemplateAttributes(yamlStr: string): boolean {
  if (!yamlStr?.trim()) return false;
  if (/\battributes:\s*$/m.test(yamlStr) || /\n\s+attributes:\n/.test(yamlStr)) return true;
  const stdKeys = new Set([
    'state_template',
    'percentage_template',
    'preset_mode_template',
    'temperature_template',
    'current_temperature_template',
    'target_temperature_template',
    'target_temp_template',
    'hvac_mode_template',
    'state',
    'percentage',
    'preset_mode',
    'temperature',
    'current_temperature',
    'target_temperature',
    'hvac_mode',
  ]);
  for (const m of yamlStr.matchAll(/^(\s*)([a-z_]+_template):/gm)) {
    if (!stdKeys.has(m[2])) return true;
  }
  return false;
}
