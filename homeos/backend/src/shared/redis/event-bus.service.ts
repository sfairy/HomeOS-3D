/**
 * 统一事件总线服务：进程内 NestJS EventEmitter + 可选 Redis Pub/Sub 多副本桥接。
 *
 * 核心职责：
 *  - 单副本场景：纯进程内 emit，Redis 未就绪时零开销回退；
 *  - 多副本场景：对桥接白名单事件异步发布到 Redis，订阅端按 instanceId 忽略自己避免回环；
 *  - 统一暴露 emitAsync / on / removeListener 等门面，调用方无需感知桥接存在。
 * 关键依赖：EventEmitter2、RedisService、event-bus-bridge.util#prepareBridgedPayload。
 */

import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomBytes } from 'crypto';
import { RedisService } from './service';
import { prepareBridgedPayload } from './event-bus-bridge.util';
import { getBridgedEventSet } from '../homeos-events';
import { getErrorMessage } from '../../common/utils';

// Redis Pub/Sub 跨副本桥接频道名：homeos:event-bus，与 EventBusService#instanceId 搭配做去重；
// 前缀 homeos: 避免与业务方自建 Redis 中其他 Pub/Sub 频道名冲突。
const BRIDGE_CHANNEL = 'homeos:event-bus';

@Injectable()
export class EventBusService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(EventBusService.name);
  /** 本实例唯一标识（12 位 hex），用于桥接消息去重（忽略自己发出的） */
  private readonly instanceId = randomBytes(6).toString('hex');
  /** 需要跨副本桥接的事件集合（缓存，避免每事件重建 Set） */
  private readonly bridgedEvents: ReadonlySet<string> = getBridgedEventSet();
  private unsubscribe: (() => void) | null = null;
  private bridgeEnabled = false;

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly redis: RedisService,
  ) {}

  async onApplicationBootstrap() {
    await this.initBridge();
  }

  private async initBridge(): Promise<void> {
    if (!this.redis.isReady()) {
      this.logger.warn('Redis 未就绪，事件总线仅走进程内通信（多副本需配置 REDIS_URL）');
      return;
    }
    try {
      this.unsubscribe = await this.redis.subscribe(BRIDGE_CHANNEL, (msg) => {
        this.onBridgeMessage(msg);
      });
      this.bridgeEnabled = true;
      this.logger.log('事件总线 Redis Pub/Sub 桥接已启用（多副本实时同步）');
    } catch (e) {
      this.logger.warn(`事件总线 Redis 桥接订阅失败: ${getErrorMessage(e)}`);
    }
  }

  private onBridgeMessage(msg: unknown): void {
    if (!msg || typeof msg !== 'object') return;
    const { event, payload, origin } = msg as {
      event?: string;
      payload?: unknown;
      origin?: string;
    };
    if (!event || origin === this.instanceId) return;
    if (process.env.EVENT_TRACE === '1') {
      this.logger.debug(`[事件追踪] bridge recv ${event} from=${origin}`);
    }
    this.eventEmitter.emit(event, payload);
  }

  async onModuleDestroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  /**
   * 发送事件（本进程 EventEmitter，触发 @OnEvent 监听器）。
   * 若为 bridged:true 且 Redis 桥接已启用，则异步发布到 Redis（fire-and-forget，不阻塞热路径）。
   */
  emit(event: string, payload?: unknown): void {
    if (process.env.EVENT_TRACE === '1') {
      this.logger.debug(`[事件追踪] emit ${event} instance=${this.instanceId}`);
    }
    this.eventEmitter.emit(event, payload);
    if (this.bridgeEnabled && this.bridgedEvents.has(event)) {
      void this.publishBridged(event, payload);
    }
  }

  private async publishBridged(event: string, payload: unknown): Promise<void> {
    try {
      await this.redis.publish(BRIDGE_CHANNEL, {
        event,
        payload: prepareBridgedPayload(event, payload),
        origin: this.instanceId,
      });
    } catch (e) {
      this.logger.warn(`事件总线桥接发布失败 ${event}: ${getErrorMessage(e)}`);
    }
  }
}
