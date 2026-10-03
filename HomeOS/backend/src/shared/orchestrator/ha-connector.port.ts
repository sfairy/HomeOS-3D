/**
 * 所属模块：backend/shared/orchestrator
 * 职责：
 *  - HA 连接器抽象端口+DI token；
 * 关键依赖：
 *  - @nestjs/core InjectionToken；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import type { HaEntity } from '../types';

/** Orchestrator 与 HA 连接器的 DI 注入 token */
export const ORCHESTRATOR_HA_CONNECTOR_PORT = Symbol('ORCHESTRATOR_HA_CONNECTOR_PORT');

/** Orchestrator 对 HA 连接器的抽象接口：状态查询、实体同步、场景配置读写与 REST 服务调用 */
export interface OrchestratorHaConnectorPort {
  getStatus(): { connected: boolean };
  fetchEntitiesByDomain(domain: string): Promise<HaEntity[]>;
  resolveConfigIdForDelete(
    component: 'automation' | 'script' | 'scene',
    configId: string,
    entityId?: string,
  ): Promise<string>;
  /** 场景 entities 同步：写入 HA scene 配置 */
  upsertSceneConfig(id: string, body: Record<string, unknown>): Promise<unknown>;
  /** 场景 entities 同步：读取 HA scene 配置 */
  fetchSceneConfig(id: string): Promise<unknown>;
  /** 场景 entities 同步：删除 HA scene 配置 */
  deleteSceneConfig(id: string): Promise<unknown>;
  /** HA REST call_service（如 scene.reload） */
  callServiceViaRest(
    domain: string,
    service: string,
    entityId?: string,
    data?: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<unknown>;
}
