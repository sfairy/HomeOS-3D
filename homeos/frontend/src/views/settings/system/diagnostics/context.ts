/**
 * 文件：context.ts
 * 职责：系统诊断页面 provide/inject 上下文键。由 SettingsDiagnosticsPanel provide，
 *       子区段通过 useDiagnosticsSection inject 按需选取字段。
 * 关键依赖：无外部依赖
 */
export const DIAGNOSTICS_KEY = Symbol('diagnostics')
