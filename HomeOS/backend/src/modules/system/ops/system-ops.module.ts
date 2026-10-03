/**
 * 所属模块：backend/modules/system/ops
 * 职责：
 *  - 运维模块（诊断/日志抓取/重启）；
 * 关键依赖：
 *  - common/observability；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { forwardRef, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../../../shared/prisma/module';
import { RedisModule } from '../../../shared/redis/module';
import { StateStoreModule } from '../../state-store/module';
import { NotificationModule } from '../../notification/module';
import { HaWsLeaderModule } from '../../ha-connector/ha-ws-leader.module';
import { ExternalApiService } from './external-api.service';

@Module({
  imports: [
    HttpModule,
    PrismaModule,
    RedisModule,
    StateStoreModule,
    HaWsLeaderModule,
    forwardRef(() => NotificationModule),
  ],
  providers: [ExternalApiService],
  exports: [ExternalApiService],
})
/**
 * SystemOpsModule：Nest @Module 模块。
 * - 所属域：modules/system/ops/system-ops；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 * @class SystemOpsModule
 */
export class SystemOpsModule {}
