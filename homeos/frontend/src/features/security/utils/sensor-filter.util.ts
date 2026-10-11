/** 安防传感器噪音过滤模块。 */

/** 排除抄表/计价等公用事业类实体，避免误入安防传感器列表 */
const UTILITY_NOISE_KEYS = [
  '抄表',
  '单价',
  '计价',
  '阶梯',
  '系数',
  '余额',
  '读数',
  '用量',
  '流量',
  'meter_read',
  'tariff',
  'billing',
  'tier_step',
  'gas_price',
  'unit_price',
  'current_read',
  'gas_meter',
  'utility',
  'consumption',
  'volume_total',
]

/**
 * 判定实体是否为公用事业类噪音（抄表/计价等）。
 *
 * 将 entity_id 与 friendly_name 拼接后小写化，匹配任一噪音关键词即判定为噪音。
 *
 * @param entityId 实体 ID
 * @param friendlyName 实体友好名称（可选）
 * @returns true 表示该实体应被排除出安防传感器列表
 */
export function isSecurityUtilityNoise(entityId: string, friendlyName = '') {
  const hay = `${entityId} ${friendlyName}`.toLowerCase()
  return UTILITY_NOISE_KEYS.some((k) => hay.includes(k.toLowerCase()))
}