/**
 * @file roles.ts
 * @module @homeos/shared/auth
 * @brief 家庭成员角色枚举与告警级别定义（JWT 鉴权 / 前端权限 / 通知优先级共用）。
 *
 * 职责：
 *  - 定义 HomeRole（admin/adult/child/guest）四角色字面量与校验函数；
 *  - 定义 AlertLevel（info/warn/danger）三级别枚举，供通知分级与告警排序使用。
 *
 * 关键依赖：
 *  - 后端签发 JWT 时 role claim 必须使用本文件的 HOME_ROLES 枚举值；
 *  - 前端路由守卫、通知中心抽屉、告警规则设置页均引用本类型。
 *
 * 约定：
 *  - 角色顺序即权限从高到低（admin → adult → child → guest）；
 *  - isHomeRole 做宽泛 unknown 收窄，容忍 JWT payload 的各种脏数据形态。
 */

/**
 * 家庭成员角色（与 JWT role 一致）。
 * - admin：管理员，拥有全部实体与系统配置权限
 * - adult：成年人，可控制全部实体但不可修改系统配置
 * - child：儿童，仅可控制白名单内实体
 * - guest：访客，权限最受限
 */
export type HomeRole = 'admin' | 'adult' | 'child' | 'guest';

/**
 * 家庭成员角色集合（只读），用于校验与遍历。
 * 顺序即权限从高到低，部分 UI 可据此排序。
 */
export const HOME_ROLES: readonly HomeRole[] = ['admin', 'adult', 'child', 'guest'] as const;

/**
 * 判断给定值是否为合法的 HomeRole。
 * 主要用于解析 JWT payload、前端路由守卫等场景，避免非法角色值进入业务逻辑。
 *
 * @param value 待校验的值（通常来自 JWT 或前端输入）
 * @returns 若为字符串且属于 HOME_ROLES 则为 true，并收窄类型为 HomeRole
 */
export function isHomeRole(value: unknown): value is HomeRole {
  // 先确保是字符串再 includes，避免类型不匹配导致误判
  return typeof value === 'string' && (HOME_ROLES as readonly string[]).includes(value);
}

/**
 * 通知 / 告警级别。
 * - info：信息提示
 * - warn：警告
 * - danger：危险/紧急
 */
export type AlertLevel = 'info' | 'warn' | 'danger';

/**
 * 告警级别集合（只读），顺序即严重程度从低到高，便于排序与比较。
 */
export const ALERT_LEVELS: readonly AlertLevel[] = ['info', 'warn', 'danger'] as const;