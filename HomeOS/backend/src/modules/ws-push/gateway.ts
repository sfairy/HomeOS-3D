/**
 * Socket.IO 推送网关：鉴权连接、实体增量、HA/领域事件广播。
 *
 * 所属模块：ws-push
 * 职责：
 * - 接入前端 Socket.IO 长连接，完成 JWT 鉴权与订阅分组，按 wsPush 配置裁剪推送范围。
 * - 监听 HA 状态变更与 Redis 连接状态，向在线客户端广播 ha_status / redis_status / entities_stale。
 * - 通过 stateBroadcast helper 实现 Hot Path 即时推 + 批量推混合策略；按实体规模自适应帧缓冲。
 * - 通过 domainEvents helper 将领域事件（通知/模式/安防/在场/能耗/Frigate/EEW 等）转译为客户端事件。
 *
 * 关键依赖：StateStoreService、HaConnectorService、RedisService、JwtService、PrismaService、
 * TokenVersionCacheService、SessionRevocationService、AppConfigService、LicenseService、TtsSpeakService。
 */
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import msgpackParser from 'socket.io-msgpack-parser';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/service';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { HA_EVENTS } from '../../shared/types';
import { WS_CLIENT_EVENTS } from '@homeos/shared';
import type {
  HaEntity,
  HaStateChangeEvent,
  HaConnectedEvent,
  HaReconnectingEvent,
  WsHaStatusPayload,
} from '../../shared/types';
import { StateStoreService } from '../state-store/service';
import { EntityAreaEnrichmentService } from '../state-store/entity-area-enrichment.service';
import { HaConnectorService } from '../ha-connector/service';
import { RedisService } from '../../shared/redis/service';
import { TtsSpeakService } from '../ha-connector/tts-speak.service';
import { REDIS_CONNECTION_CHANGED } from '../../shared/redis/service';
import { AppConfigService, APP_CONFIG_UPDATED } from '../../shared/app-config/service';
import { TokenVersionCacheService } from '../../common/http-security/token-version-cache.service';
import { SessionRevocationService } from '../../common/http-security/session-revocation.service';
import { isInitialStatesRefPayload } from '../../shared/redis/event-bus-bridge.util';
import { isInitialStatesSyncPlan } from '../../shared/ha/entity-state-diff.util';
import { assignClientSubscription } from './subscription.util';
import { buildRedisWsStatusPayload } from './delta.util';
import { WsPushStateBroadcastHelper } from './state-broadcast.helper';
import { WsPushConnectionHelper } from './connection.helper';
import { WsPushDomainEventsHelper } from './domain-events.helper';
import { recordHaSyncFeLatencySamples } from '../../common/observability/ha-sync-latency.util';

import { WS_PUSH_MAX_HTTP_BUFFER_BYTES } from './gateway.config';
import { resolveWsMaxBufferBytes } from './ws-buffer.util';
import { resolveAllowedOrigins, isOriginAllowed } from '../../common/http-security/cookie-cors.util';
import { EEW_EVENTS } from '../earthquake/types';
import { LicenseService } from '../license/license.service';

@WebSocketGateway({
  parser: msgpackParser,
  cors: {
    // 与 HTTP CORS 保持一致的来源判定：白名单 + 局域网/本机放行，其余拒绝。
    // 无 origin（同源握手、原生客户端）放行；避免 WS 比 HTTP 更宽的安全边界。
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) return callback(null, true);
      callback(null, isOriginAllowed(origin, resolveAllowedOrigins()));
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  /** 默认 1MB 不足以推送大型 HA 实例的全量 initial_states */
  maxHttpBufferSize: WS_PUSH_MAX_HTTP_BUFFER_BYTES,
  perMessageDeflate: true,
})
/**
 * WsPushGateway：Nest @WebSocketGateway WS 网关。
 * - 管理 WS 连接、消息路由与广播分发；
 * - 生命周期钩子：handleConnection / handleDisconnect；
 * @class WsPushGateway
 */
