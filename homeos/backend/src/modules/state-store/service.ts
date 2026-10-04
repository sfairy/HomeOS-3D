/**
 * 状态存储服务：HA 实体 L1 内存 + L2 Redis 影子缓存与事件日志。
 *
 * 职责：
 * - 维护 HA 全量实体在内存的 Map 快照与 domain 索引，对外提供 O(1)/O(domain) 读取。
 * - 处理 INITIAL_STATES 事件：支持数组 / Redis shadow ref / sync plan 三种 payload 形态。
 * - 接收 state_changed Hot Path：单调性校验（拒绝乱序回放）→ L1 更新 + recentChanges 入环 → 排队 Redis 增量写。
 * - HA 断连期间通过 REST poll 补同步，并计算 resync diff 供 WS 端增量重推。
 * - 维护最近变更环形缓冲（recentChanges + 自增 seq），供客户端断线重连 state_replay。
 *
 * 关键依赖：HaEntitySyncFilterService（同步白名单）、HaInitialStatesCoordinatorService、
 * AppConfigService、StateStorePersistenceService（L2 持久化）、internals 工具集。
 */
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { HA_EVENTS } from '../../shared/types';
import type { HaEntity, HaStateChangeEvent } from '../../shared/types';
import { HaEntitySyncFilterService } from '../../shared/ha/entity-sync-filter.service';
import { HaInitialStatesCoordinatorService } from '../../shared/ha/entity-state-bridge.service';

import { AppConfigService, APP_CONFIG_UPDATED } from '../../shared/app-config/service';
import { isInitialStatesRefPayload } from '../../shared/redis/event-bus-bridge.util';
import { computeResyncDiff, isInitialStatesSyncPlan } from '../../shared/ha/entity-state-diff.util';
import type { InitialStatesSyncPlan } from '../../shared/ha/entity-state-diff.util';
import { StateStorePersistenceService } from './state-store-persistence.service';
import {
  entityShadowKey,
  filterRecentChangesSince,
  pushRecentChangeEntry,
  RecentChangeRingBuffer,
  buildDomainBuckets,
  getDomainCounts,
  getEntitiesByDomain,
  indexEntityInDomainBuckets,
  unindexEntityFromDomainBuckets,
  computeStateStoreMemoryDiagnostics,
  computeStateStoreStaleInfo,
} from './internals';

/**
 * 状态存储服务
 * L1 内存 Map + L2 Redis 即时读写 + 增量持久化（P-15 优化）。
 *
 * 性能要点：
 *  - trackKeys：记录所有已持久化的 Redis key，避免 SCAN 全键遍历
 *  - 全量持久化时不再 DEL 所有旧 key + 重新 SET，改为 MSET 批量覆盖
 *  - 延迟校验 key 一致性（空闲时），不阻塞主流程
 */
