/**
 * `kernel/utils/perf` 公开面。
 *
 * 这些模块此前被合并成 `perf.ts`（1217 行），
 * 但它们各自职责不同（见各文件头注释），混在一个文件里无法按职责定位。
 * 拆回独立文件后由本桶维持既有 import 说明符不变。
 */
export * from './adaptive-perf.util'
export * from './baseline.util'
export * from './client-metrics.util'
export * from './fps-scheduler.util'
export * from './frontend-perf-monitor.util'
export * from './perf-instrumentation'
export * from './runtime-perf-mode.util'
export * from './smart-performance.util'
export * from './tablet-default-perf.util'
export * from './webgl-availability.util'
export * from './webgl-context-loss-guard.util'
