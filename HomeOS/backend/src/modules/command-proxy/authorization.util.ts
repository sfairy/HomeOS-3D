/**
 * 命令代理授权工具模块（纯函数，便于单测）
 *
 * 所属模块：command-proxy
 * 职责：
 *  - 定义命令代理相关的类型（CommandProxyAuthUser / ChildModeGate / CommandProxyTargetResolver）。
 *  - 从调用 DTO 中收集目标 entity_id：直接 entity_id、service_data.entity_id、target.{entity_id,area_id,device_id,label_id}。
 *  - 授权校验：角色权限（admin/adult/child/guest）+ restrictions 白名单 + 儿童模式网关。
 *  - 场景化校验：HA 媒体/流路径 ACL、历史查询 ACL、WebRTC 摄像头 ACL。
 *
 * 关键依赖：API_ERROR、forbidden/badRequest、device-access.util（限制匹配）、
 *           HaEntityRegistryEntry（注册表解析）、CallServiceDto。
 */
import { API_ERROR } from '../../common/errors/api-error-messages';
import { badRequest, forbidden } from '../../common/utils/business-exception';
import {
  areAllEntitiesAllowedByRestrictions,
  isChildDomainAccessDenied,
  isEntityAllowedByRestrictions,
} from '../../common/http-security/device-access.util';
import type { HaEntityRegistryEntry } from '../ha-connector/ha-rest-client.service';
import type { CallServiceDto } from './dto';

/**
 * 命令代理授权用户信息
 */
export type CommandProxyAuthUser = {
  /** 用户角色：admin / child / guest / 其他 */
  role?: string;
  /** 用户权限白名单，包含允许访问的 entity_id 或域 */
  restrictions?: string[];
};

/**
 * 儿童模式访问控制网关
 */
export type ChildModeGate = {
  /**
   * 检查指定实体是否允许被儿童模式控制
   * 
   * @param entityId 实体 ID
   * @returns 包含允许状态和拒绝原因的对象
   */
  canControl(entityId: string): { allowed: boolean; reason?: string };
};

/**
 * 命令代理目标解析器
 * 
 * 用于从 area_id / device_id / label_id 等间接目标解析出具体的 entity_id 列表
 */
type CommandProxyTargetResolver = {
  /** 获取实体注册表 */
  getRegistry: () => Promise<HaEntityRegistryEntry[]>;
  /**
   * 按 attributes 谓词查找目标实体 ID。
   * 避免每次命令授权都通过 getAll() 分配全量实体数组。
   */
  findEntityIds: (predicate: (attributes: Record<string, unknown>) => boolean) => string[];
};

/**
 * 将值转换为字符串数组
 * 
 * @param v 待转换的值，可以是字符串、数组或其他类型
 * @returns 字符串数组，空值会被过滤
 */
function toIdArray(v: unknown): string[] {
  if (typeof v === 'string' && v) return [v];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && !!x);
  return [];
}

/**
 * 从调用 DTO 中收集所有目标 entity_id
 * 
 * 支持从以下位置提取：
 * - dto.entity_id: 直接指定的实体 ID
 * - dto.service_data.entity_id: 服务数据中的实体 ID
 * - dto.service_data.target.entity_id: 目标对象中的实体 ID
 * - dto.service_data.target.area_id: 通过区域 ID 解析实体
 * - dto.service_data.target.device_id: 通过设备 ID 解析实体
 * - dto.service_data.target.label_id: 通过标签 ID 解析实体（entity_registry.labels / attributes.labels）
 * - 若标签无法解析到任何实体，抛出 TARGET_LABEL_UNRESOLVED 提示改用 entity_id
 * 
 * @param dto 命令调用 DTO
 * @param resolver 目标解析器，用于解析 area_id/device_id/label_id
 * @returns 目标实体 ID 数组
 */
