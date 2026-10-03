/**
 * 所属模块：backend/modules/automation
 * 职责：
 *  - 自动化规则指纹去重检测+合并建议；
 * 关键依赖：
 *  - rule-index.util；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { parseAutomationYamlCore, type AutomationRuleCore } from '@homeos/shared';
import type { AutomationRule } from './yaml-parse.util';

/** 用于签名计算的最小规则形状 */
type SignatureSource = Pick<AutomationRule, 'mode' | 'triggers' | 'conditions' | 'actions'>;

interface AutomationDuplicateHit {
  id: string;
  name: string;
}

/** 递归稳定序列化：对象键按字典序排序，保证顺序无关等价 */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** 计算规则语义签名：mode + triggers + conditions + actions */
export function computeAutomationSignature(rule: SignatureSource): string {
  return stableStringify({
    mode: rule.mode ?? 'single',
    triggers: rule.triggers ?? [],
    conditions: rule.conditions ?? [],
    actions: rule.actions ?? [],
  });
}

/** 由 YAML 草稿解析并计算签名；解析失败返回 null */
export function computeSignatureFromYaml(
  yaml: string,
  warn?: (message: string) => void,
): string | null {
  const parsed = parseAutomationYamlCore(yaml, '查重', warn);
  if (!parsed) return null;
  return computeAutomationSignature(parsed.core as AutomationRuleCore);
}

/** 在现有规则中查找与目标签名重复的规则（排除 excludeId 自身） */
export function findAutomationDuplicates(
  rules: AutomationRule[],
  targetSignature: string,
  excludeId?: string,
): AutomationDuplicateHit[] {
  const hits: AutomationDuplicateHit[] = [];
  const seen = new Set<string>();
  for (const rule of rules) {
    if (excludeId && rule.id === excludeId) continue;
    if (seen.has(rule.id)) continue;
    if (computeAutomationSignature(rule) !== targetSignature) continue;
    seen.add(rule.id);
    hits.push({ id: rule.id, name: rule.name });
  }
  return hits;
}
