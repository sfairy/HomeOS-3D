/**
 * @module comm-carrier.util
 * @description 通信运营商类别工具模块。
 *
 * 职责：
 * - 定义通信运营商类别类型（电信 / 联通）。
 * - 提供运营商的中文展示文案与短标签映射。
 * - 根据 entity_id 推断所属运营商。
 *
 * 依赖：与 energySources 键保持一致，供能源模块按运营商分组展示使用。
 */

/**
 * 通信运营商类别（与 energySources 键一致）
 *
 * 取值含义：
 * - ct：中国电信
 * - cu：中国联通
 */
export type CommCarrier = 'ct' | 'cu'

/**
 * 运营商中文展示文案映射表。
 * 用于在 UI 上将运营商代码翻译为用户可读的中文名称。
 */
export const COMM_CARRIER_LABELS: Record<CommCarrier, string> = {
  ct: '电信',
  cu: '联通',
}

/**
 * 运营商短标签映射表。
 * 用于在空间受限的徽标 / 角标中展示运营商英文缩写。
 */
export const COMM_CARRIER_BADGES: Record<CommCarrier, string> = {
  ct: 'CT',
  cu: 'CU',
}

/**
 * 根据 entity_id 推断所属通信运营商。
 *
 * 推断规则（基于 entity_id 前缀）：
 * - `sensor.cu_` 前缀 → 联通
 * - 其余（包括 `sensor.ct_` 及无法识别的情况）→ 电信（默认值）
 *
 * @param entityId HA 实体 ID，可能为 null / undefined。
 * @returns 推断出的运营商类别；无法识别时回退为电信（ct）。
 */
export function resolveCommCarrierFromEntityId(entityId: string | null | undefined): CommCarrier {
  const id = String(entityId || '')
  if (id.startsWith('sensor.cu_')) return 'cu'
  return 'ct'
}
