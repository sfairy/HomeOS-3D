/**
 * 职责：
 *  - UI 配置 Nest 模块；
 * 关键依赖：
 *  - static-asset.service；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { Module } from '@nestjs/common';
import { UiConfigService } from './service';
import { UiConfigStaticAssetService } from './static-asset.service';
import { UiConfigController } from './controller';
import { AppConfigModule } from '../../shared/app-config/module';

@Module({
  imports: [AppConfigModule],
  controllers: [UiConfigController],
  providers: [UiConfigService, UiConfigStaticAssetService],
  exports: [UiConfigService],
})
/**
 * UiConfigModule：Nest @Module 模块。
 * - 所属域：modules/ui-config/module.ts；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 */
export class UiConfigModule {}