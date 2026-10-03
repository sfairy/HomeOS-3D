/**
 * 所属模块：backend/common/utils
 * 职责：
 *  - 功率类实体识别（能源异常检测与智能基线共用同一判定口径）；
 * 关键依赖：
 *  - 无外部依赖，纯函数；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

/** 功率实体 ID 关键字（小写匹配） */
const POWER_ID_KEYWORDS = ['power', 'watt', '用电', '功耗'] as const;

/**
 * 判断实体是否为功率传感器。
 *
 * 判定口径（两处调用方必须一致，否则能源异常与智能基线会出现漏判/误判）：
 * 1. `sensor.` 域且 ID 含 power / watt / 用电 / 功耗；
 * 2. 任意域但 ID 含 `_power` / `_wattage` 后缀语义。
 *
 * @param entityId HA 实体 ID
 * @returns 是否为功率传感器
 */
export function isPowerSensor(entityId: string): boolean {
  const id = String(entityId ?? '').toLowerCase();
  if (!id) return false;
  if (id.startsWith('sensor.') && POWER_ID_KEYWORDS.some((kw) => id.includes(kw))) {
    return true;
  }
  return id.includes('_power') || id.includes('_wattage');
}
