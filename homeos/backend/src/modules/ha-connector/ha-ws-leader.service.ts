/**
 * HA WebSocket Leader 选举服务。
 *
 * 职责：
 * - 封装 RedisLeaderElection，在多副本部署中选举唯一 Leader 实例。
 * - 仅 Leader 实例维护到 Home Assistant 的 WebSocket 长连接，Follower 不重复连接。
 * - 提供 Leader/Follower 状态查询与回调注册，供 HaConnectorService 决定连接行为。
 * - 监听 AppConfig 热更新，同步 leaderTtlMs / leaderRenewMs。
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RedisService } from '../../shared/redis/service';
import { AppConfigService, APP_CONFIG_UPDATED } from '../../shared/app-config/service';
import { RedisLeaderElection } from '../../shared/redis/leader-election.helper';

@Injectable()
/**
 * HaWsLeaderService：Nest @Injectable 服务。
 * - 职责：承载域内核心业务逻辑；
 * - 装配：由对应 Module 的 providers 数组注入；
 * - 生命周期：可能实现 onModuleInit/onModuleDestroy（连接/订阅管理）；
 */
export class HaWsLeaderService implements OnModuleInit, OnModuleDestroy {
  private readonly election: RedisLeaderElection;
  private readonly logger = new Logger(HaWsLeaderService.name);

  constructor(
    redis: RedisService,
    private readonly appConfig: AppConfigService,
  ) {
    const ha = appConfig.get('haConnector');
    this.election = new RedisLeaderElection({
      redis,
      key: 'homeos:ha-ws-leader',
      label: 'HA WebSocket 连接',
      ttlMs: ha.leaderTtlMs ?? 8_000,
      renewMs: ha.leaderRenewMs ?? 2_500,
      standaloneWarning:
        'Redis 不可用或未配置：本实例以 standalone 模式运行 HA WebSocket。' +
        ' 多副本部署必须配置 REDIS_URL，否则会出现重复 HA 连接与重复持久化。',
      logger: this.logger,
    });
  }

  setCallbacks(cb: { onLeader?: () => void; onFollower?: () => void }) {
    this.election.setCallbacks(cb);
  }

  async onModuleInit() {
    await this.election.onModuleInit();
  }

  onModuleDestroy() {
    this.election.onModuleDestroy();
  }

  @OnEvent(APP_CONFIG_UPDATED)
  onAppConfigUpdated(keys: string[]) {
    if (!Array.isArray(keys) || !keys.includes('haConnector')) return;
    const ha = this.appConfig.get('haConnector');
    this.election.updateTiming({
      ttlMs: ha.leaderTtlMs,
      renewMs: ha.leaderRenewMs,
    });
    this.logger.log(
      `HA WS Leader 租约已热更新:ttl=${ha.leaderTtlMs}ms renew=${ha.leaderRenewMs}ms`,
    );
  }

  isHaWsLeader(): boolean {
    return this.election.getIsLeader();
  }

  isHaWsFollower(): boolean {
    return this.election.getMode() === 'follower';
  }

  getStatus() {
    return this.election.getStatus();
  }
}