@Injectable()
export class StateStoreService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StateStoreService.name);
  private store = new Map<string, HaEntity>();
  /** domain → entity_id 索引，加速 getAll(domain) */
  private domainBuckets = new Map<string, Set<string>>();
  private haSynced = false;
  private haConnected = false;
  private haDisconnectedAt: number | null = null;
  private lastSyncedAt: string | null = null;
  private lastStateChangeAt: number | null = null;

  /** 近期状态变更环形缓冲（WS 断线补发）— 仅存 entity_id，读取时从 L1 解析 */
  private recentChanges: RecentChangeRingBuffer;
  private recentChangeSeq = 0;

  constructor(
    private readonly entitySyncFilter: HaEntitySyncFilterService,
    private readonly initialStatesCoordinator: HaInitialStatesCoordinatorService,
    private readonly appConfig: AppConfigService,
    private readonly persistence: StateStorePersistenceService,
  ) {
    this.recentChanges = new RecentChangeRingBuffer(this.maxRecentChanges);
  }

  /** 当前 stateStore 配置快照（每次读取均从 AppConfigService 取最新值） */
  private get stateCfg() {
    return this.appConfig.get('stateStore');
  }

  /** recentChanges 环形缓冲容量上限（来自 stateStore.maxRecentChanges） */
  private get maxRecentChanges() {
    return this.stateCfg.maxRecentChanges;
  }

  /** 模块初始化：日志输出、Redis 连接与恢复、初始状态补全 */
  onModuleInit() {
    this.logger.log('状态存储已初始化.');
    if (this.persistence.isRedisReady()) {
      void this.restoreFromRedis();
    } else {
      this.logger.warn('REDIS_URL 未配置,仅使用内存 L1 缓存运行.');
    }
    void this.recoverInitialStatesIfNeeded();
  }

  /** 模块销毁：委托 persistence 释放 Redis 客户端与 flush 定时器 */
  onModuleDestroy() {
    this.persistence.onModuleDestroy();
  }

  /** 配置热更新：stateStore 变更时重排 Redis 持久化 flush 间隔 */
  @OnEvent(APP_CONFIG_UPDATED)
  onAppConfigUpdated(keys: string[]) {
    if (keys.includes('stateStore')) {
      this.persistence.rescheduleFlush();
    }
  }

  /** 从 Redis shadow 恢复实体到 L1 store（仅恢复不在同步白名单外且 store 中不存在的实体） */
  private async restoreFromRedis() {
    await this.persistence.restoreFromRedis(this.haSynced, (entity) => {
      if (!this.entitySyncFilter.isEntitySyncable(entity.entity_id)) return false;
      if (!this.store.has(entity.entity_id)) {
        this.store.set(entity.entity_id, entity);
        this.indexEntityId(entity.entity_id);
        return true;
      }
      return false;
    });
  }

  /**
   * 处理 INITIAL_STATES 事件：支持三种载荷形态。
   * @remarks sync plan 直接跳过（由 syncInitialStatesFromHa 处理）；ref payload 从 Redis shadow 加载；
   *          数组形态直接应用全量状态。
   */
  @OnEvent(HA_EVENTS.INITIAL_STATES)
  handleInitialStates(entities: HaEntity[] | unknown) {
    if (isInitialStatesSyncPlan(entities)) {
      return;
    }
    if (isInitialStatesRefPayload(entities)) {
      void this.loadFromRedisShadowRef(entities);
      return;
    }
    if (Array.isArray(entities)) {
      this.applyInitialStates(this.entitySyncFilter.filterSyncableStates(entities), '事件推送');
    }
  }

  /**
   * Leader：应用 HA get_states 并决定全量/增量 resync 推送策略。
   * 由 HaConnectorService 在 emit INITIAL_STATES 前调用。
   */
  syncInitialStatesFromHa(entities: HaEntity[]): InitialStatesSyncPlan {
    const filtered = this.entitySyncFilter.filterSyncableStates(entities);
    // HA 重连/恢复增量重推：仅当存在历史基线（非首次连接/非空库）时计算断线期间变化 diff；
    // 无基线时由推送方回退全量重推。需在 applyInitialStates 覆盖快照前计算。
    const resyncChanges =
      this.haSynced && this.store.size > 0 ? computeResyncDiff(this.store, filtered) : undefined;
    this.applyInitialStates(filtered, 'HA 全量状态');
    const finalEntities = this.getAll();
    if (finalEntities.length < entities.length) {
      this.logger.log(
        `实体同步过滤:${entities.length} → ${finalEntities.length}(已排除 HA 禁用/隐藏实体)`,
      );
    }
    return {
      _syncPlan: true,
      entities: finalEntities,
      ...(resyncChanges !== undefined ? { resyncChanges } : {}),
    };
  }

  /**
   * HA WS 断连期间 REST /api/states 补同步。
   * 首次或空库走全量；否则仅应用 diff 并返回变更列表供 WS 扇出。
   */
  applyRestPollStates(entities: HaEntity[]): { full: boolean; changes: HaStateChangeEvent[] } {
    const filtered = this.entitySyncFilter.filterSyncableStates(entities);
    if (!filtered.length) return { full: false, changes: [] };
    if (!this.haSynced || this.store.size === 0) {
      this.applyInitialStates(filtered, 'REST 轮询');
      return { full: true, changes: [] };
    }
    const changedAt = new Date().toISOString();
    const changes = computeResyncDiff(this.store, filtered, changedAt);
    // 仅计算 diff，由调用方经 ingress pipeline 单一路径落库与推送，避免双写 recentChangeSeq
    return { full: false, changes };
  }

  /** Follower：从 Redis shadow 加载全量快照（INITIAL_STATES 桥接引用） */
  async loadFromRedisShadowRef(ref: { count: number; at?: string }): Promise<boolean> {
    const loaded = await this.persistence.loadFromRedisShadowRef(ref);
    if (!loaded) return false;
    this.applyInitialStates(this.entitySyncFilter.filterSyncableStates(loaded), 'Redis 影子缓存');
    this.logger.log(`从 Redis 影子缓存加载 ${loaded.length} 实体(引用期望 ${ref.count})`);
    return true;
  }

  /** 写入全量快照（事件或 HA 连接器补全）— 原子替换 Map，避免 clear 窗口竞态 */
  applyInitialStates(entities: HaEntity[], source = '未知') {
    const t0 = Date.now();
    const newStore = new Map<string, HaEntity>();
    for (const entity of entities) {
      // 流式 bootstrap：live 事件可能比 get_states 快照更新，单调保留较新 L1
      const existing = this.store.get(entity.entity_id);
      if (existing) {
        const existingTs = Date.parse(String(existing.last_updated || existing.last_changed || ''));
        const incomingTs = Date.parse(String(entity.last_updated || entity.last_changed || ''));
        if (
          Number.isFinite(existingTs) &&
          Number.isFinite(incomingTs) &&
          existingTs > incomingTs
        ) {
          newStore.set(entity.entity_id, existing);
          continue;
        }
      }
      newStore.set(entity.entity_id, entity);
    }
    const newBuckets = buildDomainBuckets([...newStore.values()]);
    this.store = newStore;
    this.domainBuckets = newBuckets;

    this.haSynced = true;
    this.lastSyncedAt = new Date().toISOString();
    this.lastStateChangeAt = Date.now();
    this.logger.log(`✅ 从 HA 缓存了 ${this.store.size} 个实体(${Date.now() - t0}ms,${source})`);

    if (this.appConfig.applyRuntimePerfTuning(this.store.size)) {
      this.logger.log(`实体数 ${this.store.size}:已应用 WS 批处理自适应调优`);
    }

    if (this.persistence.isRedisReady()) {
      void this.persistence.persistAllToRedis([...this.store.values()]);
    }

    this.initialStatesCoordinator.clearInitialStatesSnapshot();
  }

  /**
   * INITIAL_STATES 事件可能早于 @OnEvent 监听器注册（启动竞态）。
   * 从 HaConnector 缓存补全 state-store。
   */
  async recoverInitialStatesIfNeeded(): Promise<boolean> {
    if (this.haSynced) return true;
    await this.initialStatesCoordinator.waitUntilInitialStatesReady(120_000);
    if (this.haSynced) return true;
    await this.initialStatesCoordinator.fetchEntityRegistry();
    const cached = this.initialStatesCoordinator.getLastInitialStates();
    if (cached?.length) {
      this.applyInitialStates(
        this.entitySyncFilter.filterSyncableStates(cached),
        '连接器恢复',
      );
      return true;
    }
    return this.haSynced;
  }

  /** 管理员手动触发：向 HA 重新 get_states 并写入 state-store */
  async resyncFromHa(): Promise<{ haCount: number; storeCount: number; haSynced: boolean }> {
    const haCount = await this.initialStatesCoordinator.requestStateResync();
    if (!this.haSynced) {
      await this.recoverInitialStatesIfNeeded();
    }
    return {
      haCount,
      storeCount: this.getCount(),
      haSynced: this.haSynced,
    };
  }

  /** 推入一条近期变更条目并返回递增序号（供 WS 断线补发使用） */
  pushRecentChange(entityId: string) {
    this.recentChangeSeq = pushRecentChangeEntry(
      this.recentChanges,
      this.recentChangeSeq,
      entityId,
      this.maxRecentChanges,
    );
    return this.recentChangeSeq;
  }

  /** 按 since / lastEventId 过滤近期变更并解析 new_state */
  getRecentChangesSince(sinceMs?: number, lastEventId?: number) {
    return filterRecentChangesSince(this.recentChanges, this.store, sinceMs, lastEventId);
  }

  /** 返回最新变更序号（客户端用于下次增量查询的 lastEventId） */
  getLatestChangeId(): number {
    return this.recentChangeSeq;
  }

  /** HA 连接成功：标记已连接并清除断连时间戳 */
  @OnEvent(HA_EVENTS.CONNECTED)
  handleHaConnected() {
    this.haConnected = true;
    this.haDisconnectedAt = null;
  }

  /** HA 断连：标记未连接并记录断连时间戳（用于陈旧度判定） */
  @OnEvent(HA_EVENTS.DISCONNECTED)
  handleHaDisconnected() {
    this.haConnected = false;
    this.haDisconnectedAt = Date.now();
  }

  /** Hot Path：更新 L1 内存与 recentChanges，排队 Redis 增量写；未写入时返回 false */
  applyStateChangedHot(event: HaStateChangeEvent): boolean {
    if (event.new_state && !this.entitySyncFilter.isEntitySyncable(event.entity_id)) {
      return false;
    }
    // 单调性：拒绝时间戳更旧的回放/乱序事件，避免 L1 被陈旧态覆盖
    if (event.new_state) {
      const prev = this.store.get(event.entity_id);
      if (prev) {
        const incomingTs = Date.parse(
          String(event.new_state.last_updated || event.new_state.last_changed || ''),
        );
        const prevTs = Date.parse(String(prev.last_updated || prev.last_changed || ''));
        if (Number.isFinite(incomingTs) && Number.isFinite(prevTs) && incomingTs < prevTs) {
          return false;
        }
      }
    }
    this.lastStateChangeAt = Date.now();
    const key = entityShadowKey(event.entity_id);
    if (event.new_state) {
      // Hot Path：写 L1 + 索引 + recentChanges + 排队 Redis 增量写（序列化延迟到 flush 批量执行）
      this.store.set(event.entity_id, event.new_state);
      this.indexEntityId(event.entity_id);
      this.pushRecentChange(event.entity_id);
      this.persistence.queueShadowWrite(key, 'set', event.new_state);
    } else {
      this.store.delete(event.entity_id);
      this.unindexEntityId(event.entity_id);
      this.persistence.queueShadowWrite(key, 'del');
    }
    return true;
  }

  /** 将实体加入 domain 索引（applyInitialStates / Hot Path 新增时调用） */
  private indexEntityId(entityId: string) {
    indexEntityInDomainBuckets(this.domainBuckets, entityId);
  }

  /** 将实体从 domain 索引移除（Hot Path 删除时调用） */
  private unindexEntityId(entityId: string) {
    unindexEntityFromDomainBuckets(this.domainBuckets, entityId);
  }

  /** 获取全部实体（可选按域过滤，通过 domainBuckets 索引加速） */
  getAll(domain?: string): HaEntity[] {
    return getEntitiesByDomain(this.store, this.domainBuckets, domain);
  }

  /**
   * 按谓词扫描实体：命中即收集 entity_id。
   * 与 getAll() 不同，不分配全量实体数组，仅返回命中结果，适合命令授权等
   * 需要按 area_id / labels 等运行时属性解析目标的低频热路径。
   */
  scanEntities(predicate: (entity: HaEntity) => boolean): string[] {
    const out: string[] = [];
    for (const entity of this.store.values()) {
      if (predicate(entity)) out.push(entity.entity_id);
    }
    return out;
  }

  /** 按 entity_id 获取单个实体（O(1) Map 查找） */
  getById(entityId: string): HaEntity | undefined {
    return this.store.get(entityId);
  }

  /** 获取各域实体计数（按数量降序） */
  getDomains() {
    return getDomainCounts(this.store);
  }

  /** 返回当前 store 中的实体总数 */
  getCount() {
    return this.store.size;
  }

  /** 运维诊断：估算 StateStore 内存占用构成 */
  getMemoryDiagnostics() {
    return computeStateStoreMemoryDiagnostics({
      store: this.store,
      recentChanges: this.recentChanges,
      maxRecentChanges: this.maxRecentChanges,
      trackedRedisKeys: this.persistence.getTrackedKeysCount(),
      redisPendingWrites: this.persistence.getRedisPendingCount(),
      haInitialStatesCached: this.initialStatesCoordinator.hasInitialStatesSnapshot(),
    });
  }

  /** HA 是否已完成初始状态同步 */
  isHaSynced() {
    return this.haSynced;
  }

  /** 数据是否陈旧（委托 getStaleInfo 判定） */
  isDataStale(): boolean {
    return this.getStaleInfo().stale;
  }

  /**
   * 返回数据陈旧度详情：stale 标记、最近同步时间、断连时长。
   * @remarks 阈值由 stateStore.staleThresholdMs 配置（默认 12s）。
   */
  getStaleInfo(): { stale: boolean; syncedAt: string | null; disconnectedMs?: number } {
    return computeStateStoreStaleInfo({
      haConnected: this.haConnected,
      haSynced: this.haSynced,
      storeSize: this.store.size,
      lastStateChangeAt: this.lastStateChangeAt,
      lastSyncedAt: this.lastSyncedAt,
      haDisconnectedAt: this.haDisconnectedAt,
      staleThresholdMs: this.stateCfg.staleThresholdMs ?? 12_000,
    });
  }
}
