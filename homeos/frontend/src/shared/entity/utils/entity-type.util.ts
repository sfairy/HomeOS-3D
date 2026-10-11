/**
 * 实体类型识别（生活账户：水 / 电 / 气 / 通讯）。
 */
/**
 * 判断是否为电力实体（entity_id 以 sensor.ele_ 开头）。
 */
export function isElectricityEntity(id: string | null | undefined): boolean {
  return !!id && id.startsWith('sensor.ele_')
}

/**
 * 判断是否为燃气实体（entity_id 以 sensor.gas_ 开头）。
 */
export function isGasEntity(id: string | null | undefined): boolean {
  return !!id && id.startsWith('sensor.gas_')
}

/**
 * 判断是否为水务实体（entity_id 以 sensor.water_ 开头）。
 */
export function isWaterEntity(id: string | null | undefined): boolean {
  return !!id && id.startsWith('sensor.water_')
}

/**
 * 判断是否为通讯实体（entity_id 以 sensor.ct_/sensor.cu_ 开头）。
 */
export function isCommEntity(id: string | null | undefined): boolean {
  return !!id && (id.startsWith('sensor.ct_') || id.startsWith('sensor.cu_'))
}

/**
 * 判断是否为公用事业实体（电力/燃气/水务/通讯任一）。
 */
export function isUtilityEntity(id: string | null | undefined): boolean {
  return isElectricityEntity(id) || isGasEntity(id) || isWaterEntity(id) || isCommEntity(id)
}
