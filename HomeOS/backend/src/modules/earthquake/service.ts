/**
 * @file earthquake.service.ts
 * @module backend/src/modules
 *
 * 地震预警核心服务：维护 WolfX WebSocket 接入、运行时配置缓存、
 * 跨源去重、阈值评估与预警分发。
 *
 * 关键能力：
 *  - 通过 WolfxWsClient 接收实时 EEW 报文，并按指数退避自动重连。
 *  - 通过 EewPollService 主动拉取 SC EEW / CENC 台网 / USGS（兜底）。
 *  - 配置来源：优先项目 layout（earthquakeConfig），回退 HA /api/config 坐标。
 *  - 去重：内存 + Redis 双写，跨源指纹（时空相近）抑制重复预警。
 *  - 状态持久化：最新预警、历史、dismissed、去重状态写入 Redis；
 *    历史同时写入 PostgreSQL（earthquakeAlertHistory 表）。
 *  - 多实例：仅 EEW Leader 实例维护 WolfX 连接与主动轮询，避免重复预警。
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../shared/prisma/service';
import { AppConfigService } from '../../shared/app-config/service';
import { EventBusService } from '../../shared/redis/event-bus.service';
import { RedisService } from '../../shared/redis/service';
import { getErrorMessage } from '../../common/utils';
import { loadActiveProjectLayout } from '../../common/platform/project-paths.util';
import { EewLeaderService } from './eew-leader.service';
import { HOMEOS_EVENTS } from '../../shared/homeos-events';
import {
  appendAlertHistoryPrisma,
  deleteSimulationHistoryPrisma,
  deleteSimulationHistoryRedis,
  loadAlertHistoryPrisma,
} from './state.util';
import {
  clearDedupeStateRedis,
  clearLatestAlertRedis,
  isEventDismissedRedis,
  isSimulationAlertRecord,
  isWolfxClusterActive,
  loadDedupeStateRedis,
  loadLatestAlertRedis,
  loadAlertHistoryRedis,
  markEventDismissedRedis,
  saveDedupeStateRedis,
  saveLatestAlertRedis,
  touchWolfxLeaderActive,
} from './state.util';
import {
  isValidHomeCoordinate,
  isWolfxCancelled,
  parseWolfxMessage,
} from './feeds.util';
import { parseEarthquakeLayout } from './state.util';
import { evaluateEewForAlert, type EewDedupeState, type EewEventFingerprint } from './eew-eval.util';
import { EewDiagnosticsBuffer } from './eew-diagnostics.util';
import { evaluateLocalQuakeThresholds } from './threshold.util';
import {
  computeSWaveCountdown,
  haversineDistanceKm,
  isEewSimulationEventId,
  normalizeEewCountdownLead,
} from '@homeos/shared';
import { WolfxWsClient } from './wolfx-ws.client';
import type { GlobalEarthquakeEvent } from './global.types';
import {
  EEW_EVENTS,
  type EarthquakeAlertPayload,
  type EarthquakeRuntimeConfig,
  type EewRawMessage,
} from './types';

// 本地去重状态清除延迟：与 Redis 侧 TTL（DEDUPE_TTL_SEC=120s）对齐，
// 保证本地内存与 Redis 去重状态同时释放，Leader 故障转移窗口内不重复预警
const DEDUPE_CLEAR_DELAY_MS = 120_000;
const LATEST_ALERT_TTL_MS = 5 * 60 * 1000;
const CONFIG_CACHE_MS = 5_000;

/**
 * 地震预警核心服务（@Injectable）。
 *
 * 实现 OnModuleInit / OnModuleDestroy，启动时初始化 WolfX 客户端并注册
 * 系统/布局配置变更监听；销毁时断开连接、清理定时器。
 *
 * 处理链（processChain）串行化所有进入的 EEW，避免并发竞态修改去重状态。
 */
