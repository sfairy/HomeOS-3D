export function createLoadTiming(scope: any, host = globalThis) {
  const isDiagnosticsEnabled =
    new URLSearchParams(host.location?.search || "").get("performance-diagnostics") === "1";
  return (phase: any) => {
    if (!isDiagnosticsEnabled) return;
    const timestampMs = Math.round(host.performance.now());
    host.console.info(
      "[3D-load]",
      JSON.stringify({
        scope: scope,
        phase: phase,
        at: timestampMs,
      }),
    );
  };
}
