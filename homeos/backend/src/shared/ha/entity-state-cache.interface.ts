/**
 * @module shared/ha
 * @file entity-state-cache.interface.ts
 * @brief HA 实体状态缓存的读写端口接口定义。
 *
 * 职责：
 *  - 以接口形式解耦 HaConnector 与 StateStore 之间的直接依赖；
 *  - 通过 Symbol 注入令牌实现读写职责分离（Reader / Writer）。
 *
 * 关键依赖：
 *  - HaEntity / HaStateChangeEvent：HA 实体与状态变更事件（来自 ../types）；
 *  - InitialStatesSyncPlan：初始状态同步计划（来自 ./entity-state-diff.util）。
 *
 * 使用方式：
 *  - 实现类通过 @Inject(ENTITY_STATE_CACHE_READER/WRITER) 注入到消费方；
 *  - Reader 供只读消费者（如查询 API），Writer 供 HaConnector 在断连补同步等场景写入。
 */
import type { HaEntity, HaStateChangeEvent } from '../types';
import type { InitialStatesSyncPlan } from './entity-state-diff.util';

/** 实体状态缓存只读接口（供 HaConnector 解耦 StateStore 直接依赖） */
export interface EntityStateCacheReader {
  /** 获取全部实体；可按 domain 过滤 */
  getAll(domain?: string): HaEntity[];
  /** 按 entity_id 查询单个实体 */
  getById(entityId: string): HaEntity | undefined;
  /** 获取当前缓存实体总数 */
  getCount(): number;
  /** HA 是否已完成首次全量同步（影响对外查询可用性） */
  isHaSynced(): boolean;
}

/** 实体状态缓存写入接口（REST 断连补同步、bootstrap 等场景） */
export interface EntityStateCacheWriter {
  /**
   * 应用 REST 轮询得到的全量状态。
   * @param entities REST 拉取的实体列表。
   * @returns full 表示是否为全量替换；changes 为本次产生的状态变更事件列表。
   */
  applyRestPollStates(entities: HaEntity[]): { full: boolean; changes: HaStateChangeEvent[] };
  /**
   * 将 HA 初始全量状态写入缓存并生成同步计划。
   * @param entities HA 启动时推送的初始实体列表。
   * @returns InitialStatesSyncPlan 同步计划（供后续 diff 比对使用）。
   */
  syncInitialStatesFromHa(entities: HaEntity[]): InitialStatesSyncPlan;
}

/** 实体状态缓存只读端口注入令牌 */
export const ENTITY_STATE_CACHE_READER = Symbol('ENTITY_STATE_CACHE_READER');

/** 实体状态缓存写入端口注入令牌 */
export const ENTITY_STATE_CACHE_WRITER = Symbol('ENTITY_STATE_CACHE_WRITER');