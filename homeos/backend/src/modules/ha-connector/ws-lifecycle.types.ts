/**
 * HA WebSocket 生命周期共享类型定义。
 *
 * 职责：
 * - 定义 WebSocket 生命周期子模块的依赖注入类型（HaConnectorWsLifecycleDeps）。
 * - 定义生命周期共享可变状态类型（HaConnectorWsLifecycleState），供连接、心跳、重连、bootstrap 等子模块读写。
 * - 提供共享状态的工厂函数，确保初始值一致。
 *
 * 被 ha-connector-ws.helper.ts 中的各生命周期子模块消费。
 */
import type { Logger } from '@nestjs/common';
import type WebSocket from 'ws';
import type { HaEntity } from '../../shared/types';
import type { HaStateIngressCoalesceService } from '../../shared/ha/state-ingress-coalesce.service';
import type { EventBusService } from '../../shared/redis/event-bus.service';
import type {
  EntityStateCacheReader,
  EntityStateCacheWriter,
} from '../../shared/ha/entity-state-cache.interface';
import type { HaConfigService } from './ha-config.service';
import type { HaConnectorCommandQueue } from './command-queue.helper';
import type { HaRestClientService } from './ha-rest-client.service';
import type { HaWsLeaderService } from './ha-ws-leader.service';
import type { HaWsPendingResult } from './types';

/**
 * HA WebSocket 生命周期子模块的依赖集合。
 * 由 HaConnectorService 在构造时组装，传递给 HaConnectorWsLifecycle 及其内部各子模块。
 */
export type HaConnectorWsLifecycleDeps = {
  logger: Logger;
  config: HaConfigService;
  eventBus: EventBusService;
  haLeader: HaWsLeaderService;
  restClient: HaRestClientService;
  entityCacheReader: EntityStateCacheReader;
  entityCacheWriter: EntityStateCacheWriter;
  ingressCoalesce: HaStateIngressCoalesceService;
  commandQueue: HaConnectorCommandQueue;
  getHaCfg: () => {
    reconnectBaseMs: number;
    maxReconnectDelayMs: number;
    disconnectRestPollEnabled: boolean;
    disconnectRestPollIntervalMs: number;
    disconnectRestPollInitialDelayMs: number;
    disconnectRestPollTimeoutMs: number;
    wsPingIntervalMs: number;
    wsPongTimeoutMs: number;
    wsHeartbeatMaxMisses: number;
    leaderTtlMs: number;
    leaderRenewMs: number;
  };
  getIntentionalReconnect: () => boolean;
  invalidateEntityRegistryCache: () => void;
  ensureEntityRegistryLoaded: () => Promise<void>;
  filterSyncableStates: (entities: HaEntity[]) => HaEntity[];
  isEntitySyncable: (entityId: string) => boolean;
  onEntityRegistryUpdated: () => Promise<void>;
  purgeNonSyncableFromCache: () => void;
};

/** HA WS 生命周期共享可变状态（各子模块读写） */
export type HaConnectorWsLifecycleState = {
  ws: WebSocket | null;
  messageId: number;
  connected: boolean;
  authenticated: boolean;
  haVersion: string;
  lastConnectedAt: string;
  destroyed: boolean;
  currentHaUrl: string;
  currentHaToken: string;
  /** 当前这次建连选用的地址来源 */
  activeSource: 'primary' | 'fallback';
  /** 是否已配置外网（局域网失败时不按 ERROR 报） */
  hasFallback: boolean;
  connectInflight: Promise<void> | null;
  pendingResults: Map<number, HaWsPendingResult>;
  eventSubscriptions: Map<number, (event: Record<string, unknown>) => void>;
  initialStatesReady: boolean;
  initialStatesWaiters: Array<() => void>;
  lastInitialStates: HaEntity[] | null;
  capturingBootstrapEvents: boolean;
  bootstrapEventBuffer: import('../../shared/types').HaStateChangeEvent[];
};

/**
 * 创建 HA WebSocket 生命周期共享状态的初始快照。
 * @returns 初始化后的可变状态对象，各字段均为默认值。
 */
export function createHaConnectorWsLifecycleState(): HaConnectorWsLifecycleState {
  return {
    ws: null,
    messageId: 1,
    connected: false,
    authenticated: false,
    haVersion: '',
    lastConnectedAt: '',
    destroyed: false,
    currentHaUrl: '',
    currentHaToken: '',
    activeSource: 'primary',
    hasFallback: false,
    connectInflight: null,
    pendingResults: new Map(),
    eventSubscriptions: new Map(),
    initialStatesReady: false,
    initialStatesWaiters: [],
    lastInitialStates: null,
    capturingBootstrapEvents: false,
    bootstrapEventBuffer: [],
  };
}