/**
 * EEW 主节点选举服务。
 *
 * 职责：基于 Redis 实现 EEW 模块的主节点选举，确保多副本部署中仅主节点
 * 维护 WolfX WebSocket 连接，避免重复预警与重复消费。
 *
 * 依赖：RedisService（选举锁存储）、RedisLeaderElection（通用选举实现）。
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../../shared/redis/service';
import { RedisLeaderElection } from '../../shared/redis/leader-election.helper';

/**
 * EEW 主节点选举服务（@Injectable）。
 *
 * 实现 OnModuleInit / OnModuleDestroy 生命周期钩子，在模块初始化时启动选举、
 * 销毁时释放锁。通过 setCallbacks 注册主/从节点切换回调，
 * EarthquakeService 据此连接或断开 WolfX WebSocket。
 */
@Injectable()
export class EewLeaderService implements OnModuleInit, OnModuleDestroy {
  private readonly election: RedisLeaderElection;

  /**
   * @param redis Redis 服务实例，用于选举锁与心跳
   */
  constructor(redis: RedisService) {
    this.election = new RedisLeaderElection({
      redis,
      key: 'homeos:eew-leader',
      label: 'EEW',
      standaloneWarning:
        'Redis 不可用：本实例以 standalone 模式运行 EEW Wolfx 连接。' +
        ' 多副本部署须配置 REDIS_URL，否则会出现重复预警连接。',
      logger: new Logger(EewLeaderService.name),
    });
  }

  /**
   * 注册主/从节点切换回调。
   * @param cb.onLeader 当前实例成为主节点时调用（应连接 WolfX）
   * @param cb.onFollower 当前实例降为从节点时调用（应断开 WolfX）
   */
  setCallbacks(cb: { onLeader?: () => void; onFollower?: () => void }) {
    this.election.setCallbacks(cb);
  }

  /** NestJS 生命周期：模块初始化时启动选举 */
  async onModuleInit() {
    await this.election.onModuleInit();
  }

  /** NestJS 生命周期：模块销毁时释放选举锁 */
  onModuleDestroy() {
    this.election.onModuleDestroy();
  }

  /** @returns 当前实例是否为 EEW 主节点 */
  isEewLeader(): boolean {
    return this.election.getIsLeader();
  }

  /** @returns 选举状态快照（isLeader / mode 等） */
  getStatus() {
    return this.election.getStatus();
  }
}
