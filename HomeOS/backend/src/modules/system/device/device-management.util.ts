/**
 * 僵尸绑定扫描判定工具
 *
 * 所属模块：system/device
 * 职责：区分「HA 中已删除」与「仅被 HomeOS 同步过滤掉」。
 *  状态库在 syncOnlyEnabledEntities 开启时不含禁用/隐藏实体，不能单独作为存活依据。
 */

/** 判定一次扫描所需的 HA 就绪快照 */
type ZombieScanHaSnapshot = {
  /** 当前状态库实体数（已按同步策略过滤） */
  storeCount: number;
  /** HA 实体注册表条数（含禁用/隐藏） */
  registryCount: number;
  /** 是否已完成至少一次 HA 全量同步 */
  haSynced: boolean;
};

/**
 * 存活实体 = 状态库 ∪ 注册表。
 * 注册表有条目即视为仍存在于 HA（即使用户隐藏或禁用了它）。
 */
export function buildAliveEntityIdSet(
  storeIds: Iterable<string>,
  registryIds: Iterable<string>,
): Set<string> {
  const alive = new Set<string>();
  for (const id of storeIds) {
    const entityId = String(id || '').trim();
    if (entityId) alive.add(entityId);
  }
  for (const id of registryIds) {
    const entityId = String(id || '').trim();
    if (entityId) alive.add(entityId);
  }
  return alive;
}

/**
 * HA 尚未同步完成时，本地绑定无法判断是否已在 HA 删除，必须跳过扫描。
 * 已同步且两侧都空：HA 确实没有实体，本地引用才是真僵尸。
 */
export function shouldSkipZombieScan(snapshot: ZombieScanHaSnapshot): boolean {
  return snapshot.storeCount === 0 && snapshot.registryCount === 0 && !snapshot.haSynced;
}
