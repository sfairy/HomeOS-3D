/**
 * HomeOS 认证载荷类型。
 *
 * homeos-3d 为单一管理员模型：仅存在一个账号，故不再区分用户角色。
 */

/**
 * 认证用户载荷：对齐 homeos-3d 的 ``UserResponse``（``id`` / ``username``）。
 *
 * homeos-3d 为单一管理员模型，不再有角色 / MFA / 访客 / 用户偏好等字段。
 */
export interface AuthUserPayload {
  id?: string // 用户标识
  username?: string // 登录用户名
  restrictions?: string[] // 实体访问白名单（3D 模型下恒为空，保留字段以兼容既有工具函数）
}
