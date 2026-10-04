/**
 * @module shared/ha
 * @file entity-sync-filter.service.ts
 * @brief HA 实体同步过滤策略：基于注册表的屏蔽集过滤已禁用/已隐藏实体。
 *
 * 职责：
 *  - 维护屏蔽实体 ID 集合（blockedEntityIds）与注册表加载状态；
 *  - 由 HaConnector 在实体注册表加载后调用 configure 写入屏蔽集；
 *  - StateStore 只读使用 filterSyncableStates / isEntitySyncable 过滤待同步实体。
 *
 * 关键依赖：
 *  - @nestjs/common：Injectable；
 *  - HaEntity：实体类型（来自 ../types）。
 *
 * 设计说明：
 *  采用共享内存视图避免 StateStore 与 HaConnector 的双向模块依赖。
 *  当 syncOnlyEnabledEntities 关闭时不过滤（全量同步），适用于不关心注册表的场景。
 */
import { Injectable } from '@nestjs/common';
import type { HaEntity } from '../types';

/**
 * 按预构建屏蔽集过滤（O(1) 查找，供大规模实例使用）。
 *
 * @param entities 待过滤的实体数组。
 * @param blockedIds 屏蔽实体 ID 集合。
 * @returns 过滤后的数组；屏蔽集为空时返回原数组引用（避免拷贝）。
 */
/** 按预构建屏蔽集过滤（O(1) 查找，供大规模实例使用） */
export function filterHaEntitiesByBlockedIds<T extends HaEntity>(
  entities: T[],
  blockedIds: Set<string>,
): T[] {
  if (!blockedIds.size) return entities;
  return entities.filter((e) => e?.entity_id && !blockedIds.has(e.entity_id));
}

/**
 * HA 实体同步过滤策略（共享内存视图）。
 * 由 HaConnector 在实体注册表加载后写入，StateStore 只读使用，避免双向模块依赖。
 *
 * 在 DI 容器中作为全局共享服务，生命周期与应用一致。
 */
/**
 * HA 实体同步过滤策略（共享内存视图）。
 * 由 HaConnector 在实体注册表加载后写入，StateStore 只读使用，避免双向模块依赖。
 */
@Injectable()
export class HaEntitySyncFilterService {
  /** 屏蔽实体 ID 集合（已禁用 / 已隐藏的实体） */
  private blockedEntityIds = new Set<string>();
  /** 是否仅同步已启用实体；关闭时全量同步不过滤 */
  private syncOnlyEnabledEntities = false;
  /** 实体注册表是否已加载（未加载时跳过过滤，避免误删全部实体） */
  private registryLoaded = false;

  /**
   * 配置过滤策略（由 HaConnector 在注册表加载后调用）。
   *
   * @param syncOnlyEnabled 是否仅同步已启用实体。
   * @param blocked 屏蔽实体 ID 集合。
   * @param loaded 注册表是否已加载完成。
   */
  configure(syncOnlyEnabled: boolean, blocked: Set<string>, loaded: boolean): void {
    this.syncOnlyEnabledEntities = syncOnlyEnabled;
    this.blockedEntityIds = new Set(blocked);
    this.registryLoaded = loaded;
  }

  /**
   * 使过滤策略失效（注册表更新或断连时调用）。
   * 清空屏蔽集并标记注册表未加载，避免使用过期数据过滤。
   */
  invalidate(): void {
    this.registryLoaded = false;
    this.blockedEntityIds.clear();
  }

  /**
   * 过滤可同步的实体状态。
   *
   * 短路规则：
   *  1. 未开启"仅同步已启用"-> 返回原数组；
   *  2. 注册表未加载或屏蔽集为空 -> 返回原数组（避免误删）；
   *  3. 否则按屏蔽集过滤。
   *
   * @param entities 待过滤的实体数组。
   * @returns 过滤后的数组；无需过滤时返回原数组引用。
   */
  filterSyncableStates(entities: HaEntity[]): HaEntity[] {
    if (!this.syncOnlyEnabledEntities) return entities;
    // 注册表未加载时不能过滤，否则会误删全部实体
    if (!this.registryLoaded || !this.blockedEntityIds.size) return entities;
    return filterHaEntitiesByBlockedIds(entities, this.blockedEntityIds);
  }

  /**
   * 判断单个实体是否可同步。
   *
   * @param entityId 实体 ID。
   * @returns true 表示可同步（未开启过滤 / 注册表未加载 / 不在屏蔽集中）。
   */
  isEntitySyncable(entityId: string): boolean {
    if (!this.syncOnlyEnabledEntities) return true;
    // 注册表未加载时默认放行，避免启动阶段误屏蔽
    if (!this.registryLoaded) return true;
    return !this.blockedEntityIds.has(entityId);
  }
}