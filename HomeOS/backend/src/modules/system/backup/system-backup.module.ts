/**
 * 系统备份子模块
 *
 * 职责：装配联动器 / AppConfig / 用户 / 完整备份包导出导入、服务器备份包文件管理、
 * 定时自动备份与内置模板市场等 7 个服务，并通过 exports 暴露给 SystemModule 与外部消费。
 *
 * 依赖：
 *  - PrismaModule / AppConfigModule / UiConfigModule：持久化、配置、UI 配置
 *  - AutomationModule / SceneModule / ScriptModule：联动器各表服务（模板市场导入需要）
 */
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../shared/prisma/module';
import { AppConfigModule } from '../../../shared/app-config/module';
import { UiConfigModule } from '../../ui-config/module';
import { AutomationModule } from '../../automation/module';
import { SceneModule } from '../../scene/module';
import { ScriptModule } from '../../script/module';
import { OrchestratorBackupService } from './orchestrator-backup.service';
import { AppConfigBackupService } from './service';
import { SystemBundleBackupService } from './system-bundle-backup.service';
import { UsersBackupService } from './users-backup.service';
import { ServerBackupService } from './server-backup.service';
import { AutoBackupService } from './auto-backup.service';
import { SystemTemplateMarketService } from './system-template-market.service';

/** 联动器 / AppConfig / 完整备份包导出导入 + 服务器备份包文件管理 + 定时自动备份 + 内置模板市场 */
@Module({
  imports: [PrismaModule, AppConfigModule, UiConfigModule, AutomationModule, SceneModule, ScriptModule],
  providers: [
    OrchestratorBackupService,
    AppConfigBackupService,
    UsersBackupService,
    SystemBundleBackupService,
    ServerBackupService,
    AutoBackupService,
    SystemTemplateMarketService,
  ],
  exports: [
    OrchestratorBackupService,
    AppConfigBackupService,
    UsersBackupService,
    SystemBundleBackupService,
    ServerBackupService,
    AutoBackupService,
    SystemTemplateMarketService,
  ],
})
/**
 * SystemBackupModule：Nest @Module 模块。
 * - 所属域：modules/system/backup/system-backup；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 * @class SystemBackupModule
 */
export class SystemBackupModule {}
