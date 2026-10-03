/**
 * 联动设置页 provide / inject 键（独立小文件，避免循环依赖）。
 */
export const ORCHESTRATOR_REFRESH_OVERVIEW_KEY = Symbol('orchestratorRefreshOverview')

/** 同步健康「配置漂移」点击后递增，各 Builder 打开列表并聚焦修复入口 */
export const ORCHESTRATOR_FOCUS_DRIFT_KEY = Symbol('orchestratorFocusDrift')
