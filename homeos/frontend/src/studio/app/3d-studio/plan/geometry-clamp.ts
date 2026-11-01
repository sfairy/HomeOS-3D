/**
 * 几何层的数值夹取总闸。
 *
 * **必须挡住非有限值**：``slidingDoorPanelCenters``、``segmentIntersection``、
 * ``sampleTransitionProgress`` 等都过它。旧实现只有 ``Math.min/max``，上游任一算式产生
 * ``NaN``（旧草稿缺字段、``Number("")``、``0/0``）都会原样透传，最终写进
 * ``mesh.position`` / ``scale`` —— three.js 生成 NaN 矩阵，整件家具**静默消失**且没有
 * 任何报错。非有限值一律落到下界。
 */
export function clamp(rawValue: unknown, minValue: number, maxValue: number): number {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return minValue;
  return Math.min(maxValue, Math.max(minValue, value));
}
