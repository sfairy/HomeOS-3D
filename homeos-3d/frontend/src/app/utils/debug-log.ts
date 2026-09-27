/**
 * 开发开关与调试日志：默认静默，只在显式打开开发开关时输出。
 */

/** 打开开发开关的查询参数名。 */
const FRONTEND_DEBUG_QUERY_PARAM = "debug";

const FRONTEND_DEBUG_QUERY_VALUES = new Set(["1", "true"]);

type LocationLike = {
  search?: unknown;
};

/**
 * 判断当前是否处于开发（诊断）模式。
 */
export function isFrontendDebugMode(locationObject: LocationLike = globalThis.location): boolean {
  try {
    const debugSearch = String(locationObject?.search || "");
    if (!debugSearch) {
      return false;
    }
    return FRONTEND_DEBUG_QUERY_VALUES.has(
      new URLSearchParams(debugSearch).get(FRONTEND_DEBUG_QUERY_PARAM) || ""
    );
  } catch {
    // 开关自己不该成为故障源：畸形输入（例如 search 被换成非字符串对象）按「没打开」处理。
    return false;
  }
}

/**
 * 判断当前是否打开了性能诊断埋点（`[3D-load]` 那类分段耗时）。
 */
export function isFrontendPerformanceDiagnosticsEnabled(
  locationObject: LocationLike = globalThis.location,
): boolean {
  if (isFrontendDebugMode(locationObject)) {
    return true;
  }
  try {
    const diagnosticsSearch = String(locationObject?.search || "");
    if (!diagnosticsSearch) {
      return false;
    }
    return new URLSearchParams(diagnosticsSearch).get("performance-diagnostics") === "1";
  } catch {
    return false;
  }
}

/**
 * 按级别输出调试日志；开关没打开时什么都不做。
 */
export function debugLog(debugLevel: string, ...debugArguments: unknown[]): void {
  if (!isFrontendDebugMode() && !isFrontendPerformanceDiagnosticsEnabled()) {
    return;
  }
  const consoleObject: unknown = globalThis.console;
  if (consoleObject === null || typeof consoleObject !== "object") {
    return;
  }
  const logMethod = (consoleObject as unknown as Record<string, unknown>)[debugLevel];
  if (typeof logMethod === "function") {
    (logMethod as (...args: unknown[]) => void).apply(consoleObject, debugArguments);
  }
}
