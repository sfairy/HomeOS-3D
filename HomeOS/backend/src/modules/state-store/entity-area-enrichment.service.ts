/**
 * 实体区域（房间）补全服务
 *
 * 所属模块：state-store
 * 职责：
 *  - 基于 HA entity_registry / area_registry / device_registry 构建实体→区域索引
 *  - 在实体状态对外暴露前，将 area_id / area_name 注入 attributes
 *  - 区域绑定变更时，向 state-store 与事件总线补发 STATE_CHANGED，保证前端实时刷新
 * 依赖：StateStoreService（写回热路径）、HaRegistryQueryService（注册表查询）、EventEmitter2（事件扇出）
 */
import { getErrorMessage } from '../../common/utils';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { HA_EVENTS } from '../../shared/types';
import type { HaEntity, HaStateChangeEvent } from '../../shared/types';
import { StateStoreService } from './service';
import { HaRegistryQueryService } from '../../shared/ha/entity-state-bridge.service';
import { scheduleBackgroundTask } from '../../common/resilience/circuit-breaker.helper';
import {
  buildAreaNameMap,
  buildDeviceAreaMap,
  buildEntityAreaIndex,
  enrichEntitiesAreas,
  enrichEntityAreas,
  HA_ENTITY_REGISTRY_UPDATED,
  ENTITY_AREA_CACHE_MS,
  type EntityAreaIndex,
} from '../../shared/ha/entity-area-enrich.util';

/**
 * 实体区域补全服务
 *
 * DI 角色：@Injectable，由 StateStoreModule 提供。监听 HA 连接 / 初始状态 / 注册表更新事件，
 * 维护一份带 TTL 的实体→区域索引，并提供同步 / 异步两种补全入口。
 */
@Injectable()
export class EntityAreaEnrichmentService {
  private readonly logger = new Logger(EntityAreaEnrichmentService.name);
  private index: EntityAreaIndex = new Map();
  private haAreas: Array<{ id: string; name: string }> = [];
  private indexAt = 0;
  private inflight: Promise<EntityAreaIndex> | null = null;
  /** invalidate 后递增，丢弃过期的在途 loadIndex 结果 */
  private loadGen = 0;

