function isPerformanceDiagnosticsEnabled(host: typeof globalThis) {
  return new URLSearchParams(host.location?.search || '').get('performance-diagnostics') === '1'
}

export function createLoadTiming(scope: any, host = globalThis) {
  const isDiagnosticsEnabled = isPerformanceDiagnosticsEnabled(host)
  return (phase: any) => {
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

/** 宿主页（展示页 / 编辑器）侧的 3D 挂载阶段：与 display-boot 同用 `[display-load]` 前缀和时间轴。 */
export function hostLoadTiming(phase: string, host = globalThis) {
  if (!isPerformanceDiagnosticsEnabled(host)) return
  host.console.info(
    '[display-load]',
    JSON.stringify({
      phase: phase,
      at: Math.round(host.performance.now()),
    }),
  )
}
