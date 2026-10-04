/**
 * @file voice-alert-priority.ts
 * @module @homeos/shared/notification
 * @brief TTS / 告警播报优先级表与比较函数（前后端单一真相源）。
 *
 * 职责：
 *  - 维护告警 key → 优先级数值（数值越大越优先）；
 *  - 提供 compareVoiceAlertPriority 比较函数，供 tts-route 排序使用。
 *
 * 关键依赖：
 *  - voice-alert.ts 的 VoiceAlertRules key 与本表对齐（决定播报优先级）；
 *  - tts-route.util.ts 调用 compareVoiceAlertPriority 排序待播报告警。
 *
 * 约定：
 *  - 地震预警优先级最高（100），全员离家提示最低（10）；
 *  - 未在表中登记的 key 缺省按 0 处理（最低优先级）。
 */
/** TTS / 告警播报优先级（数值越大越优先） */
export const VOICE_ALERT_PRIORITY: Record<string, number> = {
  earthquake: 100,
  safetyGas: 90,
  safetySmoke: 88,
  safetyWater: 86,
  securityEmergency: 85,
  securityZone: 70,
  securityAnomaly: 65,
  notificationDanger: 60,
  doorbell: 55,
  notificationWarn: 40,
  energyAnomaly: 30,
  waterAnomaly: 28,
  energyBudget: 20,
  envMoldRisk: 15,
  presenceLeft: 10,
};

/**
 * 语音告警 key 的优先级比较函数（用于 Array.sort，数值越大越优先）。
 * 未在 VOICE_ALERT_PRIORITY 中登记的 key 按 0 处理（最低优先级），不会抛出异常。
 *
 * @param a 告警 key A（如 earthquake / safetyGas 等字符串）
 * @param b 告警 key B
 * @returns 正数 = A 优先级低于 B（应排在后面）；负数 = A 优先；0 = 同优先级（相对顺序保持稳定）
 */
export function compareVoiceAlertPriority(a: string, b: string): number {
  return (VOICE_ALERT_PRIORITY[b] ?? 0) - (VOICE_ALERT_PRIORITY[a] ?? 0);
}
