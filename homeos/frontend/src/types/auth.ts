/**
 * HomeOS 用户角色与认证载荷类型。
 * 依赖：@homeos/shared（HomeRole 角色枚举）。
 */
import type { HomeRole } from '@homeos/shared'

export type { HomeRole }

/**
 * 认证用户载荷：对齐 homeos-3d 的 ``UserResponse``（``id`` / ``username`` / ``role``）。
 *
 * homeos-3d 为单一管理员模型，不再有 MFA / 访客 / 用户偏好等字段。
 */
export interface AuthUserPayload {
  id?: string // 用户标识
  username?: string // 登录用户名
  role?: HomeRole | string // 用户角色
  restrictions?: string[] // 实体访问白名单（3D 模型下恒为空，保留字段以兼容既有工具函数）
}
