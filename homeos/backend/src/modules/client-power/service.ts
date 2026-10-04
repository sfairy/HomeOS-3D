/**
 * 客户端系统信息与充电器开关滞回联动 服务。
 *
 * 职责：
 *  - 接收客户端上报的系统信息（含电量），归一化后落库到内存态并周期持久化到 RuntimeKv。
 *  - 通过 reportToken 实现配对鉴权：未配对终端仅入待配对列表，已配对终端校验 token 后才允许执行联动。
 *  - 在电量低于低阈值或达到高阈值时，调用 HaConnector 执行开关滞回联动。
 *  - 维护在线状态、待配对记录的发现/清除，并发布客户端电量相关事件供通知模块消费。
 *
 * 依赖：
 *  - AppConfigService：读取 clientPower 配置并监听变更。
 *  - PrismaService：持久化运行时状态。
 *  - HaConnectorService：执行开关服务调用。
 *  - EventBusService：经 Redis 桥接发布电量上报/低电量/充满/联动失败事件（跨实例广播）。
 *  - NotificationCooldownService：联动动作冷却，避免重复触发。
 *  - scheduleSecurityEvent：联动失败时记录安全事件用于审计。
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';
import { DEFAULT_CLIENT_POWER_SELF_CHARGE } from '@homeos/shared';
import { OnEvent } from '@nestjs/event-emitter';
import { AppConfigService, APP_CONFIG_UPDATED } from '../../shared/app-config/service';
import { PrismaService } from '../../shared/prisma/service';
import { JobRegistryService } from '../../shared/jobs/registry.service';
import { cloneJsonPayload, loadRuntimeKv } from '../../shared/prisma/runtime-kv.util';
import { EventBusService } from '../../shared/redis/event-bus.service';
import { HaConnectorService } from '../ha-connector/service';
import { NotificationCooldownService } from '../../common/alert-support/notification-cooldown.service';
import { scheduleSecurityEvent } from '../../common/http-security/hazard.util';
import { getErrorMessage } from '../../common/utils';
import { HOMEOS_EVENTS } from '../../shared/homeos-events';
import { isPeakTime } from '../../shared/app-config/pricing-config.util';
import { evaluateSelfChargeActions } from './linkage.helper';
import { normalizeClientSystemReport } from './client-system-normalize.util';
import type {
  ClientSystemState,
  ClientSystemInfo,
  ClientPowerRuntimePersist,
  PendingClientState,
  SwitchLinkageAction,
  ClientSystemReportDto as ClientSystemReportInput,
} from './types';
import { ClientSystemReportDto } from './report.dto';
import { CLIENT_POWER_RUNTIME_CONFIG_ID } from './types';

/**
 * 客户端电量上报事件的跨实例负载（JSON 可序列化，经 Redis 桥接同步各实例内存态）。
 * 字段须保持 JSON 可序列化：systemInfo 为纯 JSON 对象，无函数/循环引用。
 */
interface ClientPowerReportedPayload {
  clientId: string;
  level: number | null;
  charging: boolean | null;
  chargingTime: number | null;
  dischargingTime: number | null;
  batterySupported: boolean;
  /** 该客户端是否已在配置中注册（未配对终端同步写入待配对列表） */
  configured: boolean;
  systemInfo: ClientSystemInfo | null;
  label?: string;
  /** 上报时间（ISO 字符串），用于幂等去重与在线判定 */
  lastReportAt: string;
  reportTokenAcknowledged?: boolean;
  reportTokenHash?: string;
}

/**
 * 客户端系统信息服务（DI 角色：核心业务 Provider）。
 * 实现 OnModuleInit/OnModuleDestroy 生命周期以管理周期持久化与在线状态刷新定时器。
 */
