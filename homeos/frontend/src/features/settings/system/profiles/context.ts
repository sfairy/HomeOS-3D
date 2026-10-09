/**
 * 文件：context.ts
 * 职责：用户档案管理页面 provide/inject 上下文键。由 SettingsProfilesPanel provide，
 *       子区段通过 useProfilesSection inject 按需选取字段。
 * 关键依赖：无外部依赖
 */
export const PROFILES_KEY = Symbol('profiles')