@Injectable()
export class EarthquakeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EarthquakeService.name);
  private readonly wolfx: WolfxWsClient;

  private activeEventId = '';
  private lastEventTime = 0;
  private lastMagnitude = 0;
  private dedupeClearTimer: ReturnType<typeof setTimeout> | null = null;

  private latestAlertPayload: EarthquakeAlertPayload | null = null;
  private latestAlertTime = 0;
  private dismissedEventIds = new Set<string>();

  private runtime: EarthquakeRuntimeConfig = {
    enabled: false,
    homeLat: null,
    homeLon: null,
    maxDistance: 500,
    minMagnitude: 3,
    minLocalIntensity: 2,
    countdownLeadSec: 60,
  };
  private configLoadedAt = 0;
  /** 上次已打印的 EEW 配置指纹，避免轮询/热重载重复刷屏 */
  private eewConfigStatusKey = '';
  private processChain: Promise<void> = Promise.resolve();
  private readonly diagnostics = new EewDiagnosticsBuffer();
  private recentFingerprints: EewEventFingerprint[] = [];
  private wolfxDisconnectedSince = Date.now();

  private readonly onSystemConfigUpdated = () => {
    this.configLoadedAt = 0;
    void this.ensureRuntimeConfig(true);
  };

  private readonly onLayoutConfigUpdated = () => {
    this.configLoadedAt = 0;
    void this.ensureRuntimeConfig(true);
  };

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly eventBus: EventBusService,
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly appConfig: AppConfigService,
    private readonly eewLeader: EewLeaderService,
    private readonly redis: RedisService,
  ) {
    this.wolfx = new WolfxWsClient({
      logger: this.logger,
      onMessage: (msg) => this.handleMessage(msg),
      touchLeaderActive: () => {
        this.diagnostics.touchWolfxActivity(true);
        this.wolfxDisconnectedSince = 0;
        return touchWolfxLeaderActive(this.redis);
      },
      canConnect: () => !this.destroyed && this.eewLeader.isEewLeader() && this.runtime.enabled,
    });
  }

  private destroyed = false;

  async onModuleInit() {
    this.eventEmitter.on('SYSTEM_CONFIG_UPDATED', this.onSystemConfigUpdated);
    this.eventEmitter.on(HOMEOS_EVENTS.LAYOUT_CONFIG_UPDATED, this.onLayoutConfigUpdated);
    this.eewLeader.setCallbacks({
      onLeader: () => this.syncWolfxConnection(),
      onFollower: () => this.wolfx.disconnect(),
    });
    await this.ensureRuntimeConfig(true);
    // 兜底：选举若早于 setCallbacks 完成，enabled 翻转时的 sync 通常已连上；
    // 若仍是 Leader 且未 OPEN/CONNECTING，补一次（connect 自身有幂等守卫）。
    if (this.runtime.enabled && this.eewLeader.isEewLeader() && !this.wolfx.isConnected()) {
      this.syncWolfxConnection();
    }
  }

  onModuleDestroy() {
    this.destroyed = true;
    this.eventEmitter.off('SYSTEM_CONFIG_UPDATED', this.onSystemConfigUpdated);
    this.eventEmitter.off(HOMEOS_EVENTS.LAYOUT_CONFIG_UPDATED, this.onLayoutConfigUpdated);
    this.cleanup();
  }

  /**
   * 加载 / 刷新 EEW 运行时配置。
   * 5 秒缓存避免高频轮询重复解析 layout；force=true 强制重读。
   * 配置来源：项目 layout 的 earthquakeConfig 嵌套字段，回退顶层字段；
   * 家庭坐标缺失时回退 HA /api/config。
   * 启用状态翻转时调用 syncWolfxConnection 控制连接生命周期。
   * @param force 是否强制刷新
   * @returns 当前生效的 EEW 运行时配置
   */
  async ensureRuntimeConfig(force = false): Promise<EarthquakeRuntimeConfig> {
    const now = Date.now();
    const prevEnabled = this.runtime.enabled;
    if (!force && now - this.configLoadedAt < CONFIG_CACHE_MS) {
      return this.runtime;
    }

    try {
      const { layout } = await loadActiveProjectLayout(this.prisma, this.appConfig);
      let next = parseEarthquakeLayout(layout);

      if (next.homeLat == null || next.homeLon == null) {
        const haCoords = await this.fetchHaCoordinates();
        if (haCoords) {
          next = { ...next, homeLat: haCoords.lat, homeLon: haCoords.lon };
        }
      }

      this.runtime = next;
      this.configLoadedAt = now;

      const statusKey =
        next.homeLat != null && next.homeLon != null
          ? `${next.homeLat},${next.homeLon},${next.enabled ? 1 : 0}`
          : `unset:${next.enabled ? 1 : 0}`;
      if (statusKey !== this.eewConfigStatusKey) {
        this.eewConfigStatusKey = statusKey;
        if (next.homeLat != null && next.homeLon != null) {
          this.logger.log(
            `📍 EEW 家庭坐标:(${next.homeLat}, ${next.homeLon}) ${next.enabled ? '已启用' : '未启用'}`,
          );
        } else {
          this.logger.warn('⚠️ 未配置 EEW 家庭坐标');
        }
      }
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
      this.logger.error(`加载 EEW 配置失败:${msg}`);
    }

    if (prevEnabled !== this.runtime.enabled) {
      this.syncWolfxConnection();
    }

    return this.runtime;
  }

  private syncWolfxConnection() {
    if (this.destroyed) return;
    if (!this.runtime.enabled) {
      this.wolfx.disconnect();
      if (!this.wolfxDisconnectedSince) this.wolfxDisconnectedSince = Date.now();
      return;
    }
    if (this.eewLeader.isEewLeader()) {
      const wasConnected = this.wolfx.isConnected();
      this.wolfx.connect();
      if (!wasConnected && !this.wolfx.isConnected()) {
        if (!this.wolfxDisconnectedSince) this.wolfxDisconnectedSince = Date.now();
      }
    }
  }

  /** HTTP 轮询入口：将 EewPollService 拉取到的报文送入同一处理链（与 Wolfx WS 共用） */
  ingestEew(eew: EewRawMessage) {
    this.enqueueProcessEew(eew);
  }

  /** 记录某数据源的一次轮询结果，用于状态面板诊断展示 */
  recordSourcePoll(
    id: 'sc_eew' | 'cenc_eew' | 'usgs' | 'wolfx',
    result: { ok: boolean; error?: string },
  ) {
    this.diagnostics.recordPoll(id, result);
  }

  /**
   * 判断是否应启用 USGS 兜底。
   * Wolfx WS 在线则禁用；断开超过 downForMs 毫秒后启用，避免短暂抖动误切兜底。
   */
  shouldUseUsgsBackup(downForMs: number): boolean {
    if (this.wolfx.isConnected()) {
      this.wolfxDisconnectedSince = 0;
      return false;
    }
    if (!this.wolfxDisconnectedSince) this.wolfxDisconnectedSince = Date.now();
    return Date.now() - this.wolfxDisconnectedSince >= downForMs;
  }

  getDiagnosticsSnapshot() {
    const wolfxConnected = this.wolfx.isConnected();
    if (!wolfxConnected && !this.wolfxDisconnectedSince) {
      this.wolfxDisconnectedSince = Date.now();
    }
    if (wolfxConnected) this.wolfxDisconnectedSince = 0;
    this.diagnostics.syncWolfxFromConnection(this.wolfx.getConnectionStatus());
    return this.diagnostics.snapshot({
      wolfxConnected,
      scActive: this.runtime.enabled && this.eewLeader.isEewLeader(),
      cencActive: this.runtime.enabled && this.eewLeader.isEewLeader(),
      usgsActive:
        this.runtime.enabled &&
        this.eewLeader.isEewLeader() &&
        this.shouldUseUsgsBackup(60_000),
    });
  }

  private async fetchHaCoordinates(): Promise<{ lat: number; lon: number } | null> {
    const { haUrl, token } = await this.resolveHaCredentials();
    if (!haUrl || !token) return null;

    try {
      const response = await firstValueFrom(
        this.http.get(`${haUrl}/api/config`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 10_000,
        }),
      );
      const data = response.data as { latitude?: number; longitude?: number };
      if (data.latitude != null && data.longitude != null) {
        return { lat: Number(data.latitude), lon: Number(data.longitude) };
      }
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
      this.logger.error(`获取 HA 坐标失败:${msg}`);
    }
    return null;
  }

  async resolveHaCredentials(): Promise<{ haUrl: string; token: string }> {
    let haUrl = this.config.get('HA_URL', '') || '';
    let token = this.config.get('HA_TOKEN', '') || '';

    try {
      const { layout } = await loadActiveProjectLayout(this.prisma, this.appConfig);
      const haConfig = layout.haConfig as { url?: string; token?: string } | undefined;
      if (haConfig?.url && haConfig?.token) {
        haUrl = haConfig.url;
        token = haConfig.token;
      }
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
      this.logger.error(`读取 HA 配置失败:${msg}`);
    }

    return { haUrl: haUrl?.replace(/\/$/, ''), token };
  }

  private handleMessage(msg: Record<string, unknown>) {
    const type = String(msg.type ?? '').toLowerCase();
    if (type === 'heartbeat') {
      try {
        this.wolfx.sendPing();
      } catch (err: unknown) {
        const message = getErrorMessage(err);
        this.logger.warn(`Wolfx 心跳 ping 失败:${message}`);
      }
      return;
    }
    if (type === 'pong') return;

    const eventId = String(msg.eventId ?? msg.event_id ?? msg.EventID ?? '').trim();
    if (eventId && isWolfxCancelled(msg)) {
      this.logger.log(`[取消报] 忽略并关闭 eventId=${eventId}`);
      void this.acknowledgeAlert(eventId);
      return;
    }

    const eew = parseWolfxMessage(msg);
    if (!eew) return;

    this.logger.log(`🌊 收到 EEW:eventId=${eew.eventId} M${eew.magnitude} (${eew.latitude},${eew.longitude}) 震中="${eew.epicenter}"`);
    this.diagnostics.touchWolfxActivity(true);
    this.wolfxDisconnectedSince = 0;
    this.enqueueProcessEew(eew);
  }

  private enqueueProcessEew(eew: EewRawMessage, opts?: { skipEnabledCheck?: boolean }) {
    this.processChain = this.processChain
      .then(() => this.processEew(eew, opts))
      .catch((err: unknown) => {
        const msg = getErrorMessage(err);
        this.logger.warn(`处理 EEW 失败:${msg}`);
      });
  }

  async processEew(eew: EewRawMessage, opts?: { skipEnabledCheck?: boolean }) {
    const cfg = await this.ensureRuntimeConfig();
    if (!cfg.enabled && !opts?.skipEnabledCheck) return;

    if (this.dismissedEventIds.has(eew.eventId)) {
      this.logger.log(`[已关闭] 忽略 eventId=${eew.eventId}`);
      this.diagnostics.recordFilter({
        source: eew.source || eew.type || 'unknown',
        reason: '事件已关闭',
        eventId: eew.eventId,
      });
      return;
    }
    if (await isEventDismissedRedis(this.redis, eew.eventId)) {
      this.dismissedEventIds.add(eew.eventId);
      this.logger.log(`[已关闭/Redis] 忽略 eventId=${eew.eventId}`);
      this.diagnostics.recordFilter({
        source: eew.source || eew.type || 'unknown',
        reason: '事件已关闭(Redis)',
        eventId: eew.eventId,
      });
      return;
    }

    const dedupe = await this.loadDedupeState();
    const evalResult = evaluateEewForAlert(eew, cfg, dedupe);

    if (evalResult.kind === 'skip') {
      this.diagnostics.recordFilter({
        source: eew.source || eew.type || 'unknown',
        reason: evalResult.message,
        eventId: eew.eventId,
      });
      if (evalResult.message.startsWith('⚠️')) {
        this.logger.warn(evalResult.message);
      } else {
        this.logger.log(evalResult.message);
      }
      return;
    }

    if (evalResult.kind === 'suppress_duplicate') {
      await this.updateDedupeState({
        activeEventId: eew.eventId,
        lastMagnitude: eew.magnitude,
        recent: dedupe.recent,
      });
      this.diagnostics.recordFilter({
        source: eew.source || eew.type || 'unknown',
        reason: evalResult.message,
        eventId: eew.eventId,
      });
      this.logger.log(evalResult.message);
      return;
    }

    for (const line of evalResult.message.split('\n').filter(Boolean)) {
      this.logger.log(line);
    }

    await this.updateDedupeState(evalResult.nextDedupe);

    const alertPayload = evalResult.alert;
    const isConfirmation = alertPayload.alertKind === 'confirmation';
    this.logger.log(
      `${isConfirmation ? '📢 确认通报' : '🚨 地震预警'}:${eew.epicenter} M${eew.magnitude} | ${alertPayload.distance}km | ${alertPayload.countdown}s | 来源=${alertPayload.source || '?'}`,
    );

    this.latestAlertPayload = alertPayload;
    this.latestAlertTime = Date.now();
    try {
      await saveLatestAlertRedis(this.redis, alertPayload);
    } catch (err) {
      this.logger.warn(`[EEW] Redis 写入失败,降级为内存缓存: ${getErrorMessage(err)}`);
    }
    try {
      await appendAlertHistoryPrisma(this.prisma, alertPayload);
    } catch (err) {
      this.logger.warn(`EEW 历史写入 PostgreSQL 失败: ${getErrorMessage(err)}`);
    }

    if (isConfirmation) {
      // 确认通报：仅通知，不全屏推送
      this.eventBus.emit(EEW_EVENTS.CONFIRMATION, alertPayload);
    } else {
      this.eventBus.emit(EEW_EVENTS.ALERT, alertPayload);
    }
  }

  /**
   * 加载去重状态：优先从 Redis 读取（Leader 故障转移后跨实例共享），
   * 并同步本地内存缓存，保证 Redis 短暂不可用时无缝降级；Redis 不可用则使用内存状态。
   */
  private async loadDedupeState(): Promise<EewDedupeState> {
    if (this.redis.isReady()) {
      try {
        const remote = await loadDedupeStateRedis(this.redis);
        if (remote) {
          this.activeEventId = remote.activeEventId;
          this.lastMagnitude = remote.lastMagnitude;
          this.lastEventTime = Date.now();
          if (remote.recent?.length) this.recentFingerprints = remote.recent;
          return {
            ...remote,
            recent: remote.recent?.length ? remote.recent : this.recentFingerprints,
          };
        }
      } catch (err: unknown) {
        const msg = getErrorMessage(err);
        this.logger.warn(`EEW 去重状态 Redis 读取失败,降级内存: ${msg}`);
      }
    }
    return {
      activeEventId: this.activeEventId,
      lastMagnitude: this.lastMagnitude,
      recent: this.recentFingerprints,
    };
  }

  /**
   * 更新去重状态：写内存并重启清空定时器，同时持久化到 Redis（TTL + 时间戳保护）。
   * Redis 写入失败仅告警降级，不影响内存去重的原有行为。
   */
  private async updateDedupeState(state: EewDedupeState) {
    this.activeEventId = state.activeEventId;
    this.lastMagnitude = state.lastMagnitude;
    this.lastEventTime = Date.now();
    if (state.recent) this.recentFingerprints = state.recent;
    this.resetDedupeClearTimer();
    if (!this.redis.isReady()) return;
    try {
      await saveDedupeStateRedis(this.redis, {
        ...state,
        recent: state.recent || this.recentFingerprints,
      });
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
      this.logger.warn(`EEW 去重状态 Redis 写入失败,降级内存: ${msg}`);
    }
  }

  private resetDedupeClearTimer() {
    if (this.dedupeClearTimer) clearTimeout(this.dedupeClearTimer);
    this.dedupeClearTimer = setTimeout(() => {
      this.logger.log(`[去重] 已清除 activeEventId=${this.activeEventId}`);
      this.activeEventId = '';
      this.lastEventTime = 0;
      this.lastMagnitude = 0;
    }, DEDUPE_CLEAR_DELAY_MS);
  }

  async tryFireSimulatedAlert(): Promise<{ ok: boolean; message?: string }> {
    await this.ensureRuntimeConfig(true);
    if (!isValidHomeCoordinate(this.runtime.homeLat, this.runtime.homeLon)) {
      return { ok: false, message: '未配置有效的家庭坐标，无法触发模拟演练' };
    }

    const now = Date.now();
    const homeLat = this.runtime.homeLat as number;
    const homeLon = this.runtime.homeLon as number;
    const lat = homeLat + 0.15;
    const lon = homeLon + 0.15;
    const distance = haversineDistanceKm(homeLat, homeLon, lat, lon);
    const travelTimeSec = distance / 3.4;
    // 演练倒计时起点对齐「开始显示」阈值，WS 到达后全屏立即弹出（60s/30s 倒计时或横波已到达）
    const leadSec = normalizeEewCountdownLead(this.runtime.countdownLeadSec);
    const initialCountdownSec = leadSec;
    const originTime = now - (travelTimeSec - initialCountdownSec) * 1000;

    await this.processEew(
      {
        type: 'eew',
        source: 'test',
        eventId: `test_${now}`,
        reportId: 1,
        originTime,
        latitude: lat,
        longitude: lon,
        magnitude: 6.0,
        depth: 10,
        epicenter: '本地周边地震模拟测试',
        maxIntensity: '7',
      },
      { skipEnabledCheck: true },
    );
    return { ok: true };
  }

  private cleanup() {
    if (this.dedupeClearTimer) {
      clearTimeout(this.dedupeClearTimer);
      this.dedupeClearTimer = null;
    }
    this.wolfx.markDestroyed();
  }

  getHomeCoordinates() {
    return { lat: this.runtime.homeLat, lon: this.runtime.homeLon };
  }

  getActiveEventId() {
    return this.activeEventId;
  }

  isConnected() {
    return this.wolfx.isConnected();
  }

  getConnectionStatus() {
    return this.wolfx.getConnectionStatus();
  }

  getLatestAlert() {
    return this.resolveLatestAlert();
  }

  async resolveLatestAlert() {
    const redisStored = await loadLatestAlertRedis(this.redis);
    if (redisStored) {
      const eventId = redisStored.payload.eventId;
      if (
        (await isEventDismissedRedis(this.redis, eventId)) ||
        this.dismissedEventIds.has(eventId)
      ) {
        return { isActive: false, payload: null };
      }
      const age = Date.now() - redisStored.savedAt;
      const isActive = age < LATEST_ALERT_TTL_MS;
      return { isActive, payload: isActive ? redisStored.payload : null };
    }

    if (!this.latestAlertPayload) {
      return { isActive: false, payload: null };
    }
    const eventId = this.latestAlertPayload.eventId;
    if (
      eventId &&
      (this.dismissedEventIds.has(eventId) || (await isEventDismissedRedis(this.redis, eventId)))
    ) {
      return { isActive: false, payload: null };
    }
    const age = Date.now() - this.latestAlertTime;
    const isActive = age < LATEST_ALERT_TTL_MS;
    return { isActive, payload: isActive ? this.latestAlertPayload : null };
  }

  async acknowledgeAlert(eventId: string) {
    const normalized = String(eventId || '').trim();
    if (!normalized) return { success: false, message: '缺少 eventId' };
    this.dismissedEventIds.add(normalized);
    await markEventDismissedRedis(this.redis, normalized);
    await clearLatestAlertRedis(this.redis, normalized);
    if (this.latestAlertPayload?.eventId === normalized) {
      this.latestAlertPayload = null;
      this.latestAlertTime = 0;
    }
    if (this.activeEventId === normalized) {
      this.activeEventId = '';
      this.lastEventTime = 0;
      this.lastMagnitude = 0;
    }
    await clearDedupeStateRedis(this.redis, normalized);
    return { success: true };
  }

  /**
   * 将通过本地阈值的 CENC 目录事件写入「本地预警」历史（确认通报，不全屏）。
   * 与 EEW 共用震级/距离/烈度门槛，避免「有站内通知却无本地记录」。
   */
  async recordCatalogLocalAlert(item: GlobalEarthquakeEvent): Promise<boolean> {
    const cfg = await this.ensureRuntimeConfig();
    if (!cfg.enabled || cfg.homeLat == null || cfg.homeLon == null) return false;

    const eventId = String(item.id || '').trim();
    if (!eventId) return false;

    const gate = evaluateLocalQuakeThresholds(
      {
        magnitude: item.magnitude,
        latitude: item.latitude,
        longitude: item.longitude,
        distanceKm: item.distanceKm,
      },
      {
        minMagnitude: cfg.minMagnitude,
        maxDistanceKm: cfg.maxDistance,
        minLocalIntensity: cfg.minLocalIntensity,
        homeLat: cfg.homeLat,
        homeLon: cfg.homeLon,
      },
    );
    if (!gate.pass) {
      this.diagnostics.recordFilter({
        source: 'cenc',
        reason: `目录震情未达阈值：${gate.reason}`,
        eventId,
      });
      return false;
    }

    try {
      const existing = await this.prisma.earthquakeAlertHistory.findFirst({
        where: { eventId },
        select: { id: true },
      });
      if (existing) return false;
    } catch (err) {
      this.logger.warn(`目录震情去重查询失败,继续写入: ${getErrorMessage(err)}`);
    }

    const distance = Math.round(gate.distanceKm * 10) / 10;
    const countdown = Math.round(computeSWaveCountdown(distance, item.originTime) * 10) / 10;
    const payload: EarthquakeAlertPayload = {
      eventId,
      latitude: item.latitude,
      longitude: item.longitude,
      originTime: item.originTime,
      magnitude: item.magnitude,
      depth: item.depth,
      epicenter: item.place || '未知震中',
      distance,
      countdown,
      localIntensity: gate.localIntensity,
      maxIntensity: item.intensity != null ? String(item.intensity) : undefined,
      alertKind: 'confirmation',
      source: 'cenc',
    };

    try {
      await appendAlertHistoryPrisma(this.prisma, payload);
    } catch (err) {
      this.logger.warn(`目录震情写入本地预警失败: ${getErrorMessage(err)}`);
      return false;
    }

    // 推送确认通报：前端以平静公报弹层展示（不全屏）
    this.eventBus.emit(EEW_EVENTS.CONFIRMATION, payload);

    // 不写入 EEW 跨源去重指纹，避免目录先到时抑制后续真正的早期预警
    this.logger.log(
      `📢 目录震情记入本地预警:${payload.epicenter} M${payload.magnitude} | ${distance}km | 烈度 ${payload.localIntensity}`,
    );
    return true;
  }

  async getAlertHistory(limit = 30) {
    try {
      const pgItems = await loadAlertHistoryPrisma(this.prisma, limit);
      if (pgItems.length > 0) {
        return { items: pgItems, total: pgItems.length, source: 'postgres' as const };
      }
    } catch (err) {
      this.logger.warn(`EEW 历史读取 PostgreSQL 失败,回退 Redis: ${getErrorMessage(err)}`);
    }
    const rows = await loadAlertHistoryRedis(this.redis, limit);
    return {
      items: rows.map((row) => ({
        ...row.payload,
        savedAt: row.savedAt,
      })),
      total: rows.length,
      source: 'redis' as const,
    };
  }

  /**
   * 删除模拟演练本地预警记录（仅 test_ / source=test）。
   * @param eventId 指定事件；省略则清除全部演练
   */
  async deleteSimulationHistory(eventId?: string): Promise<{ deleted: number }> {
    const targetId = String(eventId || '').trim();
    if (targetId && !isEewSimulationEventId(targetId)) {
      return { deleted: 0 };
    }

    let pgDeleted = 0;
    let redisDeleted = 0;
    try {
      pgDeleted = await deleteSimulationHistoryPrisma(this.prisma, targetId || undefined);
    } catch (err) {
      this.logger.warn(`删除演练历史(PG)失败: ${getErrorMessage(err)}`);
    }
    try {
      redisDeleted = await deleteSimulationHistoryRedis(this.redis, targetId || undefined);
    } catch (err) {
      this.logger.warn(`删除演练历史(Redis)失败: ${getErrorMessage(err)}`);
    }
    const deleted = Math.max(pgDeleted, redisDeleted);

    const clearIds = targetId
      ? [targetId]
      : [
          ...(this.latestAlertPayload && isSimulationAlertRecord(this.latestAlertPayload)
            ? [this.latestAlertPayload.eventId]
            : []),
          ...(this.activeEventId && isEewSimulationEventId(this.activeEventId)
            ? [this.activeEventId]
            : []),
        ];

    for (const id of [...new Set(clearIds.filter(Boolean))]) {
      await clearLatestAlertRedis(this.redis, id);
      await clearDedupeStateRedis(this.redis, id);
      this.dismissedEventIds.delete(id);
      if (this.latestAlertPayload?.eventId === id) {
        this.latestAlertPayload = null;
        this.latestAlertTime = 0;
      }
      if (this.activeEventId === id) {
        this.activeEventId = '';
        this.lastEventTime = 0;
        this.lastMagnitude = 0;
      }
    }

    if (!targetId && this.latestAlertPayload && isSimulationAlertRecord(this.latestAlertPayload)) {
      this.latestAlertPayload = null;
      this.latestAlertTime = 0;
    }

    return { deleted };
  }

  getLeaderStatus() {
    return this.eewLeader.getStatus();
  }

  async getClusterConnectionStatus() {
    const local = this.getConnectionStatus();
    const leader = this.eewLeader.getStatus();
    const clusterActive = leader.isLeader
      ? local.connected
      : await isWolfxClusterActive(this.redis);
    return {
      ...local,
      isLeader: leader.isLeader,
      mode: leader.mode,
      clusterConnected: clusterActive,
    };
  }

  async getHaCoordinatesOnly(): Promise<{ latitude: number | null; longitude: number | null }> {
    await this.ensureRuntimeConfig();
    const coords = this.getHomeCoordinates();
    if (isValidHomeCoordinate(coords.lat, coords.lon)) {
      return { latitude: coords.lat, longitude: coords.lon };
    }
    const haCoords = await this.fetchHaCoordinates();
    if (haCoords && isValidHomeCoordinate(haCoords.lat, haCoords.lon)) {
      return { latitude: haCoords.lat, longitude: haCoords.lon };
    }
    return { latitude: null, longitude: null };
  }

  getRuntimeConfig() {
    return { ...this.runtime };
  }
}
