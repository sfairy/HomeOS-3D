/**
 * 语音告警（TTS）规则与播报模板工具。
 *
 * 职责：
 *   - 从 @homeos/shared 透出语音告警规则类型、默认规则、目录与归一化函数。
 *   - 提供播报模板变量替换（{{key}} 语法），让用户自定义播报内容。
 * 关键依赖：@homeos/shared（VoiceAlertRules / DEFAULT_VOICE_ALERT_RULES 等）。
 */

/** 语音告警（TTS）规则 — 控制哪些事件触发音箱播报 */

import {
  type VoiceAlertRules,
  type CustomTtsAlertRule,
  type EntityTtsAlertRule,
  DEFAULT_VOICE_ALERT_RULES,
  VOICE_ALERT_CATALOG,
  resolveVoiceAlertRules,
  normalizeWakeWords,
  matchEntityTtsAlert,
} from '@homeos/shared';

// 透出 @homeos/shared 中的类型与工具，供后端各模块统一引用
export type { VoiceAlertRules, CustomTtsAlertRule, EntityTtsAlertRule };
export {
  DEFAULT_VOICE_ALERT_RULES,
  VOICE_ALERT_CATALOG,
  resolveVoiceAlertRules,
  normalizeWakeWords,
  matchEntityTtsAlert,
};

/** 语音告警规则键：排除全局 enabled 开关后的所有具体规则名 */
type VoiceAlertRuleKey = Exclude<keyof VoiceAlertRules, 'enabled'>;

/** 内置告警规则的自定义播报模板（支持 {{name}} {{entity_id}} {{message}} {{zones}} 等） */
export type VoiceAlertTemplates = Partial<Record<VoiceAlertRuleKey, string>>;

/**
 * 替换模板变量 {{key}}。
 *
 * @param template 包含 {{key}} 占位符的模板字符串
 * @param vars 变量映射；值为 null/undefined 时替换为空串
 * @returns 替换并 trim 后的字符串
 *
 * 正则匹配 {{ word }} 形式，允许占位符前后有空白（如 {{ name }}）。
 */
export function applyAlertTemplate(
  template: string,
  vars: Record<string, string | number | undefined | null>,
): string {
  return String(template)
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
      const v = vars[key];
      // null / undefined 替换为空串，避免输出 "undefined"
      return v == null ? '' : String(v);
    })
    .trim();
}

/**
 * 判断自定义实体状态告警是否匹配。
 *
 * @param entityId 实体 ID
 * @param newState 新状态
 * @param oldState 旧状态
 * @param rule 自定义 TTS 告警规则
 * @returns true=匹配，应触发播报
 *
 * 匹配条件（全部满足）：
 * 1. 规则已启用且 trigger=entity_state
 * 2. entityMatch 非空，且 entityId 以其为前缀或完全相等
 * 3. stateTo 未设或 newState 等于 stateTo
 * 4. 状态确实发生变化（oldState !== newState）
 */
export function matchCustomEntityAlert(
  entityId: string,
  newState: string,
  oldState: string | undefined,
  rule: CustomTtsAlertRule,
): boolean {
  if (!rule.enabled || rule.trigger !== 'entity_state') return false;
  const match = rule.entityMatch?.trim();
  if (!match) return false;
  // 前缀匹配或精确匹配
  if (!entityId.startsWith(match) && entityId !== match) return false;
  const target = rule.stateTo?.trim();
  if (target && newState !== target) return false;
  // 状态未变化则不告警
  if (oldState === newState) return false;
  return true;
}
