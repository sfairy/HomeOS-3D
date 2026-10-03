/**
 * 脚本（script）域配置转换工具
 *
 * 原为 common/orchestrator/config.util.ts 的 script-config.util 段，现独立成文件。
 * 职责：
 * - HA Config API JSON ↔ 联动器/存储用 YAML 双向转换
 * - sequence 键归一化（fields 透传）
 * - 本地 YAML 结构校验与 check_config 包装
 */
import { API_ERROR } from '../../common/errors/api-error-messages';
import { normalizeSequenceForHa, normalizeSequenceFromHa } from './ha-sync.internals';
import {
  buildAliasModeYamlHeader,
  dumpOrchestratorYaml,
  parseOrchestratorYaml,
  validateYamlParsable,
} from './yaml.util';
import { BusinessException, ErrorCode } from '../../common/utils';

/** HA Config JSON → 联动器/存储用 YAML */
export function scriptHaConfigToYaml(config: Record<string, unknown>): string {
  const obj = buildAliasModeYamlHeader(config);
  if (config.fields) obj.fields = config.fields;
  if (config.sequence) obj.sequence = normalizeSequenceFromHa(config.sequence);
  return dumpOrchestratorYaml(obj);
}

/** 联动器 YAML → HA Config API JSON */
export function yamlToScriptHaConfig(yamlStr: string, configId: string, name: string) {
  const parsed = parseOrchestratorYaml(yamlStr);
  if (!parsed) {
    throw new BusinessException(ErrorCode.VALIDATION_FAILED, API_ERROR.SCRIPT_YAML_PARSE_FAILED);
  }
  const sequence = parsed.sequence ?? parsed.actions ?? [];
  const body: Record<string, unknown> = {
    id: configId,
    alias: String(parsed.alias || name),
    mode: String(parsed.mode || 'single'),
    sequence: normalizeSequenceForHa(sequence),
  };
  if (parsed.description) body.description = String(parsed.description);
  const fields = parsed.fields as Record<string, unknown> | undefined;
  if (fields && Object.keys(fields).length > 0) body.fields = fields;
  return body;
}

/** 校验脚本 YAML 配置（本地规则）。 */
export function validateScriptYamlLocal(yamlStr: string): { valid: boolean; message: string } {
  const base = validateYamlParsable(yamlStr);
  if (!base.valid) return base;
  const parsed = parseOrchestratorYaml(yamlStr);
  const sequence = parsed?.sequence ?? parsed?.actions;
  if (!sequence) return { valid: false, message: '缺少 sequence' };
  return { valid: true, message: '结构校验通过' };
}

/** 将脚本 YAML 包装为 HA check_config 可识别的 script 块 */
export function wrapScriptForHaCheck(yamlStr: string): string {
  const parsed = parseOrchestratorYaml(yamlStr);
  if (!parsed) return yamlStr;
  return dumpOrchestratorYaml({ script: { homeos_validate: parsed } });
}
