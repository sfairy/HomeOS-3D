/**
 * @file entity-validate.ts
 * @module @homeos/shared/template
 * @brief 模板实体占位符校验与槽位映射验证。
 *
 * 职责：
 *  - isPlaceholderEntityId：判定 entity_id 是否为占位符（空字符串、xxx/example、placeholder 关键字、orchestrator 占位标记）；
 *  - findPlaceholderEntityIdsInYaml：在 YAML 文本中扫描 entity_id 字段与模板函数引用，收集占位实体 ID；
 *  - validateApplianceSlotMapping：校验家电模板槽位映射是否满足必填组，且不含占位符；
 *  - yamlHasNonStandardTemplateAttributes：检测模板传感器 YAML 是否含非标准自定义属性（非白名单的 *_template 键或 attributes: 段落）。
 *
 * 关键依赖：
 *  - appliance-catalog：家电类型与必填槽位组；
 *  - orchestrator/placeholder-marker.util：联动器占位符标记识别；
 *  - slot-schema：槽位载荷规范化。
 *
 * 约定：
 *  - 前后端共用；后端用于保存前校验，前端用于表单提交前与 YAML 编辑器实时校验；
 *  - 所有判定为纯函数，不修改输入；错误通过返回消息字符串传递，不抛异常。
 */
import { APPLIANCE_TYPE_IDS, getRequiredSlotGroups } from './appliance-catalog';
import { hasOrchestratorPlaceholder } from './placeholder-marker.util';

export { getRequiredSlotGroups };
import { normalizeSlotPayload } from './slot-schema';

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
 * 解析槽位配置对象：优先兼容新格式 { mapping?: Record }（含 slotsMeta + mapping），
 * 否则按旧格式（直接就是 mapping 对象）处理，前后端过渡期双形态均接受。
 *
 * @param slots 新或旧形态的槽位配置
 * @returns 扁平后的 mapping（key → entity_id 或空/undefined/null）
 */
function resolveSlotMapping(
  slots: Record<string, string | undefined | null> | { mapping?: Record<string, string> },
): Record<string, string | undefined | null> {
  if (slots && typeof slots === 'object' && 'mapping' in slots) {
    return normalizeSlotPayload(slots).mapping;
  }
  return slots as Record<string, string | undefined | null>;
}

/**
 * 校验家电模板的槽位映射：必填槽位组至少有一组全部绑定了真实实体，且绑定值不含占位符 ID。
 *
 * @param type  家电类型 ID（如 "ac" / "tv"）；未知类型直接通过（宽松兼容新家电）
 * @param slots 槽位配置（新格式 { mapping, slotsMeta } 或旧格式 flat mapping）
 * @returns { valid, message } valid=false 时 message 为中文错误提示
 */
export function validateApplianceSlotMapping(
  type: string,
  slots: Record<string, string | undefined | null> | { mapping?: Record<string, string> },
): { valid: boolean; message: string } {
  if (!type || typeof type !== 'string') {
    return { valid: false, message: '设备类型不能为空' };
  }
  if (!APPLIANCE_TEMPLATE_TYPES.has(type)) {
    return { valid: true, message: '' };
  }
  if (!slots || typeof slots !== 'object') {
    return { valid: false, message: '槽位配置无效' };
  }
  const mapping = resolveSlotMapping(slots);
  const groups = getRequiredSlotGroups(type);
  const satisfied = groups.some((group) =>
    group.every((key) => {
      const val = mapping[key]?.trim();
      return val && !isPlaceholderEntityId(val);
    }),
  );
  if (!satisfied) {
    const hint = groups.map((g) => g.join('+')).join(' 或 ');
    return { valid: false, message: `请至少填写必填槽位：${hint}` };
  }
  for (const [key, val] of Object.entries(mapping)) {
    if (val?.trim() && isPlaceholderEntityId(val)) {
      return { valid: false, message: `槽位「${key}」含占位实体 ID，请选择真实实体` };
    }
  }
  return { valid: true, message: '' };
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
