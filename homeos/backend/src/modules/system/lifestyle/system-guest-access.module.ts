/**
 * 访客临时密码子模块：从 SystemModule 壳拆出，避免 GuestAccess 与壳强绑定。
 */
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../shared/prisma/module';
import { HaConnectorModule } from '../../ha-connector/module';
import { GuestAccessService } from './guest-access.service';

@Module({
  imports: [PrismaModule, HaConnectorModule],
  providers: [GuestAccessService],
  exports: [GuestAccessService],
})
/**
 * SystemGuestAccessModule：Nest @Module 模块。
 * - 所属域：modules/system/lifestyle/system-guest-access；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 */
export class SystemGuestAccessModule {}
