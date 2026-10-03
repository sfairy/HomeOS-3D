/**
 * Home Assistant 连接器全局模块：WebSocket 长连接 + 多副本 Leader 选举 + 命令桥接的三层架构。
 *
 * 所属模块：modules/ha-connector（@Global 标记，ORCHESTRATOR_HA_CONNECTOR_PORT 等 DI Token 无需重复 import）。
 * 装配清单：
 *  - imports：PrismaModule / ConfigModule / RedisModule / HaWsLeaderModule（Leader 选举） / StateStoreModule（实体缓存更新端口）；
 *  - providers：HaConfigService、HaRestClientService、HaStateIngressCoalesceService、HaCommandBridgeService、HaConnectorService（门面）、TtsSpeakService、HaWebrtcSignalService + 两个端口 Token；
 *  - exports：以上服务与端口，供命令代理、安防、能源、编排同步、WS 推送等模块调用。
 * 对外能力：调用 HA 服务、订阅状态变更、下载媒体 / 历史、WebRTC 信令、统一 TTS 播报。
 */

import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HaConnectorService } from './service';
import { HaConfigService } from './ha-config.service';
import { HaRestClientService } from './ha-rest-client.service';
import { HaStateIngressCoalesceService } from '../../shared/ha/state-ingress-coalesce.service';
import { HaCommandBridgeService } from './ha-command-bridge.service';
import { TtsSpeakService } from './tts-speak.service';
import { HaWebrtcSignalService } from './ha-webrtc-signal.service';
import { PrismaModule } from '../../shared/prisma/module';
import { RedisModule } from '../../shared/redis/module';
import { HaWsLeaderModule } from './ha-ws-leader.module';
import { StateStoreModule } from '../state-store/module';
import { ORCHESTRATOR_HA_CONNECTOR_PORT } from '../../shared/orchestrator/ha-connector.port';
import { HA_WS_COMMAND_EXECUTOR } from './ha-ws-command-executor.port';

/**
 * Home Assistant 连接器模块
 *
 * 三层架构：
 * - HaConnectorService  — WebSocket 长连接 + 服务调用门面
 * - HaConfigService      — 动态配置读取（Prisma缓存）
 * - HaRestClientService  — REST API（历史/实体查询/媒体代理）
 *
 * 其他提供者：
 * - HaStateIngressCoalesceService — 状态变更入站合并去重
 * - HaCommandBridgeService — 多副本 Redis 命令桥接
 * - TtsSpeakService — 统一 TTS 播报
 * - HaWebrtcSignalService — 摄像头 WebRTC 信令转发
 *
 * @Global：导出含 ORCHESTRATOR_HA_CONNECTOR_PORT，供 OrchestratorHaSyncModule 等
 * 在不 import 本模块的情况下注入适配器（避免 common → modules 反向依赖）。
 *
 * 依赖：PrismaModule、ConfigModule、RedisModule、HaWsLeaderModule、StateStoreModule。
 */
@Global()
@Module({
  imports: [PrismaModule, ConfigModule, RedisModule, HaWsLeaderModule, StateStoreModule],
  providers: [
    HaConfigService,
    HaRestClientService,
    HaStateIngressCoalesceService,
    HaCommandBridgeService,
    HaConnectorService,
    TtsSpeakService,
    HaWebrtcSignalService,
    { provide: ORCHESTRATOR_HA_CONNECTOR_PORT, useExisting: HaConnectorService },
    { provide: HA_WS_COMMAND_EXECUTOR, useExisting: HaConnectorService },
  ],
  exports: [
    HaConnectorService,
    HaConfigService,
    HaRestClientService,
    TtsSpeakService,
    HaWsLeaderModule,
    HaCommandBridgeService,
    HaWebrtcSignalService,
    ORCHESTRATOR_HA_CONNECTOR_PORT,
    HA_WS_COMMAND_EXECUTOR,
  ],
})
/**
 * HaConnectorModule：Nest @Module 模块。
 * - 所属域：modules/ha-connector/module.ts；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 * @class HaConnectorModule
 */
export class HaConnectorModule {}
