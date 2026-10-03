/**
 * WS 客户端订阅解析与可见性过滤工具。
 *
 * 所属模块：ws-push
 * 职责：
 * - 解析握手/订阅消息中的 subscribeDomains 与 pinnedEntityIds，写入 socket.data 供广播过滤使用。
 * - 提供实体对客户端可见性的统一判定：综合订阅域、钉选实体、关键域、coldEntityOnDemand 配置。
 * - 计算用户级 room key，便于通知等事件按用户去重 fan-out。
 *
 * 关键依赖：@homeos/shared（JwtUserLike 类型与 getEntityDomain 工具）。
 */
import type { JwtUserLike } from '@homeos/shared';
import { getEntityDomain } from '@homeos/shared';

/** Socket.IO room key：同一用户账号的所有连接共享一个 room，便于批量扇出 */
export function resolveUserRoomKey(user: JwtUserLike, fallbackId?: string): string {
  const id = user.userId || user.username || fallbackId || 'anon';
  return `user:${id}`;
}

/** WS 客户端 domain 订阅解析与过滤 */

/**
 * 解析 subscribeDomains 握手参数为数组/Set。
 * 接受 string（逗号分隔）或 string[]；空集合归一化为 null 表示"订阅全部"。
 */
function parseSubscribeDomains(raw: unknown): Set<string> | null {
  if (raw == null || raw === '') return null;
  let arr: string[];
  if (Array.isArray(raw)) {
    arr = raw.map(String);
  } else if (typeof raw === 'string') {
    arr = raw.split(',').map((s) => s.trim());
  } else {
    return null;
  }
  const set = new Set(arr.filter(Boolean));
  return set.size > 0 ? set : null;
}

/**
 * 判定实体所属域是否被订阅：未传 subscribed 视为订阅全部；
 * 关键域始终放行（即使未显式订阅），保证安防等关键事件必达。
 */
function isEntityDomainSubscribed(
  entityId: string,
  subscribed: Set<string> | null | undefined,
  criticalDomains: string[] | Set<string>,
): boolean {
  if (!subscribed || subscribed.size === 0) return true;
  const domain = getEntityDomain(entityId);
  const critical = criticalDomains instanceof Set ? criticalDomains : new Set(criticalDomains);
  if (critical.has(domain)) return true;
  return subscribed.has(domain);
}

/**
 * 应用客户端订阅配置：写入 subscribedDomains / pinnedEntityIds 到 socket.data，
 * 并失效订阅分组签名缓存（subscriptionGroupSig），下次广播按新订阅重算。
 */
export function assignClientSubscription(
  client: { data: Record<string, unknown> },
  raw: unknown,
  pinnedRaw?: unknown,
): Set<string> | null {
  const parsed = parseSubscribeDomains(raw);
  client.data.subscribedDomains = parsed;
  client.data.pinnedEntityIds = parsePinnedEntityIds(pinnedRaw);
  // 订阅/固定实体变更后失效分组签名缓存，下次广播按新订阅重算
  client.data.subscriptionGroupSig = null;
  return parsed;
}

/** 解析 pinnedEntityIds 握手参数为 Set；仅保留含 . 的实体 ID 以过滤无效输入 */
function parsePinnedEntityIds(raw: unknown): Set<string> | null {
  if (raw == null) return null;
  let arr: string[];
  if (Array.isArray(raw)) {
    arr = raw.map(String);
  } else if (typeof raw === 'string') {
    arr = raw.split(',').map((s) => s.trim());
  } else {
    return null;
  }
  const set = new Set(arr.filter((id) => id.includes('.')));
  return set.size > 0 ? set : null;
}

/** coldEntityOnDemand 启用时的可见性：钉选实体或订阅域命中即可见 */
function isEntityVisibleWhenColdOnDemand(
  entityId: string,
  subscribed: Set<string> | null | undefined,
  pinned: Set<string> | null | undefined,
  criticalDomains: string[] | Set<string>,
): boolean {
  if (pinned?.has(entityId)) return true;
  return isEntityDomainSubscribed(entityId, subscribed, criticalDomains);
}

/**
 * 统一的实体可见性判断函数
 * 根据 coldOnDemand 配置决定使用哪种可见性判断逻辑
 */
export function isEntityVisibleToClient(
  entityId: string,
  subscribed: Set<string> | null | undefined,
  pinned: Set<string> | null | undefined,
  criticalDomains: string[] | Set<string>,
  coldOnDemand: boolean,
): boolean {
  if (coldOnDemand) {
    return isEntityVisibleWhenColdOnDemand(entityId, subscribed, pinned, criticalDomains);
  }
  return isEntityDomainSubscribed(entityId, subscribed, criticalDomains);
}
