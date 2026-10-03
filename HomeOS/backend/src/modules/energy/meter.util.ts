/**
 * @file energy/meter.util.ts
 * @module backend/src/modules
 *
 * 主电表读数校验与归一化：仅接受累计电量（energy / kWh|Wh），
 * 拒绝功率、电流、电压等瞬时量，避免误把功率值当作累计电量累加。
 */

/** 将单位字符串归一化（小写 + 去空格），便于后续比较 */
function normalizeEnergyUnit(unit: unknown): string {
  return String(unit || '')
    .toLowerCase()
    .replace(/\s/g, '');
}

/** 是否为可差分累计的电量实体（非功率） */
export function isCumulativeEnergyMeter(attrs?: Record<string, unknown> | null): boolean {
  if (!attrs) return false;
  const dc = String(attrs.device_class || '').toLowerCase();
  const unit = normalizeEnergyUnit(attrs.unit_of_measurement);

  if (dc === 'power' || dc === 'current' || dc === 'voltage' || dc === 'apparent_power') {
    return false;
  }
  if (
    unit === 'w' ||
    unit === 'kw' ||
    unit === 'mw' ||
    unit === 'va' ||
    unit === 'kva' ||
    unit === 'a' ||
    unit === 'v'
  ) {
    return false;
  }

  if (dc === 'energy') return true;
  if (unit === 'kwh' || unit === 'wh' || unit === 'mwh') return true;
  return false;
}

/** 将读数统一为 kWh */
export function readingToKwh(value: number, attrs?: Record<string, unknown> | null): number {
  const unit = normalizeEnergyUnit(attrs?.unit_of_measurement);
  if (unit === 'wh') return value / 1000;
  if (unit === 'mwh') return value * 1000;
  return value;
}