async function collectCommandProxyTargetEntities(
  dto: CallServiceDto,
  resolver?: CommandProxyTargetResolver,
): Promise<string[]> {
  const out = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v === 'string') out.add(v);
    else if (Array.isArray(v)) v.forEach((x) => typeof x === 'string' && out.add(x));
  };
  add(dto.entity_id);
  const sd = dto.service_data as Record<string, unknown> | undefined;
  if (sd) {
    add(sd.entity_id);
    const target = sd.target as Record<string, unknown> | undefined;
    if (target) {
      add(target.entity_id);
      const areaIds = toIdArray(target.area_id);
      const deviceIds = toIdArray(target.device_id);
      const labelIds = toIdArray(target.label_id);
      if (areaIds.length || deviceIds.length || labelIds.length) {
        if (!resolver) {
          forbidden(API_ERROR.ACCESS_ENTITY_DENIED);
        }
        // 通过区域 ID 解析实体
        if (areaIds.length) {
          for (const eid of resolver.findEntityIds((attrs) => {
            const aid = attrs.area_id;
            return aid != null && areaIds.includes(String(aid));
          })) {
            out.add(eid);
          }
        }
        // 通过设备 ID 解析实体
        if (deviceIds.length) {
          const registry = await resolver.getRegistry();
          for (const row of registry) {
            if (row.device_id && deviceIds.includes(row.device_id)) out.add(row.entity_id);
          }
        }
        // 通过标签 ID 解析实体（HA entity_registry.labels）
        if (labelIds.length) {
          const registry = await resolver.getRegistry();
          let matched = 0;
          for (const row of registry) {
            const labels = row.labels || [];
            if (labels.some((lid) => labelIds.includes(lid))) {
              out.add(row.entity_id);
              matched++;
            }
          }
          // 亦尝试实体 attributes.labels（运行时态）
          for (const eid of resolver.findEntityIds((attrs) => {
            const labels = Array.isArray(attrs.labels)
              ? attrs.labels.map((x) => String(x))
              : [];
            return labels.some((lid) => labelIds.includes(lid));
          })) {
            out.add(eid);
            matched++;
          }
          if (matched === 0) {
            badRequest(API_ERROR.TARGET_LABEL_UNRESOLVED(labelIds.join(', ')));
          }
        }
      }
    }
  }
  return [...out];
}

/**
 * 校验当前用户是否允许调用 HA 服务
 * 
 * 校验流程：
 * 1. 访客角色直接拒绝
 * 2. 检查域级别的儿童访问限制
 * 3. 儿童角色必须有白名单
 * 4. 非管理员用户检查白名单限制
 * 5. 检查儿童模式控制限制
 * 
 * @param dto 命令调用 DTO
 * @param user 当前用户信息
 * @param childMode 儿童模式网关
 * @param resolver 目标解析器
 * @throws BusinessException(403) 授权失败时抛出
 */
export async function assertCommandProxyAuthorized(
  dto: CallServiceDto,
  user: CommandProxyAuthUser | undefined,
  childMode: ChildModeGate,
  resolver?: CommandProxyTargetResolver,
): Promise<void> {
  const role = user?.role;
  // 访客角色直接拒绝
  if (role === 'guest') {
    forbidden(API_ERROR.ACCESS_GUEST_DEVICE_DENIED);
  }
  // 检查域级别的儿童访问限制
  if (isChildDomainAccessDenied(role, dto.domain)) {
    forbidden(API_ERROR.ACCESS_ROLE_DEVICE_DENIED);
  }
  const restrictions: string[] = Array.isArray(user?.restrictions) ? user.restrictions : [];
  // 儿童角色必须有白名单
  if (role === 'child' && restrictions.length === 0) {
    forbidden(API_ERROR.ACCESS_CHILD_NO_WHITELIST);
  }
  // 收集所有目标实体
  const targets = await collectCommandProxyTargetEntities(dto, resolver);
  // 非管理员用户检查白名单限制
  if (role !== 'admin' && restrictions.length > 0) {
    const allowed = areAllEntitiesAllowedByRestrictions(targets, restrictions);
    if (!allowed) {
      forbidden(API_ERROR.ACCESS_ENTITY_DENIED);
    }
  }
  // 检查儿童模式控制限制
  for (const eid of targets) {
    const childCheck = childMode.canControl(eid);
    if (!childCheck.allowed) {
      forbidden(childCheck.reason || '儿童模式限制');
    }
  }
}

