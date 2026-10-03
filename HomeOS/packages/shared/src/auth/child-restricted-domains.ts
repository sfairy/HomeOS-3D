/**
 * @file child-restricted-domains.ts
 * @module @homeos/shared/auth
 * @brief 儿童角色禁止直接控制的 HA 域白名单（前后端 ACL 唯一源）。
 *
 * 职责：
 *  - 定义并导出物理安全高危设备的 domain 清单；
 *  - 提供 O(1) 的 Set 查询与角色访问拒绝判定。
 *
 * 关键依赖：
 *  - 后端 RolesGuard 与 command-proxy 中间件共用本清单判定拦截；
 *  - 前端 index.ts 从本文件再导出 ChildRestrictedDomain 与工具函数。
 *
 * 约定：
 *  - 默认儿童/访客双角色在命中高危域时一律拒绝（isChildDomainAccessDenied）；
 *  - 数组与 Set 形态同步导出，便于 JSON 序列化与高频查询。
 */

/** 儿童受限域集合（只读数组，便于序列化与单测）。包含锁/报警面板/警报器/阀门四类物理安全高危域 */
export const CHILD_RESTRICTED_DOMAIN_LIST = [
  'lock',
  'alarm_control_panel',
  'siren',
  'valve',
] as const;

/** 儿童受限域字面量联合类型（从 CHILD_RESTRICTED_DOMAIN_LIST 推导，便于类型约束） */
export type ChildRestrictedDomain = (typeof CHILD_RESTRICTED_DOMAIN_LIST)[number];

/** Set 形态，供 O(1) 域判断 */
export const CHILD_RESTRICTED_DOMAINS: ReadonlySet<string> = new Set(CHILD_RESTRICTED_DOMAIN_LIST);

/** 判断某 HA 域是否属于儿童受限域 */
export function isChildRestrictedDomain(domain: string): boolean {
  return CHILD_RESTRICTED_DOMAINS.has(domain);
}

/** 判断儿童或访客角色是否被拒绝访问某高危域（锁/警笛/阀门/报警面板） */
export function isChildDomainAccessDenied(role: string | undefined, domain: string): boolean {
  return (role === 'child' || role === 'guest') && isChildRestrictedDomain(domain);
}
