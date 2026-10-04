/**
 * 实体执行前的访问控制（ACL）工具（common 横切）。
 *
 * 职责：在「按实体下发动作」的执行入口（家庭模式动作、语音命令、Agent 工具等）前，
 *  对目标实体做与 command-proxy 一致的访问控制：
 *  - 角色限制（areAllEntitiesAllowedByRestrictions）：按用户 restrictions 白名单
 *  - 儿童模式：儿童域黑名单（isChildDomainAccessDenied）+ ChildModeGate
 *  - 高危实体（门锁 / 安防 / 燃气阀 / 警笛等）：与 high-risk-denylist 同义
 *
 * 说明：本文件从原 modules/scene/scene-execute-acl.util.ts 上移而来；
 *  common 层不得 import modules/*，故此处以结构化类型定义 actor / childMode 端口，
 *  与 command-proxy 的 CommandProxyAuthUser / ChildModeGate 结构等价。
 *
 * 关键依赖：common/http-security/device-access.util、@homeos/shared（getEntityDomain）。
 */
import { getEntityDomain } from '@homeos/shared';
import {
  areAllEntitiesAllowedByRestrictions,
  isChildDomainAccessDenied,
} from './device-access.util';
import { API_ERROR } from '../errors/api-error-messages';
import { forbidden } from '../utils/business-exception';

/**
 * 执行身份（结构等价于 command-proxy 的 CommandProxyAuthUser）。
 * - role：admin / adult / child / guest / 其他
 * - restrictions：允许访问的 entity_id 或域白名单
 */
export type OrchestratorExecActor = {
  role?: string;
  restrictions?: string[];
};

/** 儿童模式访问控制网关（结构等价于 command-proxy 的 ChildModeGate） */
export type ChildModeGate = {
  canControl(entityId: string): { allowed: boolean; reason?: string };
};

/** 单个待授权执行目标：entityId + 可选有效 domain */
export interface EntityExecTarget {
  entityId: string;
  domain?: string;
}

/**
 * 按执行目标（entityId + 有效 domain）校验权限。
 * 关键：使用传入的 domain（而非 entity_id 字符串推导），避免 domain 覆写越权。
 */
export function assertEntityTargetsExecuteAuthorized(
  targets: EntityExecTarget[],
  actor: OrchestratorExecActor | undefined,
  childMode: ChildModeGate,
): void {
  if (!actor) return;
  const role = actor.role;
  if (role === 'admin') return;

  const restrictions: string[] = Array.isArray(actor.restrictions) ? actor.restrictions : [];
  if (role === 'child' && restrictions.length === 0) {
    forbidden(API_ERROR.ACCESS_CHILD_NO_WHITELIST);
  }

  const dedup: Array<{ entityId: string; domain: string }> = [];
  const seen = new Set<string>();
  for (const t of targets || []) {
    const entityId = t?.entityId;
    if (!entityId) continue;
    const domain = t.domain || getEntityDomain(entityId);
    const key = entityId + '|' + domain;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push({ entityId, domain });
  }

  for (const { entityId, domain } of dedup) {
    if (isChildDomainAccessDenied(role, domain)) {
      forbidden(API_ERROR.ACCESS_ROLE_DEVICE_DENIED);
    }
    const childCheck = childMode.canControl(entityId);
    if (!childCheck.allowed) {
      forbidden(childCheck.reason || '儿童模式限制');
    }
  }
  if (restrictions.length > 0 && dedup.length > 0) {
    const ids = dedup.map((t) => t.entityId);
    if (!areAllEntitiesAllowedByRestrictions(ids, restrictions)) {
      forbidden(API_ERROR.ACCESS_ENTITY_DENIED);
    }
  }
}
