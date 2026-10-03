/**
 * 家庭模式模块装配定义（HomeModeModule）。
 *
 * 所属模块：backend/modules/home-mode
 * 职责：管理家庭模式（回家 / 离家 / 睡眠 / 影音 / 用餐等）的 CRUD、激活切换、
 *  触发器绑定、设备快照恢复，以及与 HA、通知、安防、在场检测的联动。
 *  激活 / 停用经分布式锁串行化，避免并发切换导致互斥组与快照状态错乱。
 *  另通过 HOME_MODE_LOOKUP 端口暴露窄接口，供 Agent tools 注入避免循环 import。
 * 依赖：
 *  - PrismaModule：DB
 *  - HaConnectorModule：下发 HA 服务调用、采集设备快照
 *  - NotificationModule（forwardRef）：模式切换通知
 *  - StateStoreModule：实体状态缓存（预设实体推荐）
 *  - ChildModeModule：child/guest 动作 ACL 拦截
 * 暴露：HomeModeService / HOME_MODE_LOOKUP（窄接口端口）。
 */
import { forwardRef, Module } from '@nestjs/common';
import { HomeModeService } from './service';
import { HomeModeController } from './controller';
import { PrismaModule } from '../../shared/prisma/module';
import { HaConnectorModule } from '../ha-connector/module';
import { NotificationModule } from '../notification/module';
import { StateStoreModule } from '../state-store/module';
import { ChildModeModule } from '../child-mode/module';
import { HOME_MODE_LOOKUP } from './home-mode.tokens';

@Module({
  imports: [
    PrismaModule,
    HaConnectorModule,
    forwardRef(() => NotificationModule),
    StateStoreModule,
    ChildModeModule,
  ],
  controllers: [HomeModeController],
  providers: [
    HomeModeService,
    { provide: HOME_MODE_LOOKUP, useExisting: HomeModeService },
  ],
  exports: [HomeModeService, HOME_MODE_LOOKUP],
})
/**
 * HomeModeModule：Nest @Module 模块。
 * - 所属域：modules/home-mode/module.ts；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 * @class HomeModeModule
 */
export class HomeModeModule {}
