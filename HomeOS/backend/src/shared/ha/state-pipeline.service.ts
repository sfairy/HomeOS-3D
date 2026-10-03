/**
 * @file ha-state-pipeline.service.ts
 * @module shared/ha
 *
 * HA 状态变更 Hot/Cold 管道服务：
 *  - Hot Path：同步完成 L1 状态存储更新 + WS 推送，保证用户端低延迟感知
 *  - Cold Path：小批次窗口聚合异步 fan-out 到副作用消费者（自动化 / 告警 / 业务统计）
 */
import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OnEvent } from '@nestjs/event-emitter';
import { HA_EVENTS } from '../types';
import type { HaStateChangeEvent, HaStateChangeBatchEvent } from '../types';
import { getErrorMessage } from '../../common/utils';
import { enrichSlimStateChangeEvent } from '../redis/event-bus-bridge.util';
import { AppConfigService } from '../app-config/service';
import { recordHaSyncLatency } from '../../common/observability/ha-sync-latency.util';
import { HaEntitySyncFilterService } from './entity-sync-filter.service';
import {
  HA_STATE_AREA_ENRICH_PORT,
  HA_STATE_STORE_HOT_PORT,
  HA_WS_PUSH_HOT_PORT,
  type HaStateAreaEnrichPort,
  type HaStateStoreHotPort,
  type HaWsPushHotPort,
} from './state-pipeline.ports';

/** HA 状态变更 Hot/Cold 管道服务：Hot Path 同步写 L1 + WS 推送，Cold Path 聚合异步 fan-out */
@Injectable()
export class HaStatePipelineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HaStatePipelineService.name);

  /** 冷路径待派发事件缓冲（FIFO） */
  private coldPending: HaStateChangeEvent[] = [];
  private coldFlushTimer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(HA_STATE_STORE_HOT_PORT)
    private readonly stateStore: HaStateStoreHotPort,
    @Inject(HA_STATE_AREA_ENRICH_PORT)
    private readonly entityAreaEnrichment: HaStateAreaEnrichPort,
    @Inject(HA_WS_PUSH_HOT_PORT)
    private readonly wsPush: HaWsPushHotPort,
    private readonly eventEmitter: EventEmitter2,
    private readonly appConfig: AppConfigService,
    private readonly entitySyncFilter: HaEntitySyncFilterService,
  ) {}

  private get coldWindowMs(): number {
    return this.appConfig.get('haConnector').coldBatchWindowMs ?? 15;
  }

  private get coldBatchMax(): number {
    return this.appConfig.get('haConnector').coldBatchMax ?? 256;
  }

  onModuleInit() {
    this.logger.debug('热/冷管道已启用(冷路径以 COLD_BATCH 一次扇出)');
  }

  onModuleDestroy() {
    this.flushColdPathEvents();
  }

  @OnEvent(HA_EVENTS.STATE_CHANGED)
  handleStateChanged(event: HaStateChangeEvent) {
    this.processHotPathEvents([event]);
  }

  @OnEvent(HA_EVENTS.STATE_CHANGED_BATCH)
  handleStateChangedBatch(payload: HaStateChangeBatchEvent) {
    const changes = payload?.changes ?? [];
    if (!changes.length) return;
    this.processHotPathEvents(changes);
  }

  private processHotPathEvents(events: HaStateChangeEvent[]) {
    const t0 = Date.now();
    const appliedList: HaStateChangeEvent[] = [];
    for (const event of events) {
      // 注册表已加载时尽早丢弃禁用/隐藏，避免 enrich + WS 空转
      if (event.new_state && !this.entitySyncFilter.isEntitySyncable(event.entity_id)) {
        continue;
      }
      const enriched = enrichSlimStateChangeEvent(event, (id) => this.stateStore.getById(id));
      const withArea = this.entityAreaEnrichment.enrichStateChangeEventSync(enriched);
      if (!this.stateStore.applyStateChangedHot(withArea)) continue;
      appliedList.push(withArea);
    }

    if (appliedList.length) {
      this.wsPush.applyStateChangedHotBatch(appliedList);
    }
    recordHaSyncLatency('hot_apply', Date.now() - t0);

    this.queueColdPathEvents(appliedList);
  }

  private queueColdPathEvents(events: HaStateChangeEvent[]) {
    if (events.length === 0) return;
    this.coldPending.push(...events);
    if (this.coldPending.length >= this.coldBatchMax) {
      this.flushColdPathEvents();
      return;
    }
    if (!this.coldFlushTimer) {
      const ms = this.coldWindowMs;
      if (ms <= 0) {
        this.flushColdPathEvents();
        return;
      }
      this.coldFlushTimer = setTimeout(() => this.flushColdPathEvents(), ms);
    }
  }

  private flushColdPathEvents() {
    if (this.coldFlushTimer) {
      clearTimeout(this.coldFlushTimer);
      this.coldFlushTimer = null;
    }
    const batch = this.coldPending;
    this.coldPending = [];
    if (batch.length === 0) return;
    try {
      this.eventEmitter.emit(HA_EVENTS.STATE_CHANGED_COLD_BATCH, {
        changes: batch,
      } satisfies HaStateChangeBatchEvent);
    } catch (err: unknown) {
      this.logger.error(`冷路径批事件派发失败:${getErrorMessage(err)}`);
    }
  }
}
