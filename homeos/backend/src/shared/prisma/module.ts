/**
 * Prisma 全局模块：装配 PrismaService 及依赖 Prisma 的后台保留服务。
 *
 * 装配清单：
 *  - providers：PrismaService、DatabaseRetentionService、PartitionMaintenanceService、NotificationCooldownService、DistributedLockService；
 *  - exports：同上，全局可注入，供各业务模块直接访问 Prisma 客户端与数据治理 / 互斥能力。
 * 关键依赖：./service（PrismaService 单例）、common/database/*、common/alert-support/*、
 *          common/resilience/*（DistributedLockService，供保留清理与家庭模式 / 安防面板串行化复用）。
 */

import { Global, Module } from '@nestjs/common';
import { DatabaseRetentionService } from '../../common/database/retention.service';
import { PartitionMaintenanceService } from '../../common/database/partition-maintenance.service';
import { NotificationCooldownService } from '../../common/alert-support/notification-cooldown.service';
import { DistributedLockService } from '../../common/resilience/distributed-lock.service';
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
 * 同时注册依赖 Prisma / Redis 的全局服务：
 *  - DatabaseRetentionService：数据库保留策略（定期清理历史数据）；
 *  - PartitionMaintenanceService：大表按月分区维护（EventLog 建分区 / 过期整月分区 DROP）；
 *  - NotificationCooldownService：通知冷却（避免重复告警轰炸）；
 *  - DistributedLockService：分布式锁（保留清理 / 家庭模式切换 / 安防面板串行化）。
 *
 * 关键依赖：PrismaService、DatabaseRetentionService、PartitionMaintenanceService、NotificationCooldownService、DistributedLockService。
 */
@Global()
@Module({
  providers: [
    PrismaService,
    DatabaseRetentionService,
    PartitionMaintenanceService,
    NotificationCooldownService,
    DistributedLockService,
  ],
  exports: [
    PrismaService,
    DatabaseRetentionService,
    PartitionMaintenanceService,
    NotificationCooldownService,
    DistributedLockService,
  ],
})
/**
 * PrismaModule：Nest @Module 模块。
 * - 所属域：shared/prisma/module.ts；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 */
export class PrismaModule {}
