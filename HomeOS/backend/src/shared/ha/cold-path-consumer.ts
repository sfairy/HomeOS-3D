/**
 * @file cold-path-consumer.ts
 * @module shared/ha
 *
 * Cold Path 消费者端口 / 注册表模型。
 *
 * 背景：
 *  - Hot Path（state-store / ws-push / event-log / security）接收全量状态变更事件，不经路由；
 *  - Cold Path（自动化 / 告警 / 业务统计等副作用消费者）经 HaStateChangeRouterService
 *    在事件监听入口做早期跳过，避免每条事件都进入昂贵业务逻辑。
 *
 * 本模块将「消费者 + 优先级 + 判定」收敛为端口（ColdPathConsumer）与注册表
 * （ColdPathConsumerRegistry）：
 *  - 新增消费者只需实现端口并 register，无需修改 router 的 switch 分支；
 *  - 注册表按优先级升序枚举全部消费者，router 仅保留门面 API 兼容既有调用方；
 *  - 未注册的消费者 id 保守兜底不丢事件（与既有 default 分支语义一致）。
 */
import { Injectable } from '@nestjs/common';
import type { HaStateChangeEvent } from '../types';

/**
 * Cold Path 消费者标识。
 * 每个值对应一类业务模块，注册表据此索引对应的预过滤判定。
 * 与既有 HaStateChangeRouterService.shouldProcess 的调用方字符串保持一致。
 */
export type ColdPathConsumerId =
  | 'automation'
  | 'alert_rules'
  | 'notification_health'
  | 'energy'
  | 'water'
  | 'environment'
  | 'child_mode'
  | 'camera'
  | 'smart_advisor_usage';

/**
 * Cold Path 消费者端口。
 * 实现方只需提供：id（注册表键）、priority（枚举顺序）、shouldProcess（预过滤判定）。
 */
export interface ColdPathConsumer {
  /** 消费者标识（注册表键，需全局唯一） */
  readonly id: ColdPathConsumerId;
  /** 优先级：数字越小越靠前，决定注册表枚举顺序（为未来按序批量派发预留） */
  readonly priority: number;
  /** 判定该消费者是否需要处理该状态变更事件 */
  shouldProcess(event: HaStateChangeEvent): boolean;
}

/**
 * Cold Path 消费者注册表（单例 Provider）。
 * 可注册 / 注销 / 枚举消费者；shouldProcess 委托给注册项，未知 id 保守返回 true 不丢事件。
 */
@Injectable()
export class ColdPathConsumerRegistry {
  private readonly consumers = new Map<ColdPathConsumerId, ColdPathConsumer>();

  /** 注册消费者；同 id 重复注册时后注册覆盖先注册（便于运行期热替换判定） */
  register(consumer: ColdPathConsumer): void {
    this.consumers.set(consumer.id, consumer);
  }

  /** 注销消费者 */
  unregister(id: ColdPathConsumerId): void {
    this.consumers.delete(id);
  }

  /** 是否已注册该消费者 */
  has(id: ColdPathConsumerId): boolean {
    return this.consumers.has(id);
  }

  /** 获取消费者（未注册返回 undefined） */
  get(id: ColdPathConsumerId): ColdPathConsumer | undefined {
    return this.consumers.get(id);
  }

  /** 按优先级升序枚举全部消费者（运维监控 / 调试 / 未来批量派发） */
  list(): ColdPathConsumer[] {
    return [...this.consumers.values()].sort((a, b) => a.priority - b.priority);
  }

  /** 判定消费者是否需要处理该事件；未知消费者保守返回 true 不丢事件 */
  shouldProcess(id: ColdPathConsumerId, event: HaStateChangeEvent): boolean {
    const consumer = this.consumers.get(id);
    return consumer ? consumer.shouldProcess(event) : true;
  }
}