@Injectable()
export class ClientPowerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ClientPowerService.name);
  /** clientId → 最新上报的客户端状态（内存态，定期 flush 到数据库） */
  private readonly states = new Map<string, ClientSystemState>();
  /** clientId → 待配对终端发现记录（未在配置中注册但已上报） */
  private readonly pending = new Map<string, PendingClientState>();
  /** 标记内存态是否已变更，下一轮 flush 时需写库 */
  private dirty = false;
  /** 周期 flush 持久化定时器（默认 15s） */
  private persistTimer: NodeJS.Timeout | null = null;
  /** 周期刷新在线标志定时器（默认 30s） */
  private staleTimer: NodeJS.Timeout | null = null;
  /** 待配对记录最大条数：防止异常/恶意客户端持续上报随机 clientId 导致内存无限增长 */
  private readonly MAX_PENDING = 100;
  /** 待配对记录最长保留时间（毫秒）：超过即清理（仍会随下次上报重新出现） */
  private readonly PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  /** 本实例已清除的运行时 id：flush 时从 KV merge 结果中删掉，避免重启后复活 */
  private readonly purgedRuntimeIds = new Set<string>();

  constructor(
    private readonly appConfig: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly haConnector: HaConnectorService,
    private readonly eventBus: EventBusService,
    private readonly cooldownService: NotificationCooldownService,
    private readonly jobs: JobRegistryService,
  ) {}

  /** 模块初始化：加载持久化运行时状态、对账待配对、刷新在线标志并启动周期任务 */
  async onModuleInit() {
    await this.loadPersistedRuntime();
    this.reconcilePendingWithConfig();
    this.refreshOnlineFlags();
    this.persistTimer = setInterval(() => {
      void this.jobs.run(
        'client-power-persist',
        { description: '客户端电量状态落库', intervalMs: 15_000 },
        () => this.flushPersistedRuntime(),
      );
    }, 15_000);
    this.staleTimer = setInterval(() => {
      void this.jobs.run(
        'client-power-online',
        { description: '客户端在线状态刷新', intervalMs: 30_000 },
        () => this.refreshOnlineFlags(),
      );
    }, 30_000);
    this.logger.log('客户端系统信息服务已启动');
  }

  /** 模块销毁：清理定时器并同步最后一次状态到数据库 */
  onModuleDestroy() {
    if (this.persistTimer) clearInterval(this.persistTimer);
    if (this.staleTimer) clearInterval(this.staleTimer);
    void this.flushPersistedRuntime();
  }

  /** 读取 clientPower 配置（每次调用都从 appConfig 取最新值，避免缓存陈旧） */
  private cfg() {
    return this.appConfig.get('clientPower');
  }

  /** 按 clientId 在配置中查找对应的客户端配置项 */
  private findClientConfig(clientId: string) {
    return this.cfg().clients.find((c) => c.id === clientId);
  }

  /** 判断该 clientId 是否已在配置中注册（已配对） */
  private isConfigured(clientId: string): boolean {
    return !!this.findClientConfig(clientId);
  }

  /**
   * 常量时间比较两个 token 字符串，避免时序侧信道泄露 token 长度/前缀信息。
   * 长度不同直接返回 false（timingSafeEqual 要求等长 buffer）。
   */
  private tokensMatch(expected: string, provided: string): boolean {
    const a = Buffer.from(expected);
    const b = Buffer.from(provided);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  /** 计算 reportToken 哈希，用于检测 token 是否已轮换 */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
  /**
   * 校验终端上报密钥：未配对终端不执行联动；已配对须持有 reportToken。
   * 首次配对后向合法终端一次性下发 token（由控制器写入 HttpOnly Cookie `homeos_cprt`）。
   *
   * 安全关键路径：
   *  - 提供的 token 不匹配且 prev 记录的哈希仍等于当前 expected，说明 token 未轮换，
   *    视为非法请求，不重发 token（防止攻击者通过错误 token 探测）。
   *  - 哈希不同或缺失，说明 token 已轮换或为首次配对，重发 expected 供合法终端重新配对。
   *
   * @param clientId 客户端标识
   * @param reportToken 本次上报携带的 token（可能为空）
   * @param clientCfg 客户端配置（未配对时为 undefined）
   * @param prev 上一次上报的状态（用于检测 token 轮换）
   * @returns linkageAllowed 是否允许执行联动；deliverToken 需要下发的 token（仅轮换/首次配对时返回）
   */
  private resolveReportAuth(
    clientId: string,
    reportToken: string | undefined,
    clientCfg: ReturnType<ClientPowerService['findClientConfig']>,
    prev: ClientSystemState | undefined,
  ): { linkageAllowed: boolean; deliverToken?: string } {
    if (!clientCfg) return { linkageAllowed: false };

    const expected = String(clientCfg.reportToken || '').trim();
    if (!expected) return { linkageAllowed: false };

    const provided = String(reportToken || '').trim();
    if (provided && this.tokensMatch(expected, provided)) {
      return { linkageAllowed: true };
    }

    // 提供的 token 不匹配：若 prev 记录的哈希仍等于当前 expected，说明 token 未轮换，
    // 视为非法请求，不重发 token（防止攻击者通过错误 token 探测）。
    // 若哈希不同或缺失，说明 token 已轮换或为首次配对，重发 expected 供合法终端重新配对。
    const expectedHash = this.hashToken(expected);
    if (prev?.reportTokenHash && prev.reportTokenHash === expectedHash) {
      return { linkageAllowed: false };
    }

    return { linkageAllowed: false, deliverToken: expected };
  }

  /**
   * 处理客户端系统信息上报。
   * 流程：
   *  1. 归一化上报数据（电量百分比、电池支持标志等）。
   *  2. 未配对终端写入 pending；已配对终端从 pending 移除。
   *  3. 校验 reportToken，决定是否允许联动。
   *  4. 更新内存态 states 并标记 dirty。
   *  5. 发布上报/低电量/充满事件。
   *  6. 若启用联动且通过鉴权，评估并执行滞回联动动作。
   *
   * 安全说明：deliverToken 仅供控制器写入 HttpOnly Cookie，绝不应出现在 HTTP 响应 JSON body 中，
   * 否则 XSS 攻击可读取明文 token。控制器在设置 Cookie 后必须将该字段从响应体中剔除。
   *
   * @param dto 上报请求体
   * @returns accepted 是否接受；configured 是否已配对；deliverToken 需下发到 Cookie 的 token（轮换/首次配对时）
   */
  async report(dto: ClientSystemReportDto): Promise<{
    accepted: boolean;
    configured: boolean;
    /** 待下发到 HttpOnly Cookie 的 reportToken，控制器负责设置 Cookie 并从 JSON body 中剔除 */
    deliverToken?: string;
  }> {
    const clientId = String(dto.clientId || '').trim();
    if (!clientId) return { accepted: false, configured: false };

    const normalized = normalizeClientSystemReport(dto as unknown as ClientSystemReportInput);
    const now = new Date().toISOString();
    const { systemInfo, level, charging, chargingTime, dischargingTime, batterySupported } =
      normalized;
    const clientCfg = this.findClientConfig(clientId);
    const configured = !!clientCfg;

    if (!configured) {
      // 未配对终端：保留首次发现时间，刷新最近上报时间
      const existingPending = this.pending.get(clientId);
      this.pending.set(clientId, {
        clientId,
        systemInfo,
        firstSeenAt: existingPending?.firstSeenAt ?? now,
        lastReportAt: now,
      });
      // 限制待配对记录数量与 TTL，防止异常/恶意客户端持续上报导致内存无限增长
      this.prunePending();
    } else {
      // 已配对终端：从 pending 中移除，避免出现在待配对列表
      this.pending.delete(clientId);
    }

    const prev = this.states.get(clientId);
    const auth = this.resolveReportAuth(clientId, dto.reportToken, clientCfg, prev);
    const expectedToken = clientCfg ? String(clientCfg.reportToken || '').trim() : '';
    const state: ClientSystemState = {
      clientId,
      systemInfo,
      level,
      charging,
      chargingTime,
      dischargingTime,
      batterySupported,
      lastReportAt: now,
      online: true,
      label: clientCfg?.label,
      pending: !configured,
      // 仅当本次 token 校验通过才视为已确认；token 轮换后旧客户端自动失效需重新配对
      reportTokenAcknowledged: auth.linkageAllowed,
      // 校验通过则记录当前 expected 哈希；否则保留 prev 哈希以便后续检测轮换
      reportTokenHash:
        auth.linkageAllowed && expectedToken
          ? this.hashToken(expectedToken)
          : prev?.reportTokenHash,
    };
    this.states.set(clientId, state);
    this.dirty = true;

    // 经 EventBusService 桥接到 Redis：Follower 收到的上报广播到所有实例，
    // Leader 与 Follower 共享同一份上报数据流（负载为纯 JSON，可安全序列化）。
    // 各实例的 @OnEvent 处理器据此同步本地 states/pending（联动动作不在此重复执行）。
    this.eventBus.emit(HOMEOS_EVENTS.CLIENT_POWER_REPORTED, {
      clientId,
      level,
      charging,
      chargingTime,
      dischargingTime,
      batterySupported,
      configured,
      systemInfo,
      label: clientCfg?.label,
      lastReportAt: now,
      reportTokenAcknowledged: auth.linkageAllowed,
      reportTokenHash: state.reportTokenHash,
    } satisfies ClientPowerReportedPayload);

    // 仅在电量跨过阈值时触发低电量/充满事件，避免重复告警
    if (level != null) {
      const lowThreshold = clientCfg?.selfCharge?.lowPercent ?? DEFAULT_CLIENT_POWER_SELF_CHARGE.lowPercent;
      const highThreshold =
        clientCfg?.selfCharge?.highPercent ?? DEFAULT_CLIENT_POWER_SELF_CHARGE.highPercent;
      if (prev?.level != null && prev.level >= lowThreshold && level < lowThreshold) {
        this.eventBus.emit(HOMEOS_EVENTS.CLIENT_POWER_LOW, { clientId, level });
      } else if (prev == null && level < lowThreshold && configured && auth.linkageAllowed) {
        // 首次上报即低于低阈值：仅对已配对（token 确认）终端触发一次，避免未配对设备误报
        this.eventBus.emit(HOMEOS_EVENTS.CLIENT_POWER_LOW, { clientId, level });
      }
      if (prev?.level != null && prev.level < highThreshold && level >= highThreshold) {
        this.eventBus.emit(HOMEOS_EVENTS.CLIENT_POWER_CHARGED, { clientId, level });
      }
    }

    if (this.cfg().enabled && auth.linkageAllowed) {
      await this.evaluateAndExecute(state);
    }

    return {
      accepted: true,
      configured,
      ...(auth.deliverToken ? { deliverToken: auth.deliverToken } : {}),
    };
  }

  /**
   * 跨实例同步客户端上报状态（CLIENT_POWER_REPORTED 桥接事件的接收方处理）。
   * 仅同步内存态 states/pending，供状态面板与周期持久化使用；不在本处理器执行联动动作，
   * 避免 Follower 重复执行 Leader 才做的开关联动——联动仍由收到原始上报的实例在 report() 中
   * 执行，自动化触发侧也已有 HaWsLeaderService.isHaWsLeader 判断过滤 Follower。
   *
   * 幂等 + 防旧事件覆盖：仅接受比本地更新的上报时间戳（ISO 字符串序即时间序）。
   * 相同时间戳说明本实例 report() 刚处理过，更旧的时间戳说明是迟到的桥接回放，
   * 两种情况均跳过，保证单实例部署与多副本乱序桥接下都不会重复覆盖或回退状态。
   *
   * @param payload 上报事件负载（可能是其他实例经 Redis 桥接回放的数据）
   */
  @OnEvent(HOMEOS_EVENTS.CLIENT_POWER_REPORTED)
  handleReportedEvent(payload?: ClientPowerReportedPayload) {
    if (!payload || typeof payload !== 'object') return;
    const clientId = String(payload.clientId || '').trim();
    if (!clientId) return;

    const existing = this.states.get(clientId);
    const lastReportAt = payload.lastReportAt || new Date().toISOString();
    // 幂等 + 防旧事件覆盖：相同时间戳说明本实例已处理（report() 直接路径）或已同步；
    // 更旧的时间戳说明是迟到的桥接事件（多副本事件乱序），跳过避免把新状态回退
    if (existing && existing.lastReportAt >= lastReportAt) return;
    if (payload.configured) {
      // 已配对终端：从待配对列表移除
      this.pending.delete(clientId);
    } else {
      // 未配对终端：保留首次发现时间，刷新最近上报时间
      const existingPending = this.pending.get(clientId);
      this.pending.set(clientId, {
        clientId,
        systemInfo: payload.systemInfo ?? null,
        firstSeenAt: existingPending?.firstSeenAt ?? lastReportAt,
        lastReportAt,
      });
      this.prunePending();
    }

    this.states.set(clientId, {
      clientId,
      systemInfo: payload.systemInfo ?? null,
      level: payload.level ?? null,
      charging: payload.charging ?? null,
      chargingTime: payload.chargingTime ?? null,
      dischargingTime: payload.dischargingTime ?? null,
      batterySupported: payload.batterySupported,
      lastReportAt,
      online: true,
      label: payload.label,
      pending: !payload.configured,
      reportTokenAcknowledged: payload.reportTokenAcknowledged,
      reportTokenHash: payload.reportTokenHash,
    });
    this.dirty = true;
  }

  /** 返回所有客户端状态快照（含在线判定）与待配对列表，供前端状态面板渲染 */
  getStatusSnapshot() {
    const cfg = this.cfg();
    const staleMs = cfg.staleTimeoutSec * 1000;
    const now = Date.now();

    const pending = this.collectPendingClients();

    const clients = [...this.states.values()].map((s) => ({
      ...s,
      online: now - new Date(s.lastReportAt).getTime() <= staleMs,
    }));

    return {
      enabled: cfg.enabled,
      clients,
      pending,
      configuredClients: cfg.clients.map(({ reportToken: _reportToken, ...rest }) => rest),
    };
  }

  /** 返回待配对终端列表（已按最近上报时间倒序） */
  getPendingClients(): PendingClientState[] {
    return this.collectPendingClients();
  }

  /**
   * 清除某个离线待配对终端的发现记录。
   * 同时从 pending 与 states 删除，避免被 reconcilePendingWithConfig 从 states 重新拉回。
   * 仅允许清除未配对且当前离线的终端（在线终端下次心跳会重新出现，配对终端应走移除策略）。
   *
   * @param id 客户端标识
   * @returns dismissed 是否已清除；reason 未清除原因（invalid | configured | online | not_found）
   */
  private tryDismissPendingRecord(id: string): { dismissed: boolean; reason?: string } {
    if (!id) return { dismissed: false, reason: 'invalid' };
    if (this.isConfigured(id)) return { dismissed: false, reason: 'configured' };

    const state = this.states.get(id);
    if (state) {
      const staleMs = this.cfg().staleTimeoutSec * 1000;
      const online = Date.now() - new Date(state.lastReportAt).getTime() <= staleMs;
      if (online) return { dismissed: false, reason: 'online' };
    }

    const hadPending = this.pending.delete(id);
    const hadState = this.states.delete(id);
    if (!hadPending && !hadState) return { dismissed: false, reason: 'not_found' };

    this.purgedRuntimeIds.add(id);
    return { dismissed: true };
  }

  /** 清除指定离线待配对终端的发现记录并立即落库 */
  async dismissPending(clientId: string): Promise<{ dismissed: boolean; reason?: string }> {
    const id = String(clientId || '').trim();
    const result = this.tryDismissPendingRecord(id);
    if (result.dismissed) {
      this.dirty = true;
      await this.flushPersistedRuntime();
      this.logger.log(`已清除离线待配对终端发现记录: ${id}`);
    }
    return result;
  }

  /** 批量清除所有离线待配对终端的发现记录（跳过仍在线的终端） */
  async dismissAllOfflinePending(): Promise<{ dismissed: number; clientIds: string[] }> {
    this.reconcilePendingWithConfig();
    const clientIds = [...this.pending.keys()].filter((id) => !this.isConfigured(id));
    const dismissed: string[] = [];
    for (const id of clientIds) {
      const result = this.tryDismissPendingRecord(id);
      if (result.dismissed) dismissed.push(id);
    }
    if (dismissed.length) {
      this.dirty = true;
      await this.flushPersistedRuntime();
      this.logger.log(`已批量清除 ${dismissed.length} 个离线待配对终端发现记录`);
    }
    return { dismissed: dismissed.length, clientIds: dismissed };
  }

  /** 监听配置变更：clientPower 配置更新后重新对账待配对列表 */
  @OnEvent(APP_CONFIG_UPDATED)
  onConfigUpdated(keys: string[]) {
    if (keys.includes('clientPower')) {
      this.reconcilePendingWithConfig();
    }
  }

  /** 配置变更或查询时：将已注册终端移出 pending，未注册但有上报记录的终端恢复为待配对 */
  private reconcilePendingWithConfig() {
    const configuredIds = new Set(this.cfg().clients.map((c) => c.id));

    for (const id of configuredIds) {
      this.pending.delete(id);
    }

    let changed = false;
    for (const state of this.states.values()) {
      const clientCfg = this.findClientConfig(state.clientId);
      const configured = !!clientCfg;

      if (state.pending !== !configured || state.label !== clientCfg?.label) {
        state.pending = !configured;
        state.label = clientCfg?.label;
        changed = true;
      }

      if (configured) continue;

      const existing = this.pending.get(state.clientId);
      this.pending.set(state.clientId, {
        clientId: state.clientId,
        systemInfo: state.systemInfo ?? existing?.systemInfo ?? null,
        firstSeenAt: existing?.firstSeenAt ?? state.lastReportAt,
        lastReportAt: state.lastReportAt,
      });
      changed = true;
    }

    if (changed) this.dirty = true;
  }

  /**
   * 限制待配对记录的内存增长：淘汰超过 TTL 的旧条目；超过上限时按最近上报时间
   * 淘汰最旧条目。被淘汰的终端下次上报会自动重新出现，不影响正常配对流程。
   */
  private prunePending(now = Date.now()) {
    let pruned = false;
    for (const [id, p] of this.pending) {
      const lastAt = new Date(p.lastReportAt).getTime();
      if (!Number.isFinite(lastAt) || now - lastAt > this.PENDING_TTL_MS) {
        this.pending.delete(id);
        if (!this.isConfigured(id)) this.states.delete(id);
        this.purgedRuntimeIds.add(id);
        pruned = true;
      }
    }
    if (this.pending.size > this.MAX_PENDING) {
      const sorted = [...this.pending.entries()].sort(
        (a, b) => new Date(b[1].lastReportAt).getTime() - new Date(a[1].lastReportAt).getTime(),
      );
      for (let i = this.MAX_PENDING; i < sorted.length; i++) {
        const id = sorted[i][0];
        this.pending.delete(id);
        if (!this.isConfigured(id)) this.states.delete(id);
        this.purgedRuntimeIds.add(id);
        pruned = true;
      }
    }
    if (pruned) this.dirty = true;
  }

  /** 收集待配对终端列表：先对账再过滤掉已注册的，最后按最近上报时间倒序 */
  private collectPendingClients(): PendingClientState[] {
    this.reconcilePendingWithConfig();
    const configuredIds = new Set(this.cfg().clients.map((c) => c.id));
    return [...this.pending.values()]
      .filter((p) => !configuredIds.has(p.clientId))
      .sort((a, b) => b.lastReportAt.localeCompare(a.lastReportAt));
  }

  /** 周期刷新在线标志：超过 staleTimeoutSec 未上报视为离线，并标记 dirty 以触发持久化 */
  private refreshOnlineFlags() {
    const staleMs = this.cfg().staleTimeoutSec * 1000;
    const now = Date.now();
    let changed = false;
    for (const state of this.states.values()) {
      const online = now - new Date(state.lastReportAt).getTime() <= staleMs;
      if (state.online !== online) {
        state.online = online;
        changed = true;
      }
    }
    // 顺带清理超过 TTL 的待配对记录
    this.prunePending(now);
    if (changed) this.dirty = true;
  }
  /**
   * 判断指定冷却键是否仍在冷却期内。
   * 冷却在 HA 调用成功后才写入，避免失败后卡住默认冷却窗口。
   *
   * @param key 冷却键（如 selfCharge:on:<clientId>）
   * @returns true 表示在冷却期内应跳过；false 表示可执行
   */
  private inCooldown(key: string): boolean {
    return this.cooldownService.isInCooldown('clientPower', key);
  }

  private markCooldown(key: string): void {
    this.cooldownService.setCooldown('clientPower', key, this.cfg().cooldownMin);
  }

  /**
   * 执行单个联动动作：先检查冷却，再调用 HA 服务。
   * 失败时按 linkageRetryCount 重试（间隔 linkageRetryDelayMs），仍失败则记录安全事件并发布联动失败事件。
   *
   * @param action 待执行的开关联动动作
   */
  private async executeAction(action: SwitchLinkageAction) {
    if (this.inCooldown(action.cooldownKey)) return;
    const retryCount = Math.max(0, Math.floor(this.cfg().linkageRetryCount) || 0);
    const retryDelayMs = Math.max(0, this.cfg().linkageRetryDelayMs || 0);
    let lastError: unknown;
    for (let attempt = 0; attempt <= retryCount; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
      }
      try {
        await this.haConnector.callService(action.domain, action.service, action.entityId);
        this.markCooldown(action.cooldownKey);
        this.logger.log(`客户端电量联动:${action.entityId} ${action.service}(${action.reason})`);
        return;
      } catch (err) {
        lastError = err;
        this.logger.warn(
          `客户端电量联动失败 [${action.entityId}] 第 ${attempt + 1}/${retryCount + 1} 次: ${getErrorMessage(err)}`,
        );
      }
    }
    const detail = `客户端电量联动失败 [${action.entityId}]: ${getErrorMessage(lastError)}`;
    this.logger.warn(detail);
    scheduleSecurityEvent(this.prisma, this.logger, 'client_power_linkage_failed', detail, {
      entityId: action.entityId,
    });
    this.eventBus.emit(HOMEOS_EVENTS.CLIENT_POWER_LINKAGE_FAILED, {
      entityId: action.entityId,
      reason: action.reason,
      error: getErrorMessage(lastError),
    });
  }

  /**
   * 评估并执行客户端的滞回联动动作。
   * 仅在客户端启用时调用 helper 计算动作列表并依次执行；
   * 峰谷错峰策略依赖当前是否处于峰电时段（家庭时区；分时未启用时恒为 false）。
   *
   * @param state 客户端最新状态
   */
  private async evaluateAndExecute(state: ClientSystemState) {
    const clientCfg = this.findClientConfig(state.clientId);
    if (!clientCfg?.enabled) return;

    const pricing = this.appConfig.get('pricing');
    const isPeak = isPeakTime(new Date(), pricing, this.appConfig.getHomeTimezone());
    const actions = evaluateSelfChargeActions(clientCfg, state, {
      isPeak,
      timeOfUseActive: pricing.timeOfUseEnabled !== false,
    });
    for (const action of actions) {
      await this.executeAction(action);
    }
  }

  /**
   * 从 RuntimeKv 加载持久化的运行时状态（states + pending）。
   * 加载后默认全部置为离线，待下次上报或在线刷新后更新。
   */
  private async loadPersistedRuntime() {
    try {
      const raw = await loadRuntimeKv<ClientPowerRuntimePersist>(
        this.prisma,
        CLIENT_POWER_RUNTIME_CONFIG_ID,
      );
      if (!raw) return;
      const data = raw;
      for (const [id, state] of Object.entries(data.states || {})) {
        this.states.set(id, { ...state, clientId: id, online: false });
      }
      for (const [id, pending] of Object.entries(data.pending || {})) {
        this.pending.set(id, {
          clientId: id,
          systemInfo: pending.systemInfo ?? null,
          firstSeenAt: String(
            pending.firstSeenAt || pending.lastReportAt || new Date().toISOString(),
          ),
          lastReportAt: String(pending.lastReportAt || new Date().toISOString()),
        });
      }
    } catch (err) {
      this.logger.warn(`加载客户端系统信息运行时状态失败: ${getErrorMessage(err)}`);
    }
  }

  /**
   * 将内存态 states 与 pending 持久化到 RuntimeKv（合并写）。
   * 仅 dirty 时执行；持久化失败时回滚 dirty 标志以便下轮重试。
   *
   * 合并语义：先读取现有持久化状态，再按客户端合并本实例最新数据——
   * 本实例有该客户端的状态则用本实例最新值覆盖，其余保留现有值。
   * 本实例已清除（dismiss / TTL 淘汰）的 id 从合并结果中删除，避免重启后复活。
   * 多副本下各实例内存态互补（各自收到部分上报），合并写避免 last-write-wins 互相覆盖，
   * 状态面板与自充电联动不再基于被冲掉的历史数据。
   */
  private async flushPersistedRuntime() {
    if (!this.dirty) return;
    this.dirty = false;
    const flushedPurgeIds = [...this.purgedRuntimeIds];
    try {
      const existing = await loadRuntimeKv<ClientPowerRuntimePersist>(
        this.prisma,
        CLIENT_POWER_RUNTIME_CONFIG_ID,
      );
      const states: ClientPowerRuntimePersist['states'] = { ...(existing?.states || {}) };
      for (const [id, s] of this.states.entries()) {
        // 在线标志是运行时计算量，不持久化（重启后由上报或刷新重建）
        const { online, ...rest } = s;
        void online;
        states[id] = rest;
      }
      const pending: ClientPowerRuntimePersist['pending'] = { ...(existing?.pending || {}) };
      for (const [id, p] of this.pending.entries()) {
        pending[id] = p;
      }
      const dropState = new Set(flushedPurgeIds.filter((id) => !this.states.has(id)));
      const dropPending = new Set(flushedPurgeIds.filter((id) => !this.pending.has(id)));
      const nextStates = Object.fromEntries(
        Object.entries(states).filter(([id]) => !dropState.has(id)),
      ) as ClientPowerRuntimePersist['states'];
      const nextPending = Object.fromEntries(
        Object.entries(pending).filter(([id]) => !dropPending.has(id)),
      ) as ClientPowerRuntimePersist['pending'];
      await this.prisma.runtimeKv.upsert({
        where: { id: CLIENT_POWER_RUNTIME_CONFIG_ID },
        create: { id: CLIENT_POWER_RUNTIME_CONFIG_ID, data: cloneJsonPayload({ states: nextStates, pending: nextPending }) },
        update: { data: cloneJsonPayload({ states: nextStates, pending: nextPending }) },
      });
      for (const id of flushedPurgeIds) this.purgedRuntimeIds.delete(id);
    } catch (err) {
      // 写库失败：恢复 dirty 以便下一轮重试
      this.dirty = true;
      this.logger.warn(`持久化客户端系统信息状态失败: ${getErrorMessage(err)}`);
    }
  }
}