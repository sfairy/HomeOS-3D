/** 实体访问控制模块 */
import { getEntityDomain } from './domain';

/**
 * JWT 用户最小形状，仅包含访问控制所需字段。
 * 与后端鉴权中间件下发的 token claim 对齐。
 */
export interface JwtUserLike {
  /** 实体可见性白名单（domain 或 entity_id 前缀），为空表示不受限 */
  restrictions?: string[];
  /** HomeOS 用户 ID */
  userId?: string;
  /** 登录用户名 */
  username?: string;
}

/**
 * 解析用户的实体可见性限制。
 *
 * @param user JWT 用户对象，可为空
 * @returns
 *  - `null`：无过滤，调用方应放行全部实体。
 *  - `string[]`：生效的限制前缀列表。
 */
export function resolveEntityRestrictions(user?: JwtUserLike | null): string[] | null {
  const r = user?.restrictions;
  return Array.isArray(r) && r.length > 0 ? r : null;
}

/**
 * 判断指定实体是否对当前用户可见。
 *
 * @param entityId HA entity_id（如 "light.living"）
 * @param userOrRestrictions 用户对象，或已解析的限制前缀数组
 * @returns true 表示允许该用户访问此实体
 *
 * 实现要点：
 *  - null / 空白名单（[] 归一为 null）直接放行；受限时仅空 entityId 拒绝；
 *  - 限制条目 ≤ 4 时走线性 some（小集合更省事，且支持 domain-only 匹配）；
 *  - 限制条目 > 4 时先取一次 domain，避免每次 indexOf，仍兼容前缀匹配。
 */
export function isEntityAllowed(
  entityId: string,
  userOrRestrictions?: JwtUserLike | string[] | null,
): boolean {
  const restrictions = Array.isArray(userOrRestrictions)
    ? userOrRestrictions
    : resolveEntityRestrictions(userOrRestrictions as JwtUserLike | null);
  if (restrictions === null || restrictions.length === 0) return true;
  if (!entityId) return false;

  // 小集合：直接线性扫描，并兼容 domain-only 形式的限制项
  if (restrictions.length <= 4) {
    return restrictions.some((prefix) =>
      prefix.includes('.')
        ? // Logic fix: 含 "." 的限制项仅当以 "." 结尾时才按前缀匹配，
          // 否则必须精确等于 entity_id，避免 "light.living" 误匹配 "light.living_room"。
          prefix.endsWith('.')
          ? entityId.startsWith(prefix)
          : entityId === prefix
        : matchesDomainOnly(entityId, prefix),
    );
  }

  // 大集合：预先取出 domain，避免每条限制重复解析
  const dotIdx = entityId.indexOf('.');
  const domain = dotIdx > 0 ? entityId.slice(0, dotIdx) : entityId;
  return restrictions.some((prefix) => {
    if (prefix.includes('.')) {
      return prefix.endsWith('.') ? entityId.startsWith(prefix) : entityId === prefix;
    }
    // 不含 "." 的限制项视为 domain 级别精确匹配，避免 "light" 误匹配 "light_meter.total"
    return domain === prefix;
  });
}

/**
 * 判断 entityId 是否匹配"仅 domain"形式的限制项。
 *
 * @param entityId 待判定的实体 ID
 * @param prefix   限制项；若含 "." 则按前缀逻辑在外层处理，此处返回 false
 * @returns true 表示 entityId 的 domain 等于 prefix
 */
function matchesDomainOnly(entityId: string, prefix: string): boolean {
  if (prefix.includes('.')) return false;
  return getEntityDomain(entityId) === prefix;
}

/**
 * 按用户权限批量过滤实体列表。
 *
 * @param entities 实体数组，元素至少包含 entity_id 字段
 * @param user     JWT 用户对象
 * @returns 过滤后的实体数组（不修改原数组）
 *
 * 优化路径：
 *  - 无限制（null / 空白名单）：原数组直接返回；
 *  - 限制条目 > 4：构建 domainSet / exactSet / prefixSet 三组索引一次过滤，避免对每个实体多次 indexOf；
 *  - 否则退化为逐个 isEntityAllowed。
 */
export function filterEntitiesByAccess<T extends { entity_id: string }>(
  entities: T[],
  user?: JwtUserLike | null,
): T[] {
  const restrictions = resolveEntityRestrictions(user);
  if (restrictions === null) return entities;

  if (restrictions.length > 4) {
    // 预构建索引以避免 O(n*m) 的重复字符串解析
    const domainSet = new Set<string>();
    const exactSet = new Set<string>();
    const prefixSet = new Set<string>();
    for (const r of restrictions) {
      if (r.includes('.')) {
        // 含 "." 的限制项：可能是完整 entity_id，也可能以 "." 结尾表示前缀。
        // 仅按「精确 / 前缀」匹配，绝不能据此放行整个 domain，否则
        // [light.a, switch.b, cover.c, fan.d, lock.e] 这类 >4 条限制会越权放行所有 light.* 等。
        // Logic fix: 仅当以 "." 结尾时才加入前缀集合，否则 "light.living" 会误匹配 "light.living_room"。
        exactSet.add(r);
        if (r.endsWith('.')) prefixSet.add(r);
      } else {
        // 不含 "." 的限制项：仅按 domain 精确匹配
        domainSet.add(r);
      }
    }
    return entities.filter((e) => {
      if (exactSet.has(e.entity_id)) return true;
      const d = getEntityDomain(e.entity_id);
      if (domainSet.has(d)) return true;
      for (const p of prefixSet) {
        if (e.entity_id.startsWith(p)) return true;
      }
      return false;
    });
  }

  return entities.filter((e) => isEntityAllowed(e.entity_id, restrictions));
}

