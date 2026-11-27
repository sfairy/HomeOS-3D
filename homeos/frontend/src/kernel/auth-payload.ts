/**
 * HomeOS 认证载荷类型。
 *
 * 单一管理员模型：仅存在一个账号，不区分用户角色。
 */

/**
 * 认证用户载荷（``id`` / ``username``）。
 */
export interface AuthUserPayload {
  id?: string // 用户标识
  username?: string // 登录用户名
  restrictions?: string[] // 实体访问白名单（当前恒为空，仍参与快照权限指纹）
}
