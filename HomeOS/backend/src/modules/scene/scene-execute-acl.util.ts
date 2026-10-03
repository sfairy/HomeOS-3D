/**
 * 场景 / 脚本执行前的实体 ACL 工具。
 *
 * 所属模块：backend/modules/scene
 * 职责：在场景或脚本执行前，对目标实体做与 command-proxy 一致的访问控制：
 *  - 角色限制（areAllEntitiesAllowedByRestrictions）：按用户 restrictions 白名单
 *  - 儿童模式：儿童域黑名单（isChildDomainAccessDenied）+ ChildModeGate
 *  - 高危实体（门锁 / 安防 / 燃气阀 / 警笛等）：与 high-risk-denylist 同义
 *  另提供 collectEntityIdsFromHaYaml 等扫描函数，用于执行前审计 YAML / entities 中
 *  命中的实体，供智能管家语音链路做 fail-closed 拦截。
 * 关键依赖：command-proxy/authorization.util（CommandProxyAuthUser / ChildModeGate）、
 *  common/http-security/device-access.util、@homeos/shared（getEntityDomain）。
 */
import { getEntityDomain } from '@homeos/shared';
import {
  areAllEntitiesAllowedByRestrictions,
  isChildDomainAccessDenied,
} from '../../common/http-security/device-access.util';
import { API_ERROR } from '../../common/errors/api-error-messages';
import { forbidden } from '../../common/utils/business-exception';
import {
  expandSceneEntityConfigs,
  resolveSceneEntityAction,
  type SceneEntityConfig,
} from '../../shared/orchestrator/config.util';
import type { ChildModeGate, CommandProxyAuthUser } from '../command-proxy/authorization.util';

/**
 * OrchestratorExecActor：业务类型别名。
 * - 表示：modules/scene/scene-execute-acl.util.ts 域内联合/映射/函数签名一组相关值；
 * - 用途：避免重复字面量、统一跨文件类型引用
 */
export type OrchestratorExecActor = CommandProxyAuthUser;

/** HA 常见域，用于从 YAML 扫描 entity_id */
const HA_ENTITY_ID_RE =
  /\b((?:light|switch|climate|cover|fan|lock|valve|alarm_control_panel|siren|media_player|vacuum|humidifier|water_heater|input_boolean|input_button|input_number|input_select|script|scene|automation|binary_sensor|sensor|person|device_tracker|camera|remote|button|number|select|time|todo|notify|tts|zone)\.[a-z0-9_]+)\b/gi;

/** 从 HA YAML 文本收集 entity_id */
export function collectEntityIdsFromHaYaml(yaml: string): string[] {
  if (!yaml?.trim()) return [];
  const ids = new Set<string>();
  for (const m of yaml.matchAll(HA_ENTITY_ID_RE)) {
    ids.add(m[1].toLowerCase());
  }
  return [...ids];
}

/** 单个待授权执行目标：entityId + resolve 后的有效 domain */
export interface EntityExecTarget {
  entityId: string;
  domain?: string;
}

/** 从场景实体配置收集执行目标（含 climate/cover 展开；保留 resolve 后的有效 domain） */
function collectSceneTargetActions(configs: SceneEntityConfig[]): EntityExecTarget[] {
  const expanded = configs.flatMap((cfg) => expandSceneEntityConfigs(cfg));
  const out: EntityExecTarget[] = [];
  const seen = new Set<string>();
  for (const cfg of expanded) {
    const { entityId, domain } = resolveSceneEntityAction(cfg);
    if (!entityId) continue;
    const key = entityId + '|' + domain;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ entityId, domain });
  }
  return out;
}

/**
 * 按实体 ID 列表校验执行权限。
 * actor 为空表示系统内部触发，跳过 ACL；仅 admin 跳过实体级校验。
 * guest 必须过实体 ACL（含高危域拒绝），不可因场景白名单绕过锁/警笛等。
 */
export function assertEntityIdsExecuteAuthorized(
  entityIds: string[],
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
  const targets = [...new Set(entityIds.filter(Boolean))];
  for (const eid of targets) {
    const domain = getEntityDomain(eid);
    if (isChildDomainAccessDenied(role, domain)) {
      forbidden(API_ERROR.ACCESS_ROLE_DEVICE_DENIED);
    }
    const childCheck = childMode.canControl(eid);
    if (!childCheck.allowed) {
      forbidden(childCheck.reason || '儿童模式限制');
    }
  }
  if (restrictions.length > 0 && targets.length > 0) {
    if (!areAllEntitiesAllowedByRestrictions(targets, restrictions)) {
      forbidden(API_ERROR.ACCESS_ENTITY_DENIED);
    }
  }
}

/**
 * 按执行目标（entityId + resolve 后有效 domain）校验权限。
 * 关键：使用 resolve 后的 domain，而非 entity_id 字符串推导，避免 domain 覆写越权。
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

/** 校验调用者是否可执行场景中的全部实体动作（使用 resolve 后有效 domain） */
export function assertSceneExecuteAuthorized(
  configs: SceneEntityConfig[],
  actor: OrchestratorExecActor | undefined,
  childMode: ChildModeGate,
): void {
  assertEntityTargetsExecuteAuthorized(collectSceneTargetActions(configs), actor, childMode);
}
