/**
 * 3D 首屏的分段耗时埋点。
 *
 * 为什么需要：舞台页的加载是「HTML → 场景接口 → 逐层归一 → stage 模块 → 首帧」一条长链，
 * 用户只感觉到「转圈」，看不出卡在哪一段。这里给链上每个节点打一条 `[3D-load]`，
 * 让「偶发变慢」有据可查（哪一段的时间戳跳了）。
 *
 * 出口只有一个：`utils/debug-log.js` 是本站诊断输出的统一出口，本模块不再自己判断
 * `location`、也不再自己 `console.*` —— 开关语义收在一处，才不会有第二个「关不掉的日志」。
 */
import { debugLog, isFrontendPerformanceDiagnosticsEnabled } from "../utils/debug-log.js?v=2609260929";

/**
 * 创建一个埋点函数。
 *
 * 采集到的 `at` 是 `performance.now()` 的整数毫秒（相对页面起点，不是 wall clock：
 * 首屏耗时看的是相对量）。关闭诊断时不产生任何开销：`enabled` 只在创建时判定一次，
 * 关闭状态下返回的函数直接 return，连 `JSON.stringify` 都不做。
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
