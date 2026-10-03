/**
 * 语音告警（TTS）规则与播报模板工具。
 *
 * 所属模块：common/alert-support。
 * 职责：
 *   - 从 @homeos/shared 透出语音告警规则类型、默认规则、目录与归一化函数。
 *   - 提供安防告警、自定义实体告警、通知告警的规则匹配与 TTS 文案生成。
 *   - 支持模板变量替换（{{key}} 语法），让用户自定义播报内容。
 * 关键依赖：@homeos/shared（VoiceAlertRules / DEFAULT_VOICE_ALERT_RULES 等）。
 */

/** 语音告警（TTS）规则 — 控制哪些事件触发音箱播报 */

import {
  type VoiceAlertRules,
  type CustomTtsAlertRule,
  type EntityTtsAlertRule,
  DEFAULT_VOICE_ALERT_RULES,
  VOICE_ALERT_CATALOG,
  DEFAULT_DAILY_ADVISOR_TTS_DAYTIME,
  DEFAULT_DAILY_ADVISOR_TTS_EVENING,
  resolveVoiceAlertRules,
  normalizeWakeWords,
  normalizeCustomTtsAlerts,
  normalizeEntityTtsAlerts,
  matchEntityTtsAlert,
} from '@homeos/shared';

// 透出 @homeos/shared 中的类型与工具，供后端各模块统一引用
export type { VoiceAlertRules, CustomTtsAlertRule, EntityTtsAlertRule };
export {
  DEFAULT_VOICE_ALERT_RULES,
  VOICE_ALERT_CATALOG,
  resolveVoiceAlertRules,
  normalizeWakeWords,
  normalizeCustomTtsAlerts,
  normalizeEntityTtsAlerts,
  matchEntityTtsAlert,
};

/**
 * 安防告警事件载荷。
 * 由安防模块在触发 alarm 时构造，用于匹配告警规则并生成 TTS 文案。
 */
interface SecurityAlarmPayload {
  /** 设备友好名称（如"客厅烟雾传感器"） */
  friendlyName?: string;
  /** 触发区域名称（如"客厅、卧室"），存在则视为分区告警 */
  zoneNames?: string;
  /** 原始告警消息，若提供则优先直接播报 */
  message?: string;
  /** 告警类型：smoke / gas_leak / water_leak 等 */
  type?: string;
  /** 触发告警的实体 ID */
  entityId?: string;
  /** 告警级别 */
  level?: string;
}

/**
 * 判断 security.alarm 应匹配哪条规则
 *
 * @param data 安防告警载荷
 * @returns 匹配到的规则键（如 'safetySmoke'），无法匹配时返回 null
 *
 * 匹配优先级：
 * 1. type=smoke → 烟雾安全告警
 * 2. type=gas_leak → 燃气泄漏安全告警
 * 3. type=water_leak → 漏水安全告警
 * 4. 有 message 但无 zone → 安防异常
 * 5. 有 zone / friendlyName / entityId → 分区安防告警
 */
/** 判断 security.alarm 应匹配哪条规则 */
export function securityAlarmRuleKey(data: SecurityAlarmPayload): VoiceAlertRuleKey | null {
  if (data.type === 'smoke') return 'safetySmoke';
  if (data.type === 'gas_leak') return 'safetyGas';
  if (data.type === 'water_leak') return 'safetyWater';
  if (data.message && !data.zoneNames) return 'securityAnomaly';
  if (data.zoneNames || data.friendlyName || data.entityId) return 'securityZone';
  return null;
}

/**
 * 判断指定告警规则是否启用。
 *
 * @param rules 语音告警规则集合
 * @param key 规则键
 * @returns true=规则已启用；若全局 enabled=false 则一律返回 false
 */
export function isVoiceAlertEnabled(rules: VoiceAlertRules, key: keyof VoiceAlertRules): boolean {
  // 全局开关关闭时，所有子规则一律视为关闭
  if (!rules.enabled) return false;
  if (key === 'enabled') return rules.enabled;
  return !!rules[key];
}

/** 语音告警规则键：排除全局 enabled 开关后的所有具体规则名 */
export type VoiceAlertRuleKey = Exclude<keyof VoiceAlertRules, 'enabled'>;

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
 * 解析告警播报文案：优先使用自定义模板，回退到默认消息。
 *
 * @param key 规则键，用于从 templates 中取自定义模板
 * @param defaultMsg 默认播报文案
 * @param templates 用户自定义模板集合
 * @param vars 模板变量
 * @returns 最终播报文案
 */
