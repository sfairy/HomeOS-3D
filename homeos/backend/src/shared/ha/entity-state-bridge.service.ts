/**
 * @file backend/src/shared/ha/entity-state-bridge.service.ts
 * @module backend/src/shared/ha
 */
/**
 * HA 实体状态桥接服务模块
 *
 * 职责：
 * - 提供 HA 实体状态变更事件总线（HaStateEventBus），解耦 HaConnector 与 StateStore 的直接依赖
 * - 定义初始状态快照与注册表查询的端口接口（HaInitialStatesPort / HaRegistryQueryPort）
 * - 提供协调器服务（HaInitialStatesCoordinatorService / HaRegistryQueryService），实现端口的注册与代理
 *
 * 依赖：
 * - @nestjs/common: Injectable, Logger
 * - @nestjs/event-emitter: EventEmitter2
 * - ../types: HA_EVENTS, HaEntity, HaStateChangeEvent
 * - ./ha-entity-registry.util: HaEntityRegistryEntry
 */
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { HA_EVENTS } from '../types';
import type { HaEntity, HaStateChangeEvent } from '../types';
import type { HaEntityRegistryEntry } from './entity-registry.util';

/**
 * HA 实体状态变更事件总线
 * 
 * 用于解耦 HaConnector 与 StateStore 的直接写入依赖，通过事件机制传递状态变更消息
 */
@Injectable()
export class HaStateEventBus {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  /**
   * 发布单个状态变更事件
   * 
   * @param event 状态变更事件对象
   */
  publishStateChanged(event: HaStateChangeEvent): void {
    this.eventEmitter.emit(HA_EVENTS.STATE_CHANGED, event);
  }

  /**
   * 批量发布状态变更事件
   * 
   * @param changes 状态变更事件数组，为空时直接返回
   */
  publishStateChangedBatch(changes: HaStateChangeEvent[]): void {
    if (!changes.length) return;
    this.eventEmitter.emit(HA_EVENTS.STATE_CHANGED_BATCH, { changes });
  }
}

/**
 * HA 初始全量状态快照与补同步端口接口
 * 
 * 由 HaConnector 在启动时注册实现，提供初始状态获取、快照管理、重同步等能力
 */
interface HaInitialStatesPort {
  /** 获取上次缓存的初始状态快照 */
  getLastInitialStates(): HaEntity[] | null;
  /** 清除初始状态快照 */
  clearInitialStatesSnapshot(): void;
  /** 检查是否存在初始状态快照 */
  hasInitialStatesSnapshot(): boolean;
  /**
   * 等待初始状态就绪
   * 
   * @param timeoutMs 超时时间（毫秒），默认 120000ms
   * @returns Promise，resolve 为 true 表示就绪，false 表示超时或端口未注册
   */
  waitUntilInitialStatesReady(timeoutMs?: number): Promise<boolean>;
  /**
   * 请求状态重同步
   * 
   * @param timeoutMs 超时时间（毫秒），默认 120000ms
   * @returns Promise，resolve 为重同步的实体数量
   */
  requestStateResync(timeoutMs?: number): Promise<number>;
  /** 获取实体注册表 */
  fetchEntityRegistry(): Promise<HaEntityRegistryEntry[]>;
}

/**
 * HA 区域/设备/实体注册表查询与写操作端口接口
 * 
 * 由 HaConnector 在启动时注册实现，提供注册表查询、缓存失效、实体区域更新等能力
 */
