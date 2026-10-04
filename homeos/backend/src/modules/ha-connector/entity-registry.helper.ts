/**
 * HA 实体注册表缓存与屏蔽索引（HaConnectorEntityRegistry）
 *
 * 职责：
 *  - 维护 HA entity_registry 缓存（disabled_by / hidden_by / hidden），用于同步过滤。
 *  - 维护屏蔽实体 ID 集合，状态同步时按 syncOnlyEnabledEntities 过滤掉不可同步实体。
 *  - WebSocket 优先拉取，失败降级 REST；带缓存 TTL 与单飞去重（inflight）避免并发抢超时。
 *  - 配置热更新时通过 syncSharedFilter 重推共享过滤视图给 HaEntitySyncFilterService。
 * 关键依赖：filterHaEntitiesByBlockedIds、HaRestClientService、HaEntityRegistryEntry、Logger。
 */
import { filterHaEntitiesByBlockedIds } from '../../shared/ha/entity-sync-filter.service';
import type { HaEntity } from '../../shared/types';
import { getErrorMessage } from '../../common/utils';
import type { HaEntityRegistryEntry, HaRestClientService } from './ha-rest-client.service';
import { mapHaEntityRegistryRow } from './ha-rest-client.service';
import type { Logger } from '@nestjs/common';

/** 实体注册表依赖集合（由 HaConnectorService 组装并注入） */
interface HaConnectorEntityRegistryDeps {
  logger: Logger;
  getHaCfg: () => {
    syncOnlyEnabledEntities: boolean;
    entityRegistryTimeoutMs: number;
    entityRegistryCacheMs: number;
  };
  isWsConnected: () => boolean;
  sendWsRequest: <T>(type: string, payload: unknown, timeoutMs: number) => Promise<T>;
  restClient: HaRestClientService;
  onFilterIndexRebuilt?: (blocked: Set<string>, loaded: boolean) => void;
}

/**
 * HA 实体注册表缓存、屏蔽索引与同步过滤。
 * 维护禁用/隐藏实体 ID 集合，在状态同步时过滤掉不可同步的实体。
 * 支持WebSocket与 REST 双通道拉取，带缓存与单飞去重。
 */
export class HaConnectorEntityRegistry {
  private entityRegistryInflight: Promise<HaEntityRegistryEntry[]> | null = null;
  private entityRegistryCache: { rows: HaEntityRegistryEntry[]; at: number } | null = null;
  private readonly blockedEntityIds = new Set<string>();
  private entityRegistryLoaded = false;

  constructor(private readonly deps: HaConnectorEntityRegistryDeps) {}

  /** 失效缓存并清空屏蔽索引，触发 onFilterIndexRebuilt 回调通知上层索引已重建（loaded=false） */
  invalidateCache(): void {
    this.entityRegistryCache = null;
    this.blockedEntityIds.clear();
    this.entityRegistryLoaded = false;
    this.deps.onFilterIndexRebuilt?.(this.blockedEntityIds, false);
  }

  /**
   * 按屏蔽索引过滤可同步实体集合。
   * syncOnlyEnabledEntities 关闭、或索引未加载/为空时直接返回原数组（短路）。
   * @param entities 待过滤的 HA 实体列表。
   * @returns 过滤掉禁用/隐藏实体后的列表。
   */
  filterSyncableStates(entities: HaEntity[]): HaEntity[] {
    const haCfg = this.deps.getHaCfg();
    if (!haCfg.syncOnlyEnabledEntities) return entities;
    if (!this.entityRegistryLoaded || !this.blockedEntityIds.size) return entities;
    const filtered = filterHaEntitiesByBlockedIds(entities, this.blockedEntityIds);
    if (filtered.length < entities.length) {
      this.deps.logger.log(
        `实体同步过滤:${entities.length} → ${filtered.length}(已排除 HA 禁用/隐藏实体)`,
      );
    }
    return filtered;
  }

  /** 单个实体是否可同步（未在屏蔽集中）。索引未加载时放行，避免冷启动误杀。 */
  isEntitySyncable(entityId: string): boolean {
    const haCfg = this.deps.getHaCfg();
    if (!haCfg.syncOnlyEnabledEntities) return true;
    if (!this.entityRegistryLoaded) return true;
    return !this.blockedEntityIds.has(entityId);
  }

  /** 当前屏蔽集快照（供配置热更新时重同步 HaEntitySyncFilterService） */
  getBlockedEntityIds(): Set<string> {
    return new Set(this.blockedEntityIds);
  }

  isRegistryLoaded(): boolean {
    return this.entityRegistryLoaded;
  }

  /** 按最新 haConnector.syncOnlyEnabledEntities 重推共享过滤视图 */
  syncSharedFilter(
    configure: (syncOnly: boolean, blocked: Set<string>, loaded: boolean) => void,
  ): void {
    configure(
      this.deps.getHaCfg().syncOnlyEnabledEntities,
      this.blockedEntityIds,
      this.entityRegistryLoaded,
    );
  }

  /**
   * 获取实体注册表（带 TTL 缓存 + 单飞去重）。
   * 缓存命中直接返回；否则发起 loadRegistry，并发请求合并到同一 inflight Promise。
   * @returns HA 实体注册表条目数组。
   */
  async fetchRegistry(): Promise<HaEntityRegistryEntry[]> {
    const haCfg = this.deps.getHaCfg();
    if (
      this.entityRegistryCache &&
      Date.now() - this.entityRegistryCache.at < haCfg.entityRegistryCacheMs
    ) {
      return this.entityRegistryCache.rows;
    }
    if (!this.entityRegistryInflight) {
      this.entityRegistryInflight = this.loadRegistry().finally(() => {
        this.entityRegistryInflight = null;
      });
    }
    return this.entityRegistryInflight;
  }

