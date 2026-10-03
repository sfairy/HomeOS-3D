/**
 * 所属模块：backend/shared/ha
 * 职责：
 *  - 状态管线热端口接口与 DI token；
 * 关键依赖：
 *  - nano-messages port 模式；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import type { HaEntity, HaStateChangeEvent } from '../types';

/** L1 状态存储热路径端口 DI token */
export const HA_STATE_STORE_HOT_PORT = Symbol('HA_STATE_STORE_HOT_PORT');
/** WS 推送热路径端口 DI token */
export const HA_WS_PUSH_HOT_PORT = Symbol('HA_WS_PUSH_HOT_PORT');
/** 实体 area 信息补全热路径端口 DI token */
export const HA_STATE_AREA_ENRICH_PORT = Symbol('HA_STATE_AREA_ENRICH_PORT');

/** L1 状态存储热端口：按 entityId 读取与热写入 */
export interface HaStateStoreHotPort {
  getById(entityId: string): HaEntity | undefined;
  /** @returns false 表示未写入 L1（过滤/乱序），调用方勿再 WS 扇出 */
  applyStateChangedHot(event: HaStateChangeEvent): boolean;
}

/**
 * HaWsPushHotPort：业务接口定义。
 * - 表示：shared/ha/state-pipeline.ports.ts 域内的数据结构或依赖注入契约；
 * - 关键字段：见接口属性行内注释；必选/可选由 ? 修饰符表达
 */
export interface HaWsPushHotPort {
  applyStateChangedHotBatch(events: HaStateChangeEvent[]): void;
}

/**
 * HaStateAreaEnrichPort：业务接口定义。
 * - 表示：shared/ha/state-pipeline.ports.ts 域内的数据结构或依赖注入契约；
 * - 关键字段：见接口属性行内注释；必选/可选由 ? 修饰符表达
 */
export interface HaStateAreaEnrichPort {
  enrichStateChangeEventSync(event: HaStateChangeEvent): HaStateChangeEvent;
}