interface HaRegistryQueryPort {
  /** 获取实体注册表 */
  fetchEntityRegistry(): Promise<HaEntityRegistryEntry[]>;
  /** 获取区域注册表 */
  fetchAreaRegistry(): Promise<Array<{ area_id: string; name: string }>>;
  /** 获取设备注册表 */
  fetchDeviceRegistry(): Promise<Array<{ device_id: string; area_id: string }>>;
  /** 使实体注册表缓存失效 */
  invalidateEntityRegistryCache(): void;
  /** 检查注册表是否处于降级状态 */
  isRegistryDegraded(): boolean;
  /** 获取注册表降级原因 */
  getRegistryDegradedReason(): string | null;
  /**
   * 更新实体所属区域
   * 
   * @param entityId 实体 ID
   * @param areaId 目标区域 ID
   */
  updateEntityArea(entityId: string, areaId: string): Promise<void>;
  /**
   * 获取指定实体的当前状态
   * 
   * @param entityId 实体 ID
   * @returns Promise，resolve 为实体对象或 null
   */
  fetchEntityState(entityId: string): Promise<HaEntity | null>;
}

/**
 * HA 初始状态协调器服务
 * 
 * 实现 HaInitialStatesPort 接口，作为端口的代理层，支持延迟注册
 */
@Injectable()
export class HaInitialStatesCoordinatorService implements HaInitialStatesPort {
  private readonly logger = new Logger(HaInitialStatesCoordinatorService.name);
  private port: HaInitialStatesPort | null = null;

  /**
   * 注册实际的端口实现
   * 
   * @param port HaInitialStatesPort 实现实例
   */
  registerPort(port: HaInitialStatesPort): void {
    this.port = port;
  }

  getLastInitialStates(): HaEntity[] | null {
    return this.port?.getLastInitialStates() ?? null;
  }

  clearInitialStatesSnapshot(): void {
    this.port?.clearInitialStatesSnapshot();
  }

  hasInitialStatesSnapshot(): boolean {
    return this.port?.hasInitialStatesSnapshot() ?? false;
  }

  waitUntilInitialStatesReady(timeoutMs = 120_000): Promise<boolean> {
    if (!this.port) {
      this.logger.debug('初始状态端口尚未注册,跳过等待 initial_states');
      return Promise.resolve(false);
    }
    return this.port.waitUntilInitialStatesReady(timeoutMs);
  }

  requestStateResync(timeoutMs = 120_000): Promise<number> {
    if (!this.port) return Promise.resolve(0);
    return this.port.requestStateResync(timeoutMs);
  }

  fetchEntityRegistry(): Promise<HaEntityRegistryEntry[]> {
    if (!this.port) return Promise.resolve([]);
    return this.port.fetchEntityRegistry();
  }
}

/**
 * HA 注册表查询服务
 * 
 * 实现 HaRegistryQueryPort 接口，作为端口的代理层，支持延迟注册
 */
@Injectable()
export class HaRegistryQueryService implements HaRegistryQueryPort {
  private port: HaRegistryQueryPort | null = null;

  /**
   * 注册实际的端口实现
   * 
   * @param port HaRegistryQueryPort 实现实例
   */
  registerPort(port: HaRegistryQueryPort): void {
    this.port = port;
  }

  fetchEntityRegistry(): Promise<HaEntityRegistryEntry[]> {
    if (!this.port) return Promise.resolve([]);
    return this.port.fetchEntityRegistry();
  }

  fetchAreaRegistry(): Promise<Array<{ area_id: string; name: string }>> {
    if (!this.port) return Promise.resolve([]);
    return this.port.fetchAreaRegistry();
  }

  fetchDeviceRegistry(): Promise<Array<{ device_id: string; area_id: string }>> {
    if (!this.port) return Promise.resolve([]);
    return this.port.fetchDeviceRegistry();
  }

  invalidateEntityRegistryCache(): void {
    this.port?.invalidateEntityRegistryCache();
  }

  isRegistryDegraded(): boolean {
    return this.port?.isRegistryDegraded() ?? false;
  }

  getRegistryDegradedReason(): string | null {
    return this.port?.getRegistryDegradedReason() ?? null;
  }

  updateEntityArea(entityId: string, areaId: string): Promise<void> {
    if (!this.port) return Promise.resolve();
    return this.port.updateEntityArea(entityId, areaId);
  }

  fetchEntityState(entityId: string): Promise<HaEntity | null> {
    if (!this.port) return Promise.resolve(null);
    return this.port.fetchEntityState(entityId);
  }
}