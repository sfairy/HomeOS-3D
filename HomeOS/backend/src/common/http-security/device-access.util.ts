/**
 * @file device-access.util.ts
 * @module common/http-security
 *
 * 设备 ACL（儿童域限制 / JWT restrictions）与 WebRTC 摄像头鉴权工具。
 *
 * 儿童受限域清单以 @homeos/shared 为唯一源，本文件再导出供后端 HTTP/WS 层使用。
 */

import { isChildDomainAccessDenied, isEntityAllowed } from '@homeos/shared';

export { isChildDomainAccessDenied };

/**
 * 非 admin 用户 JWT restrictions 白名单校验。
 *
 * 委托 @homeos/shared `isEntityAllowed`：支持 domain-only（`"light"` → `light.xxx`）
 * 与 entity/前缀匹配。空数组表示无限制（通常仅 admin），须在委托前放行——
 * shared 侧 `[]` 语义为「无可见实体」。
 *
 * @param entityId HA 实体 ID（如 'light.living_room'）。
 * @param restrictions 白名单数组（domain 或 entity_id / 前缀）。
 * @returns true 表示该实体在白名单内或无限制。
 */
export function isEntityAllowedByRestrictions(entityId: string, restrictions: string[]): boolean {
  if (!restrictions.length) return true;
  return isEntityAllowed(entityId, restrictions);
}

/**
 * 批量校验所有实体是否均满足 restrictions 白名单。
 *
 * @param entityIds 待校验的实体 ID 数组。
 * @param restrictions 前缀白名单数组。
 * @returns true 表示所有实体均被允许；空数组返回 false（无操作目标视为不合法）。
 */
export function areAllEntitiesAllowedByRestrictions(
  entityIds: string[],
  restrictions: string[],
): boolean {
  if (!entityIds.length) return false;
  return entityIds.every((eid) => isEntityAllowedByRestrictions(eid, restrictions));
}

/**
 * go2rtc WSS 反代：校验 JWT 是否允许访问指定 camera（只读流）。
 *
 * 鉴权规则：
 * 1. payload 为空或实体非 camera.* 域：拒绝。
 * 2. guest / child：必须有 restrictions 且实体命中白名单，否则拒绝。
 * 3. admin：直接放行。
 * 4. 携带 restrictions 的其他角色：按白名单校验。
 * 5. adult / user 且无 restrictions：放行（默认信任家庭成员）。
 *
 * 安全意图：摄像头流为只读，但涉及隐私，guest/child 必须显式授权才能查看；
 * admin 拥有全部权限；家庭成员默认可查看。
 *
 * @param payload JWT 解码后的载荷，含 role 与 restrictions。
 * @param entityId 待访问的摄像头实体 ID。
 * @returns true 表示允许访问该摄像头流。
 */
export function assertWebRtcWsTokenAllowed(
  payload: { role?: string; restrictions?: string[] } | null | undefined,
  entityId: string,
): boolean {
  if (!payload || !entityId.startsWith('camera.')) return false;
  const role = payload.role;
  const restrictions = Array.isArray(payload.restrictions) ? payload.restrictions : [];

  // guest / child 需显式 restrictions 白名单才可查看摄像头
  if (role === 'guest' || role === 'child') {
    if (!restrictions.length) return false;
    return isEntityAllowedByRestrictions(entityId, restrictions);
  }
  // admin 全量放行
  if (role === 'admin') return true;
  // 携带 restrictions 的其他角色按白名单校验
  if (restrictions.length > 0) {
    return isEntityAllowedByRestrictions(entityId, restrictions);
  }
  // 家庭成员（adult/user）默认可查看
  return role === 'adult' || role === 'user';
}
