/**
 * 商业授权模块：联网租约型授权的门禁与激活。
 *
 * 装配：
 * - LicenseService：负责硬件指纹生成、签名租约验签、心跳续租与租约恢复。
 * - LicenseGuard：作为 APP_GUARD 全局生效，未激活时仅放行白名单路径。
 *
 * 威胁模型：防误用与随手拷贝；不承诺防专业破解。授权商店可吊销 / 解绑。
 */
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { LicenseController } from './license.controller';
import { LicenseGuard } from './license.guard';
import { LicenseService } from './license.service';

@Module({
  controllers: [LicenseController],
  providers: [
    LicenseService,
    {
      provide: APP_GUARD,
      useClass: LicenseGuard,
    },
  ],
  exports: [LicenseService],
})
/**
 * LicenseModule：Nest @Module 模块。
 * - 所属域：modules/license/module.ts；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 */
export class LicenseModule {}
