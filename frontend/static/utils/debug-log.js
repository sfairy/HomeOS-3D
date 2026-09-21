/**
 * 开发开关与调试日志：默认静默，只在显式打开开发开关时输出。
 *
 * 把「这条诊断信息该不该出现在生产控制台」收敛到一处判断——此前散在各分支的 console.* 多数
 * 已走过 HABridgeLog 上报，同一条错误会在生产页面上出现两遍且关不掉。开关只看地址栏
 * `?debug=1`（`true` 同义），不落 localStorage：这是跟着一次会话走的临时诊断。
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