export class WsPushGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(WsPushGateway.name);
  private clientCount = 0;
  private entitiesStaleTimer: NodeJS.Timeout | null = null;
  private readonly stateBroadcast: WsPushStateBroadcastHelper;
  private readonly connection: WsPushConnectionHelper;
  private readonly domainEvents: WsPushDomainEventsHelper;

  constructor(
    private readonly stateStore: StateStoreService,
    private readonly entityAreaEnrichment: EntityAreaEnrichmentService,
    private readonly haConnector: HaConnectorService,
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
    private readonly ttsSpeak: TtsSpeakService,
    private readonly config: ConfigService,
    private readonly appConfig: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly tokenVersionCache: TokenVersionCacheService,
    private readonly sessionRevocation: SessionRevocationService,
    private readonly licenseService: LicenseService,
  ) {
    this.stateBroadcast = new WsPushStateBroadcastHelper({
      getServer: () => this.server,
      appConfig: this.appConfig,
    });
    this.connection = new WsPushConnectionHelper({
      logger: this.logger,
      getServer: () => this.server,
      stateStore: this.stateStore,
      haConnector: this.haConnector,
      entityAreaEnrichment: this.entityAreaEnrichment,
      redisService: this.redisService,
      config: this.config,
      jwtService: this.jwtService,
      prisma: this.prisma,
      tokenVersionCache: this.tokenVersionCache,
      sessionRevocation: this.sessionRevocation,
      appConfig: this.appConfig,
      stateBroadcast: this.stateBroadcast,
      isLicenseAccessAllowed: () => this.licenseService.isAccessAllowed(),
      getClientCount: () => this.clientCount,
      setClientCount: (count) => {
        this.clientCount = count;
      },
    });
    this.domainEvents = new WsPushDomainEventsHelper({
      logger: this.logger,
      getServer: () => this.server,
      prisma: this.prisma,
      ttsSpeak: this.ttsSpeak,
    });
  }

  /** 网关初始化完成回调，日志记录 + 确认 Redis 桥接已就绪 */
  afterInit() {
    this.logger.log('Socket.IO 网关已初始化');
    // 领域事件跨实例分发由 EventBus 统一桥接，此处不再订阅重复频道。
    if (this.redisService.isReady()) {
      this.logger.debug('Redis 领域事件分发由 EventBus 统一桥接');
    }
  }

  /** 模块销毁时清理状态广播 Helper 的批推定时器 */
  onModuleDestroy() {
    this.cancelEntitiesStaleBroadcast();
    this.stateBroadcast.dispose();
  }

  /** 新客户端连入：委托 connection helper 完成 JWT 鉴权、订阅分组与首推 initial_states */
  handleConnection(client: Socket) {
    return this.connection.handleConnection(client);
  }

  /** Redis 连接/断连时向所有在线客户端广播，与首连推送格式一致 */
  @OnEvent(REDIS_CONNECTION_CHANGED)
  broadcastRedisStatus(payload: { configured: boolean; ready: boolean }) {
    if (!this.server?.sockets) return;
    const msg = buildRedisWsStatusPayload(payload.configured, payload.ready);
    this.server.emit(WS_CLIENT_EVENTS.REDIS_STATUS, msg);
    this.logger.debug(`Redis 状态广播: ${msg.status}`);
  }

  /** 按实体规模自适应 Socket.IO 帧缓冲（全量 initial_states 可能超过默认 8MB 分档） */
  private applyEntityCountBufferTuning(): void {
    const count = this.stateStore.getCount();
    const bytes = resolveWsMaxBufferBytes(count);
    const engine = this.server?.engine as { opts?: { maxHttpBufferSize?: number } } | undefined;
    if (engine?.opts && engine.opts.maxHttpBufferSize !== bytes) {
      engine.opts.maxHttpBufferSize = bytes;
      this.logger.log(
        `Socket.IO 帧缓冲已按实体数 ${count} 调整为 ${Math.round(bytes / 1024 / 1024)}MB`,
      );
    }
  }

  /**
   * HA 全量同步完成事件：向所有在线客户端重推 initial_states。
   * 兼容三类 payload：syncPlan（含实体与 resync 变更）、Redis shadow ref（先 load 再推全量）、纯数组（直接推）。
   */
  @OnEvent(HA_EVENTS.INITIAL_STATES)
  async handleHaInitialStates(payload: HaEntity[] | unknown) {
    if (!this.server?.sockets) return;
    this.applyEntityCountBufferTuning();

    if (isInitialStatesSyncPlan(payload)) {
      return this.connection.pushInitialStatesToAllClients(
        payload.entities,
        payload.resyncChanges,
      );
    }

    if (isInitialStatesRefPayload(payload)) {
      await this.stateStore.loadFromRedisShadowRef(payload);
      return this.connection.pushInitialStatesToAllClients(this.stateStore.getAll());
    }

    if (Array.isArray(payload)) {
      return this.connection.pushInitialStatesToAllClients(payload);
    }
  }

  /** 客户端断连：委托 connection helper 清理订阅分组并回收计数 */
  handleDisconnect(client: Socket) {
    this.connection.handleDisconnect(client);
    this.logger.debug(`客户端已断开连接: ${client.id}`);
  }

  /** 当前在线客户端计数，供监控/熔断判断 */
  getClientCount(): number {
    return this.clientCount;
  }

  /** AppConfig 热更新：wsPush/stateStore 变更时失效订阅分组签名并重排定时器 */
  @OnEvent(APP_CONFIG_UPDATED)
  onAppConfigUpdated(keys: string[]) {
    if (!keys.some((k) => k === 'wsPush' || k === 'stateStore')) return;
    // wsPush 配置变更（如 coldEntityOnDemand 开关）可能改变分组签名，失效全部在线 socket 缓存
    if (keys.includes('wsPush')) {
      const sockets = this.server?.sockets?.sockets;
      if (sockets) {
        for (const socket of sockets.values()) {
          if (socket.data) socket.data.subscriptionGroupSig = null;
        }
      }
    }
    this.stateBroadcast.rescheduleStateFlushTimer();
    this.rescheduleEntitiesStaleBroadcast();
  }

  /** Hot Path：关键域即时推，其余域批处理 */
  applyStateChangedHot(event: HaStateChangeEvent) {
    this.stateBroadcast.applyStateChangedHot(event);
  }

  /** Hot Path 批量：合并 ingress flush，减少 WS 定时器调度 */
  applyStateChangedHotBatch(events: HaStateChangeEvent[]) {
    this.stateBroadcast.applyStateChangedHotBatch(events);
  }

  /** 前端订阅更新：按 domains / pinnedEntityIds 重置当前 socket 的订阅裁剪策略 */
  @SubscribeMessage('update_subscription')
  handleUpdateSubscription(
    client: Socket,
    payload: {
      subscribeDomains?: string[] | string | null;
      pinnedEntityIds?: string[] | string | null;
    },
  ) {
    assignClientSubscription(client, payload?.subscribeDomains, payload?.pinnedEntityIds);
    return { ok: true };
  }

  /** 前端实体 apply 延迟样本 → /metrics homeos_ha_sync_latency_ms{stage="fe_*"} */
  @SubscribeMessage('ha_sync_fe_latency')
  handleHaSyncFeLatency(
    _client: Socket,
    payload: { samples?: Array<{ stage?: string; ms?: number }> },
  ) {
    const n = recordHaSyncFeLatencySamples(payload?.samples ?? []);
    return { ok: true, accepted: n };
  }

  /** HA 连接已建立：取消 stale 推送并广播 connected 状态 */
  @OnEvent(HA_EVENTS.CONNECTED)
  handleHaConnected(data: HaConnectedEvent) {
    this.cancelEntitiesStaleBroadcast();
    const payload: WsHaStatusPayload = {
      type: 'ha_status',
      status: 'connected',
      ha_version: data.ha_version,
      timestamp: new Date().toISOString(),
    };
    this.server.emit(WS_CLIENT_EVENTS.HA_STATUS, payload);
  }

  /** HA 断连：广播 disconnected 状态并启动 entities_stale 延迟推送 */
  @OnEvent(HA_EVENTS.DISCONNECTED)
  handleHaDisconnected(data?: { reason?: string }) {
    this.server.emit(WS_CLIENT_EVENTS.HA_STATUS, {
      type: 'ha_status',
      status: 'disconnected',
      timestamp: new Date().toISOString(),
    });
    this.scheduleEntitiesStaleBroadcast(data?.reason);
  }

  /** HA 重连中：广播 reconnecting 状态与当前重试次数 */
  @OnEvent(HA_EVENTS.RECONNECTING)
  handleHaReconnecting(data: HaReconnectingEvent) {
    this.server.emit(WS_CLIENT_EVENTS.HA_STATUS, {
      type: 'ha_status',
      status: 'reconnecting',
      attempt: data.attempt,
      timestamp: new Date().toISOString(),
    });
  }

  /** HA 命令队列丢弃事件：广播队列丢弃统计，供前端提示用户重启或排查 */
  @OnEvent(HA_EVENTS.QUEUE_DROPPED)
  handleHaQueueDropped(data: {
    reason: 'ttl' | 'full' | 'restart';
    count: number;
    total: number;
    command?: { domain: string; service: string; entityId: string };
    dropped?: Array<{ domain: string; service: string; entityId: string; reason: string; at: number }>;
  }) {
    this.server.emit(WS_CLIENT_EVENTS.HA_QUEUE_DROPPED, {
      type: 'ha_queue_dropped',
      reason: data.reason,
      count: data.count,
      total: data.total,
      command: data.command,
      dropped: data.dropped ?? [],
      timestamp: new Date().toISOString(),
    });
  }

  /** 通知创建事件：转译为客户端 notification 消息 */
  @OnEvent('notification.created')
  handleNotification(data: Parameters<WsPushDomainEventsHelper['handleNotification']>[0]) {
    this.domainEvents.handleNotification(data);
  }

  /** 家庭模式激活：广播至前端用于切换 UI 主题/自动化 */
  @OnEvent('homeMode.activated')
  handleModeActivated(data: Parameters<WsPushDomainEventsHelper['handleModeActivated']>[0]) {
    this.domainEvents.handleModeActivated(data);
  }

  /** 家庭模式停用：广播至前端 */
  @OnEvent('homeMode.deactivated')
  handleModeDeactivated(data: Parameters<WsPushDomainEventsHelper['handleModeDeactivated']>[0]) {
    this.domainEvents.handleModeDeactivated(data);
  }

  /** 自动化执行事件：前端展示执行结果与日志 */
  @OnEvent('automation.executed')
  handleAutomationExecuted(
    data: Parameters<WsPushDomainEventsHelper['handleAutomationExecuted']>[0],
  ) {
    this.domainEvents.handleAutomationExecuted(data);
  }

  /** 安防布防/撤防模式变更：广播至前端与安防组件 */
  @OnEvent('security.modeChanged')
  handleSecurityModeChanged(
    data: Parameters<WsPushDomainEventsHelper['handleSecurityModeChanged']>[0],
  ) {
    this.domainEvents.handleSecurityModeChanged(data);
  }

  /** 安防区域配置变更：通知前端刷新区域列表 */
  @OnEvent('security.zonesConfigured')
  handleSecurityZonesConfigured(
    data: Parameters<WsPushDomainEventsHelper['handleSecurityZonesConfigured']>[0],
  ) {
    this.domainEvents.handleSecurityZonesConfigured(data);
  }

  /** 安防告警：广播告警类型与触发源 */
  @OnEvent('security.alarm')
  handleSecurityAlarm(data: Parameters<WsPushDomainEventsHelper['handleSecurityAlarm']>[0]) {
    this.domainEvents.handleSecurityAlarm(data);
  }

  /** 紧急事件（如 SOS）：高优先级推送给所有客户端 */
  @OnEvent('security.emergency')
  handleSecurityEmergency(
    data: Parameters<WsPushDomainEventsHelper['handleSecurityEmergency']>[0],
  ) {
    this.domainEvents.handleSecurityEmergency(data);
  }

  /** 紧急事件结束：广播解除信号 */
  @OnEvent('security.emergencyCompleted')
  handleSecurityEmergencyCompleted(data: Record<string, unknown>) {
    this.domainEvents.handleSecurityEmergencyCompleted(data);
  }

  /** 在场检测变化：广播谁在家/离家状态 */
  @OnEvent('presence.changed')
  handlePresenceChanged(data: Parameters<WsPushDomainEventsHelper['handlePresenceChanged']>[0]) {
    this.domainEvents.handlePresenceChanged(data);
  }

  /** 全员离家：触发离家模式相关自动化 */
  @OnEvent('presence.everyoneLeft')
  handleEveryoneLeft(data: Parameters<WsPushDomainEventsHelper['handleEveryoneLeft']>[0]) {
    this.domainEvents.handleEveryoneLeft(data);
  }

  /** 能耗异常检测：广播异常设备与原因 */
  @OnEvent('energy.anomaly')
  handleEnergyAnomaly(data: Record<string, unknown>) {
    this.domainEvents.handleEnergyAnomaly(data);
  }

  /** Frigate 检测事件：广播摄像头/事件 ID 给前端实时预览 */
  @OnEvent('frigate.detection')
  handleFrigateDetection(data: Record<string, unknown>) {
    this.domainEvents.handleFrigateDetection(data);
  }

  /** TTS 播报指令：调用 tts.speak helper 选路播报 */
  @OnEvent('tts.speak')
  handleTtsSpeak(data: Parameters<WsPushDomainEventsHelper['handleTtsSpeak']>[0]) {
    return this.domainEvents.handleTtsSpeak(data);
  }

  /** 房间级在场检测事件：广播用户当前所在房间给 UI 跟随 */
  @OnEvent('presence.roomChanged')
  handleRoomPresenceChange(
    data: Parameters<WsPushDomainEventsHelper['handleRoomPresenceChange']>[0],
  ) {
    this.domainEvents.handleRoomPresenceChange(data);
  }

  /** 儿童模式开关：影响 UI 限制与可用实体范围 */
  @OnEvent('childMode.changed')
  handleChildModeChanged(data: Record<string, unknown>) {
    this.domainEvents.handleChildModeChanged(data);
  }

  /** 儿童模式拦截：当儿童尝试访问受限实体时广播拦截信息 */
  @OnEvent('childMode.blocked')
  handleChildModeBlocked(data: Record<string, unknown>) {
    this.domainEvents.handleChildModeBlocked(data);
  }

  /** 地震预警（EEW）：高优先级推送震感与震中信息 */
  @OnEvent(EEW_EVENTS.ALERT)
  handleEarthquakeAlert(data: Parameters<WsPushDomainEventsHelper['handleEarthquakeAlert']>[0]) {
    this.domainEvents.handleEarthquakeAlert(data);
  }

  /** 台网核定速报 / 迟到确认：公报弹层（不全屏） */
  @OnEvent(EEW_EVENTS.CONFIRMATION)
  handleEarthquakeConfirmation(
    data: Parameters<WsPushDomainEventsHelper['handleEarthquakeConfirmation']>[0],
  ) {
    this.domainEvents.handleEarthquakeConfirmation(data);
  }

  /** 取消已调度的 entities_stale 推送（HA 恢复连接时调用） */
  private cancelEntitiesStaleBroadcast(): void {
    if (!this.entitiesStaleTimer) return;
    clearTimeout(this.entitiesStaleTimer);
    this.entitiesStaleTimer = null;
  }

  /** HA 断连后延迟推送 entities_stale；Leader 切换用更短延迟 */
  private scheduleEntitiesStaleBroadcast(reason?: string): void {
    this.cancelEntitiesStaleBroadcast();
    if (this.haConnector.getStatusSnapshot().connected) return;
    if (this.stateStore.getCount() === 0) return;
    const baseMs = this.appConfig.get('stateStore').staleThresholdMs ?? 12_000;
    // Leader 降级：尽快让客户端走冷补全，勿等满 staleThreshold
    const delayMs =
      reason === 'leader_failover' ? Math.min(3_000, baseMs) : baseMs;
    this.entitiesStaleTimer = setTimeout(() => {
      this.entitiesStaleTimer = null;
      if (this.haConnector.getStatusSnapshot().connected) return;
      this.server.emit(WS_CLIENT_EVENTS.ENTITIES_STALE, {
        type: 'entities_stale',
        reason: reason === 'leader_failover' ? 'leader_failover' : 'ha_disconnected',
        timestamp: new Date().toISOString(),
      });
    }, delayMs);
  }

  /** 已调度 stale 推送时按最新配置重排（AppConfig 更新触发） */
  private rescheduleEntitiesStaleBroadcast(): void {
    if (!this.entitiesStaleTimer) return;
    this.scheduleEntitiesStaleBroadcast();
  }
}
