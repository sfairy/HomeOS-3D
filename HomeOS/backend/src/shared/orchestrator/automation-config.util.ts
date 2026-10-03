/**
 * 自动化（automation）域配置转换工具
 *
 * 原为 common/orchestrator/config.util.ts 的 automation-config.util 段，现独立成文件。
 * 职责：
 * - HA Config API JSON ↔ 联动器/存储用 YAML 双向转换
 * - trigger/platform 键归一化（HA 2024.2+ 要求仅用 trigger）
 * - 本地 YAML 结构校验与 check_config 包装
 */
import { API_ERROR } from '../../common/errors/api-error-messages';
import { normalizeActionsForHa, normalizeActionsFromHa } from './ha-sync.internals';
import {
  buildAliasModeYamlHeader,
  dumpOrchestratorYaml,
  parseOrchestratorYaml,
  toItemList,
  validateYamlParsable,
} from './yaml.util';
import { BusinessException, ErrorCode } from '../../common/utils';

/** HA Config JSON → 联动器/存储用 YAML */
export function automationHaConfigToYaml(config: Record<string, unknown>): string {
  const obj = buildAliasModeYamlHeader(config);

  const triggers = config.triggers ?? config.trigger;
  const conditions = config.conditions ?? config.condition;
  const actions = config.actions ?? config.action;

  if (triggers) obj.trigger = normalizeTriggersFromHa(triggers);
  if (conditions) obj.condition = conditions;
  if (actions) obj.action = normalizeActionsFromHa(actions);

  return dumpOrchestratorYaml(obj);
}

/** 联动器 YAML → HA Config API JSON */
export function yamlToAutomationHaConfig(
  yamlStr: string,
  configId: string,
  name: string,
  enabled: boolean,
  runOnHa: boolean,
) {
  const parsed = parseOrchestratorYaml(yamlStr);
  if (!parsed) {
    throw new BusinessException(
      ErrorCode.VALIDATION_FAILED,
      API_ERROR.ORCHESTRATOR_YAML_PARSE_FAILED,
    );
  }

  const triggers = parsed.triggers ?? parsed.trigger ?? [];
  const conditions = parsed.conditions ?? parsed.condition ?? [];
  const actions = parsed.actions ?? parsed.action ?? [];

  return {
    id: configId,
    alias: String(parsed.alias || name),
    description: parsed.description ? String(parsed.description) : '',
    mode: String(parsed.mode || 'single'),
    triggers: normalizeTriggersForHa(triggers),
    conditions: Array.isArray(conditions) ? conditions : conditions ? [conditions] : [],
    actions: normalizeActionsForHa(actions),
    initial_state: enabled && runOnHa,
  };
}

/** HA Config → 联动器：trigger 键转为 platform */
function normalizeTriggersFromHa(raw: unknown): unknown {
  return toItemList(raw).map((t) => {
    if (!t || typeof t !== 'object') return t;
    const tr = { ...(t as Record<string, unknown>) };
    if (tr.trigger && !tr.platform) tr.platform = tr.trigger;
    delete tr.trigger;
    return tr;
  });
}

/** 联动器 → HA Config API：platform 键转为 trigger（HA 2024.2+ 要求仅用 trigger） */
function normalizeTriggersForHa(raw: unknown): unknown[] {
  return toItemList(raw).map((t) => {
    if (!t || typeof t !== 'object') return t;
    const tr = { ...(t as Record<string, unknown>) };
    if (tr.platform && !tr.trigger) tr.trigger = tr.platform;
    delete tr.platform;
    return tr;
  });
}

/** 校验自动化 YAML 本地结构（要求包含 action/actions 与 trigger/triggers） */
export function validateAutomationYamlLocal(yamlStr: string): { valid: boolean; message: string } {
  const base = validateYamlParsable(yamlStr);
  if (!base.valid) return base;
  const parsed = parseOrchestratorYaml(yamlStr);
  const triggers = parsed?.triggers ?? parsed?.trigger;
  const actions = parsed?.actions ?? parsed?.action;
  if (!actions) return { valid: false, message: '缺少 action/actions' };
  if (!triggers) return { valid: false, message: '缺少 trigger/triggers' };
  return { valid: true, message: '结构校验通过' };
}

/** 包装为 HA check_config 可识别的 automation 块 */
export function wrapAutomationForHaCheck(yamlStr: string): string {
  const parsed = parseOrchestratorYaml(yamlStr);
  if (!parsed) return yamlStr;
  return dumpOrchestratorYaml({ automation: [parsed] });
}
