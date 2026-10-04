/**
 * 职责：
 *  - 安装向导+默认模板+初始管理员模块；
 * 关键依赖：
 *  - template-entity/service；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../shared/prisma/module';
import { AppConfigModule } from '../../../shared/app-config/module';
import { RedisModule } from '../../../shared/redis/module';
import { HaConnectorModule } from '../../ha-connector/module';
import { StateStoreModule } from '../../state-store/module';
import { SetupWizardService } from './wizard.service';

@Module({
  imports: [
    PrismaModule,
    AppConfigModule,
    RedisModule,
    ConfigModule,
    HaConnectorModule,
    StateStoreModule,
  ],
  providers: [SetupWizardService],
  exports: [SetupWizardService],
})
/**
 * SystemSetupModule：Nest @Module 模块。
 * - 所属域：modules/system/setup/system-setup；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 */
export class SystemSetupModule {}