  constructor(
    private readonly registryQuery: HaRegistryQueryService,
    private readonly stateStore: StateStoreService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** 区域索引缓存有效期（毫秒），来自 entity-area-enrich.util 常量 */
  private get cacheTtlMs(): number {
    return ENTITY_AREA_CACHE_MS;
  }

  /**
   * 失效区域索引与注册表缓存。
   * 副作用：清空内存索引、重置时间戳、并通知 HaRegistryQueryService 清除其内部缓存，
   * 下次 ensureLoaded 时会重新拉取注册表。
   */
  invalidate(): void {
    this.index = new Map();
    this.haAreas = [];
    this.indexAt = 0;
    this.loadGen += 1;
    this.inflight = null;
    this.registryQuery.invalidateEntityRegistryCache();
  }

  /**
   * HA 连接成功后预加载区域索引，避免首次实体查询时的延迟毛刺。
   * 失败仅 debug 记录，不阻断主流程。
   */
  @OnEvent(HA_EVENTS.CONNECTED)
  onHaConnected(): void {
    void this.ensureLoaded().catch((err: unknown) => {
      const msg = getErrorMessage(err);
      this.logger.debug(`HA 连接后预加载区域索引失败: ${msg}`);
    });
  }

  /**
   * HA 下发全量初始状态后，对 state-store 中已存在的实体补全区域信息。
   * 通过 scheduleBackgroundTask 后台执行，避免阻塞初始状态处理热路径。
   */
  @OnEvent(HA_EVENTS.INITIAL_STATES)
  onInitialStates(): void {
    scheduleBackgroundTask(this.logger, '初始状态区域补全', () => this.reconcileStoreAreas());
  }

  /**
   * 实体注册表变更（如分配区域、重命名）时失效缓存并异步重建索引。
   * 触发场景：用户在 HA 中调整实体所属区域后。
   */
  @OnEvent(HA_ENTITY_REGISTRY_UPDATED)
  onEntityRegistryUpdated(): void {
    this.invalidate();
    void this.ensureLoaded().catch(() => undefined);
  }

  /**
   * 确保区域索引已加载（带 TTL 缓存与并发去重）。
   * @returns 当前实体→区域索引；命中缓存时直接返回，否则触发 loadIndex 并通过 inflight 去重并发请求。
   */
  async ensureLoaded(): Promise<EntityAreaIndex> {
    if (this.index.size > 0 && Date.now() - this.indexAt < this.cacheTtlMs) {
      return this.index;
    }
    if (this.inflight) return this.inflight;
    this.inflight = this.loadIndex().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  /**
   * 从 HA 并发拉取实体 / 区域 / 设备注册表，构建实体→区域索引。
   * @returns 构建完成的索引；失败时返回空 Map 并记录告警，不抛出异常。
   * @remarks 三类注册表通过 Promise.all 并发请求；区域名优先取 HA name，回退 area_id。
   */
  private async loadIndex(): Promise<EntityAreaIndex> {
    const gen = this.loadGen;
    try {
      const [registry, areas, devices] = await Promise.all([
        this.registryQuery.fetchEntityRegistry(),
        this.registryQuery.fetchAreaRegistry(),
        this.registryQuery.fetchDeviceRegistry(),
      ]);
      if (gen !== this.loadGen) return this.index;
      const areaNameById = buildAreaNameMap(areas);
      const deviceAreaById = buildDeviceAreaMap(devices);
      this.haAreas = areas.map((area) => ({
        id: area.area_id,
        name: area.name || area.area_id,
      }));
      this.index = buildEntityAreaIndex(registry, areaNameById, deviceAreaById);
      this.indexAt = Date.now();
      if (this.index.size) {
        this.logger.log(
          `实体区域索引已加载:${this.index.size} 条` +
            (deviceAreaById.size ? `(含 ${deviceAreaById.size} 个设备区域)` : ''),
        );
      } else if (registry.length) {
        this.logger.warn(`实体注册表 ${registry.length} 条,但未解析到任何区域绑定`);
      }
    } catch (err: unknown) {
      if (gen !== this.loadGen) return this.index;
      const msg = getErrorMessage(err);
      this.logger.warn(`实体区域索引加载失败: ${msg}`);
      this.index = new Map();
      this.indexAt = Date.now();
    }
    return this.index;
  }

  /**
   * 异步补全实体列表的区域信息（先 ensureLoaded 再批量注入）。
   * @param entities 待补全的实体数组
   * @returns 注入 area_id / area_name 后的实体数组
   * @remarks 注册表慢时最多等 400ms，超时用已有索引（可为空），避免列表接口卡 1s+。
   */
  async enrichEntities(entities: HaEntity[]): Promise<HaEntity[]> {
    await Promise.race([
      this.ensureLoaded(),
      new Promise<void>((resolve) => setTimeout(resolve, 400)),
    ]);
    return enrichEntitiesAreas(entities, this.index);
  }

  /**
   * 同步补全单个实体的区域信息（依赖已加载的内存索引，索引为空时原样返回）。
   * @param entity 待补全的实体
   * @returns 补全后的实体；索引未加载时不做修改
   */
  enrichEntitySync(entity: HaEntity): HaEntity {
    if (!this.index.size) return entity;
    return enrichEntityAreas(entity, this.index);
  }

  /**
   * 同步批量补全实体区域信息（索引未加载时原样返回，避免无谓拷贝）。
   * @param entities 待补全的实体数组
   * @returns 补全后的实体数组
   */
  enrichEntitiesSync(entities: HaEntity[]): HaEntity[] {
    if (!this.index.size) return entities;
    return enrichEntitiesAreas(entities, this.index);
  }

  /**
   * 同步补全状态变更事件中 new_state 的区域信息。
   * @param event HA 状态变更事件；new_state 为空时原样返回。
   * @returns 补全后的事件；若补全未改变 new_state 则返回原事件引用。
   */
  enrichStateChangeEventSync(event: HaStateChangeEvent): HaStateChangeEvent {
    if (!event.new_state) return event;
    const newState = this.enrichEntitySync(event.new_state);
    if (newState === event.new_state) return event;
    return { ...event, new_state: newState };
  }

  /**
   * 返回最近一次 loadIndex 缓存的 HA 区域列表（id + name）。
   * @returns 区域数组；索引未加载时返回空数组。
   */
  getCachedHaAreas(): Array<{ id: string; name: string }> {
    return this.haAreas;
  }

  /** 返回某区域下的实体 ID（依赖 ensureLoaded 后的注册表索引） */
  getEntityIdsByAreaId(areaId: string): string[] {
    const id = String(areaId || '').trim();
    if (!id || !this.index.size) return [];
    const ids: string[] = [];
    for (const [entityId, info] of this.index) {
      if (info.area_id === id) ids.push(entityId);
    }
    return ids;
  }

  /**
   * 对外广播指定实体的区域变更：逐实体比对补全前后的 area_id / area_name，
   * 仅在确实变化时通过 state-store 热路径与事件总线补发 STATE_CHANGED。
   * @param entityIds 需要检查的实体 ID 列表
   * @remarks 分批处理（batchSize=40），每批之间通过 setImmediate 让出事件循环，避免长任务阻塞。
   */
  async publishEntityAreaUpdates(entityIds: string[]): Promise<void> {
    if (!entityIds.length) return;
    await this.ensureLoaded();
    const changedAt = new Date().toISOString();
    // 分批广播并通过 setImmediate 让出事件循环，避免大量实体一次性补全阻塞高频状态广播
    const batchSize = 40;
    for (let i = 0; i < entityIds.length; i += batchSize) {
      const batch = entityIds.slice(i, i + batchSize);
      await new Promise<void>((resolve) => {
        setImmediate(() => {
          this.publishEntityAreaBatch(batch, changedAt);
          resolve();
        });
      });
    }
  }

  /**
   * 单批实体区域变更广播（由 publishEntityAreaUpdates 分批调用）。
   * @param entityIds 本批次实体 ID
   * @param changedAt 统一变更时间戳
   * @remarks 关键路径：对每个实体补全后逐字段比对 area_id/area_name，跳过无变更项以减少无效事件扇出。
   */
  private publishEntityAreaBatch(entityIds: string[], changedAt: string): void {
    for (const entityId of entityIds) {
      const current = this.stateStore.getById(entityId);
      if (!current) continue;
      const enriched = this.enrichEntitySync(current);
      const beforeId = String(current.attributes?.area_id || '').trim();
      const beforeName = String(current.attributes?.area_name || '').trim();
      const afterId = String(enriched.attributes?.area_id || '').trim();
      const afterName = String(enriched.attributes?.area_name || '').trim();
      if (beforeId === afterId && beforeName === afterName) {
        continue;
      }
      const event: HaStateChangeEvent = {
        entity_id: entityId,
        old_state: current,
        new_state: enriched,
        changed_at: changedAt,
      };
      this.stateStore.applyStateChangedHot(event);
      this.eventEmitter.emit(HA_EVENTS.STATE_CHANGED, event);
    }
  }

  /**
   * 对 state-store 中所有已有实体补全区域信息并广播变更。
   * 触发场景：HA 下发初始状态后（onInitialStates），确保历史实体也带上最新区域绑定。
   */
  private async reconcileStoreAreas(): Promise<void> {
    await this.ensureLoaded();
    if (!this.index.size) return;
    const entityIds = this.stateStore
      .getAll()
      .map((entity) => entity.entity_id)
      .filter((entityId) => this.index.has(entityId));
    if (!entityIds.length) return;
    await this.publishEntityAreaUpdates(entityIds);
  }
}
