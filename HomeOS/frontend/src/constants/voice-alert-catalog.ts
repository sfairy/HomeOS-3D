/**
 * 语音播报警报目录与工厂
 *
 * 职责：
 * - 转发 @homeos/shared 中的语音播报警报常量与规范化函数。
 * - 提供语音播报配置页所需的分组标签、规则目录、每日播报模板等访问入口。
 * - 提供唤醒词文本解析、自定义 / 实体 TTS 警报规则构造工厂。
 * - 提供实体播报快捷域筛选列表，用于 EntityInput 的 domain 过滤。
 *
 * 依赖：@homeos/shared 中的语音播报警报基础常量与工具函数。
 */
import {
  DEFAULT_VOICE_ALERT_RULES,
  VOICE_ALERT_CATALOG,
  VOICE_ALERT_GROUP_LABELS,
  DEFAULT_DAILY_ADVISOR_TTS_DAYTIME,
  DEFAULT_DAILY_ADVISOR_TTS_EVENING,
  mergeVoiceAlertRules,
  normalizeWakeWords,
  normalizeCustomTtsAlerts,
  normalizeEntityTtsAlerts,
} from '@homeos/shared'
export {
  DEFAULT_VOICE_ALERT_RULES,
  mergeVoiceAlertRules,
  normalizeWakeWords,
  normalizeCustomTtsAlerts,
  normalizeEntityTtsAlerts,
}
/**
 * 获取语音播报警报分组标签表的浅拷贝。
 *
 * @returns 分组 key → 中文分组标签的对象（浅拷贝，避免外部修改内部常量）。
 */
export function getVoiceAlertGroups() {
  return { ...VOICE_ALERT_GROUP_LABELS }
}
/**
 * 获取语音播报警报规则目录（引用，只读使用）。
 *
 * @returns 语音播报警报目录对象，包含可配置的规则项定义。
 */
export function getVoiceAlertCatalog() {
  return VOICE_ALERT_CATALOG
}
/**
 * 获取默认的「白天每日播报」TTS 模板。
 *
 * @returns 默认白天每日播报配置对象（引用）。
 */
export function getDefaultDailyAdvisorTtsDaytime() {
  return DEFAULT_DAILY_ADVISOR_TTS_DAYTIME
}
/**
 * 获取默认的「傍晚每日播报」TTS 模板。
 *
 * @returns 默认傍晚每日播报配置对象（引用）。
 */
export function getDefaultDailyAdvisorTtsEvening() {
  return DEFAULT_DAILY_ADVISOR_TTS_EVENING
}
/**
 * 把唤醒词文本解析为去重后的唤醒词数组。
 *
 * 按中英文逗号分隔、去除首尾空白、过滤空串，并去重。
 *
 * @param text - 用户输入的唤醒词文本，可包含中英文逗号分隔的多个词。
 * @returns 去重后的唤醒词字符串数组（保持插入顺序）。
 */
export function parseWakeWordsText(text: string | null | undefined) {
  return [
    ...new Set(
      String(text || '')
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ]
}
/**
 * 创建一条新的自定义 TTS 警报规则（用于 UI 新增按钮）。
 *
 * @returns 默认启用的自定义 TTS 警报规则对象，id 基于时间戳生成。
 */
export function newCustomTtsAlert() {
  return {
    id: `custom_${Date.now()}`,
    label: '自定义规则',
    enabled: true,
    trigger: 'notification',
    entityMatch: '',
    stateTo: '',
    notificationLevel: '',
    messageContains: '',
    sourceContains: '',
    messageTemplate: '{{message}}',
  }
}
/**
 * 创建一条新的实体 TTS 警报规则（按实体 state 变化触发播报）。
 *
 * @param entityId - 关联的 HA 实体 ID（如 `binary_sensor.door`）；默认空字符串。
 * @returns 默认启用的实体 TTS 警报规则对象，触发条件为 state 变为 `on`。
 */
export function newEntityTtsAlert(entityId: string = '') {
  return {
    id: `entity_tts_${Date.now()}`,
    entityId: String(entityId || '').trim(),
    enabled: true,
    stateTo: 'on',
    messageTemplate: '{{name}} 已触发',
  }
}
/** 实体播报快捷筛选（EntityInput domain 过滤） */
export function getEntityTtsQuickDomains() {
  return [
    { id: 'binary_sensor', label: '门磁/人体', emoji: '🚪' },
    { id: 'sensor', label: '传感器', emoji: '📡' },
    { id: 'switch', label: '开关', emoji: '🔌' },
    { id: 'button', label: '按钮', emoji: '🔘' },
    { id: 'lock', label: '门锁', emoji: '🔐' },
    { id: 'cover', label: '窗帘', emoji: '🪟' },
  ]
}
