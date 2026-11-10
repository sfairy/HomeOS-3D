/**
 * 宿主页 → 舞台 iframe 透传的 URL 开关白名单。
 *
 * 舞台 URL 由宿主重新拼装，未列入白名单的查询参数不会到达 iframe；
 * 诊断开关与运行时回退开关（A/B 对比用）都必须登记在这里，值也按白名单收窄。
 */

const FORWARDED_STAGE_FLAGS: ReadonlyArray<readonly [name: string, allowed: readonly string[]]> = [
  ['furniture-runtime', ['compact']],
  ['reflection-detail', ['low']],
  // 回退开关：计划 0.9 移除。
  ['texture-quality', ['legacy']],
  ['reflection-motion-resolution', ['cap']],
  ['marker-position', ['legacy']],
  ['dpr-cap', ['legacy', '1.5', '1.6', '2']],
  ['max-fps', ['90', '120']],
]

const DIAGNOSTIC_STAGE_FLAGS: ReadonlyArray<readonly [name: string, allowed: readonly string[]]> = [
  ['reflection-work', ['baseline']],
]

/** 从宿主页查询串挑出允许透传给舞台的开关；诊断子开关仅在 `performance-diagnostics=1` 时透传。 */
export function forwardedStageFlags(pageQuery: URLSearchParams): Record<string, string> {
  const forwarded: Record<string, string> = {}
  const pick = (flags: typeof FORWARDED_STAGE_FLAGS) => {
    for (const [name, allowed] of flags) {
      const value = pageQuery.get(name)
      if (value !== null && allowed.includes(value)) forwarded[name] = value
    }
  }
  pick(FORWARDED_STAGE_FLAGS)
  if (pageQuery.get('performance-diagnostics') === '1') {
    forwarded['performance-diagnostics'] = '1'
    pick(DIAGNOSTIC_STAGE_FLAGS)
  }
  return forwarded
}
