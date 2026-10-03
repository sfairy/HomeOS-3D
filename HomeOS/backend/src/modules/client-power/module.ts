/**
 * 客户端系统信息与充电器开关滞回联动 模块。
 *
 * 职责：
 *  - 装配 ClientPowerService 与 ClientPowerController，提供客户端系统信息上报、状态查询与待配对管理能力。
 *  - 通过 exports 暴露 ClientPowerService 供其他模块（如通知、规则引擎）消费客户端电量状态。
 *
 * 依赖：
 *  - PrismaModule：持久化运行时状态与待配对记录。
 *  - HaConnectorModule：执行开关滞回联动（callService）。
 *  - NotificationModule：联动失败时的告警冷却。
 */
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/module';
import { HaConnectorModule } from '../ha-connector/module';
import { NotificationModule } from '../notification/module';
import { ClientPowerService } from './service';
import { ClientPowerController } from './controller';

/** 客户端系统信息与充电器开关滞回联动（DI 角色：模块聚合根） */
@Module({
  imports: [PrismaModule, HaConnectorModule, NotificationModule],
  controllers: [ClientPowerController],
  providers: [ClientPowerService],
  exports: [ClientPowerService],
})
/**
 * ClientPowerModule：Nest @Module 模块。
 * - 所属域：modules/client-power/module.ts；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 * @class ClientPowerModule
 */
export class ClientPowerModule {}