/**
 * 从 HA 媒体/流路径解析 entity_id
 * 
 * 支持的路径模式：
 * - /api/camera_proxy/{entity_id}
 * - /api/camera_proxy_stream/{entity_id}
 * - /api/media_player_proxy/{entity_id}
 * - /api/image_proxy/{entity_id}
 * 
 * @param path HA 媒体/流路径
 * @returns 解析出的 entity_id，无法解析时返回 null
 */
function extractEntityIdFromHaMediaPath(path: string): string | null {
  const clean = (path.startsWith('/') ? path : `/${path}`).split('?')[0];
  const patterns = [
    /^\/api\/camera_proxy(?:_stream)?\/(.+)$/,
    /^\/api\/media_player_proxy\/(.+)$/,
    /^\/api\/image_proxy\/(.+)$/,
  ];
  for (const re of patterns) {
    const m = clean.match(re);
    if (m?.[1]) {
      try {
        return decodeURIComponent(m[1]);
      } catch {
        return m[1];
      }
    }
  }
  return null;
}

/**
 * 校验媒体实体的访问权限
 * 
 * @param entityId 实体 ID
 * @param user 当前用户信息
 * @param childMode 儿童模式网关
 * @throws BusinessException(403) 授权失败时抛出
 */
function assertEntityAccessForMedia(
  entityId: string,
  user: CommandProxyAuthUser | undefined,
  childMode: ChildModeGate,
): void {
  const role = user?.role;
  // 访客角色直接拒绝
  if (role === 'guest') {
    forbidden(API_ERROR.ACCESS_GUEST_DEVICE_DENIED);
  }
  const restrictions: string[] = Array.isArray(user?.restrictions) ? user.restrictions : [];
  // 儿童角色必须有白名单
  if (role === 'child' && restrictions.length === 0) {
    forbidden(API_ERROR.ACCESS_CHILD_NO_WHITELIST);
  }
  // 非管理员用户检查白名单限制
  if (role !== 'admin' && restrictions.length > 0) {
    if (!areAllEntitiesAllowedByRestrictions([entityId], restrictions)) {
      forbidden(API_ERROR.ACCESS_ENTITY_DENIED);
    }
  }
  // 检查儿童模式控制限制
  const childCheck = childMode.canControl(entityId);
  if (!childCheck.allowed) {
    forbidden(childCheck.reason || '儿童模式限制');
  }
}

/**
 * 校验 HA 媒体/流代理路径的实体级 ACL
 * 
 * 校验逻辑：
 * 1. 如果路径包含 camera 实体，走 WebRTC 专用校验
 * 2. 如果路径包含其他实体，走标准实体权限校验
 * 3. 如果路径不包含实体，访客拒绝，非管理员拒绝
 * 
 * @param path HA 媒体/流路径
 * @param user 当前用户信息
 * @param childMode 儿童模式网关
 * @throws BusinessException(403) 授权失败时抛出
 */
export function assertHaMediaPathAuthorized(
  path: string,
  user: CommandProxyAuthUser | undefined,
  childMode: ChildModeGate,
): void {
  const entityId = extractEntityIdFromHaMediaPath(path);
  // camera 实体走 WebRTC 专用校验
  if (entityId?.startsWith('camera.')) {
    assertWebRtcAuthorized(entityId, user, childMode);
    return;
  }
  // 其他实体走标准校验
  if (entityId) {
    assertEntityAccessForMedia(entityId, user, childMode);
    return;
  }
  // 无实体路径：访客拒绝，非管理员拒绝
  if (user?.role === 'guest') {
    forbidden(API_ERROR.ACCESS_GUEST_DEVICE_DENIED);
  }
  if (user?.role !== 'admin') {
    forbidden(API_ERROR.ACCESS_ENTITY_DENIED);
  }
}

