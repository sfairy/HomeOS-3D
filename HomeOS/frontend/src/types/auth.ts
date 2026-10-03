/**
 * HomeOS 用户角色（与后端 JWT role 一致）。
 * 依赖：@homeos/shared（HomeRole 角色枚举）。
 */
import type { HomeRole } from '@homeos/shared'

export type { HomeRole }

/** 认证用户载荷（JWT 解码后的前端可见字段） */
export interface AuthUserPayload {
  username?: string // 登录用户名
  role?: HomeRole | string // 用户角色（与后端 JWT role claim 一致）
  restrictions?: string[] // 实体访问白名单（entity_id 列表）
  allowedSceneIds?: string[] // 访客可执行的 HomeOS 场景 ID
  authenticated?: boolean // 是否已认证
  initialized?: boolean // 系统是否已完成首装初始化
  requiresMfa?: boolean // 是否需要多因素认证
}

/** 登录结果（扩展 AuthUserPayload） */
export interface LoginResult extends AuthUserPayload {
  requiresMfa?: boolean // 是否需要多因素认证（登录流程分支用）
}

/** 访客登录载荷 */
export interface GuestLoginPayload {
  restrictions?: string[] // 访客实体访问白名单
  allowedSceneIds?: string[] // 访客可执行的 HomeOS 场景
}

/** 修改密码结果 */
export interface ChangePasswordResult {
  ok: boolean // 是否修改成功
  message?: string // 结果描述或错误信息
}