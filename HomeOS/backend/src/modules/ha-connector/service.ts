/**
 * Home Assistant 连接器核心服务。
 *
 * 职责：
 * - 作为 HA WebSocket 长连接的门面（Facade），委托 HaConnectorWsLifecycle 管理连接生命周期。
 * - 统一 callService 入口：Leader 走 WebSocket，Follower 走 Redis 桥接，断连时入队或 REST 降级。
 * - 管理实体注册表缓存、可同步实体过滤、禁用实体清理。
 * - 提供 area/device registry、自动化/脚本/场景配置、Config Flow 等 REST 代理。
 * - 响应 HA 配置变更与 Leader/Follower 角色切换，自动重连。
 *
 * 依赖：HaConfigService、HaRestClientService、HaWsLeaderService、HaCommandBridgeService、
 * HaStateIngressCoalesceService、EntityStateCacheReader/Writer、HaEntitySyncFilterService 等。
 */
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventBusService } from '../../shared/redis/event-bus.service';
import { HA_EVENTS } from '../../shared/types';
import type { HaConnectionStatus, HaEntity } from '../../shared/types';
import { HaConfigService } from './ha-config.service';
import { HaWsLeaderService } from './ha-ws-leader.service';
import type {
  EntityStateCacheReader,
  EntityStateCacheWriter,
} from '../../shared/ha/entity-state-cache.interface';
import {
  ENTITY_STATE_CACHE_READER,
  ENTITY_STATE_CACHE_WRITER,
} from '../../shared/ha/entity-state-cache.interface';
import { HaEntitySyncFilterService } from '../../shared/ha/entity-sync-filter.service';
import {
  HaInitialStatesCoordinatorService,
  HaRegistryQueryService,
} from '../../shared/ha/entity-state-bridge.service';
import { HaRestClientService, type HaEntityRegistryEntry } from './ha-rest-client.service';
import { HaConnectorCommandQueue } from './command-queue.helper';
import { HaConnectorEntityRegistry } from './entity-registry.helper';
import {
  haRegistryDegraded,
  haRegistrySuccess,
  normalizeHaAreaRegistryRows,
  normalizeHaDeviceRegistryRows,
} from './ha-registry-normalize.util';
import {
  callHaService,
  callHaServiceAsLeader,
  createCallServiceImmediateFn,
  type HaConnectorCallServiceDeps,
} from './call-service.helper';
import { subscribeHaWebRtcOffer, unsubscribeHaWs } from './webrtc.helper';
import { HaConnectorWsLifecycle, sendHaWsRequest } from './ws.helper';
import {
  resolveTemplateYamlForImport,
  type ResolveTemplateYamlOptions,
  type TemplateYamlResolveResult,
} from '../../shared/ha/template-yaml-resolver';
import { OnEvent } from '@nestjs/event-emitter';
import { HaStateEventBus } from '../../shared/ha/entity-state-bridge.service';
import { AppConfigService, APP_CONFIG_UPDATED } from '../../shared/app-config/service';
import { HaStateIngressCoalesceService } from '../../shared/ha/state-ingress-coalesce.service';
import { BusinessException, ErrorCode, getErrorMessage } from '../../common/utils';
import { API_ERROR } from '../../common/errors/api-error-messages';

/** HA 离线命令队列丢弃计数（供 HA 连接状态 API 暴露） */
let haQueueDroppedTotal = 0;

/** 递增丢弃计数，在命令队列 TTL 过期或容量满时调用。 */
function incrementHaQueueDropped(): void {
  haQueueDroppedTotal++;
}

/** @returns 累计丢弃的命令总数。 */
function getHaQueueDroppedTotal(): number {
  return haQueueDroppedTotal;
}
import { HA_ENTITY_REGISTRY_UPDATED } from '../../shared/ha/entity-area-enrich.util';
import { HaCommandBridgeService } from './ha-command-bridge.service';
import { RedisService } from '../../shared/redis/service';