/**
 * 校验历史查询的实体级 ACL
 * 
 * @param entityIds 待查询的实体 ID 数组
 * @param user 当前用户信息
 * @param childMode 儿童模式网关
 * @throws BusinessException(403) 授权失败时抛出
 */
export function assertHistoryAuthorized(
  entityIds: string[],
  user: CommandProxyAuthUser | undefined,
  childMode: ChildModeGate,
): void {
  // 访客角色直接拒绝
  if (user?.role === 'guest') {
    forbidden(API_ERROR.ACCESS_GUEST_DEVICE_DENIED);
  }
  const restrictions: string[] = Array.isArray(user?.restrictions) ? user.restrictions : [];
  // 儿童角色必须有白名单
  if (user?.role === 'child' && restrictions.length === 0) {
    forbidden(API_ERROR.ACCESS_CHILD_NO_WHITELIST);
  }
  // 非管理员用户检查白名单限制
  if (user?.role !== 'admin' && restrictions.length > 0) {
    if (!areAllEntitiesAllowedByRestrictions(entityIds, restrictions)) {
      forbidden(API_ERROR.ACCESS_ENTITY_DENIED);
    }
  }
  // 检查儿童模式控制限制
  for (const eid of entityIds) {
    const childCheck = childMode.canControl(eid);
    if (!childCheck.allowed) {
      forbidden(childCheck.reason || '儿童模式限制');
    }
  }
}

/**
 * WebRTC 摄像头访问授权校验
 * 
 * 特殊规则：
 * - 访客角色：必须有白名单且实体在白名单内
 * - 儿童角色：检查域级别限制 + 必须有白名单 + 白名单校验 + 儿童模式限制
 * - 管理员：直接通过
 * 
 * @param entityId 摄像头实体 ID
 * @param user 当前用户信息
 * @param childMode 儿童模式网关
 * @throws BusinessException(403) 授权失败时抛出
 */
export function assertWebRtcAuthorized(
  entityId: string,
  user: CommandProxyAuthUser | undefined,
  childMode: ChildModeGate,
): void {
  // 仅允许访问 camera 实体
  if (!entityId?.startsWith('camera.')) {
    forbidden('仅允许访问 camera 实体');
  }
  const role = user?.role;
  const restrictions: string[] = Array.isArray(user?.restrictions) ? user.restrictions : [];

  // 访客角色：必须有白名单且实体在白名单内
  if (role === 'guest') {
    if (restrictions.length === 0) {
      forbidden(API_ERROR.ACCESS_GUEST_DEVICE_DENIED);
    }
    if (!isEntityAllowedByRestrictions(entityId, restrictions)) {
      forbidden(API_ERROR.ACCESS_ENTITY_DENIED);
    }
    return;
  }

  // 检查域级别的儿童访问限制
  if (isChildDomainAccessDenied(role, 'camera')) {
    forbidden(API_ERROR.ACCESS_ROLE_DEVICE_DENIED);
  }
  // 儿童角色必须有白名单
  if (role === 'child' && restrictions.length === 0) {
    forbidden(API_ERROR.ACCESS_CHILD_NO_WHITELIST);
  }
  // 非管理员用户检查白名单限制
  if (role !== 'admin' && restrictions.length > 0) {
    if (!areAllEntitiesAllowedByRestrictions([entityId], restrictions)) {
      forbidden(API_ERROR.ACCESS_ENTITY_DENIED);
    }
  }
  // 检查儿童模式控制限制
  const childCheck = childMode.canControl(entityId);
  if (!childCheck.allowed) {
    forbidden(childCheck.reason || '儿童模式限制');
  }
}