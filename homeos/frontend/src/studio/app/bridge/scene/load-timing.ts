/**
 * 舞台启动的分阶段计时器。
 *
 * 两个出口，各有各的读者：
 * - `performance.mark`：**无条件**打点。mark 只是往一条环形缓冲里塞一条记录（微秒级），
 *   20 来个阶段的开销可以忽略；它让线上用户的时间线也能用 DevTools / CDP 的
 *   `performance.getEntriesByType('mark')` 读出来，而不是只有开了诊断参数才留痕。
 * - `console.info('[3D-load]', ...)`：**只在** `?performance-diagnostics=1` 时打印。
 *   这是 `ops/perf/harness/bench_3d.mjs` 的采集口径（CDP 收 console），保持原样不动，
 *   否则历史基线的解析规则会一起失效。
 *
 * 打点失败一律吞掉：`performance.mark` 在极端裁剪的 WebView 上可能不存在，
 * 而「计时器把自己抛崩」会让整个舞台启动失败 —— 观测手段不能成为故障源。
 */

/** 供 CDP / DevTools 过滤的 mark 名前缀（`homeos:3d:stage:<phase>`）。 */
const MARK_PREFIX = 'homeos:3d'

function markPhase(host: any, scope: string, phase: string) {
  try {
    host.performance?.mark?.(`${MARK_PREFIX}:${scope}:${phase}`)
  } catch {
    /* 观测用打点失败不影响启动 */
  }
}

export function createLoadTiming(scope: string, host: any = globalThis) {
  const isDiagnosticsEnabled = new URLSearchParams(host.location?.search || '').get('performance-diagnostics') === '1'
  return (phase: string) => {
    markPhase(host, scope, phase)
    if (!isDiagnosticsEnabled) return
    const timestampMs = Math.round(host.performance.now())
    host.console.info(
      '[3D-load]',
      JSON.stringify({
        scope: scope,
        phase: phase,
        at: timestampMs,
      }),
    )
  }
}
