/**
 * @file state-change-router.service.ts
 * @module shared/ha
 *
 * HA 状态变更路由服务：为各业务消费者提供轻量级"是否需要处理该事件"的判定，
 * 避免所有消费者都订阅全量 ha.state_changed 事件造成扇出放大。
 *
 * 核心路径（state-store / ws-push / event-log / security）仍接收全量事件，
 * 不经过本路由；本路由仅服务于 Cold Path 上的副作用消费者（自动化 / 告警 / 业务统计等）。
 *
 * 设计说明：
 *  - 判定逻辑收敛为 ColdPathConsumer 端口 + ColdPathConsumerRegistry 注册表
 *    （见 ./cold-path-consumer.ts）：本服务在构造时把 9 个内置分支注册为带优先级的
 *    消费者条目，shouldProcess 委托注册表执行；
 *  - 对外保留 shouldProcess(consumer, event) 门面 API，既有调用方无需改动；
 *  - 新增消费者只需实现端口并 register，不再修改本服务。
 *
 * 关键依赖：
 *  - ./cold-path-consumer.ts：ColdPathConsumer 端口 / ColdPathConsumerRegistry 注册表
 *  - ./watch-index.services：提供基于规则索引的 entity 预过滤
 *  - ./ha-state-change-filter.util：提供基于 domain / 状态的健康度判定
 *  - ../types：HaStateChangeEvent 类型
 */
import { Injectable } from '@nestjs/common';
import type { HaStateChangeEvent } from '../types';
import {
  type ColdPathConsumer,
  type ColdPathConsumerId,
  ColdPathConsumerRegistry,
} from './cold-path-consumer';
import {
  AlertRuleWatchIndexService,
  AutomationWatchIndexService,
} from './watch-index.services';
import {
  getEntityDomain,
  isCameraRelevantStateChange,
  isChildModeMediaEntity,
  isDeviceHealthStateChange,
  isEnergyRelevantStateChange,
  isEnvironmentRelevantStateChange,
  isWaterRelevantStateChange,
} from './state-change-filter.util';

/**
 * 轻量状态变更路由：供各消费者快速判断是否需处理，降低 ha.state_changed 扇出开销。
 * 核心路径（state-store / ws-push / event-log / security）仍接收全量事件。
 *
 * 在 DI 容器中作为单例 Provider 暴露，注入了告警规则索引、自动化规则索引与
 * Cold Path 消费者注册表。构造时注册内置消费者（9 个分支），调用方应在事件
 * 监听器入口处调用 shouldProcess 做早期跳过，避免进入昂贵的业务逻辑。
 */
@Injectable()
export class HaStateChangeRouterService {
  constructor(
    private readonly automationWatchIndex: AutomationWatchIndexService,
    private readonly alertRuleWatchIndex: AlertRuleWatchIndexService,
    private readonly registry: ColdPathConsumerRegistry,
  ) {
    this.registerBuiltInConsumers();
  }

  /** 注册内置 Cold Path 消费者：原 switch 的 9 分支收敛为带优先级的注册表条目 */
  private registerBuiltInConsumers(): void {
    const { automationWatchIndex, alertRuleWatchIndex } = this;
    const consumers: ColdPathConsumer[] = [
      {
        id: 'automation',
        priority: 10,
        // 自动化引擎：依赖规则索引（含通配符与 event 触发器）
        shouldProcess: (event) => automationWatchIndex.shouldProcessEntity(event.entity_id),
      },
      {
        id: 'alert_rules',
        priority: 20,
        // 告警规则索引：仅当规则中显式监听该 entity 或存在全局规则时处理
        shouldProcess: (event) => alertRuleWatchIndex.shouldProcessEntity(event.entity_id),
      },
      {
        id: 'notification_health',
        priority: 30,
        // 通知健康：仅设备离线 / 低电量事件
        shouldProcess: (event) => isDeviceHealthStateChange(event),
      },
      {
        id: 'energy',
        priority: 40,
        // 能源异常：sensor / switch / climate / fan / light
        shouldProcess: (event) => isEnergyRelevantStateChange(event.entity_id),
      },
      {
        id: 'water',
        priority: 50,
        // 用水监测：sensor / binary_sensor
        shouldProcess: (event) => isWaterRelevantStateChange(event.entity_id),
      },
      {
        id: 'environment',
        priority: 60,
        // 环境健康：sensor / climate / binary_sensor
        shouldProcess: (event) => isEnvironmentRelevantStateChange(event.entity_id),
      },
      {
        id: 'child_mode',
        priority: 70,
        // 儿童模式媒体限制：media_player
        shouldProcess: (event) => isChildModeMediaEntity(event.entity_id),
      },
      {
        id: 'camera',
        priority: 80,
        // 摄像头 / Frigate：camera / binary_sensor / sensor.frigate_*
        shouldProcess: (event) => isCameraRelevantStateChange(event.entity_id),
      },
      {
        id: 'smart_advisor_usage',
        priority: 90,
        // 智能助手使用统计：可控设备 domain
        shouldProcess: (event) => {
          const domain = getEntityDomain(event.entity_id);
          return ['light', 'climate', 'media_player', 'switch', 'fan'].includes(domain);
        },
      },
    ];
    for (const consumer of consumers) {
      this.registry.register(consumer);
    }
  }

  /**
   * 判定指定消费者是否需要处理该状态变更事件。
   *
   * @param consumer 消费者标识
   * @param event HA 状态变更事件
   * @returns true 表示消费者应处理该事件；false 表示可安全跳过
   *
   * 实现说明：
   *  - 无 entity_id 的事件无法路由，统一不处理；
   *  - alert_rules / automation：依赖运行期规则索引，规则更新时索引同步刷新；
   *  - notification_health：仅关注设备离线 / 低电量；
   *  - 各业务 domain 过滤：纯函数判定，无状态；
   *  - smart_advisor_usage：智能助手使用统计关心的可控设备 domain；
   *  - 未注册消费者由注册表兜底返回 true：未知消费者不丢事件。
   */
  shouldProcess(consumer: ColdPathConsumerId, event: HaStateChangeEvent): boolean {
    const entityId = event.entity_id;
    // 无 entity_id 的事件无法路由，统一不处理
    if (!entityId) return false;
    return this.registry.shouldProcess(consumer, event);
  }
}
