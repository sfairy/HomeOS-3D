/**
 * 命令代理模块：前端 REST → Home Assistant 服务调用的封装通道，并持久化审计。
 *
 * 所属模块：modules/command-proxy。
 * 装配清单：
 *  - imports：HaConnectorModule（WS 命令执行）、StateStoreModule（实体参数校验）、PrismaModule（审计落库）、ChildModeModule（儿童锁拦截）、RedisModule（限流与幂等键）；
 *  - providers：CommandProxyService（门面）、CommandProxyAuditService（审计与敏感命令审批）；
 *  - controllers：CommandProxyController（/command-proxy/ 下 POST call-service/batch/execute 端点）；
 *  - exports：CommandProxyService，供脚本执行 / 场景联动 / Agent 工具调用复用。
 */

import { Module } from '@nestjs/common';
import { CommandProxyService } from './service';
import { CommandProxyAuditService } from './audit.service';
import { CommandProxyController } from './controller';
import { HaConnectorModule } from '../ha-connector/module';
import { StateStoreModule } from '../state-store/module';
import { PrismaModule } from '../../shared/prisma/module';
import { ChildModeModule } from '../child-mode/module';
import { RedisModule } from '../../shared/redis/module';

/**
 * 命令代理模块
 * 桥接前端与服务端的 HA 控制指令。
 * 负责接收 REST 请求，转换为 HA WebSocket 命令，
 * 并将执行结果返回给前端。
 *
 * 依赖 HaConnectorModule 提供的 HA 通信通道。
 */
@Module({
  imports: [HaConnectorModule, StateStoreModule, PrismaModule, ChildModeModule, RedisModule],
  providers: [CommandProxyService, CommandProxyAuditService],
  controllers: [CommandProxyController],
  exports: [CommandProxyService],
})
/**
 * CommandProxyModule：Nest @Module 模块。
 * - 所属域：modules/command-proxy/module.ts；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 * @class CommandProxyModule
 */
export class CommandProxyModule {}
