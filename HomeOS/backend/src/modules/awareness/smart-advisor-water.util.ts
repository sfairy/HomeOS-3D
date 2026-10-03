/**
 * @file smart-advisor-water.util.ts
 * @module awareness
 * @description 用水异常顾问工具：根据持续水流异常生成关阀建议（仅提示，不自动关阀）。
 * 依赖 `mainValveEntityId` 配置项与异常类型 `continuous_flow` 判断逻辑。
 */

/** 用水阀门顾问建议结构 */
interface WaterValveAdvisorTip {
  /** 建议标题（用于前端展示） */
  title: string;
  /** 建议正文（用于前端展示） */
  message: string;
  /** 建议类别，固定为 'water' */
  category: 'water';
}

/**
 * 持续用水异常时生成关阀建议（不自动关阀，仅顾问提示）。
 *
 * 触发条件：
 * - 异常类型为 `continuous_flow`（持续水流）。
 * - 主水阀实体 ID 存在且包含域分隔符 `.`（即形如 `valve.xxx`）。
 *
 * @param mainValveEntityId 主水阀实体 ID（来自 water.mainValveEntityId 配置）。
 * @param friendlyName 触发异常设备的友好名称，用于在提示文案中指代。
 * @param anomalyType 异常类型字符串，仅 `continuous_flow` 会触发建议。
 * @returns 满足条件时返回 `WaterValveAdvisorTip`，否则返回 `null`。
 */
export function buildWaterValveAdvisorTip(
  mainValveEntityId: string | undefined,
  friendlyName: string,
  anomalyType: string | undefined,
): WaterValveAdvisorTip | null {
  const valve = mainValveEntityId?.trim();
  if (anomalyType !== 'continuous_flow' || !valve?.includes('.')) return null;
  return {
    title: '用水异常 · 关阀建议',
    message: `${friendlyName} 持续水流，建议检查并关闭总水阀 ${valve}（请在 HA 或阀门控制中手动关闭）`,
    category: 'water',
  };
}