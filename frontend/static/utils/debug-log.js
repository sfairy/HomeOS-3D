/**
 * 开发开关与调试日志：默认静默，只在显式打开开发开关时输出。
 *
 * 位置：`utils/` 下的纯工具，被渲染器与 3D 工作室的模块引用。
 * 职责：把「这条诊断信息该不该出现在生产控制台」收敛到**一处**判断。此前这些分支里
 *   散着 `console.*`，其中多数同时已经走过 `HABridgeLog` 上报 —— 同一条错误在生产
 *   页面上出现两遍，而且没有任何开关能关掉它；排查时又分不清哪一份是真现场。
 * 约定：开关只看地址栏查询串 `?debug=1`（`true` 同义），**不落 localStorage** ——
 *   这是跟着一次会话走的临时诊断，不该在用户的浏览器里留持久状态。
 *   `debugLog(级别, …)` 的参数与 `console` 一致，但开关没打开时什么都不做，
 *   因此可以放心留在生产代码里（它不再是一个「生产里也在响」的噪声源）。
 */

/** 打开开发开关的查询参数名。 */
export const FRONTEND_DEBUG_QUERY_PARAM = "debug";

/** 被当作「已打开」的取值：只认显式的 1 / true，避免 `?debug=0` 反被当成打开。 */
const FRONTEND_DEBUG_QUERY_VALUES = new Set(["1", "true"]);

/**
 * 判断当前是否处于开发（诊断）模式。
 */
export function isFrontendDebugMode(locationObject = globalThis.location) {
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
 * 按级别输出调试日志；开关没打开时什么都不做。
 */
export function debugLog(debugLevel, ...debugArguments) {
  if (!isFrontendDebugMode()) {
    return;
  }
  const consoleObject = globalThis.console;
  const logMethod = consoleObject?.[debugLevel];
  if (typeof logMethod === "function") {
    logMethod.apply(consoleObject, debugArguments);
  }
}
