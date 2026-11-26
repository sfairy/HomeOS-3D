/**
 * 3D 生命周期诊断的计数白名单与清洗。
 *
 * 这些计数来自舞台 iframe 回的遥测（性能采样 / 分类过渡诊断 / 重载面包屑），字段名与取值
 * 都不受控：缺字段是常态，NaN / Infinity / 负数混进上报就会让「慢帧」判定变成假阳性。
 * 规则固定为「只认白名单字段、数值夹到 [0, 1e9]」，其余一律丢弃。
 *
 * 单独成文件的原因：`runtime/core/runtime.ts` 是数千行的编排宿主，纯函数留在里面既无法
 * 单测，也会被后续「再加一行」继续堆高。
 */

/** 允许透传的数值计数白名单（不在表里的一律丢弃）。 */
export const NUMERIC_COUNT_FIELDS = [
  'loadSequence',
  'frameLoads',
  'sourceRevision',
  'floorCount',
  'durationMs',
  'pending',
  'active',
  'queued',
  'replacementFrames',
  'width',
  'height',
  'dpr',
  'fromCategory',
  'toCategory',
  'geometries',
  'textures',
  'programs',
  'mapPixels',
  'mapTextures',
] as const

/** 允许透传的布尔计数白名单。 */
const BOOLEAN_COUNT_FIELDS = ['replacementPending', 'persisted'] as const

/** 计数上界：再大就是采样 bug，不是真实帧数。 */
const MAX_COUNT = 1_000_000_000

/**
 * 清洗一批诊断计数。
 * @param rawCounts 舞台回传的原始计数（可能缺字段或含非数字）
 * @returns 只含白名单字段的新对象
 */
export function sanitizeCounts(rawCounts: Record<string, unknown> = {}) {
  const sanitizedCounts: Record<string, number | boolean> = {}
  for (const numericField of NUMERIC_COUNT_FIELDS) {
    const value = rawCounts?.[numericField]
    typeof value == 'number' &&
      Number.isFinite(value) &&
      (sanitizedCounts[numericField] = Math.max(0, Math.min(MAX_COUNT, value)))
  }
  for (const booleanField of BOOLEAN_COUNT_FIELDS) {
    const value = rawCounts?.[booleanField]
    typeof value == 'boolean' && (sanitizedCounts[booleanField] = value)
  }
  return sanitizedCounts
}
