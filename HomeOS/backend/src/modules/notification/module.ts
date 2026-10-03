/**
 * 通知模块
 *
 * 职责：告警存储、推送与设置 API。
 *
 * 该模块聚合通知的持久化（Prisma）、实时分发（EventBus / Redis）以及
 * 告警规则的求值与冷却管理。通过 StateStoreModule 订阅 HA 状态变更，
 * 触发离线 / 低电量 / 自定义规则等通知。
 * 通过 ChannelsModule 发送外部通知（Email、WebPush）。
 *
 * 依赖：
 * - PrismaModule：通知与告警规则的数据库持久化
 * - StateStoreModule：订阅 HA 实体状态变更以触发健康/规则通知
 * - ChannelsModule：外部消息通道服务（Email、WebPush）
 */
import { forwardRef, Module } from '@nestjs/common';
import { NotificationService } from './service';
import { NotificationController } from './controller';
import { PrismaModule } from '../../shared/prisma/module';
import { StateStoreModule } from '../state-store/module';
import { ChannelsModule } from '../channels/module';

/**
 * 通知模块定义（DI 角色：聚合 NotificationService 与 NotificationController）。
 * 对外导出 NotificationService 供其他模块（如场景、脚本、安防）发送通知。
 */
@Module({
  imports: [PrismaModule, StateStoreModule, forwardRef(() => ChannelsModule)],
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
/**
 * NotificationModule：Nest @Module 模块。
 * - 所属域：modules/notification/module.ts；
 * - 装配职责：声明 imports（上游依赖）、providers（本域服务）、controllers（路由）、exports（跨域暴露）；
 * - 生命周期：onModuleInit / onModuleDestroy 按需实现，见类体钩子；
 * @class NotificationModule
 */
export class NotificationModule {}