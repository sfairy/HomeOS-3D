/**
 * 系统备份子模块
 *
 * 职责：装配 AppConfig / 用户 / 完整备份包导出导入、服务器备份包文件管理与
 * 定时自动备份等 5 个服务，并通过 exports 暴露给 SystemModule 与外部消费。
 *
 * 依赖：
 *  - PrismaModule / AppConfigModule / UiConfigModule：持久化、配置、UI 配置
 */
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../shared/prisma/module';
import { AppConfigModule } from '../../../shared/app-config/module';
import { UiConfigModule } from '../../ui-config/module';
import { AppConfigBackupService } from './service';
import { SystemBundleBackupService } from './system-bundle-backup.service';
import { UsersBackupService } from './users-backup.service';
import { ServerBackupService } from './server-backup.service';
import { AutoBackupService } from './auto-backup.service';

/** AppConfig / 完整备份包导出导入 + 服务器备份包文件管理 + 定时自动备份 */
@Module({
  imports: [PrismaModule, AppConfigModule, UiConfigModule],
  providers: [
    AppConfigBackupService,
    UsersBackupService,
    SystemBundleBackupService,
    ServerBackupService,
    AutoBackupService,
  ],
  exports: [
    AppConfigBackupService,
    UsersBackupService,
    SystemBundleBackupService,
    ServerBackupService,
    AutoBackupService,
  ],
})
/**
 * SystemBackupModule：Nest @Module 模块。
 * - 所属域：modules/system/backup/system-backup；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 */
export class SystemBackupModule {}
