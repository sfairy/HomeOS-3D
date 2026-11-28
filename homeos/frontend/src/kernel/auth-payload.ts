/**
 * HomeOS 认证载荷类型。
 *
 * 单账号部署：库里只有一个账号，`role` 恒为 `ADMIN`。字段先落下来，是为了让
 * 「只有管理员能改系统级配置」这条边界在前端也有一处可读的判定（`isOwner`），
 * 后续加成员时不用再改类型与 store。
 */

/** 账号角色：与后端 `users.role` 同名同值。 */
export type AuthRole = 'ADMIN' | 'MEMBER'

/**
 * 认证用户载荷（``id`` / ``username`` / ``role``）。
 */
export interface AuthUserPayload {
  id?: string // 用户标识
  username?: string // 登录用户名
  role?: AuthRole | string // 账号角色；缺省按 ADMIN 处理（老接口 / 老缓存）
  displayName?: string | null // 显示名；空时前端回退 username
  restrictions?: string[] // 实体访问白名单（当前恒为空，仍参与快照权限指纹）
}
