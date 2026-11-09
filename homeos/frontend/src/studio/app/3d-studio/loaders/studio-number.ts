/** 不依赖 three 的数值归一化；`studio-normalization` 原样再导出。 */
export function finite(candidateValue: unknown, fallbackValue = 0) {
  const numericValue = Number(candidateValue)
  return Number.isFinite(numericValue) ? numericValue : fallbackValue
}
export function normalizeFullRotation(angleDeg: unknown, fallbackAngleDeg = 0) {
  const normalizedAngleDeg = finite(angleDeg, fallbackAngleDeg)
  return normalizedAngleDeg >= 0 && normalizedAngleDeg <= 360
    ? normalizedAngleDeg
    : ((normalizedAngleDeg % 360) + 360) % 360
}
