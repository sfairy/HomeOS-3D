/**
 * 系统总模块
 *
 * 职责：聚合 backup / device / setup / access / embed-proxy / ops / lifestyle 等系统域子模块与
 * 控制器，提供配置管理、备份还原、设备管理、首装向导、访客访问、内嵌页代理、外部 API、
 * 影音场景与日程提醒等能力。能源 / 环境已提升为顶层模块；儿童模式与联动健康因 Access /
 * 诊断 HTTP 仍由本模块导入。
 *
 * 依赖：
 *  - HttpModule / ConfigModule：HTTP 客户端与配置
 *  - PrismaModule / RedisModule：持久化与缓存
 *  - UiConfigModule / HaConnectorModule / CommandProxyModule / StateStoreModule / WsPushModule：UI 配置、HA、命令代理、状态、WS 推送
 *  - ChildModeModule / LinkageHealthModule：儿童模式门禁与联动健康诊断
 *  - SystemBackupModule / SystemSetupModule：备份与首装向导
 *  - forwardRef(() => AwarenessModule)：避免与感知域循环依赖
 *  - SystemLifestyleModule / SystemOpsModule / SystemDeviceModule / SystemGuestAccessModule：生活方式、运维、设备、访客
 */
import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../shared/prisma/module';
import { RedisModule } from '../../shared/redis/module';
import { EmbedProxyController } from './embed-proxy.controller';
import { EmbedProxyService } from './embed-proxy.service';
import { SystemController } from './controller';
import { SystemSetupController } from './setup/system-setup.controller';
import { SystemBackupController } from './backup/system-backup.controller';
import { SystemConfigController } from './config.controller';
import { SystemAccessController } from './access.controller';
import { SystemLifestyleController } from './lifestyle/system-lifestyle.controller';
import { SystemOpsController } from './ops/system-ops.controller';
import { SystemService } from './service';
import { MoviePilotProxyService } from './ops/system-moviepilot-proxy.service';
import { SystemLifestyleModule } from './lifestyle/system-lifestyle.module';
import { SystemOpsModule } from './ops/system-ops.module';
import { SystemDeviceModule } from './device/system-device.module';
import { ChildModeModule } from '../child-mode/module';
import { UiConfigModule } from '../ui-config/module';
import { HaConnectorModule } from '../ha-connector/module';
import { CommandProxyModule } from '../command-proxy/module';
import { StateStoreModule } from '../state-store/module';
import { WsPushModule } from '../ws-push/module';
import { SystemBackupModule } from './backup/system-backup.module';
import { LinkageHealthModule } from '../linkage-health/module';
import { SystemSetupModule } from './setup/system-setup.module';
import { AwarenessModule } from '../awareness/module';
import { SystemGuestAccessModule } from './lifestyle/system-guest-access.module';

/**
 * 聚合壳：配置/备份/运维 HTTP 与设备管理。
 * 能源 / 环境在 AppModule 顶层注册；儿童模式与联动健康因 Access/诊断 HTTP 仍由本模块导入。
 */
@Module({
  imports: [
    HttpModule,
    ConfigModule,
    PrismaModule,
    RedisModule,
    UiConfigModule,
    HaConnectorModule,
    CommandProxyModule,
    StateStoreModule,
    WsPushModule,
    ChildModeModule,
    SystemBackupModule,
    LinkageHealthModule,
    SystemSetupModule,
    forwardRef(() => AwarenessModule),
    SystemLifestyleModule,
    SystemOpsModule,
    SystemDeviceModule,
    SystemGuestAccessModule,
  ],
  controllers: [
    SystemConfigController,
    SystemAccessController,
    SystemLifestyleController,
    SystemOpsController,
    SystemSetupController,
    SystemBackupController,
    SystemController,
    EmbedProxyController,
  ],
  providers: [
    SystemService,
    MoviePilotProxyService,
    EmbedProxyService,
  ],
  exports: [
    SystemService,
    MoviePilotProxyService,
    EmbedProxyService,
    SystemGuestAccessModule,
    SystemLifestyleModule,
    SystemOpsModule,
    SystemDeviceModule,
    LinkageHealthModule,
    SystemSetupModule,
    SystemBackupModule,
  ],
})
/**
 * SystemModule：Nest @Module 模块。
 * - 所属域：modules/system/module.ts；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 * @class SystemModule
 */
export class SystemModule {}
