/**
 * Prisma 全局模块：装配 PrismaService 及三类依赖 Prisma 的后台保留服务。
 *
 * 所属模块：shared/prisma（被 AppModule 导入一次，随后 @Global 让业务模块无需重复 import）。
 * 装配清单：
 *  - providers：PrismaService、DatabaseRetentionService、PartitionMaintenanceService、NotificationCooldownService；
 *  - exports：同上四者，全局可注入，供各业务模块直接访问 Prisma 客户端与数据治理能力。
 * 关键依赖：./service（PrismaService 单例）、common/database/*、common/alert-support/*。
 */

import { Global, Module } from '@nestjs/common';
import { DatabaseRetentionService } from '../../common/database/retention.service';
import { PartitionMaintenanceService } from '../../common/database/partition-maintenance.service';
import { NotificationCooldownService } from '../../common/alert-support/notification-cooldown.service';
import { PrismaService } from './service';

/**
 * @file module.ts
 * @module shared/prisma
 * @description
 * Prisma 全局模块（NestJS DI 容器入口）。
 *
 * 被 @Global() 装饰器标记为全局模块，即被 AppModule 导入一次后，
 * PrismaService 即可在任意模块中直接注入使用，无需重复导入。
 *
 * 同时注册了三个依赖 Prisma 的全局服务：
 *  - DatabaseRetentionService：数据库保留策略（定期清理历史数据）；
 *  - PartitionMaintenanceService：大表按月分区维护（EventLog 建分区 / 过期整月分区 DROP）；
 *  - NotificationCooldownService：通知冷却（避免重复告警轰炸）。
 *
 * 关键依赖：PrismaService、DatabaseRetentionService、PartitionMaintenanceService、NotificationCooldownService。
 */
@Global()
@Module({
  providers: [
    PrismaService,
    DatabaseRetentionService,
    PartitionMaintenanceService,
    NotificationCooldownService,
  ],
  exports: [
    PrismaService,
    DatabaseRetentionService,
    PartitionMaintenanceService,
    NotificationCooldownService,
  ],
})
/**
 * PrismaModule：Nest @Module 模块。
 * - 所属域：shared/prisma/module.ts；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 * @class PrismaModule
 */
export class PrismaModule {}