/**
 * 3D 首屏的分段耗时埋点。
 */
import { debugLog, isFrontendPerformanceDiagnosticsEnabled } from "../utils/debug-log.js?v=2609271508";

/**
 * 创建一个埋点函数。
 * @param {string} loadScope 阶段所属的作用域（例如 `"studio"`），便于多个入口共用一份日志。
 * @param {object} [env] 运行环境（测试注入替身）。
 * @returns {(loadPhase: string) => void} 记录一个阶段：关闭诊断时是空操作。
 */
export function createLoadTiming(loadScope, env = globalThis) {
  const enabled = isFrontendPerformanceDiagnosticsEnabled(env.location);
  return loadPhase => {
    if (!enabled) {
      return;
    }
    // performance 缺失（老测试替身）时退化成 0：埋点本身不该成为故障源。
    const at = Math.round(env.performance?.now?.() || 0);
    debugLog("info", "[3D-load]", JSON.stringify({ scope: loadScope, phase: loadPhase, at: at }));
  };
}
