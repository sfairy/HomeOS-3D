/** - 维护告警 key → 优先级数值（数值越大越优先）； */
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