export function resolveAlertSpeech(
  key: VoiceAlertRuleKey,
  defaultMsg: string,
  templates: VoiceAlertTemplates | undefined,
  vars?: Record<string, string | number | undefined | null>,
): string {
  const custom = templates?.[key];
  // 自定义模板非空时使用模板并替换变量，否则回退默认文案
  if (custom?.trim()) return applyAlertTemplate(custom, vars || {});
  return defaultMsg;
}
/**
 * 构建安防告警 TTS 文案。
 *
 * @param data 安防告警载荷
 * @param template 可选的自定义模板；提供时优先使用
 * @returns 播报文案；无法生成有意义内容时返回 null
 *
 * 优先级：
 * 1. 自定义模板 → 替换变量
 * 2. 原始 message → 直接播报
 * 3. 按 type 分支生成中文文案（烟雾 / 燃气 / 漏水 / 分区 / 通用）
 */
export function buildSecurityAlarmSpeech(
  data: SecurityAlarmPayload,
  template?: string,
): string | null {
  const vars = {
    name: data.friendlyName || data.entityId || '未知设备',
    entity_id: data.entityId || '',
    friendly_name: data.friendlyName || '',
    zones: data.zoneNames || '',
    message: data.message || '',
    type: data.type || '',
  };
  // 1. 自定义模板优先
  if (template?.trim()) return applyAlertTemplate(template, vars);
  // 2. 原始消息次之
  if (data.message?.trim()) return data.message.trim();
  // 3. 按 type 分支生成默认文案
  const name = vars.name as string;
  const zones = data.zoneNames || '';
  if (data.type === 'smoke') return `烟雾告警：${name} 检测到烟雾，请立即检查`;
  if (data.type === 'gas_leak') return `燃气泄漏告警：${name}，请立即通风并检查燃气阀`;
  if (data.type === 'water_leak') return `漏水告警：${name}，水阀已尝试自动关闭`;
  if (zones) return `安防告警：${name} 触发了 ${zones}`;
  if (data.friendlyName || data.entityId) return `安防告警：${name} 触发告警`;
  return null;
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

/**
 * 判断自定义通知告警是否匹配。
 *
 * @param data 通知数据（level / message / source）
 * @param rule 自定义 TTS 告警规则
 * @returns true=匹配，应触发播报
 *
 * 匹配条件：
 * 1. 规则已启用且 trigger=notification
 * 2. notificationLevel 设定时，level 须匹配
 * 3. messageContains 设定时，message 须包含该子串
 * 4. sourceContains 设定时，source 须包含该子串
 * 5. 三项条件至少设了一项，否则视为无过滤条件、不匹配
 */
export function matchCustomNotificationAlert(
  data: { level?: string; message?: string; source?: string },
  rule: CustomTtsAlertRule,
): boolean {
  if (!rule.enabled || rule.trigger !== 'notification') return false;
  if (rule.notificationLevel && data.level !== rule.notificationLevel) return false;
  const msgNeedle = rule.messageContains?.trim();
  if (msgNeedle && !String(data.message || '').includes(msgNeedle)) return false;
  const srcNeedle = rule.sourceContains?.trim();
  if (srcNeedle && !String(data.source || '').includes(srcNeedle)) return false;
  // 三项过滤条件全空时不触发，避免"匹配一切"的规则误触
  if (!msgNeedle && !srcNeedle && !rule.notificationLevel) return false;
  return true;
}

/**
 * 每日顾问问候 TTS（20 点及以后用晚间模板，否则用白天模板）
 *
 * @param hour 当前小时（0–23）
 * @param templates 可选的自定义白天 / 晚间模板
 * @returns 最终播报文案
 *
 * 优先使用用户自定义模板，为空时回退到 DEFAULT_DAILY_ADVISOR_TTS_DAYTIME / EVENING。
 */
export function resolveDailyAdvisorTts(
  hour: number,
  templates?: { daytime?: string; evening?: string },
): string {
  // 20 点起视为晚间
  const isEvening = hour >= 20;
  const custom = isEvening ? templates?.evening : templates?.daytime;
  const fallback = isEvening
    ? DEFAULT_DAILY_ADVISOR_TTS_EVENING
    : DEFAULT_DAILY_ADVISOR_TTS_DAYTIME;
  const raw = String(custom || '').trim() || fallback;
  return applyAlertTemplate(raw, { hour });
}