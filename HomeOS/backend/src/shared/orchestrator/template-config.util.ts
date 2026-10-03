/**
 * 模板实体（template-entity）域配置转换工具
 *
 * 原为 common/orchestrator/config.util.ts 的 template-config.util 段，现独立成文件。
 * 职责：
 * - template YAML ↔ HA Config API JSON / Config Entry Flow 表单字段双向转换
 * - trigger-based 模板判定与本地结构校验
 * - Template Helper 可用性探测（canPushViaTemplateHelper）
 * - 漂移对比用规范化（canonicalTemplateYamlForDrift）
 */
import { API_ERROR } from '../../common/errors/api-error-messages';
import { dumpOrchestratorYaml, parseOrchestratorYaml } from './yaml.util';
import { BusinessException, ErrorCode } from '../../common/utils';
import {
  TEMPLATE_META_KEYS,
  TEMPLATE_YAML_TO_FLOW_KEYS,
  collectTemplateBlocks,
  extractFirstTemplateItemFromParsed,
  isTriggerBasedTemplateParsed,
  normalizeTemplateRoot,
  yamlHasNonStandardTemplateAttributes,
} from '@homeos/shared';

/** 是否为 trigger-based template（configuration.yaml 中 trigger + sensor 并列结构） */
export function isTriggerBasedTemplateYaml(yamlStr: string): boolean {
  if (!yamlStr?.trim()) return false;
  try {
    const parsed = parseOrchestratorYaml(yamlStr);
    return isTriggerBasedTemplateParsed(parsed, yamlStr);
  } catch {
    return /\btrigger\s*:/m.test(yamlStr);
  }
}

/** 从 trigger-based 或普通 template YAML 提取第一个平台实体项 */
function extractFirstTemplateItem(
  yamlStr: string,
): { platform: string; item: Record<string, unknown> } | null {
  const parsed = parseOrchestratorYaml(yamlStr) as Record<string, unknown>;
  return extractFirstTemplateItemFromParsed(parsed);
}

/** 联动器 YAML → HA Config API JSON */
function yamlToTemplateHaConfig(yamlStr: string, configId: string): Record<string, unknown> {
  const parsed = parseOrchestratorYaml(yamlStr);
  if (!parsed || typeof parsed !== 'object') {
    throw new BusinessException(
      ErrorCode.VALIDATION_FAILED,
      API_ERROR.ORCHESTRATOR_YAML_PARSE_FAILED,
    );
  }

  const hit = extractFirstTemplateItem(yamlStr);
  if (hit) {
    const item = { ...hit.item };
    item.unique_id = item.unique_id || configId;
    return { id: configId, platform: hit.platform, ...item };
  }

  const templateRoot = normalizeTemplateRoot(parsed);
  for (const platform of Object.keys(templateRoot)) {
    const items = templateRoot[platform];
    if (!Array.isArray(items) || !items.length) continue;
    const item = { ...(items[0] as Record<string, unknown>) };
    item.unique_id = item.unique_id || configId;
    return { id: configId, platform, ...item };
  }
  throw new BusinessException(ErrorCode.NOT_FOUND, API_ERROR.TEMPLATE_DEFINITION_NOT_FOUND);
}

/** YAML 字段 → HA Config Entry Flow 表单字段 */
const YAML_TO_FLOW_KEYS: Record<string, string> = { ...TEMPLATE_YAML_TO_FLOW_KEYS };

/** 从 template YAML 提取 unique_id（configuration.yaml 中的实体标识） */
export function extractUniqueIdFromYaml(yamlStr: string, fallbackId: string): string {
  try {
    const body = yamlToTemplateHaConfig(yamlStr, fallbackId);
    return String(body.unique_id || fallbackId);
  } catch {
    return fallbackId;
  }
}

/** 判断是否应跳过 Template Helper 并走 configuration.yaml */
export function shouldSkipTemplateHelper(yamlStr: string): boolean {
  if (isTriggerBasedTemplateYaml(yamlStr)) return true;
  return yamlHasNonStandardTemplateAttributes(yamlStr);
}

/** 联动器 YAML → HA Config Entry Flow 提交数据（UI Helper，非 configuration.yaml 主路径） */
function yamlToFlowConfig(yamlStr: string, configId: string) {
  const body = yamlToTemplateHaConfig(yamlStr, configId);
  const platform = String(body.platform || 'sensor');
  const name = String(body.name || body.friendly_name || configId);
  const flowConfig: Record<string, unknown> = {
    next_step_id: platform,
    name,
  };
  for (const [yamlKey, flowKey] of Object.entries(YAML_TO_FLOW_KEYS)) {
    const val = body[yamlKey];
    if (val != null && val !== '') flowConfig[flowKey] = val;
  }
  return { platform, flowConfig };
}