  /**
   * 强制重新拉取实体注册表。
   * 先等待在途拉取结束（避免与在途大包抢超时），再清缓存并触发新一轮 fetchRegistry。
   */
  async refreshRegistry(): Promise<HaEntityRegistryEntry[]> {
    this.entityRegistryCache = null;
    // 等在途拉取结束再重拉，避免双发大包 registry result 互相抢超时
    if (this.entityRegistryInflight) {
      try {
        await this.entityRegistryInflight;
      } catch {
        /* 在途失败仍强制重拉 */
      }
    }
    this.entityRegistryCache = null;
    return this.fetchRegistry();
  }

  /**
   * 实际拉取实体注册表：WebSocket 优先（config/entity_registry/list），失败降级 REST。
   * 成功后写入缓存并重建屏蔽索引；WS 与 REST 均失败时返回空数组并告警。
   */
  private async loadRegistry(): Promise<HaEntityRegistryEntry[]> {
    const haCfg = this.deps.getHaCfg();
    if (this.deps.isWsConnected()) {
      try {
        const rows = await this.deps.sendWsRequest<Array<Record<string, unknown>>>(
          'config/entity_registry/list',
          undefined,
          haCfg.entityRegistryTimeoutMs,
        );
        if (Array.isArray(rows) && rows.length) {
          this.deps.logger.log(`实体注册表 WebSocket 成功: ${rows.length} 条`);
          const mapped = rows
            .map((e) => mapHaEntityRegistryRow(e))
            .filter(Boolean) as HaEntityRegistryEntry[];
          await this.finalizeCache(mapped);
          return mapped;
        }
      } catch (err: unknown) {
        this.deps.logger.warn(`WebSocket 实体注册表失败: ${getErrorMessage(err)}`);
      }
    }
    const fromRest = await this.deps.restClient.fetchEntityRegistry(haCfg.entityRegistryTimeoutMs);
    if (fromRest.length) {
      await this.finalizeCache(fromRest);
      return fromRest;
    }
    this.deps.logger.warn('实体注册表拉取失败,模板发现可能为空');
    return [];
  }

  /** 写入缓存前补充 display hidden 实体并重建屏蔽索引（仅在 rows 非空时缓存） */
  private async finalizeCache(rows: HaEntityRegistryEntry[]): Promise<void> {
    const displayHidden = await this.fetchDisplayHiddenEntityIds();
    this.rebuildBlockedIndex(rows, displayHidden);
    if (rows.length) this.entityRegistryCache = { rows, at: Date.now() };
  }

  /**
   * 拉取「列表展示隐藏」实体集合（config/entity_registry/list_for_display）。
   * 仅在 WS 连接时拉取，接口不可用时返回空集（仅 debug 日志，不影响主流程）。
   */
  private async fetchDisplayHiddenEntityIds(): Promise<Set<string>> {
    if (!this.deps.isWsConnected()) return new Set();
    try {
      const result = await this.deps.sendWsRequest<{
        entities?: Array<{ entity_id?: string; hidden?: boolean }>;
      }>(
        'config/entity_registry/list_for_display',
        undefined,
        this.deps.getHaCfg().entityRegistryTimeoutMs,
      );
      const hidden = new Set<string>();
      for (const row of result?.entities ?? []) {
        if (row?.entity_id && row.hidden) hidden.add(row.entity_id);
      }
      return hidden;
    } catch (err: unknown) {
      this.deps.logger.debug(`列表展示接口不可用: ${getErrorMessage(err)}`);
      return new Set();
    }
  }

  /**
   * 重建屏蔽实体索引：disabled_by → 禁用；hidden_by/hidden → 注册表隐藏；
   * 补充 displayHidden 中尚未标记的展示隐藏实体。完成后触发 onFilterIndexRebuilt 通知上层。
   */
  private rebuildBlockedIndex(rows: HaEntityRegistryEntry[], displayHidden?: Set<string>): void {
    this.blockedEntityIds.clear();
    let hiddenByRegistry = 0;
    let disabled = 0;
    for (const entry of rows) {
      if (!entry.entity_id) continue;
      if (entry.disabled_by) {
        this.blockedEntityIds.add(entry.entity_id);
        disabled++;
      } else if (entry.hidden_by || entry.hidden) {
        this.blockedEntityIds.add(entry.entity_id);
        hiddenByRegistry++;
      }
    }
    let hiddenByDisplay = 0;
    if (displayHidden) {
      for (const entityId of displayHidden) {
        if (!this.blockedEntityIds.has(entityId)) {
          this.blockedEntityIds.add(entityId);
          hiddenByDisplay++;
        }
      }
    }
    const haCfg = this.deps.getHaCfg();
    if (haCfg.syncOnlyEnabledEntities && this.blockedEntityIds.size) {
      this.deps.logger.log(
        `实体同步屏蔽索引:禁用 ${disabled},注册表隐藏 ${hiddenByRegistry}` +
          (hiddenByDisplay ? `,展示列表隐藏 +${hiddenByDisplay}` : '') +
          `,合计 ${this.blockedEntityIds.size}`,
      );
    }
    this.entityRegistryLoaded = true;
    this.deps.onFilterIndexRebuilt?.(this.blockedEntityIds, true);
  }
}
