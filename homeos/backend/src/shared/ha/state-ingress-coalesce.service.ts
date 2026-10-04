/**
 * @file state-ingress-coalesce.service.ts
 * @module shared/ha
 *
 * HA WebSocket 入口微窗口合并服务：
 * 仅对 sensor / binary_sensor 等同 entity 连续变更做短窗口（默认 12ms）合并，
 * 关键控制域（light / switch / lock 等）直接 bypass，避免合并带来的控制延迟。
 * 合并时保留首包 old_state + 末包 new_state，供电表差分等消费方不错计增量。
 *
 * 合并后的事件以 STATE_CHANGED_BATCH 批量事件发出，降低 Hot Path / Redis 桥接 / WS 扇出频率。
 *
 * 关键依赖：
 *  - ../redis/event-bus.service：将合并后事件桥接到 Redis 与本地 EventEmitter
 *  - ../app-config/service：读取 haConnector / wsPush 配置
 *  - ../types：HA_EVENTS 事件名与 HaStateChangeEvent / HaStateChangeBatchEvent 类型
 *  - @homeos/shared：DEFAULT_CRITICAL_DOMAINS 关键域默认值
 *
 * 实现 OnModuleDestroy 以保证模块卸载时刷新残留事件，避免丢失。
 */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventBusService } from '../redis/event-bus.service';
import { AppConfigService } from '../app-config/service';
import { HA_EVENTS } from '../types';
import type { HaStateChangeEvent, HaStateChangeBatchEvent } from '../types';
import { WS_PUSH_CRITICAL_DOMAINS, getEntityDomain } from '@homeos/shared';
import { recordHaSyncLatency } from '../../common/observability/ha-sync-latency.util';
import { HaEntitySyncFilterService } from './entity-sync-filter.service';

/**
 * HA WebSocket 入口微窗口合并：仅合并 sensor/binary_sensor 等同 entity 连续变更，
 * 关键控制域 bypass，降低 Hot Path / Redis 桥接 / WS 扇出频率。
 *
 * 在 DI 容器中作为单例 Provider 暴露，注入 EventBusService 与 AppConfigService。
 * 由 HA WebSocket 入口（ha-websocket.gateway 等）在收到 state_changed 时调用 enqueue。
 */
@Injectable()
export class HaStateIngressCoalesceService implements OnModuleDestroy {
  private readonly logger = new Logger(HaStateIngressCoalesceService.name);
  // 待合并事件：按 entity_id 去重，新事件覆盖旧事件（只保留最新 state）
  private pending = new Map<string, { event: HaStateChangeEvent; enqueuedAt: number }>();
  // 合并窗口定时器；为 null 表示当前无待刷新事件
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly eventBus: EventBusService,
    private readonly appConfig: AppConfigService,
    private readonly entitySyncFilter: HaEntitySyncFilterService,
  ) {}

  /**
   * 模块销毁钩子：清理定时器并立即刷新剩余事件，保证不丢数据。
   */
  onModuleDestroy() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushAll();
  }

  // 配置访问器：每次读取最新的 haConnector 配置，支持运行期热更新
  private get cfg() {
    return this.appConfig.get('haConnector');
  }

  /**
   * 判定 entity 是否属于允许合并的域。
   * 配置缺失时回退到默认 ['sensor', 'binary_sensor']，这些域状态变化频繁但实时性要求低。
   */
  private isCoalesceDomain(entityId: string): boolean {
    const domains = this.cfg.ingressCoalesceDomains;
    const list =
      Array.isArray(domains) && domains.length > 0 ? domains : ['sensor', 'binary_sensor'];
    return list.includes(getEntityDomain(entityId));
  }

  /**
   * 判定 entity 是否属于关键控制域（必须立即下发，不能合并）。
   * 配置缺失时回退到 WS_PUSH_CRITICAL_DOMAINS（含 lock）。
   */
  private isCriticalDomain(entityId: string): boolean {
    const critical = this.appConfig.get('wsPush').criticalDomains;
    const list: readonly string[] =
      Array.isArray(critical) && critical.length > 0 ? critical : [...WS_PUSH_CRITICAL_DOMAINS];
    return list.includes(getEntityDomain(entityId));
  }

  /**
   * 状态变更事件入队入口（由 HA WebSocket gateway 调用）。
   *
   * @param event HA 状态变更事件
   *
   * 处理流程：
   *  1. 功能未启用 或 entity 不在合并域 → 直接立即下发
   *  2. entity 属于关键控制域 → 直接立即下发（保证控制延迟）
   *  3. 否则：覆盖式入队（同 entity 仅保留最新），并启动 / 复用合并窗口
   */
  enqueue(event: HaStateChangeEvent): void {
    // 注册表就绪后丢弃禁用/隐藏，避免合并窗口与 Hot Path 空转
    if (event.new_state && !this.entitySyncFilter.isEntitySyncable(event.entity_id)) {
      return;
    }
    if (!this.cfg.ingressCoalesceEnabled || !this.isCoalesceDomain(event.entity_id)) {
      this.emitImmediate(event);
      return;
    }
    if (this.isCriticalDomain(event.entity_id)) {
      this.emitImmediate(event);
      return;
    }
    // 合并窗口内保留「首包 old_state + 末包 new_state」，避免电表等差分计量丢中间跳变
    const prev = this.pending.get(event.entity_id);
    if (prev) {
      this.pending.set(event.entity_id, {
        enqueuedAt: prev.enqueuedAt,
        event: {
          ...event,
          old_state: prev.event.old_state ?? event.old_state,
          pipeline_ts: prev.event.pipeline_ts ?? event.pipeline_ts,
        },
      });
    } else {
      this.pending.set(event.entity_id, { event, enqueuedAt: Date.now() });
    }
    this.scheduleFlush();
  }

  /**
   * 安排一次合并窗口刷新。
   * 若已有定时器则复用，避免每个事件都重启定时器导致合并窗口无法收敛。
   */
  private scheduleFlush() {
    if (this.flushTimer) return;
    const ms = this.cfg.ingressCoalesceWindowMs ?? 16;
    if (ms <= 0) {
      this.flushAll();
      return;
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushAll();
    }, ms);
  }

  /**
   * 刷新所有待合并事件：以 STATE_CHANGED_BATCH 批量事件发出。
   *
   * Hot Path 关键节点：批量事件由 HaStatePipelineService 处理，
   * 走 L1 状态存储 + WS 推送 + Cold Path 异步 fan-out。
   */
  private flushAll() {
    if (this.pending.size === 0) return;
    const now = Date.now();
    const entries = Array.from(this.pending.values());
    this.pending.clear();
    for (const { enqueuedAt } of entries) {
      recordHaSyncLatency('ingress_coalesce_dwell', Math.max(0, now - enqueuedAt));
    }
    const batch = entries.map((e) => e.event);
    const t0 = Date.now();
    this.eventBus.emit(HA_EVENTS.STATE_CHANGED_BATCH, {
      changes: batch,
    } satisfies HaStateChangeBatchEvent);
    recordHaSyncLatency('ingress_flush', Date.now() - t0);
  }

  /**
   * 立即下发单条事件（未走合并路径）。
   * 用于关键控制域或合并功能未启用的情况。
   */
  private emitImmediate(event: HaStateChangeEvent) {
    recordHaSyncLatency('ingress_coalesce_dwell', 0);
    const t0 = Date.now();
    this.eventBus.emit(HA_EVENTS.STATE_CHANGED_BATCH, {
      changes: [event],
    } satisfies HaStateChangeBatchEvent);
    recordHaSyncLatency('ingress_flush', Date.now() - t0);
  }
}