/** HA Config JSON → 联动器 YAML */
function templateHaConfigToYaml(config: Record<string, unknown>): string {
  const platform = String(config.platform || 'sensor');
  const id = config.id;
  const rest = Object.fromEntries(
    Object.entries(config).filter(([k]) => k !== 'platform' && k !== 'id'),
  ) as Record<string, unknown>;
  const obj = { template: { [platform]: [{ ...rest, unique_id: rest.unique_id || id }] } };
  return dumpOrchestratorYaml(obj);
}

function validateTriggerTemplateYamlLocal(yamlStr: string): { valid: boolean; message: string } {
  const parsed = parseOrchestratorYaml(yamlStr);
  if (!parsed?.template) return { valid: false, message: '缺少 template 根节点' };

  const blocks = collectTemplateBlocks(parsed.template);
  const triggerBlocks = blocks.filter((b) => 'trigger' in b);
  if (!triggerBlocks.length) {
    return { valid: false, message: '未找到含 trigger 的 template 块' };
  }

  for (const block of triggerBlocks) {
    const triggers = block.trigger;
    if (!Array.isArray(triggers) || !triggers.length) {
      return { valid: false, message: 'trigger 段不能为空' };
    }
    let hasPlatform = false;
    for (const [key, items] of Object.entries(block)) {
      if (
        TEMPLATE_META_KEYS.has(key) ||
        key === 'trigger' ||
        !Array.isArray(items) ||
        !items.length
      )
        continue;
      const item = items[0];
      const row = item as Record<string, unknown>;
      if (item && typeof item === 'object' && (row.name || row.unique_id || row.state)) {
        hasPlatform = true;
        break;
      }
    }
    if (!hasPlatform) {
      return { valid: false, message: 'trigger 模板需包含至少一个平台定义（如 sensor）' };
    }
  }
  return { valid: true, message: 'trigger-based template 结构校验通过' };
}

/** 校验模板 YAML 本地结构（trigger-based 与 platform-based 两种形态） */
export function validateTemplateYamlLocal(yamlStr: string): { valid: boolean; message: string } {
  if (isTriggerBasedTemplateYaml(yamlStr)) {
    return validateTriggerTemplateYamlLocal(yamlStr);
  }
  try {
    yamlToTemplateHaConfig(yamlStr, 'homeos_validate');
    return { valid: true, message: '结构校验通过' };
  } catch (e: unknown) {
    return { valid: false, message: (e as Error).message || 'YAML 无效' };
  }
}

/** 可通过 UI Template Helper（Config Entry Flow）推送的平台 */
const TEMPLATE_HELPER_PLATFORMS = new Set([
  'sensor',
  'binary_sensor',
  'switch',
  'button',
  'number',
  'select',
  'fan',
  'light',
  'cover',
  'climate',
  'lock',
]);

/** 判断是否可尝试 Config Entry Helper 推送 */
export function canPushViaTemplateHelper(yamlStr: string): {
  ok: boolean;
  platform?: string;
  flowConfig?: Record<string, unknown>;
} {
  if (shouldSkipTemplateHelper(yamlStr)) return { ok: false };
  try {
    const body = yamlToTemplateHaConfig(yamlStr, 'homeos_probe');
    const platform = String(body.platform || '');
    if (!TEMPLATE_HELPER_PLATFORMS.has(platform)) return { ok: false };
    const { flowConfig } = yamlToFlowConfig(yamlStr, 'homeos_probe');
    return { ok: true, platform, flowConfig };
  } catch {
    return { ok: false };
  }
}

/** 将模板 YAML 包装为 HA check_config 可识别的 template 块 */
export function wrapTemplateForHaCheck(yamlStr: string): string {
  if (isTriggerBasedTemplateYaml(yamlStr)) return yamlStr;
  const parsed = parseOrchestratorYaml(yamlStr);
  if (!parsed || typeof parsed !== 'object') return yamlStr;
  try {
    const body = yamlToTemplateHaConfig(yamlStr, 'homeos_validate');
    const platform = String(body.platform || 'sensor');
    const item = Object.fromEntries(
      Object.entries(body).filter(([k]) => k !== 'platform' && k !== 'id'),
    ) as Record<string, unknown>;
    return dumpOrchestratorYaml({ template: { [platform]: [item] } });
  } catch {
    return yamlStr;
  }
}

/** 漂移对比用规范化：trigger 模板不做 HA Config 往返（会丢失 trigger 段） */
export function canonicalTemplateYamlForDrift(yamlStr: string, configId: string): string {
  if (isTriggerBasedTemplateYaml(yamlStr)) return yamlStr.trim();
  try {
    const cfg = yamlToTemplateHaConfig(yamlStr, configId);
    return templateHaConfigToYaml(cfg);
  } catch {
    return yamlStr.trim();
  }
}
