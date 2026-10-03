/**
 * 所属模块：backend/modules/system/device
 * 职责：
 *  - 系统设备管理 Nest 模块；
 * 关键依赖：
 *  - device-management.service；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { forwardRef, Module } from '@nestjs/common';
import { PrismaModule } from '../../../shared/prisma/module';
import { AppConfigModule } from '../../../shared/app-config/module';
import { StateStoreModule } from '../../state-store/module';
import { NotificationModule } from '../../notification/module';
import { HaWsLeaderModule } from '../../ha-connector/ha-ws-leader.module';
import { DeviceLifespanService } from './lifespan.service';
import { DeviceHealthService } from './health.service';
import { DeviceManagementService } from './device-management.service';
import { UiConfigModule } from '../../ui-config/module';
import { HaConnectorModule } from '../../ha-connector/module';

@Module({
  imports: [
    PrismaModule,
    AppConfigModule,
    StateStoreModule,
    HaWsLeaderModule,
    HaConnectorModule,
    UiConfigModule,
    forwardRef(() => NotificationModule),
  ],
  providers: [DeviceLifespanService, DeviceHealthService, DeviceManagementService],
  exports: [DeviceLifespanService, DeviceHealthService, DeviceManagementService],
})
/**
 * SystemDeviceModule：Nest @Module 模块。
 * - 所属域：modules/system/device/system-device；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 * @class SystemDeviceModule
 */
export class SystemDeviceModule {}
