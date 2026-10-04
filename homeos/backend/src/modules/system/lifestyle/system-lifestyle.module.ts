/**
 * 职责：
 *  - 生活方式聚合模块（访客/偏好/媒体）；
 * 关键依赖：
 *  - guest-access.service；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../../shared/prisma/module';
import { RedisModule } from '../../../shared/redis/module';
import { AppConfigModule } from '../../../shared/app-config/module';
import { HaConnectorModule } from '../../ha-connector/module';
import { HaWsLeaderModule } from '../../ha-connector/ha-ws-leader.module';
import { HomeModeModule } from '../../home-mode/module';
import { SecurityModule } from '../../security/module';
import { StateStoreModule } from '../../state-store/module';
import { AwarenessModule } from '../../awareness/module';
import { MediaSceneService } from './media-scene.service';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    AppConfigModule,
    HaConnectorModule,
    HaWsLeaderModule,
    HomeModeModule,
    SecurityModule,
    StateStoreModule,
    forwardRef(() => AwarenessModule),
  ],
  providers: [MediaSceneService],
  exports: [MediaSceneService],
})
/**
 * SystemLifestyleModule：Nest @Module 模块。
 * - 所属域：modules/system/lifestyle/system-lifestyle；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 */
export class SystemLifestyleModule {}