/**
 * HA 连接器核心服务（@Injectable）。
 * 作为 HomeOS 与 Home Assistant 交互的统一门面，封装 WebSocket 长连接、服务调用、实体注册表管理等。
 */
@Injectable()
export class HaConnectorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HaConnectorService.name);

  /** 实体注册表缓存与同步过滤 */
  private readonly entityRegistry: HaConnectorEntityRegistry;
  /** HA 断连期间 call_service 缓冲队列 */
  private readonly commandQueue: HaConnectorCommandQueue;
  /** WebSocket 连接生命周期管理（认证、心跳、重连、bootstrap） */
  private readonly wsLifecycle: HaConnectorWsLifecycle;
  /** callService 依赖包（传递给 internals 中的纯函数） */
  private readonly callServiceDeps: HaConnectorCallServiceDeps;

  /** 标记当前重连是否为配置变更触发的主动重连（跳过 close 事件的重连调度） */
  private intentionalReconnect = false;
  /** area/device registry 最近一次拉取是否因异常降级 */
  private registryDegraded = false;
  /** registry 降级原因（供状态 API 暴露） */
  private registryDegradedReason: string | null = null;
  private droppedPersistTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly DROPPED_REDIS_KEY = 'homeos:ha-command:dropped';
  /**
   * HA 配置变更回调：失效缓存后比较主/备地址与 Token。
   * 仅当 HA 凭证真正变化时才重连；布局保存等不得打断已连通的外网会话。
   */
  private readonly onConfigUpdated = async () => {
    const previous = this.config.getLoadedEndpointsSnapshot();
    this.config.invalidateCache();
    this.restClient.invalidateCache();
    const next = await this.config.getRuntimeConfig();
    if (HaConfigService.sameEndpoints(previous, next)) {
      return;
    }
    this.config.resetFailover();
    if (!this.haLeader.isHaWsLeader()) return;
    this.logger.log('检测到 HA 配置变更,正在重连...');
    this.wsLifecycle.setDestroyed(false);
    // 标记为主动重连，避免 close 事件重复调度重连
    this.intentionalReconnect = true;
    this.wsLifecycle.cleanup();
    try {
      await this.wsLifecycle.connect();
    } finally {
      this.intentionalReconnect = false;
    }
  };

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly eventBus: EventBusService,
    private readonly config: HaConfigService,
    private readonly restClient: HaRestClientService,
    private readonly appConfig: AppConfigService,
    private readonly haLeader: HaWsLeaderService,
    private readonly ingressCoalesce: HaStateIngressCoalesceService,
    @Inject(forwardRef(() => HaCommandBridgeService))
    private readonly commandBridge: HaCommandBridgeService,
    @Inject(ENTITY_STATE_CACHE_READER)
    private readonly entityCacheReader: EntityStateCacheReader,
    @Inject(ENTITY_STATE_CACHE_WRITER)
    private readonly entityCacheWriter: EntityStateCacheWriter,
    private readonly stateEventBus: HaStateEventBus,
    private readonly entitySyncFilter: HaEntitySyncFilterService,
    private readonly initialStatesCoordinator: HaInitialStatesCoordinatorService,
    private readonly registryQuery: HaRegistryQueryService,
    private readonly redis: RedisService,
  ) {
    // 使用 ref 容器打破构造顺序循环：子模块需要引用尚未创建的 wsLifecycle
    const wsLifecycleRef: { current: HaConnectorWsLifecycle | null } = { current: null };

    this.entityRegistry = new HaConnectorEntityRegistry({
      logger: this.logger,
      getHaCfg: () => this.haCfg,
      isWsConnected: () => wsLifecycleRef.current?.isConnected() ?? false,
      sendWsRequest: (type, payload, timeoutMs) =>
        this.sendRequest(type, payload as Record<string, unknown> | undefined, timeoutMs),
      restClient: this.restClient,
      onFilterIndexRebuilt: (blocked, loaded) => {
        this.entitySyncFilter.configure(this.haCfg.syncOnlyEnabledEntities, blocked, loaded);
      },
    });

    const entityRegistryRef: { current: HaConnectorEntityRegistry | null } = {
      current: this.entityRegistry,
    };
    const callServiceDepsRef: { current: HaConnectorCallServiceDeps | null } = { current: null };

    const commandQueue = new HaConnectorCommandQueue({
      send: (domain, service, entityId, serviceData, returnResponse) => {
        const deps = callServiceDepsRef.current;
        if (!deps) {
          return Promise.reject(
            new BusinessException(ErrorCode.CONFIG_ERROR, API_ERROR.HA_CALL_SERVICE_DEPS_NOT_READY),
          );
        }
        return createCallServiceImmediateFn(deps)(
          domain,
          service,
          entityId,
          serviceData,
          returnResponse,
        );
      },
      emitDropped: (reason, count = 1, command) => {
        for (let i = 0; i < count; i++) incrementHaQueueDropped();
        this.eventEmitter.emit(HA_EVENTS.QUEUE_DROPPED, {
          reason,
          count,
          total: getHaQueueDroppedTotal(),
          command,
          dropped: this.commandQueue.getDroppedRecent(),
        });
      },
      getMax: () => this.haCfg.commandQueueMax,
      getTtlMs: () => this.haCfg.commandQueueTtlMs,
      isConnected: () => wsLifecycleRef.current?.isConnected() ?? false,
      persistDropped: (items) => this.schedulePersistDropped(items),
    });
    this.commandQueue = commandQueue;

    const wsLifecycle = new HaConnectorWsLifecycle({
      logger: this.logger,
      config: this.config,
      eventBus: this.eventBus,
      haLeader: this.haLeader,
      restClient: this.restClient,
      entityCacheReader: this.entityCacheReader,
      entityCacheWriter: this.entityCacheWriter,
      ingressCoalesce: this.ingressCoalesce,
      commandQueue: this.commandQueue,
      getHaCfg: () => this.haCfg,
      getIntentionalReconnect: () => this.intentionalReconnect,
      invalidateEntityRegistryCache: () => entityRegistryRef.current?.invalidateCache(),
      ensureEntityRegistryLoaded: async () => {
        await entityRegistryRef.current?.fetchRegistry();
      },
      filterSyncableStates: (entities) =>
        entityRegistryRef.current?.filterSyncableStates(entities) ?? entities,
      isEntitySyncable: (entityId) =>
        entityRegistryRef.current?.isEntitySyncable(entityId) ??
        this.entitySyncFilter.isEntitySyncable(entityId),
      onEntityRegistryUpdated: () => this.handleEntityRegistryUpdated(),
      purgeNonSyncableFromCache: () => this.purgeNonSyncableFromStateStore(),
    });
    wsLifecycleRef.current = wsLifecycle;
    this.wsLifecycle = wsLifecycle;

    entityRegistryRef.current = this.entityRegistry;

    this.callServiceDeps = {
      logger: this.logger,
      wsLifecycle: this.wsLifecycle,
      commandQueue: this.commandQueue,
      haLeader: this.haLeader,
      commandBridge: this.commandBridge,
      restClient: this.restClient,
      getEntityState: (entityId) => this.entityCacheReader.getById(entityId)?.state,
    };
    callServiceDepsRef.current = this.callServiceDeps;

    // 监听系统配置变更（HA 地址/Token 更新）
    this.eventEmitter.on('SYSTEM_CONFIG_UPDATED', this.onConfigUpdated);
    // 注册 Leader/Follower 回调：当选 Leader 时建立 WS 连接，降级 Follower 时断开
    this.haLeader.setCallbacks({
      onLeader: () => {
        this.wsLifecycle.setDestroyed(false);
        void this.wsLifecycle.connect();
      },
      onFollower: () => {
        const wasConnected = this.wsLifecycle.isConnected();
        this.wsLifecycle.cleanup();
        this.wsLifecycle.onFollowerDisconnect();
        // cleanup 已摘掉 close 监听，需显式通知：Follower 侧尽快 stale，缩短 Leader 切换空窗
        if (wasConnected) {
          this.eventBus.emit(HA_EVENTS.DISCONNECTED, { reason: 'leader_failover' });
        }
      },
    });
  }

  private get haCfg() {
    return this.appConfig.get('haConnector');
  }

  @OnEvent(APP_CONFIG_UPDATED)
  onAppConfigUpdated(keys: string[]) {
    this.wsLifecycle.onAppConfigUpdated(keys);
    // Profile 切换：失效 HA 缓存并按新凭证重连（与 SYSTEM_CONFIG_UPDATED 同路径）
    if (Array.isArray(keys) && keys.includes('profiles')) {
      void this.onConfigUpdated();
    }
    // syncOnlyEnabledEntities 等过滤开关：立即重同步共享过滤视图，避免「已保存但 Hot Path 仍用旧标志」
    if (Array.isArray(keys) && keys.includes('haConnector')) {
      this.applySyncFilterConfigChange();
    }
  }

  /**
   * haConnector 配置变更后：把 syncOnlyEnabledEntities 推到 HaEntitySyncFilterService，
   * 开启时顺带 purge L1 中已禁用/隐藏实体（关闭时需「刷新实体」拉取全量）。
   */
  private applySyncFilterConfigChange(): void {
    const syncOnly = this.haCfg.syncOnlyEnabledEntities;
    this.entityRegistry.syncSharedFilter((enabled, blocked, loaded) => {
      this.entitySyncFilter.configure(enabled, blocked, loaded);
    });
    this.logger.log(
      `实体同步过滤已热更新:syncOnlyEnabledEntities=${syncOnly}` +
        (this.entityRegistry.isRegistryLoaded()
          ? `,屏蔽集 ${this.entityRegistry.getBlockedEntityIds().size}`
          : '(注册表尚未加载)'),
    );
    if (syncOnly && this.entityRegistry.isRegistryLoaded()) {
      const purged = this.purgeNonSyncableFromStateStore();
      if (purged > 0) {
        this.eventBus.emit(HA_EVENTS.INITIAL_STATES, {
          _syncPlan: true,
          entities: this.entityCacheReader.getAll(),
        });
      }
    }
  }

  /** NestJS 生命周期钩子：注册初始状态协调器与注册表查询端口。 */
  async onModuleInit() {
    this.initialStatesCoordinator.registerPort(this);
    this.registryQuery.registerPort(this);
    await this.restoreDroppedCommands();
  }

  /** NestJS 生命周期钩子：标记销毁、取消事件监听、清理 WS 连接。 */
  onModuleDestroy() {
    this.commandQueue.parkPendingAsDropped();
    if (this.droppedPersistTimer) {
      clearTimeout(this.droppedPersistTimer);
      this.droppedPersistTimer = null;
    }
    const dropped = this.commandQueue.getDroppedRecent();
    void this.redis
      .set(HaConnectorService.DROPPED_REDIS_KEY, JSON.stringify(dropped), 7 * 24 * 3600)
      .catch((err) => this.logger.debug(`退出时持久化丢弃指令失败: ${getErrorMessage(err)}`));
    this.wsLifecycle.setDestroyed(true);
    this.eventEmitter.off('SYSTEM_CONFIG_UPDATED', this.onConfigUpdated);
    this.wsLifecycle.cleanup();
  }

  private schedulePersistDropped(items: ReturnType<HaConnectorCommandQueue['getDroppedRecent']>): void {
    if (this.droppedPersistTimer) clearTimeout(this.droppedPersistTimer);
    this.droppedPersistTimer = setTimeout(() => {
      this.droppedPersistTimer = null;
      void this.redis
        .set(HaConnectorService.DROPPED_REDIS_KEY, JSON.stringify(items), 7 * 24 * 3600)
        .catch((err) => this.logger.debug(`丢弃指令持久化失败: ${getErrorMessage(err)}`));
    }, 200);
  }

  private async restoreDroppedCommands(): Promise<void> {
    try {
      const raw = await this.redis.get(HaConnectorService.DROPPED_REDIS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed) || parsed.length === 0) return;
      this.commandQueue.hydrateDropped(parsed);
      this.logger.log(`已恢复可重试丢弃指令: ${this.commandQueue.getDroppedRecent().length} 条`);
    } catch (err) {
      this.logger.debug(`恢复丢弃指令失败: ${getErrorMessage(err)}`);
    }
  }

  /** @returns HA 连接状态快照。 */
  getStatus(): HaConnectionStatus {
    return this.getStatusSnapshot();
  }

  /**
   * @returns HA 连接状态快照：WebSocket 连接、HA 版本、Leader 模式、命令队列长度与丢弃计数。
   */
  getStatusSnapshot(): HaConnectionStatus {
    const leader = this.haLeader.getStatus();
    const ws = this.wsLifecycle.getStatusFields();
    return {
      connected: ws.connected,
      ha_url: ws.ha_url,
      ha_version: ws.ha_version,
      last_connected_at: ws.last_connected_at,
      reconnect_count: ws.reconnect_count,
      ha_ws_leader: leader.isLeader,
      ha_ws_mode: leader.mode,
      queue_length: this.commandQueue.length,
      queue_dropped_total: getHaQueueDroppedTotal(),
      dropped_commands: this.commandQueue.getDroppedRecent(),
    };
  }

  isInitialStatesReady(): boolean {
    return this.wsLifecycle.isInitialStatesReady();
  }

  getLastInitialStates(): HaEntity[] | null {
    return this.wsLifecycle.getLastInitialStates();
  }

  clearInitialStatesSnapshot() {
    this.wsLifecycle.clearInitialStatesSnapshot();
  }

  hasInitialStatesSnapshot(): boolean {
    return this.wsLifecycle.hasInitialStatesSnapshot();
  }

  waitUntilInitialStatesReady(timeoutMs = 120_000): Promise<boolean> {
    return this.wsLifecycle.waitUntilInitialStatesReady(timeoutMs);
  }

  async requestStateResync(timeoutMs = 120_000): Promise<number> {
    return this.wsLifecycle.requestStateResync(timeoutMs);
  }

  getDroppedCommands() {
    return this.commandQueue.getDroppedRecent();
  }

  retryDroppedCommands() {
    return this.commandQueue.retryDropped();
  }

  /**
   * Leader 专用服务调用（不经 Follower 桥接，直接走 WebSocket）。
   * 供 HaCommandBridgeService 在 Leader 端执行 Follower 转发的命令。
   * @param requestId 可选幂等键：Leader 端去重，防止桥接重放 / 队列 flush 重复执行。
   * @returns HA 服务调用结果。
   */
  callServiceAsLeader(
    domain: string,
    service: string,
    entityId: string,
    serviceData?: Record<string, unknown>,
    returnResponse?: boolean,
    requestId?: string,
  ): Promise<unknown> {
    return callHaServiceAsLeader(
      this.callServiceDeps,
      domain,
      service,
      entityId,
      serviceData,
      returnResponse,
      requestId,
    );
  }

  /**
   * 统一 HA 服务调用入口。
   * 路由策略：Leader+已连接 → WebSocket 即时调用；Follower → Redis 桥接转发；断连 → 入队或 REST 降级。
   * @param domain HA 服务域。
   * @param service HA 服务名。
   * @param entityId 目标实体 ID。
   * @param serviceData 服务调用附加参数。
   * @param returnResponse 是否返回 HA 响应体。
   * @param requestId 可选幂等键：断连入队 / 重试时同键去重，避免命令重复执行。
   * @returns HA 服务调用结果。
   */
  callService(
    domain: string,
    service: string,
    entityId: string,
    serviceData?: Record<string, unknown>,
    returnResponse?: boolean,
    requestId?: string,
  ): Promise<unknown> {
    return callHaService(
      this.callServiceDeps,
      domain,
      service,
      entityId,
      serviceData,
      returnResponse,
      requestId,
    );
  }

  callServiceViaRest = (
    d: string,
    s: string,
    e?: string,
    data?: Record<string, unknown>,
    timeoutMs?: number,
  ) => this.restClient.callServiceViaRest(d, s, e, data, timeoutMs);
  fetchHistory = (ids: string[], h: number) => this.restClient.fetchHistory(ids, h);
  fetchMediaImage = (p: string) => this.restClient.fetchMediaImage(p);
  openMediaStream = (p: string) => this.restClient.openMediaStream(p);

  /**
   * 获取指定域下所有实体：优先从已同步缓存读取，未同步时等待初始状态就绪后回退 REST。
   * @param domain 实体域。
   * @returns 该域下所有可同步实体数组。
   */
  fetchEntitiesByDomain(domain: string): Promise<HaEntity[]> {
    if (this.entityCacheReader.isHaSynced()) {
      return Promise.resolve(this.entityCacheReader.getAll(domain));
    }
    return this.fetchEntitiesByDomainWithWait(domain);
  }

  /**
   * 等待初始状态就绪后从缓存读取，超时则 REST 拉取并过滤。
   * @param domain 实体域。
   * @returns 该域下所有可同步实体数组。
   */
  private async fetchEntitiesByDomainWithWait(domain: string): Promise<HaEntity[]> {
    const ready = await this.waitUntilInitialStatesReady(15_000);
    if (ready && this.entityCacheReader.isHaSynced()) {
      return this.entityCacheReader.getAll(domain);
    }
    const all = await this.restClient.fetchEntitiesByDomain(domain);
    return this.filterSyncableStates(all);
  }

  invalidateEntityRegistryCache(): void {
    this.entityRegistry.invalidateCache();
  }

  filterSyncableStates(entities: HaEntity[]): HaEntity[] {
    return this.entityRegistry.filterSyncableStates(entities);
  }

  isEntitySyncable(entityId: string): boolean {
    return this.entityRegistry.isEntitySyncable(entityId);
  }

  /**
   * 实体注册表更新事件处理：刷新注册表，清理禁用/隐藏实体，重推全量可同步实体。
   * 仅在 syncOnlyEnabledEntities 开启时执行过滤。
   */
  async handleEntityRegistryUpdated(): Promise<void> {
    this.eventEmitter.emit(HA_ENTITY_REGISTRY_UPDATED);
    if (!this.haCfg.syncOnlyEnabledEntities) return;
    await this.refreshEntityRegistry();
    const purged = this.purgeNonSyncableFromStateStore();
    if (purged > 0) {
      // 有实体被清理，重推全量可同步实体以更新前端缓存
      this.eventBus.emit(HA_EVENTS.INITIAL_STATES, {
        _syncPlan: true,
        entities: this.entityCacheReader.getAll(),
      });
      this.logger.log(`实体注册表变更:已重推 ${this.entityCacheReader.getCount()} 个可同步实体`);
    }
  }

  /**
   * 从状态缓存中移除所有不可同步（禁用/隐藏）的实体，发布 state_changed 通知前端。
   * @returns 被移除的实体数量。
   */
  purgeNonSyncableFromStateStore(): number {
    const all = this.entityCacheReader.getAll();
    const changedAt = new Date().toISOString();
    let purged = 0;
    for (const entity of all) {
      if (!this.isEntitySyncable(entity.entity_id)) {
        this.stateEventBus.publishStateChanged({
          entity_id: entity.entity_id,
          old_state: entity,
          new_state: null,
          changed_at: changedAt,
        });
        purged++;
      }
    }
    if (purged > 0) {
      this.logger.log(`已从缓存移除 ${purged} 个禁用/隐藏实体`);
    }
    return purged;
  }

  fetchEntityState = (e: string) => this.restClient.fetchEntityState(e);
  fetchEntityRegistry = () => this.entityRegistry.fetchRegistry();
  getConfigForRest = () => this.config.getConfig();
  testHaConnection = (url: string, token: string) => this.restClient.testConnection(url, token);
  fetchAutomationConfig = (id: string) => this.restClient.fetchAutomationConfig(id);
  upsertAutomationConfig = (id: string, body: Record<string, unknown>) =>
    this.restClient.upsertAutomationConfig(id, body);
  deleteAutomationConfig = (id: string) => this.restClient.deleteAutomationConfig(id);
  fetchScriptConfig = (id: string) => this.restClient.fetchScriptConfig(id);
  upsertScriptConfig = (id: string, body: Record<string, unknown>) =>
    this.restClient.upsertScriptConfig(id, body);
  deleteScriptConfig = (id: string) => this.restClient.deleteScriptConfig(id);
  fetchSceneConfig = (id: string) => this.restClient.fetchSceneConfig(id);
  upsertSceneConfig = (id: string, body: Record<string, unknown>) =>
    this.restClient.upsertSceneConfig(id, body);
  deleteSceneConfig = (id: string) => this.restClient.deleteSceneConfig(id);
  getConfigEntry = (entryId: string) => this.restClient.getConfigEntry(entryId);
  listConfigEntries = (domain?: string) => this.restClient.listConfigEntries(domain);
  upsertTemplateHelper = (flowConfig: Record<string, unknown>, entryId?: string | null) =>
    this.restClient.upsertTemplateHelper(flowConfig, entryId);
  deleteConfigEntry = (entryId: string) => this.restClient.deleteConfigEntry(entryId);

  async removeEntityFromRegistry(entityId: string): Promise<void> {
    await this.sendRequest('config/entity_registry/remove', { entity_id: entityId }, 15_000);
  }

  async updateEntityArea(entityId: string, areaId: string): Promise<void> {
    await this.sendRequest(
      'config/entity_registry/update',
      { entity_id: entityId, area_id: areaId || null },
      15_000,
    );
  }

  /**
   * 解析删除操作的实际 configId：优先用传入的 configId 查询，失败后从实体属性和 slug 推导候选。
   * @param component HA 配置组件（automation / script / scene）。
   * @param configId 初始 configId 候选。
   * @param entityId 关联实体 ID（用于从属性和 slug 推导候选 ID）。
   * @returns 经验证可查询到的 configId。
   */
  async resolveConfigIdForDelete(
    component: 'automation' | 'script' | 'scene',
    configId: string,
    entityId?: string,
  ): Promise<string> {
    const fetchConfig =
      component === 'automation'
        ? this.fetchAutomationConfig.bind(this)
        : component === 'script'
          ? this.fetchScriptConfig.bind(this)
          : this.fetchSceneConfig.bind(this);
    if (await fetchConfig(configId)) return configId;
    const candidates: string[] = [];
    if (entityId) {
      try {
        const st = await this.fetchEntityState(entityId);
        const attrId = st?.attributes?.id;
        if (attrId != null && String(attrId)) candidates.push(String(attrId));
      } catch {
        /* 忽略 */
      }
      const slug = entityId.includes('.') ? entityId.split('.').slice(1).join('.') : entityId;
      if (slug && slug !== configId) candidates.push(slug);
    }
    for (const id of candidates) {
      if (await fetchConfig(id)) return id;
    }
    return configId;
  }

  startOptionsFlow = (entryId: string) => this.restClient.startOptionsFlow(entryId);
  submitOptionsFlowStep = (flowId: string, data: Record<string, unknown>) =>
    this.restClient.submitOptionsFlowStep(flowId, data);
  abortConfigFlow = (flowId: string) => this.restClient.abortConfigFlow(flowId);

  resolveTemplateYaml(
    registryEntry: HaEntityRegistryEntry,
    haConfigDir?: string,
    options?: ResolveTemplateYamlOptions,
  ): Promise<TemplateYamlResolveResult> {
    const dir = haConfigDir?.trim() || process.env.HA_CONFIG_DIR?.trim() || undefined;
    return resolveTemplateYamlForImport(
      registryEntry,
      {
        startOptionsFlow: (id) => this.restClient.startOptionsFlow(id),
        submitOptionsFlowStep: (id, data) => this.restClient.submitOptionsFlowStep(id, data),
        abortConfigFlow: (id) => this.restClient.abortConfigFlow(id),
        fetchEntityState: (eid) => this.restClient.fetchEntityState(eid),
        fetchEntityRegistry: () => this.entityRegistry.fetchRegistry(),
      },
      dir,
      options,
    );
  }

  refreshEntityRegistry() {
    return this.entityRegistry.refreshRegistry();
  }

  subscribeWebRtcOffer(entityId: string, offer: string) {
    return subscribeHaWebRtcOffer(this.wsLifecycle, entityId, offer);
  }

  unsubscribeHaWs(subscriptionId: number, timeoutMs = 5000): Promise<void> {
    return unsubscribeHaWs(this.wsLifecycle, subscriptionId, timeoutMs);
  }

  /**
   * 通用 HA WebSocket 请求（如 render_template、entity_registry/remove 等）。
   * @param type HA WebSocket 消息类型。
   * @param extra 附加字段（合并到消息体）。
   * @param timeoutMs 超时毫秒数，默认 10s。
   * @returns HA 响应结果。
   * @throws {BusinessException} WebSocket 未连接时抛出。
   */
  sendRequest<T = unknown>(
    type: string,
    extra?: Record<string, unknown>,
    timeoutMs = 10_000,
  ): Promise<T> {
    return sendHaWsRequest<T>(this.wsLifecycle, type, extra, timeoutMs);
  }

  /**
   * 通过 WebSocket 获取 HA 区域注册表。
   * @returns 区域列表（area_id + name），失败时返回空数组并标记降级。
   */
  async fetchAreaRegistry(): Promise<Array<{ area_id: string; name: string }>> {
    const timeoutMs = this.haCfg.entityRegistryTimeoutMs ?? 45_000;
    try {
      const rows = await this.sendRequest<unknown>('config/area_registry/list', {}, timeoutMs);
      const normalized = normalizeHaAreaRegistryRows(rows);
      const outcome = haRegistrySuccess(normalized);
      this.registryDegraded = outcome.degraded;
      this.registryDegradedReason = outcome.reason;
      return outcome.rows;
    } catch (e) {
      const outcome = haRegistryDegraded<{ area_id: string; name: string }>(e);
      this.logger.warn(`获取 HA 区域注册表失败: ${outcome.reason}`);
      this.registryDegraded = outcome.degraded;
      this.registryDegradedReason = outcome.reason;
      return outcome.rows;
    }
  }

  /**
   * 通过 WebSocket 获取 HA 设备注册表（仅返回已分配区域的设备）。
   * @returns 设备列表（device_id + area_id），失败时返回空数组并标记降级。
   */
  async fetchDeviceRegistry(): Promise<Array<{ device_id: string; area_id: string }>> {
    const timeoutMs = this.haCfg.entityRegistryTimeoutMs ?? 45_000;
    try {
      const rows = await this.sendRequest<unknown>('config/device_registry/list', {}, timeoutMs);
      return normalizeHaDeviceRegistryRows(rows);
    } catch (e) {
      const outcome = haRegistryDegraded<{ device_id: string; area_id: string }>(e);
      this.logger.warn(`获取 HA 设备注册表失败: ${outcome.reason}`);
      this.registryDegraded = outcome.degraded;
      this.registryDegradedReason = outcome.reason;
      return outcome.rows;
    }
  }

  /** HA area/device registry 最近一次拉取是否因异常降级为空 */
  isRegistryDegraded(): boolean {
    return this.registryDegraded;
  }

  getRegistryDegradedReason(): string | null {
    return this.registryDegradedReason;
  }

  /** @returns HA WebSocket 是否已连接（含认证完成）。 */
  isConnected(): boolean {
    return this.wsLifecycle.isConnected();
  }
}
