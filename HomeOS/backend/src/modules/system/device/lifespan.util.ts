/**
 * 设备寿命健康分档工具
 *
 * 所属模块：system/device
 * 职责：将设备健康分（0-100）映射为 healthy/warning/critical 三档，
 *  并对一批健康分进行汇总计数，供寿命摘要与设备健康概览使用。
 */

/** 设备寿命健康档位：健康 / 警告 / 临界（需更换） */
type LifespanHealthBand = 'healthy' | 'warning' | 'critical';

/**
 * 按 AppConfig 阈值划分设备健康档位。
 *
 * 档位规则：
 *  - healthy：健康分 ≥ 80（固定上限，与告警阈值无关）；
 *  - warning：80 > 健康分 ≥ alertThreshold（处于告警线以上但仍需留意）；
 *  - critical：健康分 < alertThreshold（已达告警线，建议关注/更换）。
 *
 * @param healthScore 设备健康分（0-100）。
 * @param alertThreshold 告警阈值（来自 AppConfig，低于该值视为临界）。
 * @returns 健康档位。
 */
function classifyLifespanHealth(
  healthScore: number,
  alertThreshold: number,
): LifespanHealthBand {
  if (healthScore >= 80) return 'healthy';
  if (healthScore >= alertThreshold) return 'warning';
  return 'critical';
}

/**
 * 对一批健康分按档位汇总计数。
 *
 * @param scores 多台设备的健康分数组。
 * @param alertThreshold 告警阈值，用于划分 warning / critical。
 * @returns 各档位设备数量 { healthyCount, warningCount, criticalCount }。
 */
export function summarizeLifespanCounts(
  scores: number[],
  alertThreshold: number,
): { healthyCount: number; warningCount: number; criticalCount: number } {
  let healthyCount = 0;
  let warningCount = 0;
  let criticalCount = 0;
  for (const score of scores) {
    const band = classifyLifespanHealth(score, alertThreshold);
    if (band === 'healthy') healthyCount++;
    else if (band === 'warning') warningCount++;
    else criticalCount++;
  }
  return { healthyCount, warningCount, criticalCount };
}