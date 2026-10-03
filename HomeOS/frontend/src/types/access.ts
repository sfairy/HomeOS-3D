/**
 * 访问控制与审计相关 TypeScript 类型：用户角色、审计日志与 UI 上下文接口。
 * 依赖：vue（Ref / ComputedRef 类型）、@homeos/shared（HomeRole 角色、PaginatedResult 分页契约）。
 */
import type { ComputedRef, Ref } from 'vue'
import type { HomeRole, PaginatedResult } from '@homeos/shared'

/**
 * 访问角色：内置四角色（契约见 @homeos/shared HomeRole），兼容自定义角色字符串。
 * `(string & {})` 保留任意字符串宽泛性的同时维持内置角色的字面量提示。
 */
export type AccessRole = HomeRole | (string & {})

/** 访问用户信息（管理后台展示用） */
export interface AccessUser {
  id?: string // 用户唯一 ID
  username: string // 登录用户名
  role: AccessRole // 角色
  entityRestrictions?: string[] // 实体访问白名单（entity_id 列表）
}

/** 访问用户编辑表单（前端编辑态） */
export interface AccessUserEdit {
  id?: string // 用户唯一 ID
  username: string // 登录用户名
  password?: string // 明文密码（仅创建/重置时提交）
  role: AccessRole // 角色
  restrictionsStr: string // 实体白名单文本（逗号分隔，提交前解析为字符串数组）
}

/** 命令审计日志条目（记录 HA service 调用） */
export interface CommandAuditLog {
  id?: string // 日志唯一 ID
  createdAt?: string // 创建时间（ISO 字符串）
  username?: string // 操作者用户名
  role?: string // 操作者角色
  domain?: string // HA 服务域（如 light / switch）
  service?: string // HA 服务名（如 turn_on）
  entityId?: string // 目标实体 ID
  success?: boolean // 是否执行成功
  error?: string // 失败时的错误信息
}

/** 登录审计日志条目（记录登录尝试） */
export interface LoginAuditLog {
  createdAt?: string // 创建时间（ISO 字符串）
  username?: string // 登录用户名
  success?: boolean // 是否登录成功
  ip?: string // 客户端 IP 地址
  userAgent?: string // 客户端 User-Agent
  [key: string]: unknown // 后端可能扩展的其它字段
}

/** 通用分页响应包装（基于 @homeos/shared PaginatedResult 契约；字段全可选以兼容未分页响应） */
export type PaginatedItems<T> = Partial<PaginatedResult<T>>

/** 审计日志删除结果 */
export interface AuditDeleteResult {
  deleted?: number // 已删除条目数
}

/** 角色元信息（角色选择器展示） */
export interface RoleMeta {
  id?: string // 角色 ID
  label: string // 角色 UI 标签
  desc?: string // 角色描述
}

/** chrome store 在访问模块所需的最小接口（notify / confirm 切片） */
export interface AccessChromeStore {
  notify: (message: string, type?: string, duration?: number) => void // 通知提示方法
  confirm: (
    message: string,
    title?: string,
    opts?: { confirmText?: string; type?: string },
  ) => Promise<boolean> // 确认对话框方法，返回用户是否确认
}

/** entities store 在访问模块所需的最小接口 */
export interface AccessEntitiesStore {
  getEntity: (entityId: string) => unknown // 根据实体 ID 获取实体
}

/** 访问管理上下文（注入到访问相关组件） */
export interface AccessAdminContext {
  chrome: AccessChromeStore // chrome store notify/confirm slice
  isAdmin: Ref<boolean> | ComputedRef<boolean> | { value: boolean } // 是否管理员（支持多种响应式形态）
}

/** 审计日志查询选项 */
export interface AccessAuditQueryOpts {
  limit?: number // 每页条目数
  page?: number // 页码
}

/** 审计日志用户筛选下拉项 */
export interface AuditUserOption {
  value: string // 选项值（用户名）
  label: string // 选项展示文本
  hint: string // 选项辅助提示
}