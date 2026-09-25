/**
 * 开发开关与调试日志：默认静默，只在显式打开开发开关时输出。
 *
 * 把「这条诊断信息该不该出现在生产控制台」收敛到一处判断——此前散在各分支的 console.* 多数
 * 已走过 HABridgeLog 上报，同一条错误会在生产页面上出现两遍且关不掉。开关只看地址栏
 * `?debug=1`（`true` 同义），不落 localStorage：这是跟着一次会话走的临时诊断。
 *
 * 另有一条并列的开关 `?performance-diagnostics=1`：它专给首屏分段耗时埋点用（3D 加载链的
 * `[3D-load]`）。两者都只是「把本地诊断打开」，输出出口同为 debugLog，因此这里让 debugLog
 * 同时认这两个参数，而不是让埋点模块自己再开一条 console 通道。
 */

/** 打开开发开关的查询参数名。 */
const FRONTEND_DEBUG_QUERY_PARAM = "debug";

/** 被当作「已打开」的取值：只认显式的 1 / true，避免 `?debug=0` 反被当成打开。 */
const FRONTEND_DEBUG_QUERY_VALUES = new Set(["1", "true"]);

/**
 * 判断当前是否处于开发（诊断）模式。
 */
function isFrontendDebugMode(locationObject = globalThis.location) {
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
 *
 * 与 `isFrontendDebugMode` 是「或」的关系：`?debug=1` 一并打开它（要看分段就得先能看日志），
 * 而 `?performance-diagnostics=1` 可以在不打开其余调试输出的前提下单独开它。
 * 只认 `1`：`?performance-diagnostics=0` 不该被当成打开。
 */
export function isFrontendPerformanceDiagnosticsEnabled(locationObject = globalThis.location) {
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
export function debugLog(debugLevel, ...debugArguments) {
  if (!isFrontendDebugMode() && !isFrontendPerformanceDiagnosticsEnabled()) {
    return;
  }
  const consoleObject = globalThis.console;
  const logMethod = consoleObject?.[debugLevel];
  if (typeof logMethod === "function") {
    logMethod.apply(consoleObject, debugArguments);
  }
}
